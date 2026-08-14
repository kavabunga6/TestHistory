import { fileURLToPath } from "node:url";
import { processApiIntegrationDeliveries } from "./workerApiIntegrationDeliveries.js";

import type {
  WorkerJobHandlerMap,
  WorkerLogger,
  WorkerPipelinePorts,
  WorkerQueueAdapter
} from "./workerTypes.js";
import { runtimeDependencies, workerJobNames } from "./workerConstants.js";
import { createInMemoryDispatcher as createWorkerInMemoryDispatcher } from "./workerDispatcher.js";
import { logWorkerEvent } from "./workerLogging.js";
import { createWorkerJobHandlers } from "./workerJobHandlers.js";
import { processApiUploadQueue } from "./workerApiUploadQueue.js";
import { isConfigured } from "./workerHealthPipeline.js";
export {
  buildHistoryComparePermissionAuditMaterializationPlan,
  createInMemoryHistoryComparePermissionAuditSnapshotAdapter
} from "./workerHistoryComparePermissionAudit.js";
export { createInMemorySearchIndexProjectionAdapter } from "./workerSearchIndexProjection.js";
export {
  buildAnalyticsDefectClusterProjections,
  buildAnalyticsMaterializePipelinePlan,
  buildAnalyticsProjectionFacts,
  buildSearchIndexProjectionDocuments
} from "./workerAnalyticsProjection.js";
export { buildArtifactPreviewRetentionEligibilityPlan } from "./workerArtifactPreviewRetention.js";
export {
  buildAttachmentPreviewRetentionDryRunArtifactScheduleMaterializationPlan,
  buildAttachmentPreviewRetentionDryRunScheduleDescriptorMaterializationPlan,
  buildAttachmentPreviewRetentionDryRunSchedulePlan
} from "./workerAttachmentPreviewRetentionSchedule.js";
export {
  buildArtifactPreviewGenerationPlan,
  createInMemoryArtifactPreviewDescriptorStoreAdapter
} from "./workerArtifactPreviewGeneration.js";
export {
  buildDefectMuteProjectionPlan,
  buildDefectMuteReplayInvariantMaterializationPlan,
  createInMemoryDefectMuteProjectionAdapter,
  createInMemoryDefectMuteReplayInvariantMaterializationAdapter
} from "./workerDefectMuteProjection.js";
export {
  buildArchiveDiagnosticReplayPlan,
  createInMemoryArchiveDiagnosticReplayAdapter
} from "./workerArchiveDiagnosticReplay.js";
export {
  buildArchiveIntakeExecutionPlan,
  mapArchiveParserManifestToWorkerManifest,
  reconcileArchiveParserDiagnostics
} from "./workerArchiveIntake.js";
export { createMockRabbitMqAdapter, WorkerJobValidationError } from "./workerDispatcher.js";
export { logWorkerEvent } from "./workerLogging.js";
export { createDefaultWorkerPipelinePorts, createWorkerJobHandlers } from "./workerJobHandlers.js";
export { buildArtifactCleanupPipelinePlan } from "./workerArtifactCleanupPlanning.js";
export { processApiUploadQueue } from "./workerApiUploadQueue.js";
export { buildIngestionParseMetadataSummary } from "./workerIngestionMetadataSummary.js";
export {
  buildLaunchClosePipelinePlan,
  buildTestCaseSyncPipelinePlan,
  buildWorkerHealth,
  buildWorkerHeartbeat,
  isConfigured
} from "./workerHealthPipeline.js";
export { sanitizeLogValue } from "./workerLogSanitizer.js";
export { validateWorkerJobEnvelope } from "./workerValidation.js";
export { runtimeDependencies, workerJobNames } from "./workerConstants.js";
export type {
  AnalyticsMaterializePipelinePlan,
  AnalyticsProjectionFact,
  AnalyticsProjectionParameter,
  AnalyticsProjectionResult,
  ApiUploadQueueFetch,
  ApiUploadQueueWorkerOptions,
  ApiUploadQueueWorkerResult,
  ArchiveDiagnosticReplayAdapter,
  ArchiveDiagnosticReplayApplyResult,
  ArchiveDiagnosticReplayDiagnostic,
  ArchiveDiagnosticReplayEvent,
  ArchiveDiagnosticReplayJobPayload,
  ArchiveDiagnosticReplayPlan,
  ArchiveDiagnosticReplayProjection,
  ArchiveDiagnosticReplayRecord,
  ArchiveDiagnosticReplaySource,
  ArchiveDiagnosticReplaySummary,
  ArchiveIntakeChunkPlan,
  ArchiveIntakeDiagnostic,
  ArchiveIntakeEntryPlan,
  ArchiveIntakeEntryStatus,
  ArchiveIntakeExecutionPlan,
  ArchiveIntakeManifest,
  ArchiveIntakeManifestEntry,
  ArchiveIntakeManifestEntryKind,
  ArchiveIntakeMetadataSummary,
  ArchiveManifestIngestionPayload,
  ArchiveParserManifest,
  ArchiveParserManifestEntry,
  ArchiveParserManifestEntryKind,
  ArtifactCleanupBatchSummary,
  ArtifactCleanupPipelinePlan,
  ArtifactCleanupPlanAuditEvidence,
  ArtifactCleanupPlanNoopReason,
  ArtifactPreviewDescriptorApplyResult,
  ArtifactPreviewDescriptorStoreAdapter,
  ArtifactPreviewDescriptorStoreAdapterKind,
  ArtifactPreviewGenerationDiagnostic,
  ArtifactPreviewGenerationPlan,
  ArtifactPreviewGenerationRecord,
  ArtifactPreviewGenerationSource,
  ArtifactPreviewGenerationStatus,
  ArtifactPreviewRetentionCleanupCandidate,
  ArtifactPreviewRetentionDescriptorSource,
  ArtifactPreviewRetentionDiagnostic,
  ArtifactPreviewRetentionEligibilityPlan,
  ArtifactPreviewRetentionEligibilityRecord,
  ArtifactPreviewRetentionEligibilityStatus,
  AttachmentPreviewRetentionDryRunScheduleBatch,
  AttachmentPreviewRetentionDryRunScheduleDescriptorMaterializationPlan,
  AttachmentPreviewRetentionDryRunScheduleDescriptorMaterializationRecord,
  AttachmentPreviewRetentionDryRunScheduleDiagnostic,
  AttachmentPreviewRetentionDryRunSchedulePlan,
  DeadLetterWorkerJob,
  DefectMuteProjectionAdapter,
  DefectMuteProjectionAdapterKind,
  DefectMuteProjectionApplyResult,
  DefectMuteProjectionJobPayload,
  DefectMuteProjectionPlan,
  DefectMuteProjectionSummary,
  DefectMuteReplayInvariantMaterializationAdapter,
  DefectMuteReplayInvariantMaterializationApplyResult,
  DefectMuteReplayInvariantMaterializationPlan,
  DefectMuteReplayInvariantMaterializationRecord,
  DefectMuteReplayInvariantMaterializationSummary,
  DuplicateWorkerJob,
  EnqueueWorkerJob,
  EnqueueWorkerJobResult,
  HistoryComparePermissionAuditMaterializationDiagnostic,
  HistoryComparePermissionAuditMaterializationPlan,
  HistoryComparePermissionAuditMaterializationSummary,
  HistoryComparePermissionAuditSnapshotAdapter,
  HistoryComparePermissionAuditSnapshotApplyResult,
  HistoryComparePermissionAuditSnapshotProjection,
  HistoryComparePermissionAuditSnapshotRecord,
  IngestionParseMetadataSummary,
  LaunchClosePipelinePlan,
  PipelineStatusTransition,
  PlannedChildWorkerJob,
  ProcessNextResult,
  RetrySafePipelineSummary,
  RuntimeDependency,
  SearchIndexApplyResult,
  SearchIndexProjectionAdapter,
  SearchIndexProjectionAdapterKind,
  SearchIndexProjectionDocument,
  SearchIndexProjectionPage,
  SearchIndexProjectionQuery,
  SearchIndexProjectionSort,
  TestCaseSyncPipelinePlan,
  WorkerDispatcherSnapshot,
  WorkerHealthSnapshot,
  WorkerHeartbeat,
  WorkerJob,
  WorkerJobContext,
  WorkerJobEnvelopeValidationResult,
  WorkerJobHandler,
  WorkerJobHandlerMap,
  WorkerJobName,
  WorkerJobPayloadMap,
  WorkerJobStatusRecord,
  WorkerJobStatusState,
  WorkerLogger,
  WorkerLogLevel,
  WorkerPipelinePorts,
  WorkerQueueAdapter,
  WorkerQueueSnapshot
} from "./workerTypes.js";

