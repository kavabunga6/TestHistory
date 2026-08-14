import type { AllureResultsImportDescriptor } from "./launches.js";

export type WorkerJobName =
  | "ingestion.parse"
  | "launch.close"
  | "testcase.sync"
  | "analytics.materialize"
  | "artifact.cleanup";

export type WorkerJobRetryMetadata = {
  attempt: number;
  maxAttempts: number;
  firstQueuedAt: string;
  lastAttemptAt?: string;
  nextAttemptAt?: string;
  lastError?: {
    name: string;
    message: string;
  };
};

export type IngestionParseJobPayload = {
  projectId: string;
  launchId: string;
  importId?: string;
  idempotencyKey?: string;
  source: {
    format: "allure-results" | "junit-xml";
    uri: string;
  };
  allure?: AllureResultsImportDescriptor;
  requestedBy?: string;
};

export type LaunchCloseJobPayload = {
  projectId: string;
  launchId: string;
  closedBy?: string;
};

export type TestCaseSyncJobPayload = {
  projectId: string;
  launchId: string;
  testCaseIds?: string[];
};

export type AnalyticsMaterializeJobPayload = {
  projectId: string;
  launchId?: string;
  window?: {
    from: string;
    to: string;
  };
};

export type ArtifactCleanupJobPayload = {
  projectId?: string;
  before: string;
  batchSize?: number;
  dryRun?: boolean;
};

export type WorkerJobPayloadMap = {
  "ingestion.parse": IngestionParseJobPayload;
  "launch.close": LaunchCloseJobPayload;
  "testcase.sync": TestCaseSyncJobPayload;
  "analytics.materialize": AnalyticsMaterializeJobPayload;
  "artifact.cleanup": ArtifactCleanupJobPayload;
};

export type WorkerJob<TName extends WorkerJobName = WorkerJobName> = {
  id: string;
  name: TName;
  payload: WorkerJobPayloadMap[TName];
  queuedAt: string;
  retry: WorkerJobRetryMetadata;
  traceId?: string;
};

export type DeadLetterWorkerJob<TName extends WorkerJobName = WorkerJobName> = WorkerJob<TName> & {
  deadLetteredAt: string;
  reason: string;
};
