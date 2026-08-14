import { createHash } from "node:crypto";
import { artifactPreviewDescriptorPersistenceVersion } from "./types.js";
import { normalizePositiveInteger } from "./artifactContent.js";
import { toArtifactDescriptor } from "./artifactPreparation.js";
import { createArtifactPreviewDescriptor } from "./artifactPreviewCore.js";
import { createArtifactPreviewDescriptorPersistenceRecord } from "./artifactPreviewPersistence.js";
import {
  assertArtifactPreviewPersistenceSafe,
  stableArtifactJsonStringify
} from "./artifactPreviewPersistenceUtils.js";
import {
  compareRetentionCandidates,
  createRetentionCandidate,
  hashRetentionDryRunPart
} from "./retentionPlanning.js";

import type {
  ArtifactDescriptor,
  ArtifactPreviewDescriptorPersistenceRecord,
  ArtifactRetentionCandidate,
  AttachmentPreviewRetentionDryRunArtifactScheduleDescriptor,
  AttachmentPreviewRetentionDryRunArtifactScheduleDescriptors,
  AttachmentPreviewRetentionDryRunDescriptorEvidence,
  AttachmentPreviewRetentionDryRunDescriptorEvidenceItem,
  PreparedArtifact
} from "./types.js";
export { defaultArtifactPolicy, normalizeArtifactPolicy } from "./policy.js";
export {
  assertArtifactWithinPolicy,
  assertUniqueArtifactChecksums,
  evaluateArtifactCleanup,
  findDuplicateArtifactChecksums,
  normalizeArtifactSourcePath,
  prepareArtifact,
  restoreArtifactPayload,
  toArtifactDescriptor
} from "./artifactPreparation.js";
export {
  defaultCleanupRules,
  executeArtifactCleanup,
  simulateArtifactCleanup
} from "./artifactCleanup.js";
export { mapWithConcurrency } from "./concurrency.js";
export {
  createRetentionPlan,
  planArtifactDeletionBatches,
  planArtifactRetention,
  planArtifactRetentionDryRunBatches
} from "./retentionPlanning.js";
export {
  classifyArtifact,
  createArtifactStorageKey,
  isArtifactStorageKey,
  parseArtifactStorageKey
} from "./artifactKeys.js";
export {
  chooseArtifactCompressionStrategy,
  classifyArtifactRetentionClass,
  detectArtifactContentType,
  evaluateArtifactPreviewEligibility
} from "./artifactContent.js";
export {
  createArtifactPreviewDescriptor,
  createArtifactPreviewDescriptorFromContent,
  redactArtifactMetadataForLog
} from "./artifactPreviewCore.js";
export {
  classifyArtifactPreviewDescriptorRetention,
  createArtifactPreviewDescriptorPersistenceRecord,
  readArtifactPreviewDescriptor,
  serializeArtifactPreviewDescriptor
} from "./artifactPreviewPersistence.js";
export {
  artifactPreviewDescriptorPersistenceVersion,
  maxArtifactPreviewDescriptorPersistenceBytes
} from "./types.js";
export type * from "./types.js";

