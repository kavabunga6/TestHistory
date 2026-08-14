import {
  planArtifactDeletionBatches,
  planArtifactRetention,
  planArtifactRetentionDryRunBatches,
  type ArtifactDeletionBatch,
  type ArtifactDescriptor,
  type ArtifactRetentionCandidate,
  type ArtifactRetentionDryRunBatch
} from "@testhistory/artifacts";
import type { ArtifactCleanupJobPayload } from "@testhistory/contracts";

import {
  artifactCleanupBatchIntervalMinutes,
  defaultArtifactCleanupBatchSize,
  maxArtifactCleanupBatchBytes,
  maxArtifactCleanupBatchSize
} from "./workerConstants.js";
import type {
  ArtifactCleanupBatchSummary,
  ArtifactCleanupPipelinePlan,
  ArtifactCleanupPlanAuditEvidence,
  ArtifactCleanupPlanNoopReason
} from "./workerTypes.js";

export function buildArtifactCleanupPipelinePlan(input: {
  payload: ArtifactCleanupJobPayload;
  artifacts: readonly ArtifactDescriptor[];
  closedLaunchIds: readonly string[];
  currentTime: Date;
}): ArtifactCleanupPipelinePlan {
  const requestedBatchSize = input.payload.batchSize;
  const plannedBatchSize = normalizeArtifactCleanupBatchSize(requestedBatchSize);
  const cleanupCutoff = parseArtifactCleanupCutoff(input.payload.before, input.currentTime);
  const retentionPreview = planArtifactRetention({
    artifacts: filterCleanupArtifactsByPayload(input.artifacts, input.payload),
    closedLaunchIds: input.closedLaunchIds,
    now: cleanupCutoff
  });
  const dryRun = input.payload.dryRun ?? false;
  const dryRunBatchPlan = dryRun
    ? planArtifactRetentionDryRunBatches({
        retentionPreview,
        maxCount: plannedBatchSize,
        maxBytes: maxArtifactCleanupBatchBytes,
        intervalMinutes: artifactCleanupBatchIntervalMinutes
      })
    : undefined;
  const deletionBatches = dryRun
    ? []
    : planArtifactDeletionBatches({
        candidates: retentionPreview.candidates,
        maxCount: plannedBatchSize,
        maxBytes: maxArtifactCleanupBatchBytes,
        intervalMinutes: artifactCleanupBatchIntervalMinutes
      });
  const batchSummaries =
    dryRunBatchPlan === undefined
      ? summarizeArtifactDeletionBatches(deletionBatches)
      : summarizeArtifactRetentionDryRunBatches(dryRunBatchPlan.batches);
  const stagedCandidateCount = retentionPreview.candidates.length;
  const deleteRequestedCount = dryRun ? 0 : stagedCandidateCount;
  const totalCandidateBytes = sumRetentionCandidateBytes(retentionPreview.candidates);
  const dryRunBatchCount = dryRunBatchPlan?.batchCount ?? 0;
  const noopReason =
    stagedCandidateCount === 0
      ? retentionPreview.query.skippedOpenLaunchRecords > 0
        ? "open-launches-only"
        : "no-candidates"
      : undefined;
  const auditEvidenceInput: {
    dryRun: boolean;
    stagedCandidateCount: number;
    deleteRequestedCount: number;
    skippedOpenLaunchRecords: number;
    retainedRecordCount: number;
    batchCount: number;
    totalCandidateBytes: number;
    planDigest?: string;
    noopReason?: ArtifactCleanupPlanNoopReason;
  } = {
    dryRun,
    stagedCandidateCount,
    deleteRequestedCount,
    skippedOpenLaunchRecords: retentionPreview.query.skippedOpenLaunchRecords,
    retainedRecordCount: retentionPreview.query.retainedRecords,
    batchCount: dryRun ? dryRunBatchCount : deletionBatches.length,
    totalCandidateBytes
  };
  if (dryRunBatchPlan !== undefined) {
    auditEvidenceInput.planDigest = dryRunBatchPlan.planDigest;
  }
  if (noopReason !== undefined) {
    auditEvidenceInput.noopReason = noopReason;
  }
  const auditEvidence = buildArtifactCleanupPlanAuditEvidence(auditEvidenceInput);

  return {
    transitions: [
      { state: "cleanup_requested", at: input.currentTime.toISOString() },
      {
        state:
          noopReason !== undefined
            ? "cleanup_noop_audited"
            : dryRun
              ? "retention_preview_staged"
              : "delete_batches_planned",
        at: input.currentTime.toISOString()
      }
    ],
    dryRun,
    executionMode: dryRun ? "dry-run" : "delete",
    requestedBatchSize,
    plannedBatchSize,
    scannedArtifactCount: retentionPreview.query.scannedRecords,
    stagedCandidateCount,
    skippedOpenLaunchRecords: retentionPreview.query.skippedOpenLaunchRecords,
    retainedRecordCount: retentionPreview.query.retainedRecords,
    deletionBatchCount: deletionBatches.length,
    dryRunBatchCount,
    candidateCount: stagedCandidateCount,
    deleteRequestedCount,
    batches: batchSummaries,
    auditRecordCount: auditEvidence.length,
    auditEvidence,
    ...(dryRunBatchPlan !== undefined ? { dryRunPlanDigest: dryRunBatchPlan.planDigest } : {}),
    ...(noopReason !== undefined ? { noopReason } : {}),
    summary: {
      projectScope: input.payload.projectId ?? "all",
      before: input.payload.before,
      dryRun,
      executionMode: dryRun ? "dry-run" : "delete",
      plannedBatchSize,
      scannedArtifactCount: retentionPreview.query.scannedRecords,
      stagedCandidateCount,
      skippedOpenLaunchRecords: retentionPreview.query.skippedOpenLaunchRecords,
      retainedRecordCount: retentionPreview.query.retainedRecords,
      deletionBatchCount: deletionBatches.length,
      dryRunBatchCount,
      candidateCount: stagedCandidateCount,
      deleteRequestedCount,
      totalCandidateBytes,
      auditRecordCount: auditEvidence.length,
      ...(dryRunBatchPlan !== undefined ? { dryRunPlanDigest: dryRunBatchPlan.planDigest } : {}),
      ...(noopReason !== undefined ? { noopReason } : {})
    }
  };
}

