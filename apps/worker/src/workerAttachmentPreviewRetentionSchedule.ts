import {
  createAttachmentPreviewRetentionDryRunArtifactScheduleDescriptors,
  type ArtifactDescriptor,
  type AttachmentPreviewRetentionDryRunArtifactScheduleDescriptor,
  type AttachmentPreviewRetentionDryRunArtifactScheduleDescriptors
} from "@testhistory/artifacts";
import {
  artifactCleanupBatchIntervalMinutes,
  defaultAttachmentPreviewRetentionDryRunBatchSize,
  maxAttachmentPreviewRetentionDryRunBatchSize,
  maxAttachmentPreviewRetentionDryRunDiagnostics,
  maxAttachmentPreviewRetentionDryRunRefsPerBatch
} from "./workerConstants.js";
import { hashIdempotencyParts } from "./workerHash.js";
import { isNonEmptyString } from "./workerValueUtils.js";
import {
  buildArtifactPreviewRetentionDescriptorRef,
  buildArtifactPreviewRetentionEligibilityPlan,
  normalizePreviewRetentionTimestamp,
  orderArtifactPreviewRetentionCleanupCandidates,
  orderArtifactPreviewRetentionSources
} from "./workerArtifactPreviewRetention.js";
import type {
  ArtifactPreviewRetentionCleanupCandidate,
  ArtifactPreviewRetentionDescriptorSource,
  ArtifactPreviewRetentionDiagnostic,
  AttachmentPreviewRetentionDryRunScheduleBatch,
  AttachmentPreviewRetentionDryRunScheduleDescriptorMaterializationPlan,
  AttachmentPreviewRetentionDryRunScheduleDescriptorMaterializationRecord,
  AttachmentPreviewRetentionDryRunScheduleDiagnostic,
  AttachmentPreviewRetentionDryRunSchedulePlan
} from "./workerTypes.js";

export function buildAttachmentPreviewRetentionDryRunSchedulePlan(input: {
  sources: readonly ArtifactPreviewRetentionDescriptorSource[];
  closedLaunchIds: Iterable<string>;
  at: string;
  batchSize?: number;
}): AttachmentPreviewRetentionDryRunSchedulePlan {
  const scheduledAt = normalizePreviewRetentionTimestamp(input.at, new Date().toISOString());
  const closedLaunchIds = new Set(
    [...input.closedLaunchIds].filter((launchId) => isNonEmptyString(launchId))
  );
  const closedSources: ArtifactPreviewRetentionDescriptorSource[] = [];
  const diagnostics: AttachmentPreviewRetentionDryRunScheduleDiagnostic[] = [];
  let skippedOpenLaunchDescriptorCount = 0;
  let missingLaunchScopeDescriptorCount = 0;
  let omittedDiagnosticCount = 0;

  for (const source of orderArtifactPreviewRetentionSources(input.sources)) {
    const descriptorRef = buildArtifactPreviewRetentionDescriptorRef(source.descriptor);
    if (!isNonEmptyString(source.launchId)) {
      missingLaunchScopeDescriptorCount += 1;
      omittedDiagnosticCount += appendAttachmentPreviewRetentionDryRunDiagnostic(diagnostics, {
        code: "missing-launch-scope",
        severity: "warn",
        retryable: false,
        descriptorRef,
        message: "Preview descriptor was not scheduled because launch scope was unavailable."
      });
      continue;
    }

    if (!closedLaunchIds.has(source.launchId)) {
      skippedOpenLaunchDescriptorCount += 1;
      omittedDiagnosticCount += appendAttachmentPreviewRetentionDryRunDiagnostic(diagnostics, {
        code: "open-launch-descriptor-skipped",
        severity: "info",
        retryable: false,
        descriptorRef,
        message: "Preview descriptor was not scheduled because launch is not closed."
      });
      continue;
    }

    closedSources.push(source);
  }

  const eligibilityPlan = buildArtifactPreviewRetentionEligibilityPlan({
    sources: closedSources,
    at: scheduledAt
  });
  const plannedBatchSize = normalizeAttachmentPreviewRetentionDryRunBatchSize(input.batchSize);
  const batches = buildAttachmentPreviewRetentionDryRunBatches({
    candidates: eligibilityPlan.cleanupEligibleDescriptors,
    batchSize: plannedBatchSize
  });
  const scheduleDigest = buildAttachmentPreviewRetentionDryRunScheduleDigest(batches);
  const summary = {
    sourceDescriptorCount: input.sources.length,
    closedLaunchDescriptorCount: closedSources.length,
    skippedOpenLaunchDescriptorCount,
    missingLaunchScopeDescriptorCount,
    cleanupEligibleDescriptorCount: eligibilityPlan.summary.cleanupEligibleDescriptorCount,
    scheduledDescriptorCount: eligibilityPlan.cleanupEligibleDescriptors.length,
    retainedDescriptorCount: eligibilityPlan.summary.retainedDescriptorCount,
    invalidDescriptorCount: eligibilityPlan.summary.invalidDescriptorCount,
    duplicateDescriptorCount: eligibilityPlan.summary.duplicateDescriptorCount,
    omittedDiagnosticCount: omittedDiagnosticCount + eligibilityPlan.summary.omittedDiagnosticCount,
    deleteRequestedCount: 0 as const,
    scheduleDigest,
    projectionDigest: eligibilityPlan.summary.projectionDigest,
    plannedOperations: [
      "artifact.preview.retention.classify",
      "artifact.preview.retention.dry-run.schedule"
    ] as const
  } satisfies AttachmentPreviewRetentionDryRunSchedulePlan["summary"];

  return {
    boundary: "worker-local-attachment-preview-retention-dry-run-scheduling",
    consistency: "retry-safe-idempotent-descriptor-schedule",
    scope: "closed-launches",
    dryRun: true,
    readOnly: true,
    deletionExecution: false,
    deleteRequestedCount: 0,
    transitions: [
      { state: "preview_retention_schedule_requested", at: scheduledAt },
      { state: "preview_retention_closed_launches_selected", at: scheduledAt },
      { state: "preview_retention_dry_run_batches_scheduled", at: scheduledAt }
    ],
    requestedBatchSize: input.batchSize,
    plannedBatchSize,
    batchCount: batches.length,
    batches,
    diagnostics: mergeAttachmentPreviewRetentionDryRunDiagnostics(
      diagnostics,
      eligibilityPlan.diagnostics
    ),
    summary
  };
}

