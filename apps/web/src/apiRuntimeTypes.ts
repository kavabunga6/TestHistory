export type UploadMode = "json-batch" | "chunked-json";

export type UploadCapabilitySummary = {
  apiVersion: string;
  batchJson: boolean;
  chunkedJson: boolean;
  archivePlanned: boolean;
  multipartS3Planned: boolean;
  compressionMinBytes: number;
  retentionDays: number;
  maxUploadConcurrency: number;
  chunkBytes: number;
  modules: string[];
};

export type RuntimeUiState = "ready" | "running" | "waiting" | "blocked";

export type RuntimeTimelineStep = {
  id: string;
  label: string;
  description: string;
  state: RuntimeUiState;
  meta: string;
};

export type RuntimeQueue = {
  name: string;
  scope: "ingestion" | "processing" | "cleanup";
  state: RuntimeUiState;
  detail: string;
  wip?: boolean;
};

export type RuntimeWorkerStatus = {
  id: string;
  label: string;
  value: string;
  state: RuntimeUiState;
  detail: string;
  wip?: boolean;
};

export type RuntimeCleanupReadiness = {
  label: string;
  state: RuntimeUiState;
  retention: string;
  storage: string;
  queue: string;
};

export type RuntimeUiModel = {
  lifecycle: RuntimeTimelineStep[];
  pipeline: RuntimeTimelineStep[];
  cleanup: RuntimeCleanupReadiness;
  queues: RuntimeQueue[];
  workers: RuntimeWorkerStatus[];
};
