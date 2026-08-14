import type {
  AnalyticsMaterializeJobPayload,
  ArtifactCleanupJobPayload,
  IngestionParseJobPayload,
  TestCaseSyncJobPayload,
  WorkerJobRetryMetadata
} from "@testhistory/contracts";
import type {
  ArchiveDiagnosticReplayJobPayload,
  DeadLetterWorkerJob,
  EnqueueWorkerJob,
  WorkerJob,
  WorkerJobContext,
  WorkerJobHandlerMap,
  WorkerJobPayloadMap,
  WorkerJobStatusRecord,
  WorkerJobStatusState
} from "./workerTypes.js";
import { defaultArtifactCleanupBatchSize } from "./workerConstants.js";
import { hashIdempotencyParts } from "./workerHash.js";
import { isNonEmptyString } from "./workerValueUtils.js";

export function createRetryMetadata(
  firstQueuedAt: string,
  maxAttempts: number
): WorkerJobRetryMetadata {
  return {
    attempt: 0,
    maxAttempts,
    firstQueuedAt
  };
}

export function buildStatusRecord(
  job: WorkerJob | DeadLetterWorkerJob,
  state: WorkerJobStatusState,
  updatedAt: string,
  options: {
    duplicateOfJobId?: string | undefined;
    idempotencyKeyHash?: string | undefined;
    deadLetteredAt?: string | undefined;
    reason?: string | undefined;
  } = {}
): WorkerJobStatusRecord {
  const record: WorkerJobStatusRecord = {
    jobId: job.id,
    jobName: job.name,
    state,
    queuedAt: job.queuedAt,
    updatedAt,
    attempt: job.retry.attempt,
    maxAttempts: job.retry.maxAttempts
  };

  const idempotencyKeyHash = options.idempotencyKeyHash ?? getIdempotencyKeyHash(job);
  if (job.traceId !== undefined) {
    record.traceId = job.traceId;
  }
  if (idempotencyKeyHash !== undefined) {
    record.idempotencyKeyHash = idempotencyKeyHash;
  }
  if (options.duplicateOfJobId !== undefined) {
    record.duplicateOfJobId = options.duplicateOfJobId;
  }
  if (job.retry.nextAttemptAt !== undefined) {
    record.nextAttemptAt = job.retry.nextAttemptAt;
  }
  if (job.retry.lastAttemptAt !== undefined) {
    record.lastAttemptAt = job.retry.lastAttemptAt;
  }
  if (job.retry.lastError !== undefined) {
    record.lastError = job.retry.lastError;
  }
  if (options.deadLetteredAt !== undefined) {
    record.deadLetteredAt = options.deadLetteredAt;
  }
  if (options.reason !== undefined) {
    record.reason = options.reason;
  }

  return record;
}

export function getIdempotencyKeyHash(job: EnqueueWorkerJob | WorkerJob): string | undefined {
  switch (job.name) {
    case "ingestion.parse": {
      const payload = job.payload as IngestionParseJobPayload;
      const idempotencyKey = payload.idempotencyKey;
      if (!isNonEmptyString(idempotencyKey)) {
        return undefined;
      }

      return hashIdempotencyParts([job.name, idempotencyKey]);
    }
    case "launch.close": {
      const payload = job.payload as WorkerJobPayloadMap["launch.close"];
      return hashIdempotencyParts([job.name, payload.projectId, payload.launchId]);
    }
    case "testcase.sync": {
      const payload = job.payload as TestCaseSyncJobPayload;
      const testCaseIds =
        payload.testCaseIds === undefined ? ["all"] : [...payload.testCaseIds].sort();
      return hashIdempotencyParts([job.name, payload.projectId, payload.launchId, ...testCaseIds]);
    }
    case "analytics.materialize": {
      const payload = job.payload as AnalyticsMaterializeJobPayload;
      return hashIdempotencyParts([
        job.name,
        payload.projectId,
        payload.launchId ?? "all",
        payload.window?.from ?? "no-window-from",
        payload.window?.to ?? "no-window-to"
      ]);
    }
    case "defect.mute.project":
      return undefined;
    case "archive.diagnostics.replay": {
      const payload = job.payload as ArchiveDiagnosticReplayJobPayload;
      return hashIdempotencyParts([
        job.name,
        payload.projectId,
        payload.launchId,
        payload.archiveRef,
        ...payload.events.map((event) => event.id).sort()
      ]);
    }
    case "artifact.cleanup": {
      const payload = job.payload as ArtifactCleanupJobPayload;
      return hashIdempotencyParts([
        job.name,
        payload.projectId ?? "all",
        payload.before,
        String(payload.batchSize ?? defaultArtifactCleanupBatchSize),
        String(payload.dryRun ?? false)
      ]);
    }
  }
}

export function dispatchJob(
  job: WorkerJob,
  handlers: WorkerJobHandlerMap,
  context: WorkerJobContext
): Promise<void> | void {
  const handler = handlers[job.name];
  return handler(job as never, context);
}

export function findRunnableJobIndex(queue: WorkerJob[], currentTime: Date): number {
  return queue.findIndex((job) => {
    if (job.retry.nextAttemptAt === undefined) {
      return true;
    }

    return Date.parse(job.retry.nextAttemptAt) <= currentTime.getTime();
  });
}

export function findEarliestNextAttempt(queue: WorkerJob[]): string | undefined {
  return queue
    .map((job) => job.retry.nextAttemptAt)
    .filter((nextAttemptAt): nextAttemptAt is string => nextAttemptAt !== undefined)
    .sort()[0];
}

export function markAttemptStarted(job: WorkerJob, currentTime: Date): WorkerJob {
  const retry = { ...job.retry };
  delete retry.nextAttemptAt;
  return {
    ...job,
    retry: {
      ...retry,
      attempt: retry.attempt + 1,
      lastAttemptAt: currentTime.toISOString()
    }
  };
}

export function withLastError(
  job: WorkerJob,
  lastError: NonNullable<WorkerJobRetryMetadata["lastError"]>
): WorkerJob {
  return {
    ...job,
    retry: {
      ...job.retry,
      lastError
    }
  };
}

export function scheduleRetry(job: WorkerJob, retryDelayMs: number, currentTime: Date): WorkerJob {
  return {
    ...job,
    retry: {
      ...job.retry,
      nextAttemptAt: new Date(currentTime.getTime() + retryDelayMs).toISOString()
    }
  };
}

export function serializeError(error: unknown): NonNullable<WorkerJobRetryMetadata["lastError"]> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message
    };
  }

  return {
    name: "Error",
    message: String(error)
  };
}

export function logJobSummary(job: WorkerJob | DeadLetterWorkerJob): Record<string, unknown> {
  return {
    jobId: job.id,
    jobName: job.name,
    traceId: job.traceId,
    attempt: job.retry.attempt,
    maxAttempts: job.retry.maxAttempts,
    nextAttemptAt: job.retry.nextAttemptAt,
    lastError: job.retry.lastError,
    deadLetteredAt: "deadLetteredAt" in job ? job.deadLetteredAt : undefined,
    reason: "reason" in job ? job.reason : undefined
  };
}
