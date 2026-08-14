import type {
  ArtifactPreviewDescriptor,
  ArtifactPreviewDescriptorRetentionClassification,
  ArtifactPreviewDescriptorRetentionPolicyClass,
  ArtifactDescriptor,
  ArtifactRetentionClass,
  ArtifactResultStatus
} from "@testhistory/artifacts";
import type { DefectMuteAuditEvent, DefectMuteReplayProjection } from "@testhistory/domain";

import type {
  PipelineStatusTransition,
  RetrySafePipelineSummary,
  DefectMuteProjectionAdapterKind,
  DefectMuteProjectionSummary
} from "./workerTypesPart01.js";

export type DefectMuteProjectionPlan = {
  transitions: PipelineStatusTransition[];
  diagnostics: {
    eventIdHashes: readonly string[];
    omittedEventIdCount: number;
  };
  summary: DefectMuteProjectionSummary;
};

export type DefectMuteProjectionApplyResult = DefectMuteProjectionSummary & {
  adapterKind: DefectMuteProjectionAdapterKind;
  boundary: "worker-local-mute-projection";
  consistency: "append-only-replay";
  appliedAt: string;
  idempotencyKeyHash: string;
  receivedEventCount: number;
  appendedEventCount: number;
  unchangedEventCount: number;
  totalStoredEventCount: number;
};

export type DefectMuteProjectionAdapter = {
  kind: DefectMuteProjectionAdapterKind;
  applyEvents: (input: {
    projectId: string;
    events: readonly DefectMuteAuditEvent[];
    projectionDigest: string;
    at: string;
  }) => DefectMuteProjectionApplyResult;
  getProjection: (projectId: string) => DefectMuteReplayProjection;
  snapshot: () => DefectMuteReplayProjection[];
};

export type DefectMuteReplayInvariantMaterializationRecord = {
  invariantRef: string;
  projectId: string;
  source: "projected-defect-mute-state";
  materializedAt: string;
  deterministic: boolean;
  recomputable: boolean;
  projectScoped: boolean;
  appendOnly: {
    uniqueProjectedEventIds: boolean;
    projectedEventCount: number;
    duplicateEventCount: number;
    duplicateEventIdHashes: readonly string[];
  };
  redaction: {
    passed: boolean;
    leakedMarkerHashes: readonly string[];
  };
  rawEffectiveSeparation: {
    effectiveStateExcludesRawFailureHistory: boolean;
    rawFailureHistoryPreserved: boolean;
    rawFailureHistoryNotMutatedByUnmute: boolean;
    rawFailureOccurrenceCount: number;
    effectiveRecordCount: number;
    rawFailurePayloadIncluded: false;
  };
  projectionDigest: string;
  recomputedDigest: string;
  evidenceDigest: string;
};

export type DefectMuteReplayInvariantMaterializationSummary = {
  projectId: string;
  materializedRecordCount: number;
  deterministic: boolean;
  recomputable: boolean;
  projectScoped: boolean;
  appendOnlyUniqueProjectedEventIds: boolean;
  redactionPassed: boolean;
  effectiveStateExcludesRawFailureHistory: boolean;
  rawFailureHistoryPreserved: boolean;
  rawFailureHistoryNotMutatedByUnmute: boolean;
  rawFailureOccurrenceCount: number;
  effectiveRecordCount: number;
  materializationDigest: string;
  projectedMuteStateCompatible: true;
  mutationBoundary: "worker-materialization-only-no-rest-or-mcp-or-ui-claims";
  plannedOperations: readonly [
    "defect_mute.replay_invariant.summarize",
    "defect_mute.replay_invariant.materialize"
  ];
};

export type DefectMuteReplayInvariantMaterializationPlan = {
  boundary: "worker-local-defect-mute-replay-invariant-materialization";
  consistency: "retry-safe-idempotent-projected-mute-state";
  scope: "project";
  readOnly: true;
  rawFailurePayloadsIncluded: false;
  transitions: PipelineStatusTransition[];
  record: DefectMuteReplayInvariantMaterializationRecord;
  summary: DefectMuteReplayInvariantMaterializationSummary;
};

