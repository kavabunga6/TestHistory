import type {
  AllureStatus,
  IngestionParseJobPayload,
  WorkerJobName as ContractWorkerJobName,
  WorkerJobPayloadMap as ContractWorkerJobPayloadMap,
  WorkerJobRetryMetadata
} from "@testhistory/contracts";
import type {
  DefectClusterLifecycleState,
  DefectClusterReadModel,
  DefectMuteAuditEvent
} from "@testhistory/domain";

import type {
  ArchiveIntakeMetadataSummary,
  ArchiveDiagnosticReplayEvent
} from "./workerTypesPart03.js";

export type RuntimeDependency = {
  id: string;
  env: string;
  required: boolean;
  purpose: string;
};

export type WorkerLogger = {
  log: (message?: unknown, ...optionalParams: unknown[]) => void;
  warn?: (message?: unknown, ...optionalParams: unknown[]) => void;
  error?: (message?: unknown, ...optionalParams: unknown[]) => void;
};

export type WorkerJobContext = {
  log: (level: WorkerLogLevel, event: string, details?: Record<string, unknown>) => void;
  enqueue: <TName extends WorkerJobName>(
    input: EnqueueWorkerJob<TName>
  ) => EnqueueWorkerJobResult<TName>;
  now: () => Date;
};

export type WorkerJobHandler<TName extends WorkerJobName> = (
  job: WorkerJob<TName>,
  context: WorkerJobContext
) => Promise<void> | void;

export type WorkerJobHandlerMap = {
  [TName in WorkerJobName]: WorkerJobHandler<TName>;
};

export type DefectMuteProjectionJobPayload = {
  projectId: string;
  events: readonly DefectMuteAuditEvent[];
};

export type ArchiveDiagnosticReplayJobPayload = {
  projectId: string;
  launchId: string;
  archiveRef: string;
  events: readonly ArchiveDiagnosticReplayEvent[];
};

export type WorkerJobName =
  ContractWorkerJobName | "defect.mute.project" | "archive.diagnostics.replay";

