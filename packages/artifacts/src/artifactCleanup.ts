import { createHash } from "node:crypto";
import { normalizeArtifactPolicy } from "./policy.js";
import {
  planArtifactDeletionBatches,
  planArtifactRetention,
  sumRetentionCandidateBytes
} from "./retentionPlanning.js";
import type {
  ArtifactCleanupAuditAction,
  ArtifactCleanupAuditRecord,
  ArtifactCleanupAuditStatus,
  ArtifactCleanupBatch,
  ArtifactCleanupExecutionBatchSummary,
  ArtifactCleanupExecutionResult,
  ArtifactCleanupNoopReason,
  ArtifactCleanupPolicyRule,
  ArtifactCleanupRetrySafeError,
  ArtifactCleanupSimulation,
  ArtifactDeletionBatch,
  ArtifactDescriptor,
  ArtifactObjectStorePort,
  ArtifactPolicy,
  ArtifactRetentionCandidate,
  ArtifactRetentionPlannerResult,
  ArtifactStorageKey
} from "./types.js";

export function defaultCleanupRules(): ArtifactCleanupPolicyRule[] {
  return [
    {
      id: "passed-attachments-168h",
      kinds: ["attachment"],
      statuses: ["passed"],
      maxAgeHours: 168
    },
    {
      id: "failed-other-attachments-720h",
      kinds: ["attachment"],
      statuses: ["failed", "broken", "skipped", "unknown", "other"],
      maxAgeHours: 720
    },
    {
      id: "scenarios-fixtures-720h",
      kinds: ["scenario", "fixture"],
      statuses: ["passed", "failed", "broken", "skipped", "unknown", "other"],
      maxAgeHours: 720
    }
  ];
}

export function simulateArtifactCleanup(input: {
  artifacts: ArtifactDescriptor[];
  closedLaunchIds: Iterable<string>;
  projectIdsByLaunchId?: ReadonlyMap<string, string> | Record<string, string>;
  now?: Date;
  policy?: Partial<ArtifactPolicy>;
  rules?: ArtifactCleanupPolicyRule[];
  globalRules?: ArtifactCleanupPolicyRule[];
  projectRules?:
    ReadonlyMap<string, ArtifactCleanupPolicyRule[]> | Record<string, ArtifactCleanupPolicyRule[]>;
}): ArtifactCleanupSimulation {
  const now = input.now ?? new Date();
  const policy = normalizeArtifactPolicy(input.policy);
  const globalRules = input.globalRules ?? input.rules ?? defaultCleanupRules();
  const projectRules = normalizeProjectRules(input.projectRules);
  const projectIdsByLaunchId = normalizeProjectIds(input.projectIdsByLaunchId);
  const closedLaunchIds = new Set(input.closedLaunchIds);
  const eligible: ArtifactCleanupSimulation["eligible"] = [];
  let skippedOpenLaunchRecords = 0;
  const projectRuleCount = Array.from(projectRules.values()).reduce(
    (total, rules) => total + rules.length,
    0
  );

  for (const artifact of input.artifacts) {
    if (!closedLaunchIds.has(artifact.launchId)) {
      skippedOpenLaunchRecords += 1;
      continue;
    }

    const projectId = artifact.projectId ?? projectIdsByLaunchId.get(artifact.launchId);
    const artifactProjectRules = projectId === undefined ? [] : (projectRules.get(projectId) ?? []);
    const rule = [...globalRules, ...artifactProjectRules]
      .filter(
        (candidate) =>
          candidate.kinds.includes(artifact.kind) &&
          candidate.statuses.includes(artifact.upload.resultStatus)
      )
      .sort((left, right) => left.maxAgeHours - right.maxAgeHours)[0];
    if (rule === undefined) {
      continue;
    }

    const ageHours = Math.max(
      0,
      Math.floor((now.getTime() - Date.parse(artifact.createdAt)) / (60 * 60 * 1000))
    );
    if (ageHours >= rule.maxAgeHours) {
      eligible.push({ artifact, rule, ageHours });
    }
  }

  return {
    query: {
      scope: "closed-launches",
      scannedRecords: input.artifacts.length,
      eligibleRecords: eligible.length,
      skippedOpenLaunchRecords,
      batchSize: policy.cleanupBatchSize,
      batchIntervalMinutes: policy.cleanupBatchIntervalMinutes,
      globalRuleCount: globalRules.length,
      projectRuleCount
    },
    eligible,
    batches: createCleanupBatches(
      eligible.map((item) => item.artifact.storageKey),
      policy.cleanupBatchSize,
      policy.cleanupBatchIntervalMinutes
    )
  };
}