export type DefectMuteReplayInvariantMaterializationApplyResult =
  DefectMuteReplayInvariantMaterializationSummary & {
    adapterKind: "in-memory-defect-mute-replay-invariant-worker-wip";
    boundary: "worker-local-defect-mute-replay-invariant-materialization";
    consistency: "retry-safe-idempotent-projected-mute-state";
    appliedAt: string;
    idempotencyKeyHash: string;
    upsertedRecordCount: number;
    updatedRecordCount: number;
    unchangedRecordCount: number;
    totalRecordCount: number;
  };

export type DefectMuteReplayInvariantMaterializationAdapter = {
  kind: "in-memory-defect-mute-replay-invariant-worker-wip";
  applyProjection: (input: {
    projectId: string;
    projection: DefectMuteReplayProjection;
    materializationDigest: string;
    at: string;
    unsafeMarkers?: readonly string[];
  }) => DefectMuteReplayInvariantMaterializationApplyResult;
  getRecord: (projectId: string) => DefectMuteReplayInvariantMaterializationRecord | undefined;
  snapshot: () => DefectMuteReplayInvariantMaterializationRecord[];
};

export type ArtifactCleanupBatchSummary = {
  index: number;
  candidateCount: number;
  totalBytes: number;
  scheduledAfterMinutes: number;
  maxCount: number;
  maxBytes: number;
  candidateRefs?: string[];
  batchDigest?: string;
  deletionExecution?: false;
};

export type ArtifactCleanupPlanNoopReason = "open-launches-only" | "no-candidates";

export type ArtifactCleanupPlanAuditEvidence = {
  action: "retention.preview" | "cleanup.noop" | "cleanup.dry-run" | "cleanup.execution.planned";
  status: "planned" | "noop";
  scope: "closed-launches";
  dryRun: boolean;
  candidateCount: number;
  deleteRequestedCount: number;
  skippedOpenLaunchRecords: number;
  retainedRecordCount: number;
  batchCount: number;
  totalCandidateBytes: number;
  planDigest?: string;
  noopReason?: ArtifactCleanupPlanNoopReason;
};

export type ArtifactCleanupPipelinePlan = {
  transitions: PipelineStatusTransition[];
  dryRun: boolean;
  executionMode: "dry-run" | "delete";
  requestedBatchSize: number | undefined;
  plannedBatchSize: number;
  scannedArtifactCount: number;
  stagedCandidateCount: number;
  skippedOpenLaunchRecords: number;
  retainedRecordCount: number;
  deletionBatchCount: number;
  dryRunBatchCount: number;
  dryRunPlanDigest?: string;
  candidateCount: number;
  deleteRequestedCount: number;
  batches: ArtifactCleanupBatchSummary[];
  auditRecordCount: number;
  auditEvidence: ArtifactCleanupPlanAuditEvidence[];
  noopReason?: ArtifactCleanupPlanNoopReason;
  summary: RetrySafePipelineSummary;
};

export type ArtifactPreviewGenerationSource = {
  artifact: ArtifactDescriptor;
  content?: Buffer | string;
  maxPreviewBytes?: number;
  processingError?: {
    code?: string;
    retryable?: boolean;
  };
};

export type ArtifactPreviewGenerationStatus =
  "ready" | "metadata-only" | "unsupported" | "retryable-error" | "terminal-error";

export type ArtifactPreviewGenerationRecord = {
  artifactId: string;
  descriptorRef: string;
  status: ArtifactPreviewGenerationStatus;
  support: ArtifactPreviewDescriptor["support"] | "none";
  reason: ArtifactPreviewDescriptor["reason"] | "preview-generation-error";
  contentType: string | null;
  originalBytes: number;
  previewBytes: number;
  maxPreviewBytes: number;
  derivedPreviewIncluded: boolean;
  retryable: boolean;
  safety: {
    bounded: true;
    pathIncluded: false;
    storageKeyIncluded: false;
    rawPayloadIncluded: false;
    blobIncluded: false;
    signedUrlIncluded: false;
    redactionApplied: boolean;
  };
};