export function buildAttachmentPreviewRetentionDryRunScheduleDescriptorMaterializationPlan(input: {
  scheduleDescriptors: AttachmentPreviewRetentionDryRunArtifactScheduleDescriptors;
  at: string;
  maxDescriptorRefsPerRecord?: number;
}): AttachmentPreviewRetentionDryRunScheduleDescriptorMaterializationPlan {
  const materializedAt = normalizePreviewRetentionTimestamp(input.at, new Date().toISOString());
  assertAttachmentPreviewRetentionDryRunScheduleDescriptorsSafe(input.scheduleDescriptors);
  const maxDescriptorRefs = normalizeAttachmentPreviewRetentionDryRunDescriptorRefLimit(
    input.maxDescriptorRefsPerRecord
  );
  const records = orderAttachmentPreviewRetentionDryRunArtifactScheduleDescriptors(
    input.scheduleDescriptors.schedules
  ).map((schedule) =>
    buildAttachmentPreviewRetentionDryRunScheduleDescriptorMaterializationRecord({
      schedule,
      maxDescriptorRefs
    })
  );
  const materializationDigest =
    buildAttachmentPreviewRetentionDryRunScheduleDescriptorMaterializationDigest(records);
  const summary = {
    schema: input.scheduleDescriptors.schema,
    sourceScheduleDigest: input.scheduleDescriptors.scheduleDigest,
    scannedArtifactCount: input.scheduleDescriptors.scannedArtifactCount,
    stagedCandidateCount: input.scheduleDescriptors.stagedCandidateCount,
    descriptorCount: input.scheduleDescriptors.descriptorCount,
    materializedDescriptorCount: records.reduce(
      (total, record) => total + record.descriptorCount,
      0
    ),
    scheduleDescriptorCount: records.length,
    skippedOpenLaunchRecords: input.scheduleDescriptors.skippedOpenLaunchRecords,
    skippedNonAttachmentRecords: input.scheduleDescriptors.skippedNonAttachmentRecords,
    retainedRecordCount: input.scheduleDescriptors.retainedRecordCount,
    totalDescriptorPreviewBytes: input.scheduleDescriptors.totalDescriptorPreviewBytes,
    scheduleDigest: materializationDigest,
    plannedOperations: [
      "artifact.preview.retention.dry-run.schedule.describe",
      "artifact.preview.retention.dry-run.schedule.materialize"
    ] as const
  } satisfies AttachmentPreviewRetentionDryRunScheduleDescriptorMaterializationPlan["summary"];

  return {
    boundary: "worker-local-attachment-preview-retention-dry-run-schedule-materialization",
    consistency: "retry-safe-idempotent-descriptor-schedule-materialization",
    scope: "closed-launches",
    dryRun: true,
    readOnly: true,
    executionMode: "dry-run",
    mutationAllowed: false,
    deletionExecution: false,
    deleteRequestedCount: 0,
    transitions: [
      { state: "preview_retention_schedule_descriptors_received", at: materializedAt },
      { state: "preview_retention_schedule_descriptors_validated", at: materializedAt },
      { state: "preview_retention_schedule_descriptors_materialized", at: materializedAt }
    ],
    records,
    summary
  };
}

