import type { PageMetadataReadModel } from "./core.js";

export type ArtifactKind =
  | "allure-result"
  | "allure-container"
  | "attachment"
  | "fixture"
  | "scenario"
  | "environment"
  | "executor"
  | "unknown";

export type ArtifactPolicyReadModel = {
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
  metadataSource: "result" | "test-case";
  fieldSources: Record<string, "from_result" | "from_test_case">;
  chunkedUploads: boolean;
  acceptedKinds: ArtifactKind[];
  resultFilePattern: string;
  containerFilePattern: string;
};

export type ArtifactDescriptorReadModel = {
  id: string;
  launchId: string;
  projectId?: string;
  path: string;
  kind: ArtifactKind;
  contentType?: string;
  originalBytes: number;
  storedBytes: number;
  sha256: string;
  compression: "none" | "gzip";
  compressionMetadata: {
    algorithm: "none" | "gzip";
    originalBytes: number;
    storedBytes: number;
    ratio: number;
    savedBytes: number;
  };
  expiresAt: string;
  createdAt: string;
  retention: {
    days: number;
    expiresAt: string;
    cleanupEligibleAt: string;
  };
  cleanup: {
    status: "retained" | "eligible";
    reason: "retention-active" | "retention-expired";
    evaluatedAt: string;
  };
  upload: {
    source: "result" | "test-case";
    resultStatus: "passed" | "failed" | "broken" | "skipped" | "unknown" | "other";
  };
};

export type ArtifactPreviewKind = "none" | "text" | "json" | "xml" | "html" | "image";

export type ArtifactPreviewFlavor =
  "text" | "log" | "json" | "xml" | "html" | "image" | "unsupported-binary" | "unknown";

export type ArtifactPreviewSupport = "inline" | "metadata-only" | "unsupported";

export type ArtifactPreviewReason =
  | "eligible"
  | "too-large"
  | "unsupported-binary"
  | "missing-content-type"
  | "content-unavailable"
  | "image-metadata-only";

export type ArtifactPreviewTextBodyReadModel = {
  type: "redacted-text";
  encoding: "utf8";
  value: string;
  lineCount: number;
  truncated: boolean;
  redacted: boolean;
};

export type ArtifactPreviewImageBodyReadModel = {
  type: "image-metadata";
  mediaType: string;
  inline: false;
  downloadRequired: true;
};

export type ArtifactPreviewMetadataOnlyBodyReadModel = {
  type: "metadata-only";
};

export type ArtifactPreviewSafetyReadModel = {
  descriptorVersion: 1;
  bounded: true;
  pathIncluded: false;
  storageKeyIncluded: false;
  rawPayloadIncluded: false;
  blobIncluded: false;
  signedUrlIncluded: false;
  redactionApplied: boolean;
};

export type ArtifactPreviewDescriptorBaseReadModel = {
  id: string;
  artifactId: string;
  kind: ArtifactPreviewKind;
  flavor: ArtifactPreviewFlavor;
  originalBytes: number;
  previewBytes: number;
  maxPreviewBytes: number;
  contentType?: string;
  sha256: string;
  safety: ArtifactPreviewSafetyReadModel;
};

export type ArtifactPreviewReadyDescriptorReadModel = ArtifactPreviewDescriptorBaseReadModel & {
  support: "inline";
  status: "ready";
  kind: Exclude<ArtifactPreviewKind, "none" | "image">;
  flavor: Exclude<ArtifactPreviewFlavor, "image" | "unsupported-binary" | "unknown">;
  reason: "eligible" | "too-large";
  body: ArtifactPreviewTextBodyReadModel;
};

export type ArtifactPreviewImageDescriptorReadModel = ArtifactPreviewDescriptorBaseReadModel & {
  support: "metadata-only";
  status: "metadata-only";
  kind: "image";
  flavor: "image";
  reason: "image-metadata-only";
  previewBytes: 0;
  body: ArtifactPreviewImageBodyReadModel;
};

export type ArtifactPreviewUnsupportedDescriptorReadModel =
  ArtifactPreviewDescriptorBaseReadModel & {
    support: "unsupported";
    status: "metadata-only";
    kind: "none";
    flavor: "unsupported-binary" | "unknown";
    reason: "unsupported-binary" | "missing-content-type";
    previewBytes: 0;
    body: ArtifactPreviewMetadataOnlyBodyReadModel;
  };

export type ArtifactPreviewUnavailableDescriptorReadModel =
  ArtifactPreviewDescriptorBaseReadModel & {
    support: "metadata-only";
    status: "metadata-only";
    kind: Exclude<ArtifactPreviewKind, "none" | "image">;
    flavor: Exclude<ArtifactPreviewFlavor, "image" | "unsupported-binary" | "unknown">;
    reason: "content-unavailable";
    previewBytes: 0;
    body: ArtifactPreviewMetadataOnlyBodyReadModel;
  };

export type ArtifactPreviewDescriptorReadModel =
  | ArtifactPreviewReadyDescriptorReadModel
  | ArtifactPreviewImageDescriptorReadModel
  | ArtifactPreviewUnsupportedDescriptorReadModel
  | ArtifactPreviewUnavailableDescriptorReadModel;

export type ArtifactPreviewListReadModel = {
  kind: "artifact-preview-list";
  launchId: string;
  projectId: string;
  resultUuid?: string;
  page: PageMetadataReadModel;
  items: ArtifactPreviewDescriptorReadModel[];
};

export type ArtifactChecksumDuplicateReadModel = {
  sha256: string;
  artifactIds: string[];
  count: number;
};

export type ArtifactRetentionPreviewRequest = {
  projectId?: string;
  batchSize?: number;
};

export type ArtifactRetentionPreviewReadModel = {
  expired: ArtifactDescriptorReadModel[];
  retained: ArtifactDescriptorReadModel[];
  skippedOpenLaunchArtifacts: ArtifactDescriptorReadModel[];
  deletionPlan: {
    eligibleLaunchStatus: "closed";
    batchSize: number;
    batches: Array<{ index: number; artifactIds: string[] }>;
  };
};