export function createAttachmentPreviewRetentionDryRunDescriptorEvidence(input: {
  artifacts: Array<ArtifactDescriptor | PreparedArtifact>;
  closedLaunchIds: Iterable<string>;
  now?: Date;
  maxDescriptors?: number;
  maxPreviewBytes?: number;
  retentionHorizonDays?: number;
}): AttachmentPreviewRetentionDryRunDescriptorEvidence {
  const now = input.now ?? new Date();
  const closedLaunchIds = new Set(input.closedLaunchIds);
  const descriptorLimit = normalizePositiveInteger(input.maxDescriptors, 100);
  const maxPreviewBytes = normalizePositiveInteger(input.maxPreviewBytes, 4096);
  const artifactsById = new Map<string, ArtifactDescriptor | PreparedArtifact>();
  const candidates: ArtifactRetentionCandidate[] = [];
  let skippedOpenLaunchRecords = 0;
  let skippedNonAttachmentRecords = 0;
  let retainedRecordCount = 0;

  for (const artifactInput of input.artifacts) {
    const artifact = toArtifactDescriptor(artifactInput);
    artifactsById.set(artifact.id, artifactInput);

    if (!closedLaunchIds.has(artifact.launchId)) {
      skippedOpenLaunchRecords += 1;
      continue;
    }

    if (artifact.kind !== "attachment") {
      skippedNonAttachmentRecords += 1;
      continue;
    }

    if (Date.parse(artifact.retention.cleanupEligibleAt) > now.getTime()) {
      retainedRecordCount += 1;
      continue;
    }

    candidates.push(createRetentionCandidate(artifact, now));
  }

  const orderedCandidates = candidates.sort(compareRetentionCandidates);
  const descriptors = orderedCandidates.slice(0, descriptorLimit).map((candidate) => {
    const itemInput: {
      candidate: ArtifactRetentionCandidate;
      artifact: ArtifactDescriptor | PreparedArtifact | undefined;
      maxPreviewBytes: number;
      retentionHorizonDays?: number;
    } = {
      candidate,
      artifact: artifactsById.get(candidate.artifactId),
      maxPreviewBytes
    };
    if (input.retentionHorizonDays !== undefined) {
      itemInput.retentionHorizonDays = input.retentionHorizonDays;
    }
    return createAttachmentPreviewRetentionDryRunDescriptorEvidenceItem(itemInput);
  });
  const evidence: Omit<AttachmentPreviewRetentionDryRunDescriptorEvidence, "evidenceDigest"> = {
    schema: "testhistory.attachment-preview-retention-dry-run-descriptor-evidence",
    version: artifactPreviewDescriptorPersistenceVersion,
    scope: "closed-launches",
    artifactKind: "attachment",
    dryRun: true,
    executionMode: "dry-run",
    deletionExecution: false,
    scannedArtifactCount: input.artifacts.length,
    stagedCandidateCount: orderedCandidates.length,
    descriptorCount: descriptors.length,
    skippedOpenLaunchRecords,
    skippedNonAttachmentRecords,
    retainedRecordCount,
    descriptorLimit,
    totalDescriptorPreviewBytes: descriptors.reduce(
      (sum, descriptor) => sum + descriptor.preview.previewBytes,
      0
    ),
    descriptors,
    safety: createAttachmentPreviewRetentionDryRunDescriptorEvidenceSafety()
  };

  const result = {
    ...evidence,
    evidenceDigest: createAttachmentPreviewRetentionDryRunDescriptorEvidenceDigest(evidence)
  };
  assertArtifactPreviewPersistenceSafe(result);
  return result;
}

export function createAttachmentPreviewRetentionDryRunArtifactScheduleDescriptors(input: {
  artifacts: Array<ArtifactDescriptor | PreparedArtifact>;
  closedLaunchIds: Iterable<string>;
  now?: Date;
  maxDescriptors?: number;
  maxPreviewBytes?: number;
  maxDescriptorsPerSchedule?: number;
  scheduleIntervalMinutes?: number;
  retentionHorizonDays?: number;
}): AttachmentPreviewRetentionDryRunArtifactScheduleDescriptors {
  const evidenceInput: {
    artifacts: Array<ArtifactDescriptor | PreparedArtifact>;
    closedLaunchIds: Iterable<string>;
    now?: Date;
    maxDescriptors?: number;
    maxPreviewBytes?: number;
    retentionHorizonDays?: number;
  } = {
    artifacts: input.artifacts,
    closedLaunchIds: input.closedLaunchIds
  };
  if (input.now !== undefined) {
    evidenceInput.now = input.now;
  }
  if (input.maxDescriptors !== undefined) {
    evidenceInput.maxDescriptors = input.maxDescriptors;
  }
  if (input.maxPreviewBytes !== undefined) {
    evidenceInput.maxPreviewBytes = input.maxPreviewBytes;
  }
  if (input.retentionHorizonDays !== undefined) {
    evidenceInput.retentionHorizonDays = input.retentionHorizonDays;
  }

  const evidence = createAttachmentPreviewRetentionDryRunDescriptorEvidence(evidenceInput);
  const scheduleDescriptorLimit = normalizePositiveInteger(input.maxDescriptorsPerSchedule, 100);
  const scheduleIntervalMinutes = normalizePositiveInteger(input.scheduleIntervalMinutes, 5);
  const schedules = createAttachmentPreviewRetentionDryRunArtifactScheduleDescriptorBatches({
    evidence,
    maxDescriptors: scheduleDescriptorLimit,
    intervalMinutes: scheduleIntervalMinutes
  });
  const schedulePlan: Omit<
    AttachmentPreviewRetentionDryRunArtifactScheduleDescriptors,
    "scheduleDigest"
  > = {
    schema: "testhistory.attachment-preview-retention-dry-run-artifact-schedule-descriptors",
    version: artifactPreviewDescriptorPersistenceVersion,
    scope: "closed-launches",
    artifactKind: "attachment",
    dryRun: true,
    executionMode: "dry-run",
    mutationAllowed: false,
    scannedArtifactCount: evidence.scannedArtifactCount,
    stagedCandidateCount: evidence.stagedCandidateCount,
    descriptorCount: evidence.descriptorCount,
    scheduleDescriptorCount: schedules.length,
    skippedOpenLaunchRecords: evidence.skippedOpenLaunchRecords,
    skippedNonAttachmentRecords: evidence.skippedNonAttachmentRecords,
    retainedRecordCount: evidence.retainedRecordCount,
    descriptorLimit: evidence.descriptorLimit,
    scheduleDescriptorLimit,
    scheduleIntervalMinutes,
    totalDescriptorPreviewBytes: evidence.totalDescriptorPreviewBytes,
    schedules,
    safety: createAttachmentPreviewRetentionDryRunArtifactScheduleSafety()
  };
  const result = {
    ...schedulePlan,
    scheduleDigest: createAttachmentPreviewRetentionDryRunArtifactScheduleDigest(schedulePlan)
  };

  assertArtifactPreviewPersistenceSafe(result);
  return result;
}

