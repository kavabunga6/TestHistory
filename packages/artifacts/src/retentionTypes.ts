import type {
  ArtifactKind,
  ArtifactPreviewDescriptor,
  ArtifactPreviewDescriptorRetentionClassification,
  ArtifactPreviewFlavor,
  ArtifactPreviewKind,
  ArtifactPreviewSupport,
  ArtifactResultStatus,
  ArtifactRetentionClass,
  ArtifactStorageKey
} from "./modelTypes.js";
import { artifactPreviewDescriptorPersistenceVersion } from "./modelTypes.js";

export type ArtifactRetentionStageReason = "cleanup-window-open";

export type ArtifactRetentionCandidate = {
  artifactId: string;
  launchId: string;
  projectId?: string;
  storageKey: ArtifactStorageKey;
  kind: ArtifactKind;
  resultStatus: ArtifactResultStatus;
  retentionClass: ArtifactRetentionClass;
  originalBytes: number;
  storedBytes: number;
  expiresAt: string;
  cleanupEligibleAt: string;
  stagedAt: string;
  reason: ArtifactRetentionStageReason;
  deterministicKey: string;
};

export type ArtifactRetentionPlannerResult = {
  query: {
    scope: "closed-launches";
    scannedRecords: number;
    stagedRecords: number;
    skippedOpenLaunchRecords: number;
    retainedRecords: number;
  };
  candidates: ArtifactRetentionCandidate[];
};

export type ArtifactDeletionBatch = {
  index: number;
  candidateCount: number;
  totalBytes: number;
  storageKeys: ArtifactStorageKey[];
  candidateIds: string[];
  scheduledAfterMinutes: number;
  maxCount: number;
  maxBytes: number;
};

export type ArtifactRetentionDryRunCandidateRef = {
  candidateRef: string;
  launchRef: string;
  projectRef?: string;
  kind: ArtifactKind;
  resultStatus: ArtifactResultStatus;
  retentionClass: ArtifactRetentionClass;
  originalBytes: number;
  storedBytes: number;
  expiresAt: string;
  cleanupEligibleAt: string;
  reason: ArtifactRetentionStageReason;
  safety: {
    redactedCandidateRef: true;
    pathIncluded: false;
    objectTargetIncluded: false;
    rawPayloadIncluded: false;
    blobIncluded: false;
    externalUrlIncluded: false;
    credentialIncluded: false;
    deletionExecution: false;
  };
};

export type ArtifactRetentionDryRunBatch = {
  index: number;
  candidateCount: number;
  totalBytes: number;
  scheduledAfterMinutes: number;
  maxCount: number;
  maxBytes: number;
  candidateRefs: ArtifactRetentionDryRunCandidateRef[];
  batchDigest: string;
  deletionExecution: false;
};

export type ArtifactRetentionDryRunBatchPlan = {
  scope: "closed-launches";
  dryRun: true;
  executionMode: "dry-run";
  deletionExecution: false;
  scannedArtifactCount: number;
  stagedCandidateCount: number;
  skippedOpenLaunchRecords: number;
  retainedRecordCount: number;
  batchCount: number;
  totalCandidateBytes: number;
  planDigest: string;
  batches: ArtifactRetentionDryRunBatch[];
  safety: {
    bounded: true;
    closedLaunchScope: true;
    pathIncluded: false;
    objectTargetIncluded: false;
    rawPayloadIncluded: false;
    blobIncluded: false;
    externalUrlIncluded: false;
    credentialIncluded: false;
    deletionExecution: false;
  };
};

export type AttachmentPreviewRetentionDryRunDescriptorEvidenceItem = {
  descriptorRef: string;
  descriptorDigest: string;
  artifactRef: string;
  launchRef: string;
  projectRef?: string;
  resultStatus: ArtifactResultStatus;
  retentionClass: ArtifactRetentionClass;
  descriptorRetention: ArtifactPreviewDescriptorRetentionClassification;
  preview: {
    kind: ArtifactPreviewKind;
    flavor: ArtifactPreviewFlavor;
    support: ArtifactPreviewSupport;
    status: ArtifactPreviewDescriptor["status"];
    reason: ArtifactPreviewDescriptor["reason"];
    bodyType: ArtifactPreviewDescriptor["body"]["type"];
    originalBytes: number;
    previewBytes: number;
    maxPreviewBytes: number;
    contentType?: string;
    redactionApplied: boolean;
  };
  cleanup: {
    expiresAt: string;
    cleanupEligibleAt: string;
    reason: ArtifactRetentionStageReason;
  };
  safety: {
    bounded: true;
    descriptorOnly: true;
    closedLaunchScope: true;
    pathIncluded: false;
    storageKeyIncluded: false;
    objectTargetIncluded: false;
    rawPayloadIncluded: false;
    blobIncluded: false;
    signedUrlIncluded: false;
    deletionExecution: false;
  };
};

