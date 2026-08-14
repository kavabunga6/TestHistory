import type { RuntimeDependency, WorkerJobName } from "./workerTypes.js";

export const maxArchiveIntakeDiagnostics = 50;

export const runtimeDependencies: RuntimeDependency[] = [
  {
    id: "postgresql",
    env: "DATABASE_URL",
    required: true,
    purpose: "persist normalized launches, results, test cases, jobs, and cleanup state"
  },
  {
    id: "rabbitmq",
    env: "RABBITMQ_URL",
    required: true,
    purpose: "consume ingestion, launch close, analytics, and artifact cleanup jobs"
  },
  {
    id: "s3-compatible-storage",
    env: "S3_ENDPOINT",
    required: true,
    purpose: "read raw Allure artifacts and write previews or cleanup targets"
  },
  {
    id: "redis",
    env: "REDIS_URL",
    required: true,
    purpose: "short-lived locks, coordination, sessions, and retry throttles"
  },
  {
    id: "clickhouse",
    env: "CLICKHOUSE_URL",
    required: false,
    purpose: "write long-term analytics facts"
  },
  {
    id: "opensearch",
    env: "OPENSEARCH_URL",
    required: false,
    purpose: "index searchable result and test case documents"
  }
];

export const workerJobNames = [
  "ingestion.parse",
  "launch.close",
  "testcase.sync",
  "analytics.materialize",
  "defect.mute.project",
  "archive.diagnostics.replay",
  "artifact.cleanup"
] as const satisfies readonly WorkerJobName[];

export const defaultMaxAttempts = 3;

export const defaultRetryDelayMs = 1_000;

export const defaultHeartbeatStaleMs = 90_000;

export const defaultArtifactCleanupBatchSize = 100;

export const maxArtifactCleanupBatchSize = 500;

export const maxArtifactCleanupBatchBytes = 512 * 1024 * 1024;

export const artifactCleanupBatchIntervalMinutes = 5;

export const maxArtifactPreviewRetentionDiagnostics = 20;

export const defaultAttachmentPreviewRetentionDryRunBatchSize = 100;

export const maxAttachmentPreviewRetentionDryRunBatchSize = 250;

export const maxAttachmentPreviewRetentionDryRunDiagnostics = 20;

export const maxAttachmentPreviewRetentionDryRunRefsPerBatch = 20;