export async function executeArtifactCleanup(input: {
  artifacts: ArtifactDescriptor[];
  closedLaunchIds: Iterable<string>;
  objectStore: Pick<ArtifactObjectStorePort, "deleteObjects">;
  now?: Date;
  dryRun?: boolean;
  maxCount: number;
  maxBytes: number;
  intervalMinutes?: number;
  runId?: string;
}): Promise<ArtifactCleanupExecutionResult> {
  const now = input.now ?? new Date();
  const dryRun = input.dryRun ?? false;
  const retentionPreview = planArtifactRetention({
    artifacts: input.artifacts,
    closedLaunchIds: input.closedLaunchIds,
    now
  });
  const deletionBatchInput: {
    candidates: ArtifactRetentionCandidate[];
    maxCount: number;
    maxBytes: number;
    intervalMinutes?: number;
  } = {
    candidates: retentionPreview.candidates,
    maxCount: input.maxCount,
    maxBytes: input.maxBytes
  };
  if (input.intervalMinutes !== undefined) {
    deletionBatchInput.intervalMinutes = input.intervalMinutes;
  }
  const deletionBatches = planArtifactDeletionBatches(deletionBatchInput);
  const runId =
    input.runId ?? createCleanupExecutionRunId(retentionPreview, deletionBatches, dryRun);
  const audit: ArtifactCleanupAuditRecord[] = [
    createCleanupAuditRecord({
      runId,
      action: "retention.preview",
      status: "planned",
      at: now.toISOString(),
      dryRun,
      candidates: retentionPreview.candidates,
      skippedOpenLaunchRecords: retentionPreview.query.skippedOpenLaunchRecords,
      retainedRecordCount: retentionPreview.query.retainedRecords,
      deletedCount: 0,
      missingCount: 0
    })
  ];
  const noopReason =
    retentionPreview.candidates.length === 0
      ? retentionPreview.query.skippedOpenLaunchRecords > 0
        ? "open-launches-only"
        : "no-candidates"
      : undefined;

  if (noopReason !== undefined) {
    audit.push(
      createCleanupAuditRecord({
        runId,
        action: "cleanup.noop",
        status: "noop",
        at: now.toISOString(),
        dryRun,
        candidates: [],
        skippedOpenLaunchRecords: retentionPreview.query.skippedOpenLaunchRecords,
        retainedRecordCount: retentionPreview.query.retainedRecords,
        deletedCount: 0,
        missingCount: 0,
        noopReason
      })
    );

    return createCleanupExecutionResult({
      runId,
      status: "noop",
      dryRun,
      retentionPreview,
      deletionBatches,
      audit,
      deletedCount: 0,
      missingCount: 0,
      failedBatchCount: 0,
      noopReason
    });
  }

  if (dryRun) {
    audit.push(
      createCleanupAuditRecord({
        runId,
        action: "cleanup.dry-run",
        status: "noop",
        at: now.toISOString(),
        dryRun,
        candidates: retentionPreview.candidates,
        skippedOpenLaunchRecords: retentionPreview.query.skippedOpenLaunchRecords,
        retainedRecordCount: retentionPreview.query.retainedRecords,
        deletedCount: 0,
        missingCount: 0
      })
    );

    return createCleanupExecutionResult({
      runId,
      status: "completed",
      dryRun,
      retentionPreview,
      deletionBatches,
      audit,
      deletedCount: 0,
      missingCount: 0,
      failedBatchCount: 0
    });
  }

  let deletedCount = 0;
  let missingCount = 0;
  let failedBatchCount = 0;

  for (const batch of deletionBatches) {
    const batchCandidates = retentionPreview.candidates.filter((candidate) =>
      batch.candidateIds.includes(candidate.artifactId)
    );

    try {
      const receipt = await input.objectStore.deleteObjects(batch.storageKeys);
      deletedCount += receipt.deleted.length;
      missingCount += receipt.missing.length;
      audit.push(
        createCleanupAuditRecord({
          runId,
          action: "cleanup.batch.delete",
          status: "completed",
          at: now.toISOString(),
          dryRun,
          candidates: batchCandidates,
          skippedOpenLaunchRecords: retentionPreview.query.skippedOpenLaunchRecords,
          retainedRecordCount: retentionPreview.query.retainedRecords,
          deletedCount: receipt.deleted.length,
          missingCount: receipt.missing.length,
          batchIndex: batch.index
        })
      );
    } catch (error) {
      failedBatchCount += 1;
      audit.push(
        createCleanupAuditRecord({
          runId,
          action: "cleanup.batch.delete",
          status: "failed",
          at: now.toISOString(),
          dryRun,
          candidates: batchCandidates,
          skippedOpenLaunchRecords: retentionPreview.query.skippedOpenLaunchRecords,
          retainedRecordCount: retentionPreview.query.retainedRecords,
          deletedCount: 0,
          missingCount: 0,
          batchIndex: batch.index,
          error: createRetrySafeCleanupError(error)
        })
      );
    }
  }

  const status =
    failedBatchCount === 0
      ? "completed"
      : failedBatchCount === deletionBatches.length
        ? "failed"
        : "partial-failure";

  return createCleanupExecutionResult({
    runId,
    status,
    dryRun,
    retentionPreview,
    deletionBatches,
    audit,
    deletedCount,
    missingCount,
    failedBatchCount
  });
}