export type ArtifactPreviewGenerationDiagnostic = {
  code: "duplicate-artifact" | "preview-generation-error";
  severity: "info" | "warn" | "error";
  retryable: boolean;
  artifactRef?: string;
  descriptorRef?: string;
  message: string;
};

export type ArtifactPreviewGenerationPlan = {
  boundary: "wip-artifact-preview-worker";
  consistency: "retry-safe-idempotent-preview-upsert";
  transitions: PipelineStatusTransition[];
  records: ArtifactPreviewGenerationRecord[];
  descriptors: ArtifactPreviewDescriptor[];
  diagnostics: ArtifactPreviewGenerationDiagnostic[];
  summary: RetrySafePipelineSummary & {
    projectId: string;
    launchId: string;
    sourceArtifactCount: number;
    descriptorCount: number;
    readyCount: number;
    metadataOnlyCount: number;
    unsupportedCount: number;
    retryableErrorCount: number;
    terminalErrorCount: number;
    inlinePreviewBytes: number;
    generationDigest: string;
    plannedOperations: readonly ["artifact.preview.generate", "artifact.preview.upsert"];
  };
};

export type ArtifactPreviewDescriptorStoreAdapterKind = "in-memory-preview-descriptor-wip";

export type ArtifactPreviewDescriptorApplyResult = {
  adapterKind: ArtifactPreviewDescriptorStoreAdapterKind;
  boundary: "wip-preview-descriptor-store";
  consistency: "retry-safe-upsert";
  generationDigest: string;
  appliedAt: string;
  idempotencyKeyHash: string;
  receivedDescriptorCount: number;
  upsertedDescriptorCount: number;
  updatedDescriptorCount: number;
  unchangedDescriptorCount: number;
  totalDescriptorCount: number;
};

export type ArtifactPreviewDescriptorStoreAdapter = {
  kind: ArtifactPreviewDescriptorStoreAdapterKind;
  applyDescriptors: (input: {
    descriptors: readonly ArtifactPreviewDescriptor[];
    generationDigest: string;
    at: string;
  }) => ArtifactPreviewDescriptorApplyResult;
  snapshot: () => ArtifactPreviewDescriptor[];
};

export type ArtifactPreviewRetentionDescriptorSource = {
  descriptor: ArtifactPreviewDescriptor;
  launchId?: string;
  observedAt?: string;
  resultStatus?: ArtifactResultStatus;
  retentionClass?: ArtifactRetentionClass;
  policyClass?: ArtifactPreviewDescriptorRetentionPolicyClass;
  retentionHorizonDays?: number;
};

export type ArtifactPreviewRetentionEligibilityStatus = "eligible" | "retained" | "preserved";

export type ArtifactPreviewRetentionEligibilityRecord = {
  descriptorRef: string;
  artifactRef: string;
  status: ArtifactPreviewRetentionEligibilityStatus;
  retentionClass: ArtifactRetentionClass;
  policyClass: ArtifactPreviewDescriptorRetentionPolicyClass;
  auditReason: ArtifactPreviewDescriptorRetentionClassification["auditReason"];
  cleanupEligibilityReason: ArtifactPreviewDescriptorRetentionClassification["cleanupEligibility"]["reason"];
  observedAt: string;
  cleanupEligibleAt: string | null;
  retentionHorizonDays: number;
  evidencePreserved: boolean;
  legalHoldPlaceholder: boolean;
  safety: ArtifactPreviewDescriptorRetentionClassification["safety"];
};