function normalizeArtifactCleanupBatchSize(batchSize: number | undefined): number {
  return Math.min(batchSize ?? defaultArtifactCleanupBatchSize, maxArtifactCleanupBatchSize);
}

function parseArtifactCleanupCutoff(before: string, fallback: Date): Date {
  const cutoffMs = Date.parse(before);
  return Number.isFinite(cutoffMs) ? new Date(cutoffMs) : fallback;
}

function filterCleanupArtifactsByPayload(
  artifacts: readonly ArtifactDescriptor[],
  payload: ArtifactCleanupJobPayload
): ArtifactDescriptor[] {
  return artifacts.filter(
    (artifact) => payload.projectId === undefined || artifact.projectId === payload.projectId
  );
}

function summarizeArtifactDeletionBatches(
  batches: readonly ArtifactDeletionBatch[]
): ArtifactCleanupBatchSummary[] {
  return batches.map((batch) => ({
    index: batch.index,
    candidateCount: batch.candidateCount,
    totalBytes: batch.totalBytes,
    scheduledAfterMinutes: batch.scheduledAfterMinutes,
    maxCount: batch.maxCount,
    maxBytes: batch.maxBytes
  }));
}

function summarizeArtifactRetentionDryRunBatches(
  batches: readonly ArtifactRetentionDryRunBatch[]
): ArtifactCleanupBatchSummary[] {
  return batches.map((batch) => ({
    index: batch.index,
    candidateCount: batch.candidateCount,
    totalBytes: batch.totalBytes,
    scheduledAfterMinutes: batch.scheduledAfterMinutes,
    maxCount: batch.maxCount,
    maxBytes: batch.maxBytes,
    candidateRefs: batch.candidateRefs.map((candidate) => candidate.candidateRef),
    batchDigest: batch.batchDigest,
    deletionExecution: false
  }));
}

function buildArtifactCleanupPlanAuditEvidence(input: {
  dryRun: boolean;
  stagedCandidateCount: number;
  deleteRequestedCount: number;
  skippedOpenLaunchRecords: number;
  retainedRecordCount: number;
  batchCount: number;
  totalCandidateBytes: number;
  planDigest?: string;
  noopReason?: ArtifactCleanupPlanNoopReason;
}): ArtifactCleanupPlanAuditEvidence[] {
  const preview: ArtifactCleanupPlanAuditEvidence = {
    action: "retention.preview",
    status: "planned",
    scope: "closed-launches",
    dryRun: input.dryRun,
    candidateCount: input.stagedCandidateCount,
    deleteRequestedCount: 0,
    skippedOpenLaunchRecords: input.skippedOpenLaunchRecords,
    retainedRecordCount: input.retainedRecordCount,
    batchCount: input.batchCount,
    totalCandidateBytes: input.totalCandidateBytes
  };
  if (input.planDigest !== undefined) {
    preview.planDigest = input.planDigest;
  }

  if (input.noopReason !== undefined) {
    return [
      preview,
      {
        action: "cleanup.noop",
        status: "noop",
        scope: "closed-launches",
        dryRun: input.dryRun,
        candidateCount: 0,
        deleteRequestedCount: 0,
        skippedOpenLaunchRecords: input.skippedOpenLaunchRecords,
        retainedRecordCount: input.retainedRecordCount,
        batchCount: 0,
        totalCandidateBytes: 0,
        noopReason: input.noopReason
      }
    ];
  }

  if (input.dryRun) {
    return [
      preview,
      {
        action: "cleanup.dry-run",
        status: "noop",
        scope: "closed-launches",
        dryRun: true,
        candidateCount: input.stagedCandidateCount,
        deleteRequestedCount: 0,
        skippedOpenLaunchRecords: input.skippedOpenLaunchRecords,
        retainedRecordCount: input.retainedRecordCount,
        batchCount: input.batchCount,
        totalCandidateBytes: input.totalCandidateBytes,
        ...(input.planDigest !== undefined ? { planDigest: input.planDigest } : {})
      }
    ];
  }

  return [
    preview,
    {
      action: "cleanup.execution.planned",
      status: input.dryRun ? "noop" : "planned",
      scope: "closed-launches",
      dryRun: input.dryRun,
      candidateCount: input.stagedCandidateCount,
      deleteRequestedCount: input.deleteRequestedCount,
      skippedOpenLaunchRecords: input.skippedOpenLaunchRecords,
      retainedRecordCount: input.retainedRecordCount,
      batchCount: input.batchCount,
      totalCandidateBytes: input.totalCandidateBytes
    }
  ];
}

function sumRetentionCandidateBytes(candidates: readonly ArtifactRetentionCandidate[]): number {
  return candidates.reduce((total, candidate) => total + candidate.storedBytes, 0);
}