function createCleanupExecutionRunId(
  retentionPreview: ArtifactRetentionPlannerResult,
  deletionBatches: readonly ArtifactDeletionBatch[],
  dryRun: boolean
): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        scope: "closed-launches",
        dryRun,
        scannedRecords: retentionPreview.query.scannedRecords,
        skippedOpenLaunchRecords: retentionPreview.query.skippedOpenLaunchRecords,
        retainedRecords: retentionPreview.query.retainedRecords,
        candidateKeys: retentionPreview.candidates.map((candidate) => candidate.deterministicKey),
        batchShape: deletionBatches.map((batch) => ({
          index: batch.index,
          candidateIds: batch.candidateIds,
          maxCount: batch.maxCount,
          maxBytes: batch.maxBytes
        }))
      })
    )
    .digest("hex")
    .slice(0, 24);
}

function createCleanupAuditRecord(input: {
  runId: string;
  action: ArtifactCleanupAuditAction;
  status: ArtifactCleanupAuditStatus;
  at: string;
  dryRun: boolean;
  candidates: readonly ArtifactRetentionCandidate[];
  skippedOpenLaunchRecords: number;
  retainedRecordCount: number;
  deletedCount: number;
  missingCount: number;
  batchIndex?: number;
  noopReason?: ArtifactCleanupNoopReason;
  error?: ArtifactCleanupRetrySafeError;
}): ArtifactCleanupAuditRecord {
  const record: ArtifactCleanupAuditRecord = {
    id: createCleanupAuditId(input.runId, input.action, input.batchIndex, input.noopReason),
    runId: input.runId,
    action: input.action,
    status: input.status,
    scope: "closed-launches",
    at: input.at,
    dryRun: input.dryRun,
    candidateCount: input.candidates.length,
    deletedCount: input.deletedCount,
    missingCount: input.missingCount,
    skippedOpenLaunchRecords: input.skippedOpenLaunchRecords,
    retainedRecordCount: input.retainedRecordCount,
    totalBytes: sumRetentionCandidateBytes(input.candidates),
    candidateIds: input.candidates.map((candidate) => candidate.artifactId),
    storageKeyHashes: input.candidates.map((candidate) =>
      hashArtifactStorageKey(candidate.storageKey)
    )
  };

  if (input.batchIndex !== undefined) {
    record.batchIndex = input.batchIndex;
  }
  if (input.noopReason !== undefined) {
    record.noopReason = input.noopReason;
  }
  if (input.error !== undefined) {
    record.error = input.error;
  }

  return record;
}