function createAttachmentPreviewRetentionDryRunDescriptorEvidenceItem(input: {
  candidate: ArtifactRetentionCandidate;
  artifact: ArtifactDescriptor | PreparedArtifact | undefined;
  maxPreviewBytes: number;
  retentionHorizonDays?: number;
}): AttachmentPreviewRetentionDryRunDescriptorEvidenceItem {
  if (input.artifact === undefined) {
    throw new Error("Attachment preview retention descriptor evidence artifact is missing");
  }

  const descriptor = createArtifactPreviewDescriptor({
    artifact: input.artifact,
    maxPreviewBytes: input.maxPreviewBytes
  });
  const persistenceRecord = createArtifactPreviewDescriptorPersistenceRecord({
    descriptor,
    retentionClass: input.candidate.retentionClass,
    ...(input.retentionHorizonDays !== undefined
      ? { retentionHorizonDays: input.retentionHorizonDays }
      : {})
  });
  const descriptorRetention = persistenceRecord.descriptorRetention;
  if (descriptorRetention === undefined) {
    throw new Error("Attachment preview retention descriptor classification is missing");
  }
  const item: AttachmentPreviewRetentionDryRunDescriptorEvidenceItem = {
    descriptorRef: hashRetentionDryRunPart("artifact-preview-retention-descriptor", [
      input.candidate.deterministicKey,
      descriptor.id
    ]),
    descriptorDigest: createAttachmentPreviewDescriptorDigest(persistenceRecord),
    artifactRef: hashRetentionDryRunPart("artifact-retention-artifact", [
      input.candidate.artifactId
    ]),
    launchRef: hashRetentionDryRunPart("artifact-retention-launch", [input.candidate.launchId]),
    resultStatus: input.candidate.resultStatus,
    retentionClass: input.candidate.retentionClass,
    descriptorRetention,
    preview: {
      kind: descriptor.kind,
      flavor: descriptor.flavor,
      support: descriptor.support,
      status: descriptor.status,
      reason: descriptor.reason,
      bodyType: descriptor.body.type,
      originalBytes: descriptor.originalBytes,
      previewBytes: descriptor.previewBytes,
      maxPreviewBytes: descriptor.maxPreviewBytes,
      ...(descriptor.contentType !== undefined ? { contentType: descriptor.contentType } : {}),
      redactionApplied: descriptor.safety.redactionApplied
    },
    cleanup: {
      expiresAt: input.candidate.expiresAt,
      cleanupEligibleAt: input.candidate.cleanupEligibleAt,
      reason: input.candidate.reason
    },
    safety: createAttachmentPreviewRetentionDryRunDescriptorItemSafety()
  };

  if (input.candidate.projectId !== undefined) {
    item.projectRef = hashRetentionDryRunPart("artifact-retention-project", [
      input.candidate.projectId
    ]);
  }

  return item;
}

