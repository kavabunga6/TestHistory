import { createHash } from "node:crypto";
import { classifyArtifactRetentionClass, normalizePositiveInteger } from "./artifactContent.js";
import type {
  ArtifactDeletionBatch,
  ArtifactDescriptor,
  ArtifactRetentionCandidate,
  ArtifactRetentionDryRunBatch,
  ArtifactRetentionDryRunBatchPlan,
  ArtifactRetentionDryRunCandidateRef,
  ArtifactRetentionPlannerResult
} from "./types.js";

export function createRetentionPlan(
  artifacts: ArtifactDescriptor[],
  now: Date = new Date()
): { expired: ArtifactDescriptor[]; retained: ArtifactDescriptor[] } {
  const expired: ArtifactDescriptor[] = [];
  const retained: ArtifactDescriptor[] = [];

  for (const artifact of artifacts) {
    if (new Date(artifact.expiresAt).getTime() <= now.getTime()) {
      expired.push(artifact);
    } else {
      retained.push(artifact);
    }
  }

  return { expired, retained };
}

export function planArtifactRetention(input: {
  artifacts: ArtifactDescriptor[];
  closedLaunchIds: Iterable<string>;
  now?: Date;
}): ArtifactRetentionPlannerResult {
  const now = input.now ?? new Date();
  const closedLaunchIds = new Set(input.closedLaunchIds);
  const candidates: ArtifactRetentionCandidate[] = [];
  let skippedOpenLaunchRecords = 0;
  let retainedRecords = 0;

  for (const artifact of input.artifacts) {
    if (!closedLaunchIds.has(artifact.launchId)) {
      skippedOpenLaunchRecords += 1;
      continue;
    }

    const cleanupEligibleAt = artifact.retention.cleanupEligibleAt;
    if (Date.parse(cleanupEligibleAt) > now.getTime()) {
      retainedRecords += 1;
      continue;
    }

    candidates.push(createRetentionCandidate(artifact, now));
  }

  const orderedCandidates = candidates.sort(compareRetentionCandidates);

  return {
    query: {
      scope: "closed-launches",
      scannedRecords: input.artifacts.length,
      stagedRecords: orderedCandidates.length,
      skippedOpenLaunchRecords,
      retainedRecords
    },
    candidates: orderedCandidates
  };
}

export function planArtifactDeletionBatches(input: {
  candidates: ArtifactRetentionCandidate[];
  maxCount: number;
  maxBytes: number;
  intervalMinutes?: number;
}): ArtifactDeletionBatch[] {
  const maxCount = normalizePositiveInteger(input.maxCount, 1000);
  const maxBytes = normalizePositiveInteger(input.maxBytes, 1024 * 1024 * 1024);
  const intervalMinutes = normalizePositiveInteger(input.intervalMinutes, 5);
  const batches: ArtifactDeletionBatch[] = [];
  let current: ArtifactRetentionCandidate[] = [];
  let currentBytes = 0;

  for (const candidate of [...input.candidates].sort(compareRetentionCandidates)) {
    const wouldExceedCount = current.length >= maxCount;
    const wouldExceedBytes = current.length > 0 && currentBytes + candidate.storedBytes > maxBytes;

    if (wouldExceedCount || wouldExceedBytes) {
      batches.push(
        createDeletionBatch(batches.length, current, intervalMinutes, maxCount, maxBytes)
      );
      current = [];
      currentBytes = 0;
    }

    current.push(candidate);
    currentBytes += candidate.storedBytes;
  }

  if (current.length > 0) {
    batches.push(createDeletionBatch(batches.length, current, intervalMinutes, maxCount, maxBytes));
  }

  return batches;
}