export function buildAttachmentPreviewRetentionDryRunArtifactScheduleMaterializationPlan(input: {
  artifacts: readonly ArtifactDescriptor[];
  closedLaunchIds: Iterable<string>;
  at: string;
  maxDescriptors?: number;
  maxPreviewBytes?: number;
  maxDescriptorsPerSchedule?: number;
  scheduleIntervalMinutes?: number;
  retentionHorizonDays?: number;
  maxDescriptorRefsPerRecord?: number;
}): AttachmentPreviewRetentionDryRunScheduleDescriptorMaterializationPlan {
  const scheduleInput: Parameters<
    typeof createAttachmentPreviewRetentionDryRunArtifactScheduleDescriptors
  >[0] = {
    artifacts: [...input.artifacts],
    closedLaunchIds: input.closedLaunchIds,
    now: new Date(normalizePreviewRetentionTimestamp(input.at, new Date().toISOString()))
  };
  if (input.maxDescriptors !== undefined) {
    scheduleInput.maxDescriptors = input.maxDescriptors;
  }
  if (input.maxPreviewBytes !== undefined) {
    scheduleInput.maxPreviewBytes = input.maxPreviewBytes;
  }
  if (input.maxDescriptorsPerSchedule !== undefined) {
    scheduleInput.maxDescriptorsPerSchedule = input.maxDescriptorsPerSchedule;
  }
  if (input.scheduleIntervalMinutes !== undefined) {
    scheduleInput.scheduleIntervalMinutes = input.scheduleIntervalMinutes;
  }
  if (input.retentionHorizonDays !== undefined) {
    scheduleInput.retentionHorizonDays = input.retentionHorizonDays;
  }

  return buildAttachmentPreviewRetentionDryRunScheduleDescriptorMaterializationPlan({
    scheduleDescriptors:
      createAttachmentPreviewRetentionDryRunArtifactScheduleDescriptors(scheduleInput),
    at: input.at,
    ...(input.maxDescriptorRefsPerRecord !== undefined
      ? { maxDescriptorRefsPerRecord: input.maxDescriptorRefsPerRecord }
      : {})
  });
}

function normalizeAttachmentPreviewRetentionDryRunBatchSize(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return defaultAttachmentPreviewRetentionDryRunBatchSize;
  }

  return Math.min(maxAttachmentPreviewRetentionDryRunBatchSize, Math.max(1, Math.floor(value)));
}

function normalizeAttachmentPreviewRetentionDryRunDescriptorRefLimit(
  value: number | undefined
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return maxAttachmentPreviewRetentionDryRunRefsPerBatch;
  }

  return Math.min(maxAttachmentPreviewRetentionDryRunRefsPerBatch, Math.max(0, Math.floor(value)));
}