function createAttachmentPreviewDescriptorDigest(
  record: ArtifactPreviewDescriptorPersistenceRecord
): string {
  return createHash("sha256")
    .update(
      stableArtifactJsonStringify({
        schema: record.schema,
        version: record.version,
        retentionClass: record.retentionClass,
        descriptorRetention: record.descriptorRetention,
        descriptor: {
          id: record.descriptor.id,
          artifactId: record.descriptor.artifactId,
          kind: record.descriptor.kind,
          flavor: record.descriptor.flavor,
          support: record.descriptor.support,
          status: record.descriptor.status,
          reason: record.descriptor.reason,
          originalBytes: record.descriptor.originalBytes,
          previewBytes: record.descriptor.previewBytes,
          maxPreviewBytes: record.descriptor.maxPreviewBytes,
          contentType: record.descriptor.contentType,
          sha256: record.descriptor.sha256,
          bodyType: record.descriptor.body.type,
          safety: record.descriptor.safety
        }
      })
    )
    .digest("hex")
    .slice(0, 24);
}

function createAttachmentPreviewRetentionDryRunDescriptorEvidenceDigest(
  evidence: Omit<AttachmentPreviewRetentionDryRunDescriptorEvidence, "evidenceDigest">
): string {
  return createHash("sha256")
    .update(
      stableArtifactJsonStringify({
        schema: evidence.schema,
        version: evidence.version,
        scope: evidence.scope,
        artifactKind: evidence.artifactKind,
        dryRun: evidence.dryRun,
        deletionExecution: evidence.deletionExecution,
        scannedArtifactCount: evidence.scannedArtifactCount,
        stagedCandidateCount: evidence.stagedCandidateCount,
        descriptorCount: evidence.descriptorCount,
        skippedOpenLaunchRecords: evidence.skippedOpenLaunchRecords,
        skippedNonAttachmentRecords: evidence.skippedNonAttachmentRecords,
        retainedRecordCount: evidence.retainedRecordCount,
        descriptorLimit: evidence.descriptorLimit,
        descriptorDigests: evidence.descriptors.map((descriptor) => descriptor.descriptorDigest)
      })
    )
    .digest("hex")
    .slice(0, 24);
}

function createAttachmentPreviewRetentionDryRunArtifactScheduleDescriptorBatches(input: {
  evidence: AttachmentPreviewRetentionDryRunDescriptorEvidence;
  maxDescriptors: number;
  intervalMinutes: number;
}): AttachmentPreviewRetentionDryRunArtifactScheduleDescriptor[] {
  const schedules: AttachmentPreviewRetentionDryRunArtifactScheduleDescriptor[] = [];
  const descriptors = [...input.evidence.descriptors].sort((left, right) =>
    left.descriptorDigest.localeCompare(right.descriptorDigest)
  );

  for (let offset = 0; offset < descriptors.length; offset += input.maxDescriptors) {
    const batchDescriptors = descriptors.slice(offset, offset + input.maxDescriptors);
    schedules.push(
      createAttachmentPreviewRetentionDryRunArtifactScheduleDescriptor({
        evidenceDigest: input.evidence.evidenceDigest,
        index: schedules.length,
        scheduledAfterMinutes: schedules.length * input.intervalMinutes,
        maxDescriptors: input.maxDescriptors,
        descriptors: batchDescriptors
      })
    );
  }

  return schedules;
}

function createAttachmentPreviewRetentionDryRunArtifactScheduleDescriptor(input: {
  evidenceDigest: string;
  index: number;
  scheduledAfterMinutes: number;
  maxDescriptors: number;
  descriptors: AttachmentPreviewRetentionDryRunDescriptorEvidenceItem[];
}): AttachmentPreviewRetentionDryRunArtifactScheduleDescriptor {
  const schedule: Omit<
    AttachmentPreviewRetentionDryRunArtifactScheduleDescriptor,
    "scheduleDigest" | "scheduleRef"
  > = {
    index: input.index,
    scheduledAfterMinutes: input.scheduledAfterMinutes,
    descriptorCount: input.descriptors.length,
    totalPreviewBytes: input.descriptors.reduce(
      (sum, descriptor) => sum + descriptor.preview.previewBytes,
      0
    ),
    maxDescriptors: input.maxDescriptors,
    evidenceDigest: input.evidenceDigest,
    descriptorRefs: input.descriptors.map((descriptor) => descriptor.descriptorRef),
    descriptorDigests: input.descriptors.map((descriptor) => descriptor.descriptorDigest),
    dryRun: true,
    executionMode: "dry-run",
    mutationAllowed: false,
    safety: createAttachmentPreviewRetentionDryRunArtifactScheduleSafety()
  };
  const scheduleDigest =
    createAttachmentPreviewRetentionDryRunArtifactScheduleDescriptorDigest(schedule);

  return {
    ...schedule,
    scheduleRef: hashRetentionDryRunPart("artifact-preview-retention-schedule", [
      input.evidenceDigest,
      String(input.index),
      scheduleDigest
    ]),
    scheduleDigest
  };
}

