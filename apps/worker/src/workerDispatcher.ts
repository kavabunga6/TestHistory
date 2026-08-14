import {
  defaultHeartbeatStaleMs,
  defaultMaxAttempts,
  defaultRetryDelayMs
} from "./workerConstants.js";
import { buildWorkerHealth, buildWorkerHeartbeat } from "./workerHealthPipeline.js";
import { logWorkerEvent } from "./workerLogging.js";
import {
  buildStatusRecord,
  createRetryMetadata,
  dispatchJob,
  findEarliestNextAttempt,
  findRunnableJobIndex,
  getIdempotencyKeyHash,
  logJobSummary,
  markAttemptStarted,
  scheduleRetry,
  serializeError,
  withLastError
} from "./workerRuntime.js";
import type {
  DeadLetterWorkerJob,
  DuplicateWorkerJob,
  EnqueueWorkerJob,
  EnqueueWorkerJobResult,
  ProcessNextResult,
  WorkerDispatcherSnapshot,
  WorkerHealthSnapshot,
  WorkerHeartbeat,
  WorkerJob,
  WorkerJobContext,
  WorkerJobHandlerMap,
  WorkerJobName,
  WorkerJobStatusRecord,
  WorkerLogger,
  WorkerPipelinePorts,
  WorkerQueueAdapter
} from "./workerTypes.js";
import { validateWorkerJobEnvelope } from "./workerValidation.js";

export class WorkerJobValidationError extends Error {
  readonly issues: string[];

  constructor(issues: string[]) {
    super(`Invalid worker job envelope: ${issues.join("; ")}`);
    this.name = "WorkerJobValidationError";
    this.issues = issues;
  }
}