export function createInMemoryDispatcher(
  options: {
    handlers?: Partial<WorkerJobHandlerMap>;
    logger?: WorkerLogger;
    maxAttempts?: number;
    retryDelayMs?: number;
    queueAdapter?: WorkerQueueAdapter;
    pipelinePorts?: WorkerPipelinePorts;
    env?: NodeJS.ProcessEnv;
    heartbeatStaleMs?: number;
    now?: () => Date;
  } = {}
) {
  return createWorkerInMemoryDispatcher({
    ...options,
    createHandlers: createWorkerJobHandlers
  });
}

export function startWorker(
  options: {
    env?: NodeJS.ProcessEnv;
    logger?: WorkerLogger;
    intervalMs?: number;
  } = {}
) {
  const env = options.env ?? process.env;
  const logger = options.logger ?? console;
  const intervalMs = options.intervalMs ?? Number(env.WORKER_HEARTBEAT_MS ?? "30000");
  const dispatcher = createInMemoryDispatcher({ env, logger });
  const uploadQueueApiUrl = env.TESTHISTORY_API_URL;
  const uploadQueueToken = env.TESTHISTORY_WORKER_TOKEN;
  const uploadQueueIntervalMs = Number(env.WORKER_UPLOAD_QUEUE_INTERVAL_MS ?? "5000");
  const integrationDeliveryIntervalMs = Number(
    env.WORKER_INTEGRATION_DELIVERY_INTERVAL_MS ?? "5000"
  );

  logWorkerEvent(logger, "info", "worker.started", {
    intervalMs,
    uploadQueuePolling: uploadQueueApiUrl !== undefined,
    topology: runtimeDependencies.map((dependency) => ({
      id: dependency.id,
      required: dependency.required,
      configured: isConfigured(env, dependency.env),
      purpose: dependency.purpose
    })),
    queues: workerJobNames
  });

  const heartbeat = setInterval(() => {
    dispatcher.heartbeat();
  }, intervalMs);

  let uploadQueuePolling = false;
  const uploadQueuePoller =
    uploadQueueApiUrl === undefined
      ? undefined
      : setInterval(() => {
          if (uploadQueuePolling) {
            return;
          }
          uploadQueuePolling = true;
          void processApiUploadQueue({
            baseUrl: uploadQueueApiUrl,
            limit: Number(env.WORKER_UPLOAD_QUEUE_LIMIT ?? "25"),
            maxJobs: Number(env.WORKER_UPLOAD_QUEUE_MAX_JOBS ?? "25"),
            workerId: env.WORKER_ID ?? env.HOSTNAME ?? "testhistory-worker",
            leaseMs: Number(env.WORKER_UPLOAD_QUEUE_LEASE_MS ?? "300000"),
            ...(uploadQueueToken !== undefined
              ? { headers: { authorization: `Bearer ${uploadQueueToken}` } }
              : {}),
            logger
          })
            .then((result) => {
              if (result.status !== "idle") {
                logWorkerEvent(
                  logger,
                  result.status === "processed" ? "info" : "warn",
                  "worker.upload_queue.poll",
                  {
                    status: result.status,
                    polledJobs: result.polledJobs,
                    processedJobs: result.processedJobs,
                    failedJobs: result.failedJobs
                  }
                );
              }
            })
            .finally(() => {
              uploadQueuePolling = false;
            });
        }, uploadQueueIntervalMs);

  let integrationDeliveryPolling = false;
  const integrationDeliveryPoller =
    uploadQueueApiUrl === undefined
      ? undefined
      : setInterval(() => {
          if (integrationDeliveryPolling) return;
          integrationDeliveryPolling = true;
          void processApiIntegrationDeliveries({
            baseUrl: uploadQueueApiUrl,
            ...(uploadQueueToken !== undefined ? { token: uploadQueueToken } : {}),
            workerId: env.WORKER_ID ?? env.HOSTNAME ?? "testhistory-worker",
            limit: Number(env.WORKER_INTEGRATION_DELIVERY_LIMIT ?? "25")
          })
            .then((result) => {
              if (result.status !== "idle") {
                logWorkerEvent(
                  logger,
                  result.status === "processed" ? "info" : "warn",
                  "worker.integration_delivery.poll",
                  result
                );
              }
            })
            .finally(() => {
              integrationDeliveryPolling = false;
            });
        }, integrationDeliveryIntervalMs);

  return {
    dispatcher,
    stop: () => {
      clearInterval(heartbeat);
      if (uploadQueuePoller !== undefined) {
        clearInterval(uploadQueuePoller);
      }
      if (integrationDeliveryPoller !== undefined) {
        clearInterval(integrationDeliveryPoller);
      }
    }
  };
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]) {
  startWorker();
}