export type AttachmentPreviewRetentionDryRunDescriptorEvidence = {
  schema: "testhistory.attachment-preview-retention-dry-run-descriptor-evidence";
  version: typeof artifactPreviewDescriptorPersistenceVersion;
  scope: "closed-launches";
  artifactKind: "attachment";
  dryRun: true;
  executionMode: "dry-run";
  deletionExecution: false;
  scannedArtifactCount: number;
  stagedCandidateCount: number;
  descriptorCount: number;
  skippedOpenLaunchRecords: number;
  skippedNonAttachmentRecords: number;
  retainedRecordCount: number;
  descriptorLimit: number;
  totalDescriptorPreviewBytes: number;
  evidenceDigest: string;
  descriptors: AttachmentPreviewRetentionDryRunDescriptorEvidenceItem[];
  safety: {
    bounded: true;
    descriptorOnly: true;
    closedLaunchScope: true;
    pathIncluded: false;
    storageKeyIncluded: false;
    objectTargetIncluded: false;
    rawPayloadIncluded: false;
    blobIncluded: false;
    signedUrlIncluded: false;
    deletionExecution: false;
  };
};

export type AttachmentPreviewRetentionDryRunArtifactScheduleDescriptor = {
  scheduleRef: string;
  index: number;
  scheduledAfterMinutes: number;
  descriptorCount: number;
  totalPreviewBytes: number;
  maxDescriptors: number;
  evidenceDigest: string;
  descriptorRefs: string[];
  descriptorDigests: string[];
  dryRun: true;
  executionMode: "dry-run";
  mutationAllowed: false;
  scheduleDigest: string;
  safety: {
    bounded: true;
    descriptorOnly: true;
    closedLaunchScope: true;
    pathIncluded: false;
    storageKeyIncluded: false;
    objectTargetIncluded: false;
    providerMutationHandleIncluded: false;
    rawPayloadIncluded: false;
    blobIncluded: false;
    signedUrlIncluded: false;
    credentialIncluded: false;
    mutationAllowed: false;
  };
};

export type AttachmentPreviewRetentionDryRunArtifactScheduleDescriptors = {
  schema: "testhistory.attachment-preview-retention-dry-run-artifact-schedule-descriptors";
  version: typeof artifactPreviewDescriptorPersistenceVersion;
  scope: "closed-launches";
  artifactKind: "attachment";
  dryRun: true;
  executionMode: "dry-run";
  mutationAllowed: false;
  scannedArtifactCount: number;
  stagedCandidateCount: number;
  descriptorCount: number;
  scheduleDescriptorCount: number;
  skippedOpenLaunchRecords: number;
  skippedNonAttachmentRecords: number;
  retainedRecordCount: number;
  descriptorLimit: number;
  scheduleDescriptorLimit: number;
  scheduleIntervalMinutes: number;
  totalDescriptorPreviewBytes: number;
  scheduleDigest: string;
  schedules: AttachmentPreviewRetentionDryRunArtifactScheduleDescriptor[];
  safety: {
    bounded: true;
    descriptorOnly: true;
    closedLaunchScope: true;
    pathIncluded: false;
    storageKeyIncluded: false;
    objectTargetIncluded: false;
    providerMutationHandleIncluded: false;
    rawPayloadIncluded: false;
    blobIncluded: false;
    signedUrlIncluded: false;
    credentialIncluded: false;
    mutationAllowed: false;
  };
};

export type ArtifactCleanupRetrySafeError = {
  code: "object-store-delete-failed";
  name: string;
  message: string;
  retryable: true;
};

export type ArtifactCleanupAuditAction =
  "retention.preview" | "cleanup.noop" | "cleanup.dry-run" | "cleanup.batch.delete";

export type ArtifactCleanupAuditStatus = "planned" | "noop" | "completed" | "failed";

export type ArtifactCleanupNoopReason = "open-launches-only" | "no-candidates";

export type ArtifactCleanupAuditRecord = {
  id: string;
  runId: string;
  action: ArtifactCleanupAuditAction;
  status: ArtifactCleanupAuditStatus;
  scope: "closed-launches";
  at: string;
  dryRun: boolean;
  candidateCount: number;
  deletedCount: number;
  missingCount: number;
  skippedOpenLaunchRecords: number;
  retainedRecordCount: number;
  totalBytes: number;
  candidateIds: string[];
  storageKeyHashes: string[];
  batchIndex?: number;
  noopReason?: ArtifactCleanupNoopReason;
  error?: ArtifactCleanupRetrySafeError;
};

export type ArtifactCleanupExecutionBatchSummary = {
  index: number;
  candidateCount: number;
  totalBytes: number;
  scheduledAfterMinutes: number;
  maxCount: number;
  maxBytes: number;
  candidateIds: string[];
  storageKeyHashes: string[];
};

export type ArtifactCleanupExecutionResult = {
  runId: string;
  status: "noop" | "completed" | "partial-failure" | "failed";
  scope: "closed-launches";
  dryRun: boolean;
  scannedArtifactCount: number;
  stagedCandidateCount: number;
  skippedOpenLaunchRecords: number;
  retainedRecordCount: number;
  deletionBatchCount: number;
  deleteRequestedCount: number;
  deletedCount: number;
  missingCount: number;
  failedBatchCount: number;
  totalCandidateBytes: number;
  noopReason?: ArtifactCleanupNoopReason;
  batches: ArtifactCleanupExecutionBatchSummary[];
  audit: ArtifactCleanupAuditRecord[];
};