function createCleanupExecutionResult(input: {
  runId: string;
  status: ArtifactCleanupExecutionResult["status"];
  dryRun: boolean;
  retentionPreview: ArtifactRetentionPlannerResult;
  deletionBatches: readonly ArtifactDeletionBatch[];
  audit: ArtifactCleanupAuditRecord[];
  deletedCount: number;
  missingCount: number;
  failedBatchCount: number;
  noopReason?: ArtifactCleanupNoopReason;
}): ArtifactCleanupExecutionResult {
  const result: ArtifactCleanupExecutionResult = {
    runId: input.runId,
    status: input.status,
    scope: "closed-launches",
    dryRun: input.dryRun,
    scannedArtifactCount: input.retentionPreview.query.scannedRecords,
    stagedCandidateCount: input.retentionPreview.query.stagedRecords,
    skippedOpenLaunchRecords: input.retentionPreview.query.skippedOpenLaunchRecords,
    retainedRecordCount: input.retentionPreview.query.retainedRecords,
    deletionBatchCount: input.deletionBatches.length,
    deleteRequestedCount: input.dryRun ? 0 : input.retentionPreview.query.stagedRecords,
    deletedCount: input.deletedCount,
    missingCount: input.missingCount,
    failedBatchCount: input.failedBatchCount,
    totalCandidateBytes: sumRetentionCandidateBytes(input.retentionPreview.candidates),
    batches: input.deletionBatches.map(summarizeCleanupExecutionBatch),
    audit: input.audit
  };

  if (input.noopReason !== undefined) {
    result.noopReason = input.noopReason;
  }

  return result;
}

function summarizeCleanupExecutionBatch(
  batch: ArtifactDeletionBatch
): ArtifactCleanupExecutionBatchSummary {
  return {
    index: batch.index,
    candidateCount: batch.candidateCount,
    totalBytes: batch.totalBytes,
    scheduledAfterMinutes: batch.scheduledAfterMinutes,
    maxCount: batch.maxCount,
    maxBytes: batch.maxBytes,
    candidateIds: batch.candidateIds,
    storageKeyHashes: batch.storageKeys.map(hashArtifactStorageKey)
  };
}

function createCleanupAuditId(
  runId: string,
  action: ArtifactCleanupAuditAction,
  batchIndex: number | undefined,
  noopReason: ArtifactCleanupNoopReason | undefined
): string {
  return createHash("sha256")
    .update([runId, action, String(batchIndex ?? "all"), noopReason ?? "none"].join("|"))
    .digest("hex")
    .slice(0, 24);
}

function hashArtifactStorageKey(storageKey: ArtifactStorageKey): string {
  return createHash("sha256").update(storageKey).digest("hex").slice(0, 24);
}

function createRetrySafeCleanupError(error: unknown): ArtifactCleanupRetrySafeError {
  return {
    code: "object-store-delete-failed",
    name: error instanceof Error ? error.name : "Error",
    message: "Artifact cleanup delete failed; retry the batch",
    retryable: true
  };
}

function createCleanupBatches(
  storageKeys: ArtifactStorageKey[],
  batchSize: number,
  batchIntervalMinutes: number
): ArtifactCleanupBatch[] {
  const batches: ArtifactCleanupBatch[] = [];

  for (let offset = 0; offset < storageKeys.length; offset += batchSize) {
    const keys = storageKeys.slice(offset, offset + batchSize);
    batches.push({
      index: batches.length,
      size: keys.length,
      storageKeys: keys,
      scheduledAfterMinutes: batches.length * batchIntervalMinutes
    });
  }

  return batches;
}

function normalizeProjectRules(
  rules:
    | ReadonlyMap<string, ArtifactCleanupPolicyRule[]>
    | Record<string, ArtifactCleanupPolicyRule[]>
    | undefined
): ReadonlyMap<string, ArtifactCleanupPolicyRule[]> {
  if (rules === undefined) {
    return new Map();
  }

  return rules instanceof Map ? rules : new Map(Object.entries(rules));
}

function normalizeProjectIds(
  projectIds: ReadonlyMap<string, string> | Record<string, string> | undefined
): ReadonlyMap<string, string> {
  if (projectIds === undefined) {
    return new Map();
  }

  return projectIds instanceof Map ? projectIds : new Map(Object.entries(projectIds));
}