export type WorkerJobPayloadMap = ContractWorkerJobPayloadMap & {
  "defect.mute.project": DefectMuteProjectionJobPayload;
  "archive.diagnostics.replay": ArchiveDiagnosticReplayJobPayload;
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

export type EnqueueWorkerJob<TName extends WorkerJobName = WorkerJobName> = {
  id: string;
  name: TName;
  payload: WorkerJobPayloadMap[TName];
  traceId?: string;
};

export type EnqueueWorkerJobResult<TName extends WorkerJobName = WorkerJobName> =
  | {
      status: "enqueued";
      job: WorkerJob<TName>;
      idempotencyKeyHash?: string;
    }
  | {
      status: "duplicate";
      job: WorkerJob<TName>;
      duplicateOfJobId: string;
      idempotencyKeyHash: string;
    };

export type ProcessNextResult =
  | { status: "idle" }
  | { status: "deferred"; nextAttemptAt: string }
  | { status: "completed"; job: WorkerJob }
  | { status: "retry"; job: WorkerJob }
  | { status: "dead-lettered"; job: DeadLetterWorkerJob };

export type WorkerLogLevel = "info" | "warn" | "error";

export type WorkerJobStatusState =
  "queued" | "running" | "completed" | "retry_scheduled" | "dead_lettered" | "duplicate";

export type WorkerJobStatusRecord = {
  jobId: string;
  jobName: WorkerJobName;
  state: WorkerJobStatusState;
  queuedAt: string;
  updatedAt: string;
  attempt: number;
  maxAttempts: number;
  traceId?: string;
  idempotencyKeyHash?: string;
  duplicateOfJobId?: string;
  nextAttemptAt?: string;
  lastAttemptAt?: string;
  lastError?: WorkerJobRetryMetadata["lastError"];
  deadLetteredAt?: string;
  reason?: string;
};

export type DuplicateWorkerJob = {
  job: WorkerJob;
  duplicateOfJobId: string;
  idempotencyKeyHash: string;
  detectedAt: string;
};

export type WorkerQueueSnapshot = {
  queued: WorkerJob[];
};

export type WorkerQueueAdapter = {
  kind: "rabbitmq-mock";
  publish: (job: WorkerJob) => void;
  takeRunnable: (currentTime: Date) => WorkerJob | undefined;
  requeue: (job: WorkerJob) => void;
  getNextAttemptAt: () => string | undefined;
  snapshot: () => WorkerQueueSnapshot;
};

export type WorkerDispatcherSnapshot = WorkerQueueSnapshot & {
  completed: WorkerJob[];
  deadLetters: DeadLetterWorkerJob[];
  duplicates: DuplicateWorkerJob[];
  statuses: WorkerJobStatusRecord[];
};

export type WorkerHeartbeat = {
  status: "ok" | "degraded";
  at: string;
  live: true;
  ready: boolean;
  queueDepth: number;
  completedJobs: number;
  deadLetterJobs: number;
  duplicateJobs: number;
  retryScheduledJobs: number;
  requiredDependencies: number;
  configuredRequiredDependencies: number;
  queues: readonly WorkerJobName[];
};

export type WorkerHealthSnapshot = {
  status: "ok" | "degraded";
  live: true;
  ready: boolean;
  checkedAt: string;
  dependencies: Array<{
    id: string;
    required: boolean;
    configured: boolean;
  }>;
  queue: {
    adapter: WorkerQueueAdapter["kind"];
    depth: number;
    completedJobs: number;
    deadLetterJobs: number;
    duplicateJobs: number;
    retryScheduledJobs: number;
  };
  heartbeat: {
    lastHeartbeatAt?: string;
    stale: boolean;
  };
};

export type ApiUploadQueueFetch = (
  input: string | URL,
  init?: RequestInit
) => Promise<Pick<Response, "ok" | "status" | "json" | "text">>;

export type ApiUploadQueueWorkerOptions = {
  baseUrl: string;
  limit?: number;
  maxJobs?: number;
  workerId?: string;
  leaseMs?: number;
  fetch?: ApiUploadQueueFetch;
  headers?: Record<string, string>;
  logger?: WorkerLogger;
};

export type ApiUploadQueueWorkerResult = {
  status: "idle" | "processed" | "partial_failure" | "failed";
  polledJobs: number;
  processedJobs: number;
  failedJobs: number;
  jobIds: string[];
  errors: Array<{ jobId?: string; status?: number; message: string }>;
};

export type WorkerJobEnvelopeValidationResult =
  { ok: true; job: EnqueueWorkerJob } | { ok: false; issues: string[] };

export type IngestionParseMetadataSummary = {
  projectId: string;
  launchId: string;
  sourceFormat: IngestionParseJobPayload["source"]["format"];
  hasImportId: boolean;
  hasIdempotencyKey: boolean;
  allure?: {
    results: {
      total: number;
      withUuid: number;
      withHistoryId: number;
      withTestCaseId: number;
      withContentDigest: number;
      withDuration: number;
      attachmentReferenceCount: number;
      statusCounts: Partial<Record<AllureStatus, number>>;
    };
    attachments: {
      total: number;
      withContentDigest: number;
      withSizeBytes: number;
      totalSizeBytes: number;
      referencedByResultCount: number;
      typeCounts: Record<string, number>;
    };
  };
  archiveManifest?: ArchiveIntakeMetadataSummary;
};

export type PipelineStatusTransition = {
  state: string;
  at: string;
};

export type RetrySafePipelineSummary = Record<
  string,
  string | number | boolean | null | readonly string[]
>;

export type PlannedChildWorkerJob =
  EnqueueWorkerJob<"testcase.sync"> | EnqueueWorkerJob<"analytics.materialize">;

export type LaunchClosePipelinePlan = {
  transitions: PipelineStatusTransition[];
  childJobs: PlannedChildWorkerJob[];
  summary: RetrySafePipelineSummary;
};

export type TestCaseSyncPipelinePlan = {
  transitions: PipelineStatusTransition[];
  summary: RetrySafePipelineSummary;
};

export type AnalyticsMaterializePipelinePlan = {
  transitions: PipelineStatusTransition[];
  facts: AnalyticsProjectionFact[];
  searchIndexDocuments: SearchIndexProjectionDocument[];
  defectClusters: DefectClusterReadModel[];
  summary: RetrySafePipelineSummary;
};

export type AnalyticsProjectionParameter = {
  name?: string;
  value?: string;
  mode?: "default" | "masked" | "hidden";
  excluded?: boolean;
};

export type AnalyticsProjectionResult = {
  uuid: string;
  launchId?: string;
  historyId?: string;
  testCaseId?: string;
  fullName?: string;
  name?: string;
  status?: AllureStatus;
  start?: number;
  stop?: number;
  durationMs?: number;
  labels?: Record<string, readonly string[]>;
  parameters?: readonly AnalyticsProjectionParameter[];
  attachmentCount?: number;
  attachments?: readonly unknown[];
  statusDetails?: {
    flaky?: boolean;
    muted?: boolean;
    message?: string;
    trace?: string;
  };
  launchName?: string;
  launchCreatedAt?: string;
};

export type AnalyticsProjectionFact = {
  id: string;
  projectId: string;
  launchId: string;
  resultUuid: string;
  caseKeyHash: string;
  status: AllureStatus;
  durationMs: number | null;
  failed: boolean;
  flaky: boolean;
  muted: boolean;
  attachmentCount: number;
  visibleParameterCount: number;
  labelKeys: readonly string[];
  parameterSignatureHash: string;
  defectClusterId?: string;
  defectState?: DefectClusterLifecycleState;
  failureSignatureHash?: string;
};

export type SearchIndexProjectionDocument = {
  id: string;
  indexName: "testhistory-results";
  projectId: string;
  launchId: string;
  resultUuid: string;
  caseKeyHash: string;
  title: string;
  status: AllureStatus;
  durationBucket: "none" | "0-1s" | "1-10s" | "10s+";
  flaky: boolean;
  muted: boolean;
  labelKeys: readonly string[];
  visibleParameterNames: readonly string[];
  attachmentCount: number;
  defectClusterId?: string;
  defectState?: DefectClusterLifecycleState;
  failureSignatureHash?: string;
};

export type SearchIndexProjectionAdapterKind = "in-memory-search-projection-wip";

export type SearchIndexProjectionSort =
  "title" | "-title" | "status" | "-status" | "durationBucket" | "-durationBucket";

export type SearchIndexProjectionQuery = {
  projectId: string;
  launchId?: string;
  search?: string;
  statuses?: readonly AllureStatus[];
  flaky?: boolean;
  muted?: boolean;
  limit?: number;
  offset?: number;
  sort?: SearchIndexProjectionSort;
};

export type SearchIndexProjectionPage = {
  items: SearchIndexProjectionDocument[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
  nextOffset?: number;
  query: SearchIndexProjectionQuery;
  adapterKind: SearchIndexProjectionAdapterKind;
  boundary: "wip-in-memory-projection";
  consistency: "api-list-compatible";
};

export type SearchIndexApplyResult = {
  adapterKind: SearchIndexProjectionAdapterKind;
  boundary: "wip-in-memory-projection";
  consistency: "retry-safe-upsert";
  projectionDigest: string;
  appliedAt: string;
  idempotencyKeyHash: string;
  receivedDocumentCount: number;
  upsertedDocumentCount: number;
  updatedDocumentCount: number;
  unchangedDocumentCount: number;
  totalDocumentCount: number;
};

export type SearchIndexProjectionAdapter = {
  kind: SearchIndexProjectionAdapterKind;
  applyDocuments: (input: {
    documents: readonly SearchIndexProjectionDocument[];
    projectionDigest: string;
    at: string;
  }) => SearchIndexApplyResult;
  listDocuments: (query: SearchIndexProjectionQuery) => SearchIndexProjectionPage;
  snapshot: () => SearchIndexProjectionDocument[];
};

export type DefectMuteProjectionAdapterKind = "in-memory-defect-mute-projection-wip";

export type DefectMuteProjectionSummary = {
  projectId: string;
  eventCount: number;
  mutedEventCount: number;
  unmutedEventCount: number;
  activeMuteCount: number;
  inactiveMuteCount: number;
  rawFailureOccurrenceCount: number;
  projectionDigest: string;
  mutationBoundary: "worker-projection-only-no-rest-mutation";
};