function buildAttachmentPreviewRetentionDryRunBatches(input: {
  candidates: readonly ArtifactPreviewRetentionCleanupCandidate[];
  batchSize: number;
}): AttachmentPreviewRetentionDryRunScheduleBatch[] {
  const candidates = orderArtifactPreviewRetentionCleanupCandidates(input.candidates);
  const batches: AttachmentPreviewRetentionDryRunScheduleBatch[] = [];

  for (let index = 0; index * input.batchSize < candidates.length; index += 1) {
    const batchCandidates = candidates.slice(
      index * input.batchSize,
      (index + 1) * input.batchSize
    );
    const descriptorRefs = batchCandidates.map((candidate) => candidate.descriptorRef);
    const visibleDescriptorRefs = descriptorRefs.slice(
      0,
      maxAttachmentPreviewRetentionDryRunRefsPerBatch
    );

    batches.push({
      index,
      descriptorCount: batchCandidates.length,
      scheduledAfterMinutes: index * artifactCleanupBatchIntervalMinutes,
      maxCount: input.batchSize,
      descriptorRefs: visibleDescriptorRefs,
      omittedDescriptorRefCount: descriptorRefs.length - visibleDescriptorRefs.length,
      batchDigest: hashIdempotencyParts([
        "attachment-preview-retention-dry-run-batch",
        String(index),
        ...descriptorRefs
      ]),
      deletionExecution: false,
      deleteRequestedCount: 0
    });
  }

  return batches;
}

function buildAttachmentPreviewRetentionDryRunScheduleDigest(
  batches: readonly AttachmentPreviewRetentionDryRunScheduleBatch[]
): string {
  return hashIdempotencyParts([
    "attachment-preview-retention-dry-run-schedule",
    ...batches.flatMap((batch) => [
      String(batch.index),
      String(batch.descriptorCount),
      batch.batchDigest
    ])
  ]);
}

function buildAttachmentPreviewRetentionDryRunScheduleDescriptorMaterializationRecord(input: {
  schedule: AttachmentPreviewRetentionDryRunArtifactScheduleDescriptor;
  maxDescriptorRefs: number;
}): AttachmentPreviewRetentionDryRunScheduleDescriptorMaterializationRecord {
  const descriptorRefs = input.schedule.descriptorRefs.slice(0, input.maxDescriptorRefs);
  return {
    scheduleRef: input.schedule.scheduleRef,
    scheduleDigest: input.schedule.scheduleDigest,
    index: input.schedule.index,
    descriptorCount: input.schedule.descriptorCount,
    scheduledAfterMinutes: input.schedule.scheduledAfterMinutes,
    maxDescriptors: input.schedule.maxDescriptors,
    totalPreviewBytes: input.schedule.totalPreviewBytes,
    descriptorRefs,
    descriptorDigests: input.schedule.descriptorDigests,
    omittedDescriptorRefCount: input.schedule.descriptorRefs.length - descriptorRefs.length,
    dryRun: true,
    executionMode: "dry-run",
    mutationAllowed: false,
    deletionExecution: false,
    deleteRequestedCount: 0,
    safety: {
      bounded: input.schedule.safety.bounded,
      descriptorOnly: input.schedule.safety.descriptorOnly,
      closedLaunchScope: input.schedule.safety.closedLaunchScope,
      pathIncluded: input.schedule.safety.pathIncluded,
      storageKeyIncluded: input.schedule.safety.storageKeyIncluded,
      objectTargetIncluded: input.schedule.safety.objectTargetIncluded,
      rawPayloadIncluded: input.schedule.safety.rawPayloadIncluded,
      blobIncluded: input.schedule.safety.blobIncluded,
      signedUrlIncluded: input.schedule.safety.signedUrlIncluded,
      credentialIncluded: input.schedule.safety.credentialIncluded,
      mutationAllowed: input.schedule.safety.mutationAllowed
    }
  };
}

function orderAttachmentPreviewRetentionDryRunArtifactScheduleDescriptors(
  schedules: readonly AttachmentPreviewRetentionDryRunArtifactScheduleDescriptor[]
): AttachmentPreviewRetentionDryRunArtifactScheduleDescriptor[] {
  return [...schedules].sort((left, right) => {
    const byIndex = left.index - right.index;
    return byIndex === 0 ? left.scheduleDigest.localeCompare(right.scheduleDigest) : byIndex;
  });
}

function buildAttachmentPreviewRetentionDryRunScheduleDescriptorMaterializationDigest(
  records: readonly AttachmentPreviewRetentionDryRunScheduleDescriptorMaterializationRecord[]
): string {
  return hashIdempotencyParts([
    "attachment-preview-retention-dry-run-schedule-descriptor-materialization",
    ...records.flatMap((record) => [
      String(record.index),
      record.scheduleRef,
      record.scheduleDigest,
      String(record.descriptorCount),
      String(record.totalPreviewBytes),
      ...record.descriptorDigests
    ])
  ]);
}

