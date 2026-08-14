import type {
  ArtifactChecksumDuplicateReadModel,
  ArtifactDescriptorReadModel
} from "./artifacts.js";
import type { LaunchStatus, LaunchSummary } from "./launches.js";

export type UploadJobStatus =
  "queued" | "processing" | "completed" | "completed_with_errors" | "failed";

export type UploadJobReadModel = {
  id: string;
  launchId: string;
  status: UploadJobStatus;
  receivedFiles: number;
  importedResults: number;
  duplicateResults: number;
  storedArtifacts: number;
  errors: Array<{ path: string; errors: string[]; warnings: string[] }>;
  createdAt: string;
  updatedAt: string;
  lease?: {
    claimedBy: string;
    claimedAt: string;
    expiresAt: string;
    active: boolean;
  };
};

export type UploadSessionStatus =
  "open" | "completing" | "completed" | "aborted" | "expired" | "failed";

export type UploadSessionFileReadModel = {
  path: string;
  totalChunks: number;
  receivedChunks: number;
  totalBytes?: number;
  receivedBytes: number;
  progress: number;
};

export type UploadSessionReadModel = {
  id: string;
  launchId: string;
  path: string;
  status: UploadSessionStatus;
  totalChunks: number;
  receivedChunks: number;
  totalBytes?: number;
  receivedBytes: number;
  progress: number;
  files: UploadSessionFileReadModel[];
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  closedAt?: string;
  completedJobId?: string;
  cleanup?: {
    chunksClearedAt?: string;
    reason: "completed" | "aborted" | "expired" | "failed";
  };
};

export type UploadDiagnosticSeverity = "info" | "warning" | "error";

export type UploadDiagnosticReadModel = {
  scope: "session" | "file" | "job" | "queue";
  severity: UploadDiagnosticSeverity;
  code: string;
  message: string;
  path?: string;
};

export type UploadProgressReadModel = {
  totalUnits: number;
  processedUnits: number;
  percent: number;
  totalBytes?: number;
  processedBytes?: number;
};

export type QueueWorkerStatus = "idle" | "accepting" | "busy" | "blocked" | "offline";

export type QueueWorkerStatusReadModel = {
  mode: "inline" | "queue";
  queue: {
    name: string;
    status: QueueWorkerStatus;
    depth: number;
    inFlight: number;
    deadLetters: number;
  };
  workers: Array<{
    name: string;
    status: QueueWorkerStatus;
    concurrency: number;
    activeJobs: number;
    heartbeatAt?: string;
  }>;
  capacity?: {
    targetUsers: number;
    targetResults: number;
    targetWindowHours: number;
    targetResultsPerHour: number;
    targetResultsPerSecond: number;
    estimatedResultsPerHourCapacity: number;
    capacityMargin: number;
    status: "ok" | "at_risk" | "insufficient";
  };
  backpressure?: {
    enabled: boolean;
    accepting: boolean;
    reason: "below_watermark" | "queue_depth_watermark" | "inflight_watermark" | "dead_letters";
    retryAfterMs: number;
    queueDepthWatermark: number;
    inFlightWatermark: number;
    queueDepthRatio: number;
    inFlightRatio: number;
  };
  limits?: {
    jsonBatchSyncFileLimit: number;
    jsonBatchSyncByteLimit: number;
    chunkBytes: number;
    maxUploadChunks: number;
    maxUploadSessionBytes: number;
    maxArtifactBytes: number;
    defaultArtifactRetentionDays: number;
  };
  updatedAt: string;
};

export type EnterpriseIngestionReadinessReadModel = {
  kind: "enterprise-ingestion-readiness";
  status: "accepting" | "throttled" | "blocked";
  updatedAt: string;
  profile: {
    users: number;
    resultCount: number;
    windowHours: number;
    targetResultsPerHour: number;
    targetResultsPerSecond: number;
  };
  queue: QueueWorkerStatusReadModel;
  totals: {
    launches: number;
    sessions: number;
    jobs: number;
    openSessions: number;
    queuedJobs: number;
    processingJobs: number;
    failedJobs: number;
    receivedFiles: number;
    importedResults: number;
    storedArtifacts: number;
  };
  uploadModes: {
    jsonBatch: {
      enterpriseRecommended: false;
      fileLimit: number;
      byteLimit: number;
    };
    chunked: {
      enterpriseRecommended: true;
      chunkBytes: number;
      maxChunks: number;
      maxSessionBytes: number;
    };
    archive: {
      enterpriseRecommended: true;
      manifestEntriesLimit: number;
      storesArchivePayloadOnApi: false;
    };
  };
  recommendations: string[];
};

export type UploadIngestionStatusReadModel = {
  id: string;
  kind: "session" | "job";
  launchId: string;
  status: UploadSessionStatus | UploadJobStatus;
  progress: UploadProgressReadModel;
  diagnostics: UploadDiagnosticReadModel[];
  queue: QueueWorkerStatusReadModel;
  session?: UploadSessionReadModel;
  job?: UploadJobReadModel;
  links: {
    self: string;
    launch: string;
    session?: string;
    job?: string;
  };
};

export type LaunchIngestionStatusReadModel = {
  launchId: string;
  launchStatus: LaunchStatus;
  progress: UploadProgressReadModel;
  diagnostics: UploadDiagnosticReadModel[];
  queue: QueueWorkerStatusReadModel;
  sessions: UploadSessionReadModel[];
  jobs: UploadJobReadModel[];
  totals: {
    sessions: number;
    jobs: number;
    openSessions: number;
    processingJobs: number;
    completedJobs: number;
    failedJobs: number;
    storedArtifacts: number;
    importedResults: number;
    duplicateResults: number;
  };
};

export type UploadFileInput = {
  path: string;
  content: string;
};

export type UploadBatchRequest = {
  files: UploadFileInput[];
};

export type UploadBatchResponse = {
  job: UploadJobReadModel;
  imported: Array<{ path: string; uuid: string; warnings: string[] }>;
  artifacts: ArtifactDescriptorReadModel[];
  checksumDuplicates: ArtifactChecksumDuplicateReadModel[];
  launch: LaunchSummary;
};

export type ChunkedUploadFileInput = {
  path: string;
  totalChunks: number;
  totalBytes?: number;
};

export type ChunkedUploadCreateRequest = {
  path?: string;
  totalChunks?: number;
  totalBytes?: number;
  files?: ChunkedUploadFileInput[];
};

export type UploadChunkRequest = {
  content: string;
  path?: string;
  contentEncoding?: "utf8" | "base64";
  sha256?: string;
};

export type ChunkedUploadCompleteResponse = UploadBatchResponse & {
  session: UploadSessionReadModel;
};