export function planArtifactRetentionDryRunBatches(input: {
  retentionPreview: ArtifactRetentionPlannerResult;
  maxCount: number;
  maxBytes: number;
  intervalMinutes?: number;
}): ArtifactRetentionDryRunBatchPlan {
  const maxCount = normalizePositiveInteger(input.maxCount, 1000);
  const maxBytes = normalizePositiveInteger(input.maxBytes, 1024 * 1024 * 1024);
  const intervalMinutes = normalizePositiveInteger(input.intervalMinutes, 5);
  const batches: ArtifactRetentionDryRunBatch[] = [];
  let current: ArtifactRetentionDryRunCandidateRef[] = [];
  let currentBytes = 0;

  for (const candidate of [...input.retentionPreview.candidates].sort(compareRetentionCandidates)) {
    const ref = createRetentionDryRunCandidateRef(candidate);
    const wouldExceedCount = current.length >= maxCount;
    const wouldExceedBytes = current.length > 0 && currentBytes + ref.storedBytes > maxBytes;

    if (wouldExceedCount || wouldExceedBytes) {
      batches.push(
        createRetentionDryRunBatch(batches.length, current, intervalMinutes, maxCount, maxBytes)
      );
      current = [];
      currentBytes = 0;
    }

    current.push(ref);
    currentBytes += ref.storedBytes;
  }

  if (current.length > 0) {
    batches.push(
      createRetentionDryRunBatch(batches.length, current, intervalMinutes, maxCount, maxBytes)
    );
  }

  const totalCandidateBytes = sumRetentionCandidateBytes(input.retentionPreview.candidates);

  return {
    scope: "closed-launches",
    dryRun: true,
    executionMode: "dry-run",
    deletionExecution: false,
    scannedArtifactCount: input.retentionPreview.query.scannedRecords,
    stagedCandidateCount: input.retentionPreview.query.stagedRecords,
    skippedOpenLaunchRecords: input.retentionPreview.query.skippedOpenLaunchRecords,
    retainedRecordCount: input.retentionPreview.query.retainedRecords,
    batchCount: batches.length,
    totalCandidateBytes,
    planDigest: createRetentionDryRunPlanDigest(input.retentionPreview, batches),
    batches,
    safety: createRetentionDryRunPlanSafety()
  };
}

export function createRetentionCandidate(
  artifact: ArtifactDescriptor,
  now: Date
): ArtifactRetentionCandidate {
  const deterministicKey = [
    artifact.retention.cleanupEligibleAt,
    artifact.launchId,
    artifact.storageKey,
    artifact.id
  ].join("|");

  return {
    artifactId: artifact.id,
    launchId: artifact.launchId,
    ...(artifact.projectId !== undefined ? { projectId: artifact.projectId } : {}),
    storageKey: artifact.storageKey,
    kind: artifact.kind,
    resultStatus: artifact.upload.resultStatus,
    retentionClass: classifyArtifactRetentionClass(artifact.upload.resultStatus),
    originalBytes: artifact.originalBytes,
    storedBytes: artifact.storedBytes,
    expiresAt: artifact.expiresAt,
    cleanupEligibleAt: artifact.retention.cleanupEligibleAt,
    stagedAt: now.toISOString(),
    reason: "cleanup-window-open",
    deterministicKey
  };
}

export function compareRetentionCandidates(
  left: ArtifactRetentionCandidate,
  right: ArtifactRetentionCandidate
): number {
  return left.deterministicKey.localeCompare(right.deterministicKey);
}

function createDeletionBatch(
  index: number,
  candidates: ArtifactRetentionCandidate[],
  intervalMinutes: number,
  maxCount: number,
  maxBytes: number
): ArtifactDeletionBatch {
  return {
    index,
    candidateCount: candidates.length,
    totalBytes: candidates.reduce((sum, candidate) => sum + candidate.storedBytes, 0),
    storageKeys: candidates.map((candidate) => candidate.storageKey),
    candidateIds: candidates.map((candidate) => candidate.artifactId),
    scheduledAfterMinutes: index * intervalMinutes,
    maxCount,
    maxBytes
  };
}

