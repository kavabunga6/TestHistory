import type {
  ArtifactCleanupMetadata,
  ArtifactCleanupBatch,
  ArtifactCleanupPolicyRule,
  ArtifactCleanupStatus,
  ArtifactCompression,
  ArtifactCompressionMetadata,
  ArtifactKind,
  ArtifactRetentionMetadata,
  ArtifactStorageMetadata,
  ArtifactStorageKey,
  ArtifactUploadMetadata
} from "./modelTypes.js";

export type ArtifactDescriptor = {
  id: string;
  launchId: string;
  projectId?: string;
  path: string;
  kind: ArtifactKind;
  contentType?: string;
  originalBytes: number;
  storedBytes: number;
  sha256: string;
  compression: ArtifactCompression;
  compressionMetadata: ArtifactCompressionMetadata;
  storage: ArtifactStorageMetadata;
  storageKey: ArtifactStorageKey;
  expiresAt: string;
  retention: ArtifactRetentionMetadata;
  cleanup: ArtifactCleanupMetadata;
  upload: ArtifactUploadMetadata;
  createdAt: string;
};

export type PreparedArtifact = ArtifactDescriptor & {
  payload: Buffer;
};

export type ArtifactChecksumDuplicate = {
  sha256: string;
  artifactIds: string[];
  storageKeys: ArtifactStorageKey[];
  count: number;
};

export type ArtifactStorageKeyParts = {
  launchId: string;
  kind: ArtifactKind;
  artifactId: string;
};

export type ArtifactQuery = {
  id?: string;
  launchId?: string;
  projectId?: string;
  kind?: ArtifactKind;
  cleanupStatus?: ArtifactCleanupStatus;
  createdBefore?: string;
  createdAfter?: string;
  limit?: number;
  cursor?: string;
};

export type ArtifactPage<T> = {
  items: T[];
  nextCursor?: string;
};

export type ArtifactCleanupBatchRecord = {
  id: string;
  status: "pending" | "running" | "completed" | "failed";
  storageKeys: ArtifactStorageKey[];
  scheduledAt: string;
  startedAt?: string;
  completedAt?: string;
  error?: string;
};

export type ArtifactCleanupSimulation = {
  query: {
    scope: "closed-launches";
    scannedRecords: number;
    eligibleRecords: number;
    skippedOpenLaunchRecords: number;
    batchSize: number;
    batchIntervalMinutes: number;
    globalRuleCount: number;
    projectRuleCount: number;
  };
  eligible: Array<{
    artifact: ArtifactDescriptor;
    rule: ArtifactCleanupPolicyRule;
    ageHours: number;
  }>;
  batches: ArtifactCleanupBatch[];
};

export type ArtifactRepositoryPort = {
  save(descriptor: ArtifactDescriptor): Promise<void>;
  findById(id: string): Promise<ArtifactDescriptor | undefined>;
  list(query: ArtifactQuery): Promise<ArtifactPage<ArtifactDescriptor>>;
  markCleanupEligible(ids: string[], evaluatedAt: string): Promise<void>;
  deleteById(id: string): Promise<void>;
};

export type ArtifactCleanupBatchRepositoryPort = {
  save(batch: ArtifactCleanupBatchRecord): Promise<void>;
  findPending(limit: number, now: string): Promise<ArtifactCleanupBatchRecord[]>;
  markRunning(id: string, startedAt: string): Promise<void>;
  markCompleted(id: string, completedAt: string): Promise<void>;
  markFailed(id: string, error: string, failedAt: string): Promise<void>;
};

export type ArtifactPrimaryStoreRepositories = {
  artifacts: ArtifactRepositoryPort;
  cleanupBatches: ArtifactCleanupBatchRepositoryPort;
};

export type ArtifactPrimaryStorePort = {
  repositories: ArtifactPrimaryStoreRepositories;
  transaction<T>(work: (repositories: ArtifactPrimaryStoreRepositories) => Promise<T>): Promise<T>;
};

export type ArtifactObject = {
  key: ArtifactStorageKey;
  body: Buffer;
  originalBytes: number;
  storedBytes: number;
  sha256: string;
  compression: ArtifactCompression;
  contentType?: string;
};

export type ArtifactObjectMetadata = Omit<ArtifactObject, "body"> & {
  updatedAt: string;
};

export type ArtifactObjectWriteReceipt = {
  key: ArtifactStorageKey;
  etag?: string;
  storedBytes: number;
  writtenAt: string;
};

export type ArtifactObjectStorePort = {
  putObject(object: ArtifactObject): Promise<ArtifactObjectWriteReceipt>;
  getObject(key: ArtifactStorageKey): Promise<ArtifactObject | undefined>;
  headObject(key: ArtifactStorageKey): Promise<ArtifactObjectMetadata | undefined>;
  deleteObjects(
    keys: ArtifactStorageKey[]
  ): Promise<{ deleted: ArtifactStorageKey[]; missing: ArtifactStorageKey[] }>;
};

export type ArtifactQueueMessage =
  | {
      type: "artifact.object.write-requested";
      artifactId: string;
      storageKey: ArtifactStorageKey;
      requestedAt: string;
    }
  | {
      type: "artifact.cleanup.requested";
      batchId: string;
      storageKeys: ArtifactStorageKey[];
      requestedAt: string;
      reason: "retention-expired" | "policy-rule";
    };

export type ArtifactQueuePort = {
  enqueue(message: ArtifactQueueMessage): Promise<void>;
  enqueueMany(messages: ArtifactQueueMessage[]): Promise<void>;
};