export function createInMemoryDispatcher(options: {
  createHandlers: (pipelinePorts?: WorkerPipelinePorts) => WorkerJobHandlerMap;
  handlers?: Partial<WorkerJobHandlerMap>;
  logger?: WorkerLogger;
  maxAttempts?: number;
  retryDelayMs?: number;
  queueAdapter?: WorkerQueueAdapter;
  pipelinePorts?: WorkerPipelinePorts;
  env?: NodeJS.ProcessEnv;
  heartbeatStaleMs?: number;
  now?: () => Date;
}) {
  const logger = options.logger ?? console;
  const maxAttempts = options.maxAttempts ?? defaultMaxAttempts;
  const retryDelayMs = options.retryDelayMs ?? defaultRetryDelayMs;
  const now = options.now ?? (() => new Date());
  const env = options.env ?? process.env;
  const heartbeatStaleMs = options.heartbeatStaleMs ?? defaultHeartbeatStaleMs;
  const handlers: WorkerJobHandlerMap = {
    ...options.createHandlers(options.pipelinePorts),
    ...options.handlers
  };
  const queueAdapter = options.queueAdapter ?? createMockRabbitMqAdapter();
  const completed: WorkerJob[] = [];
  const deadLetters: DeadLetterWorkerJob[] = [];
  const duplicates: DuplicateWorkerJob[] = [];
  const statusRecords = new Map<string, WorkerJobStatusRecord>();
  const idempotencyIndex = new Map<string, string>();
  let lastHeartbeatAt: string | undefined;

  function enqueueJob<TName extends WorkerJobName>(
    input: EnqueueWorkerJob<TName>
  ): EnqueueWorkerJobResult<TName> {
    const validation = validateWorkerJobEnvelope(input);
    if (!validation.ok) {
      throw new WorkerJobValidationError(validation.issues);
    }

    const queuedAt = now().toISOString();
    const validatedInput = validation.job as EnqueueWorkerJob<TName>;
    const idempotencyKeyHash = getIdempotencyKeyHash(validatedInput);
    const job = {
      ...validatedInput,
      queuedAt,
      retry: createRetryMetadata(queuedAt, maxAttempts)
    } satisfies WorkerJob<TName>;

    if (idempotencyKeyHash !== undefined) {
      const duplicateOfJobId = idempotencyIndex.get(idempotencyKeyHash);
      if (duplicateOfJobId !== undefined) {
        const duplicate = {
          job,
          duplicateOfJobId,
          idempotencyKeyHash,
          detectedAt: queuedAt
        } satisfies DuplicateWorkerJob;
        duplicates.push(duplicate);
        statusRecords.set(
          job.id,
          buildStatusRecord(job, "duplicate", queuedAt, {
            duplicateOfJobId,
            idempotencyKeyHash
          })
        );
        logWorkerEvent(logger, "warn", "job.duplicate", {
          ...logJobSummary(job),
          duplicateOfJobId,
          idempotencyKeyHash
        });
        return {
          status: "duplicate",
          job,
          duplicateOfJobId,
          idempotencyKeyHash
        };
      }

      idempotencyIndex.set(idempotencyKeyHash, job.id);
    }

    queueAdapter.publish(job);
    statusRecords.set(job.id, buildStatusRecord(job, "queued", queuedAt, { idempotencyKeyHash }));
    logWorkerEvent(logger, "info", "job.enqueued", {
      ...logJobSummary(job),
      idempotencyKeyHash
    });
    const result: EnqueueWorkerJobResult<TName> = { status: "enqueued", job };
    if (idempotencyKeyHash !== undefined) {
      result.idempotencyKeyHash = idempotencyKeyHash;
    }
    return result;
  }

  const context: WorkerJobContext = {
    log: (level, event, details) => logWorkerEvent(logger, level, event, details),
    enqueue: enqueueJob,
    now
  };

  return {
    enqueue<TName extends WorkerJobName>(
      input: EnqueueWorkerJob<TName>
    ): EnqueueWorkerJobResult<TName> {
      return enqueueJob(input);
    },

    async processNext(): Promise<ProcessNextResult> {
      const currentTime = now();
      const job = queueAdapter.takeRunnable(currentTime);
      if (job === undefined) {
        const nextAttemptAt = queueAdapter.getNextAttemptAt();
        return nextAttemptAt === undefined
          ? { status: "idle" }
          : { status: "deferred", nextAttemptAt };
      }

      const runningJob = markAttemptStarted(job, currentTime);
      statusRecords.set(
        runningJob.id,
        buildStatusRecord(runningJob, "running", currentTime.toISOString())
      );
      logWorkerEvent(logger, "info", "job.started", logJobSummary(runningJob));

      try {
        await dispatchJob(runningJob, handlers, context);
        completed.push(runningJob);
        statusRecords.set(
          runningJob.id,
          buildStatusRecord(runningJob, "completed", now().toISOString())
        );
        logWorkerEvent(logger, "info", "job.completed", logJobSummary(runningJob));
        return { status: "completed", job: runningJob };
      } catch (error) {
        const lastError = serializeError(error);
        const failedJob = withLastError(runningJob, lastError);

        if (failedJob.retry.attempt < failedJob.retry.maxAttempts) {
          const retriedJob = scheduleRetry(failedJob, retryDelayMs, now());
          queueAdapter.requeue(retriedJob);
          statusRecords.set(
            retriedJob.id,
            buildStatusRecord(retriedJob, "retry_scheduled", retriedJob.retry.nextAttemptAt!)
          );
          logWorkerEvent(logger, "warn", "job.retry.scheduled", logJobSummary(retriedJob));
          return { status: "retry", job: retriedJob };
        }

        const deadLetterJob = {
          ...failedJob,
          deadLetteredAt: now().toISOString(),
          reason: lastError.message
        } satisfies DeadLetterWorkerJob;

        deadLetters.push(deadLetterJob);
        statusRecords.set(
          deadLetterJob.id,
          buildStatusRecord(deadLetterJob, "dead_lettered", deadLetterJob.deadLetteredAt, {
            deadLetteredAt: deadLetterJob.deadLetteredAt,
            reason: deadLetterJob.reason
          })
        );
        logWorkerEvent(logger, "error", "job.dead_lettered", logJobSummary(deadLetterJob));
        return { status: "dead-lettered", job: deadLetterJob };
      }
    },

    async processAll(limit = 100): Promise<ProcessNextResult[]> {
      const results: ProcessNextResult[] = [];
      for (let processed = 0; processed < limit; processed += 1) {
        const result = await this.processNext();
        results.push(result);
        if (result.status === "idle" || result.status === "deferred") {
          break;
        }
      }

      return results;
    },

    snapshot(): WorkerDispatcherSnapshot {
      const queueSnapshot = queueAdapter.snapshot();
      return {
        queued: queueSnapshot.queued,
        completed: [...completed],
        deadLetters: [...deadLetters],
        duplicates: [...duplicates],
        statuses: [...statusRecords.values()]
      };
    },

    heartbeat(): WorkerHeartbeat {
      const at = now().toISOString();
      lastHeartbeatAt = at;
      const heartbeat = buildWorkerHeartbeat(this.snapshot(), env, at);
      logWorkerEvent(logger, "info", "worker.heartbeat", heartbeat);
      return heartbeat;
    },

    getHealth(): WorkerHealthSnapshot {
      const heartbeatOptions: { lastHeartbeatAt?: string; heartbeatStaleMs: number } = {
        heartbeatStaleMs
      };
      if (lastHeartbeatAt !== undefined) {
        heartbeatOptions.lastHeartbeatAt = lastHeartbeatAt;
      }

      return buildWorkerHealth(this.snapshot(), env, now(), queueAdapter.kind, heartbeatOptions);
    }
  };
}

export function createMockRabbitMqAdapter(initialJobs: WorkerJob[] = []): WorkerQueueAdapter {
  const queue = [...initialJobs];

  return {
    kind: "rabbitmq-mock",
    publish(job) {
      queue.push(job);
    },
    takeRunnable(currentTime) {
      const nextIndex = findRunnableJobIndex(queue, currentTime);
      if (nextIndex === -1) {
        return undefined;
      }

      return queue.splice(nextIndex, 1)[0];
    },
    requeue(job) {
      queue.push(job);
    },
    getNextAttemptAt() {
      return findEarliestNextAttempt(queue);
    },
    snapshot() {
      return {
        queued: [...queue]
      };
    }
  };
}