export type ArtifactPreviewRetentionCleanupCandidate = {
  descriptorRef: string;
  artifactRef: string;
  retentionClass: ArtifactRetentionClass;
  policyClass: ArtifactPreviewDescriptorRetentionPolicyClass;
  auditReason: ArtifactPreviewDescriptorRetentionClassification["auditReason"];
  cleanupEligibleAt: string;
  reason: ArtifactPreviewDescriptorRetentionClassification["cleanupEligibility"]["reason"];
};

export type ArtifactPreviewRetentionDiagnostic = {
  code: "duplicate-descriptor" | "invalid-descriptor-retention" | "diagnostic-limit-reached";
  severity: "info" | "warn" | "error";
  retryable: false;
  descriptorRef?: string;
  message: string;
};

export type ArtifactPreviewRetentionEligibilityPlan = {
  boundary: "worker-local-preview-retention-eligibility";
  consistency: "retry-safe-idempotent-retention-projection";
  transitions: PipelineStatusTransition[];
  records: ArtifactPreviewRetentionEligibilityRecord[];
  cleanupEligibleDescriptors: ArtifactPreviewRetentionCleanupCandidate[];
  diagnostics: ArtifactPreviewRetentionDiagnostic[];
  summary: RetrySafePipelineSummary & {
    sourceDescriptorCount: number;
    classifiedDescriptorCount: number;
    cleanupEligibleDescriptorCount: number;
    retainedDescriptorCount: number;
    evidenceDescriptorCount: number;
    legalHoldPlaceholderCount: number;
    invalidDescriptorCount: number;
    duplicateDescriptorCount: number;
    omittedDiagnosticCount: number;
    projectionDigest: string;
    plannedOperations: readonly [
      "artifact.preview.retention.classify",
      "artifact.preview.cleanup.project"
    ];
  };
};

export type AttachmentPreviewRetentionDryRunScheduleDiagnostic = {
  code:
    | "open-launch-descriptor-skipped"
    | "missing-launch-scope"
    | "duplicate-descriptor"
    | "invalid-descriptor-retention"
    | "diagnostic-limit-reached";
  severity: "info" | "warn";
  retryable: false;
  descriptorRef?: string;
  message: string;
};

export type AttachmentPreviewRetentionDryRunScheduleBatch = {
  index: number;
  descriptorCount: number;
  scheduledAfterMinutes: number;
  maxCount: number;
  descriptorRefs: string[];
  omittedDescriptorRefCount: number;
  batchDigest: string;
  deletionExecution: false;
  deleteRequestedCount: 0;
};

export type AttachmentPreviewRetentionDryRunSchedulePlan = {
  boundary: "worker-local-attachment-preview-retention-dry-run-scheduling";
  consistency: "retry-safe-idempotent-descriptor-schedule";
  scope: "closed-launches";
  dryRun: true;
  readOnly: true;
  deletionExecution: false;
  deleteRequestedCount: 0;
  transitions: PipelineStatusTransition[];
  requestedBatchSize: number | undefined;
  plannedBatchSize: number;
  batchCount: number;
  batches: AttachmentPreviewRetentionDryRunScheduleBatch[];
  diagnostics: AttachmentPreviewRetentionDryRunScheduleDiagnostic[];
  summary: RetrySafePipelineSummary & {
    sourceDescriptorCount: number;
    closedLaunchDescriptorCount: number;
    skippedOpenLaunchDescriptorCount: number;
    missingLaunchScopeDescriptorCount: number;
    cleanupEligibleDescriptorCount: number;
    scheduledDescriptorCount: number;
    retainedDescriptorCount: number;
    invalidDescriptorCount: number;
    duplicateDescriptorCount: number;
    omittedDiagnosticCount: number;
    deleteRequestedCount: 0;
    scheduleDigest: string;
    projectionDigest: string;
    plannedOperations: readonly [
      "artifact.preview.retention.classify",
      "artifact.preview.retention.dry-run.schedule"
    ];
  };
};