function createRetentionDryRunCandidateRef(
  candidate: ArtifactRetentionCandidate
): ArtifactRetentionDryRunCandidateRef {
  const ref: ArtifactRetentionDryRunCandidateRef = {
    candidateRef: hashRetentionDryRunPart("artifact-retention-candidate", [
      candidate.deterministicKey
    ]),
    launchRef: hashRetentionDryRunPart("artifact-retention-launch", [candidate.launchId]),
    kind: candidate.kind,
    resultStatus: candidate.resultStatus,
    retentionClass: candidate.retentionClass,
    originalBytes: candidate.originalBytes,
    storedBytes: candidate.storedBytes,
    expiresAt: candidate.expiresAt,
    cleanupEligibleAt: candidate.cleanupEligibleAt,
    reason: candidate.reason,
    safety: createRetentionDryRunCandidateSafety()
  };

  if (candidate.projectId !== undefined) {
    ref.projectRef = hashRetentionDryRunPart("artifact-retention-project", [candidate.projectId]);
  }

  return ref;
}

function createRetentionDryRunBatch(
  index: number,
  candidateRefs: ArtifactRetentionDryRunCandidateRef[],
  intervalMinutes: number,
  maxCount: number,
  maxBytes: number
): ArtifactRetentionDryRunBatch {
  const batch: Omit<ArtifactRetentionDryRunBatch, "batchDigest"> = {
    index,
    candidateCount: candidateRefs.length,
    totalBytes: candidateRefs.reduce((sum, candidate) => sum + candidate.storedBytes, 0),
    scheduledAfterMinutes: index * intervalMinutes,
    maxCount,
    maxBytes,
    candidateRefs,
    deletionExecution: false
  };

  return {
    ...batch,
    batchDigest: createRetentionDryRunBatchDigest(batch)
  };
}

function createRetentionDryRunBatchDigest(input: {
  index: number;
  candidateCount: number;
  totalBytes: number;
  scheduledAfterMinutes: number;
  maxCount: number;
  maxBytes: number;
  candidateRefs: readonly ArtifactRetentionDryRunCandidateRef[];
  deletionExecution: false;
}): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        scope: "closed-launches",
        index: input.index,
        candidateRefs: input.candidateRefs.map((candidate) => candidate.candidateRef),
        candidateCount: input.candidateCount,
        totalBytes: input.totalBytes,
        scheduledAfterMinutes: input.scheduledAfterMinutes,
        maxCount: input.maxCount,
        maxBytes: input.maxBytes,
        deletionExecution: input.deletionExecution
      })
    )
    .digest("hex")
    .slice(0, 24);
}

function createRetentionDryRunPlanDigest(
  retentionPreview: ArtifactRetentionPlannerResult,
  batches: readonly ArtifactRetentionDryRunBatch[]
): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        scope: "closed-launches",
        dryRun: true,
        deletionExecution: false,
        scannedRecords: retentionPreview.query.scannedRecords,
        skippedOpenLaunchRecords: retentionPreview.query.skippedOpenLaunchRecords,
        retainedRecords: retentionPreview.query.retainedRecords,
        candidateKeys: [...retentionPreview.candidates]
          .sort(compareRetentionCandidates)
          .map((candidate) => candidate.deterministicKey),
        batchDigests: batches.map((batch) => batch.batchDigest)
      })
    )
    .digest("hex")
    .slice(0, 24);
}

export function hashRetentionDryRunPart(namespace: string, parts: readonly string[]): string {
  return `${namespace}:${createHash("sha256")
    .update([namespace, ...parts].join("|"))
    .digest("hex")
    .slice(0, 24)}`;
}

function createRetentionDryRunCandidateSafety(): ArtifactRetentionDryRunCandidateRef["safety"] {
  return {
    redactedCandidateRef: true,
    pathIncluded: false,
    objectTargetIncluded: false,
    rawPayloadIncluded: false,
    blobIncluded: false,
    externalUrlIncluded: false,
    credentialIncluded: false,
    deletionExecution: false
  };
}

function createRetentionDryRunPlanSafety(): ArtifactRetentionDryRunBatchPlan["safety"] {
  return {
    bounded: true,
    closedLaunchScope: true,
    pathIncluded: false,
    objectTargetIncluded: false,
    rawPayloadIncluded: false,
    blobIncluded: false,
    externalUrlIncluded: false,
    credentialIncluded: false,
    deletionExecution: false
  };
}

export function sumRetentionCandidateBytes(
  candidates: readonly ArtifactRetentionCandidate[]
): number {
  return candidates.reduce((sum, candidate) => sum + candidate.storedBytes, 0);
}
