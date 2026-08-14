import type { TestCaseSyncJobPayload } from "@testhistory/contracts";

import { defaultHeartbeatStaleMs, runtimeDependencies, workerJobNames } from "./workerConstants.js";
import type {
  LaunchClosePipelinePlan,
  PlannedChildWorkerJob,
  TestCaseSyncPipelinePlan,
  WorkerDispatcherSnapshot,
  WorkerHealthSnapshot,
  WorkerHeartbeat,
  WorkerJob,
  WorkerQueueAdapter
} from "./workerTypes.js";

export function isConfigured(env: NodeJS.ProcessEnv, envName: string): boolean {
  return typeof env[envName] === "string" && env[envName]!.length > 0;
}

export function buildWorkerHeartbeat(
  snapshot: WorkerDispatcherSnapshot,
  env: NodeJS.ProcessEnv,
  at: string
): WorkerHeartbeat {
  const requiredDependencies = runtimeDependencies.filter((dependency) => dependency.required);
  const configuredRequiredDependencies = requiredDependencies.filter((dependency) =>
    isConfigured(env, dependency.env)
  );
  const retryScheduledJobs = snapshot.statuses.filter(
    (status) => status.state === "retry_scheduled"
  ).length;
  const ready = configuredRequiredDependencies.length === requiredDependencies.length;

  return {
    status: ready && snapshot.deadLetters.length === 0 ? "ok" : "degraded",
    at,
    live: true,
    ready,
    queueDepth: snapshot.queued.length,
    completedJobs: snapshot.completed.length,
    deadLetterJobs: snapshot.deadLetters.length,
    duplicateJobs: snapshot.duplicates.length,
    retryScheduledJobs,
    requiredDependencies: requiredDependencies.length,
    configuredRequiredDependencies: configuredRequiredDependencies.length,
    queues: workerJobNames
  };
}

export function buildWorkerHealth(
  snapshot: WorkerDispatcherSnapshot,
  env: NodeJS.ProcessEnv,
  currentTime: Date,
  adapter: WorkerQueueAdapter["kind"],
  heartbeat: {
    lastHeartbeatAt?: string;
    heartbeatStaleMs?: number;
  } = {}
): WorkerHealthSnapshot {
  const dependencies = runtimeDependencies.map((dependency) => ({
    id: dependency.id,
    required: dependency.required,
    configured: isConfigured(env, dependency.env)
  }));
  const requiredReady = dependencies.every(
    (dependency) => !dependency.required || dependency.configured
  );
  const stale =
    heartbeat.lastHeartbeatAt !== undefined &&
    Date.parse(heartbeat.lastHeartbeatAt) +
      (heartbeat.heartbeatStaleMs ?? defaultHeartbeatStaleMs) <
      currentTime.getTime();
  const retryScheduledJobs = snapshot.statuses.filter(
    (status) => status.state === "retry_scheduled"
  ).length;
  const ready = requiredReady && !stale;

  const result: WorkerHealthSnapshot = {
    status: ready && snapshot.deadLetters.length === 0 ? "ok" : "degraded",
    live: true,
    ready,
    checkedAt: currentTime.toISOString(),
    dependencies,
    queue: {
      adapter,
      depth: snapshot.queued.length,
      completedJobs: snapshot.completed.length,
      deadLetterJobs: snapshot.deadLetters.length,
      duplicateJobs: snapshot.duplicates.length,
      retryScheduledJobs
    },
    heartbeat: {
      stale
    }
  };

  if (heartbeat.lastHeartbeatAt !== undefined) {
    result.heartbeat.lastHeartbeatAt = heartbeat.lastHeartbeatAt;
  }

  return result;
}

export function buildLaunchClosePipelinePlan(
  job: WorkerJob<"launch.close">,
  at: string
): LaunchClosePipelinePlan {
  const childJobs: PlannedChildWorkerJob[] = [
    {
      id: buildChildJobId(job, "testcase.sync"),
      name: "testcase.sync",
      payload: {
        projectId: job.payload.projectId,
        launchId: job.payload.launchId
      },
      ...(job.traceId !== undefined ? { traceId: job.traceId } : {})
    },
    {
      id: buildChildJobId(job, "analytics.materialize"),
      name: "analytics.materialize",
      payload: {
        projectId: job.payload.projectId,
        launchId: job.payload.launchId
      },
      ...(job.traceId !== undefined ? { traceId: job.traceId } : {})
    }
  ];

  return {
    transitions: [
      { state: "close_requested", at },
      { state: "children_planned", at }
    ],
    childJobs,
    summary: {
      projectId: job.payload.projectId,
      launchId: job.payload.launchId,
      childJobCount: childJobs.length,
      childJobNames: childJobs.map((childJob) => childJob.name)
    }
  };
}

export function buildTestCaseSyncPipelinePlan(
  payload: TestCaseSyncJobPayload,
  at: string
): TestCaseSyncPipelinePlan {
  const testCaseIds = payload.testCaseIds;
  const requestedTestCaseCount = testCaseIds?.length ?? 0;

  return {
    transitions: [
      { state: "sync_requested", at },
      { state: "sync_plan_materialized", at }
    ],
    summary: {
      projectId: payload.projectId,
      launchId: payload.launchId,
      scope: testCaseIds === undefined ? "launch" : "selected",
      requestedTestCaseCount,
      allTestCases: testCaseIds === undefined
    }
  };
}

function buildChildJobId(
  parentJob: WorkerJob<"launch.close">,
  childName: "testcase.sync" | "analytics.materialize"
): string {
  return `${parentJob.id}:${parentJob.retry.attempt}:${childName}`;
}