function createAttachmentPreviewRetentionDryRunArtifactScheduleDescriptorDigest(
  input: Omit<
    AttachmentPreviewRetentionDryRunArtifactScheduleDescriptor,
    "scheduleDigest" | "scheduleRef"
  >
): string {
  return createHash("sha256")
    .update(
      stableArtifactJsonStringify({
        evidenceDigest: input.evidenceDigest,
        index: input.index,
        scheduledAfterMinutes: input.scheduledAfterMinutes,
        descriptorCount: input.descriptorCount,
        totalPreviewBytes: input.totalPreviewBytes,
        maxDescriptors: input.maxDescriptors,
        descriptorRefs: input.descriptorRefs,
        descriptorDigests: input.descriptorDigests,
        dryRun: input.dryRun,
        executionMode: input.executionMode,
        mutationAllowed: input.mutationAllowed,
        safety: input.safety
      })
    )
    .digest("hex")
    .slice(0, 24);
}

function createAttachmentPreviewRetentionDryRunArtifactScheduleDigest(
  input: Omit<AttachmentPreviewRetentionDryRunArtifactScheduleDescriptors, "scheduleDigest">
): string {
  return createHash("sha256")
    .update(
      stableArtifactJsonStringify({
        schema: input.schema,
        version: input.version,
        scope: input.scope,
        artifactKind: input.artifactKind,
        dryRun: input.dryRun,
        executionMode: input.executionMode,
        mutationAllowed: input.mutationAllowed,
        scannedArtifactCount: input.scannedArtifactCount,
        stagedCandidateCount: input.stagedCandidateCount,
        descriptorCount: input.descriptorCount,
        scheduleDescriptorCount: input.scheduleDescriptorCount,
        skippedOpenLaunchRecords: input.skippedOpenLaunchRecords,
        skippedNonAttachmentRecords: input.skippedNonAttachmentRecords,
        retainedRecordCount: input.retainedRecordCount,
        descriptorLimit: input.descriptorLimit,
        scheduleDescriptorLimit: input.scheduleDescriptorLimit,
        scheduleIntervalMinutes: input.scheduleIntervalMinutes,
        totalDescriptorPreviewBytes: input.totalDescriptorPreviewBytes,
        scheduleDigests: input.schedules.map((schedule) => schedule.scheduleDigest),
        safety: input.safety
      })
    )
    .digest("hex")
    .slice(0, 24);
}

function createAttachmentPreviewRetentionDryRunDescriptorItemSafety(): AttachmentPreviewRetentionDryRunDescriptorEvidenceItem["safety"] {
  return {
    bounded: true,
    descriptorOnly: true,
    closedLaunchScope: true,
    pathIncluded: false,
    storageKeyIncluded: false,
    objectTargetIncluded: false,
    rawPayloadIncluded: false,
    blobIncluded: false,
    signedUrlIncluded: false,
    deletionExecution: false
  };
}

function createAttachmentPreviewRetentionDryRunArtifactScheduleSafety(): AttachmentPreviewRetentionDryRunArtifactScheduleDescriptor["safety"] {
  return {
    bounded: true,
    descriptorOnly: true,
    closedLaunchScope: true,
    pathIncluded: false,
    storageKeyIncluded: false,
    objectTargetIncluded: false,
    providerMutationHandleIncluded: false,
    rawPayloadIncluded: false,
    blobIncluded: false,
    signedUrlIncluded: false,
    credentialIncluded: false,
    mutationAllowed: false
  };
}

function createAttachmentPreviewRetentionDryRunDescriptorEvidenceSafety(): AttachmentPreviewRetentionDryRunDescriptorEvidence["safety"] {
  return {
    bounded: true,
    descriptorOnly: true,
    closedLaunchScope: true,
    pathIncluded: false,
    storageKeyIncluded: false,
    objectTargetIncluded: false,
    rawPayloadIncluded: false,
    blobIncluded: false,
    signedUrlIncluded: false,
    deletionExecution: false
  };
}
