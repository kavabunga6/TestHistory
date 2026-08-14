export const artifactPreviewDescriptorPersistenceVersion = 1;
export const maxArtifactPreviewDescriptorPersistenceBytes = 64 * 1024;

export type ArtifactKind =
  | "allure-result"
  | "allure-container"
  | "attachment"
  | "fixture"
  | "scenario"
  | "environment"
  | "executor"
  | "unknown";

declare const artifactStorageKeyBrand: unique symbol;

export type ArtifactStorageKey = string & {
  readonly [artifactStorageKeyBrand]: true;
};

export type ArtifactCompression = "none" | "gzip";

export type ArtifactResultStatus = "passed" | "failed" | "broken" | "skipped" | "unknown" | "other";

export type ArtifactMetadataSource = "result" | "test-case";

export type ArtifactRetentionClass =
  "passed-short" | "skipped-short" | "failure-diagnostic" | "unknown-diagnostic";

export type ArtifactPreviewDescriptorRetentionPolicyClass =
  "short-lived-preview" | "evidence-retained" | "legal-hold-placeholder";

export type ArtifactPreviewDescriptorRetentionAuditReason =
  | "short-lived-preview-descriptor"
  | "evidence-preview-descriptor"
  | "legal-hold-placeholder-descriptor";

export type ArtifactPreviewDescriptorCleanupEligibility = {
  eligible: boolean;
  reason:
    | "preview-retention-horizon-applies"
    | "evidence-retention-horizon-applies"
    | "legal-hold-placeholder-requires-explicit-release";
};

export type ArtifactPreviewDescriptorRetentionClassification = {
  policyClass: ArtifactPreviewDescriptorRetentionPolicyClass;
  retentionClass: ArtifactRetentionClass;
  cleanupEligibility: ArtifactPreviewDescriptorCleanupEligibility;
  auditReason: ArtifactPreviewDescriptorRetentionAuditReason;
  retentionHorizonDays: number;
  horizon: {
    unit: "days";
    minDays: number;
    maxDays: number;
  };
  safety: {
    bounded: true;
    pathIncluded: false;
    storageKeyIncluded: false;
    rawPayloadIncluded: false;
    blobIncluded: false;
    signedUrlIncluded: false;
  };
};

export type ArtifactCompressionDecisionReason =
  | "below-threshold"
  | "unsupported-binary"
  | "compressible-cost-optimized"
  | "compressible-diagnostic";

export type ArtifactCompressionStrategy = {
  algorithm: ArtifactCompression;
  shouldAttemptCompression: boolean;
  reason: ArtifactCompressionDecisionReason;
  retentionClass: ArtifactRetentionClass;
  originalBytes: number;
  thresholdBytes: number;
  resultStatus: ArtifactResultStatus;
  mimeClass: "compressible" | "unsupported-binary" | "unknown";
  contentType?: string;
};

export type ArtifactPreviewKind = "none" | "text" | "json" | "xml" | "html" | "image";

export type ArtifactPreviewEligibility = {
  eligible: boolean;
  kind: ArtifactPreviewKind;
  reason: "eligible" | "too-large" | "unsupported-binary" | "missing-content-type";
  originalBytes: number;
  maxPreviewBytes: number;
  contentType?: string;
};

export type ArtifactPreviewFlavor =
  "text" | "log" | "json" | "xml" | "html" | "image" | "unsupported-binary" | "unknown";

export type ArtifactPreviewSupport = "inline" | "metadata-only" | "unsupported";

export type ArtifactPreviewTextBody = {
  type: "redacted-text";
  encoding: "utf8";
  value: string;
  lineCount: number;
  truncated: boolean;
  redacted: boolean;
};

export type ArtifactPreviewImageBody = {
  type: "image-metadata";
  mediaType: string;
  inline: false;
  downloadRequired: true;
};

export type ArtifactPreviewMetadataOnlyBody = {
  type: "metadata-only";
};

export type ArtifactPreviewDescriptor = {
  id: string;
  artifactId: string;
  kind: ArtifactPreviewKind;
  flavor: ArtifactPreviewFlavor;
  support: ArtifactPreviewSupport;
  status: "ready" | "metadata-only";
  reason: ArtifactPreviewEligibility["reason"] | "content-unavailable" | "image-metadata-only";
  originalBytes: number;
  previewBytes: number;
  maxPreviewBytes: number;
  contentType?: string;
  sha256: string;
  body: ArtifactPreviewTextBody | ArtifactPreviewImageBody | ArtifactPreviewMetadataOnlyBody;
  safety: {
    descriptorVersion: 1;
    bounded: true;
    pathIncluded: false;
    storageKeyIncluded: false;
    rawPayloadIncluded: false;
    blobIncluded: false;
    signedUrlIncluded: false;
    redactionApplied: boolean;
  };
};

export type ArtifactPreviewDescriptorPersistenceRecord = {
  schema: "testhistory.artifact-preview-descriptor";
  version: typeof artifactPreviewDescriptorPersistenceVersion;
  retentionClass: ArtifactRetentionClass;
  descriptorRetention?: ArtifactPreviewDescriptorRetentionClassification;
  descriptor: ArtifactPreviewDescriptor;
};

export type ArtifactPreviewDescriptorReadModel = Omit<
  ArtifactPreviewDescriptorPersistenceRecord,
  "descriptorRetention"
> & {
  descriptorRetention: ArtifactPreviewDescriptorRetentionClassification;
  serializedBytes: number;
};

export type ArtifactPolicy = {
  compressionMinBytes: number;
  retentionDays: number;
  maxUploadConcurrency: number;
  chunkBytes: number;
  maxArtifactBytes: number;
  maxUploadSessionBytes: number;
  maxUploadChunks: number;
  uploadSessionTtlMinutes: number;
  cleanupGraceDays: number;
  cleanupBatchSize: number;
  cleanupBatchIntervalMinutes: number;
  metadataSource: ArtifactMetadataSource;
};

export type ArtifactCleanupStatus = "retained" | "eligible";

export type ArtifactCompressionMetadata = {
  algorithm: ArtifactCompression;
  originalBytes: number;
  storedBytes: number;
  ratio: number;
  savedBytes: number;
};

export type ArtifactRetentionMetadata = {
  days: number;
  expiresAt: string;
  cleanupEligibleAt: string;
};

export type ArtifactCleanupMetadata = {
  status: ArtifactCleanupStatus;
  reason: "retention-active" | "retention-expired";
  evaluatedAt: string;
};

export type ArtifactStorageMetadata = {
  backend: "s3-compatible";
  accessTier: "frequent";
  diskIsolation: "separate-from-db";
  kubernetesVolume: "csi";
  key: ArtifactStorageKey;
};

export type ArtifactUploadMetadata = {
  source: ArtifactMetadataSource;
  resultStatus: ArtifactResultStatus;
};

export type ArtifactCleanupPolicyRule = {
  id: string;
  kinds: ArtifactKind[];
  statuses: ArtifactResultStatus[];
  maxAgeHours: number;
};

export type ArtifactCleanupBatch = {
  index: number;
  size: number;
  storageKeys: ArtifactStorageKey[];
  scheduledAfterMinutes: number;
};