function assertAttachmentPreviewRetentionDryRunScheduleDescriptorsSafe(
  scheduleDescriptors: AttachmentPreviewRetentionDryRunArtifactScheduleDescriptors
): void {
  if (
    scheduleDescriptors.schema !==
      "testhistory.attachment-preview-retention-dry-run-artifact-schedule-descriptors" ||
    scheduleDescriptors.scope !== "closed-launches" ||
    scheduleDescriptors.artifactKind !== "attachment" ||
    scheduleDescriptors.dryRun !== true ||
    scheduleDescriptors.executionMode !== "dry-run" ||
    scheduleDescriptors.mutationAllowed !== false ||
    !isAttachmentPreviewRetentionDryRunScheduleSafetySafe(scheduleDescriptors.safety)
  ) {
    throw new Error("Attachment preview retention schedule descriptors are unsafe.");
  }

  for (const schedule of scheduleDescriptors.schedules) {
    if (
      schedule.dryRun !== true ||
      schedule.executionMode !== "dry-run" ||
      schedule.mutationAllowed !== false ||
      !isAttachmentPreviewRetentionDryRunScheduleSafetySafe(schedule.safety)
    ) {
      throw new Error("Attachment preview retention schedule descriptor is unsafe.");
    }
  }
}

function isAttachmentPreviewRetentionDryRunScheduleSafetySafe(safety: {
  bounded: boolean;
  descriptorOnly: boolean;
  closedLaunchScope: boolean;
  pathIncluded: boolean;
  storageKeyIncluded: boolean;
  objectTargetIncluded: boolean;
  providerMutationHandleIncluded: boolean;
  rawPayloadIncluded: boolean;
  blobIncluded: boolean;
  signedUrlIncluded: boolean;
  credentialIncluded: boolean;
  mutationAllowed: boolean;
}): boolean {
  return (
    safety.bounded === true &&
    safety.descriptorOnly === true &&
    safety.closedLaunchScope === true &&
    safety.pathIncluded === false &&
    safety.storageKeyIncluded === false &&
    safety.objectTargetIncluded === false &&
    safety.providerMutationHandleIncluded === false &&
    safety.rawPayloadIncluded === false &&
    safety.blobIncluded === false &&
    safety.signedUrlIncluded === false &&
    safety.credentialIncluded === false &&
    safety.mutationAllowed === false
  );
}

function appendAttachmentPreviewRetentionDryRunDiagnostic(
  diagnostics: AttachmentPreviewRetentionDryRunScheduleDiagnostic[],
  diagnostic: AttachmentPreviewRetentionDryRunScheduleDiagnostic
): number {
  if (diagnostics.length < maxAttachmentPreviewRetentionDryRunDiagnostics) {
    diagnostics.push({
      ...diagnostic,
      message: diagnostic.message.slice(0, 160)
    });
    return 0;
  }

  if (
    diagnostics.length === maxAttachmentPreviewRetentionDryRunDiagnostics &&
    diagnostics.every((entry) => entry.code !== "diagnostic-limit-reached")
  ) {
    diagnostics.push({
      code: "diagnostic-limit-reached",
      severity: "warn",
      retryable: false,
      message: "Additional attachment preview retention dry-run diagnostics were omitted."
    });
  }

  return 1;
}

function mergeAttachmentPreviewRetentionDryRunDiagnostics(
  scheduleDiagnostics: readonly AttachmentPreviewRetentionDryRunScheduleDiagnostic[],
  eligibilityDiagnostics: readonly ArtifactPreviewRetentionDiagnostic[]
): AttachmentPreviewRetentionDryRunScheduleDiagnostic[] {
  const diagnostics = [...scheduleDiagnostics];
  for (const diagnostic of eligibilityDiagnostics) {
    appendAttachmentPreviewRetentionDryRunDiagnostic(diagnostics, {
      code: diagnostic.code,
      severity: diagnostic.severity === "error" ? "warn" : diagnostic.severity,
      retryable: false,
      ...(diagnostic.descriptorRef !== undefined
        ? { descriptorRef: diagnostic.descriptorRef }
        : {}),
      message: diagnostic.message
    });
  }

  return diagnostics;
}
