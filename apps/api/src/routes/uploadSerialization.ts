import {
  defaultArtifactPolicy,
  normalizeArtifactPolicy,
  type ArtifactPolicy
} from "@testhistory/artifacts";
import type {
  EnterpriseIngestionReadinessReadModel,
  LaunchIngestionStatusReadModel,
  QueueWorkerStatusReadModel,
  UploadDiagnosticReadModel,
  UploadIngestionStatusReadModel,
  UploadJobReadModel,
  UploadProgressReadModel,
  UploadSessionReadModel
} from "@testhistory/contracts";
import type { PersistentUploadJob } from "@testhistory/domain";
import { type AppStore, type Launch, type UploadJob, type UploadSession } from "../store.js";

import {
  enterpriseArtifactWorkerConcurrency,
  enterpriseBackpressureRetryAfterMs,
  enterpriseEstimatedResultsPerWorkerHour,
  enterpriseInFlightWatermark,
  enterpriseParserWorkerConcurrency,
  enterpriseQueueDepthWatermark,
  enterpriseTargetResults,
  enterpriseTargetUsers,
  enterpriseTargetWindowHours,
  jsonBatchSyncByteLimit,
  jsonBatchSyncFileLimit,
  maxArchiveManifestEntries
} from "./uploadTypes.js";
import { expireSessionIfNeeded } from "./uploadChunked.js";

export function serializeUploadSession(session: UploadSession): UploadSessionReadModel {
  const files = Array.from(session.files.values()).map((file) => ({
    path: file.path,
    totalChunks: file.totalChunks,
    receivedChunks: file.receivedChunks,
    ...(file.totalBytes !== undefined ? { totalBytes: file.totalBytes } : {}),
    receivedBytes: file.receivedBytes,
    progress:
      file.totalChunks === 0
        ? 0
        : Math.round((file.receivedChunks / file.totalChunks) * 10000) / 100
  }));

  return {
    id: session.id,
    launchId: session.launchId,
    path: session.path,
    status: session.status,
    totalChunks: session.totalChunks,
    receivedChunks: session.receivedChunks,
    ...(session.totalBytes !== undefined ? { totalBytes: session.totalBytes } : {}),
    receivedBytes: session.receivedBytes,
    progress:
      session.totalChunks === 0
        ? 0
        : Math.round((session.receivedChunks / session.totalChunks) * 10000) / 100,
    files,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    expiresAt: session.expiresAt,
    ...(session.closedAt !== undefined ? { closedAt: session.closedAt } : {}),
    ...(session.cleanup !== undefined ? { cleanup: session.cleanup } : {}),
    ...(session.completedJobId !== undefined ? { completedJobId: session.completedJobId } : {})
  };
}

export function buildSessionIngestionStatus(
  store: AppStore,
  session: UploadSession
): UploadIngestionStatusReadModel {
  const job =
    session.completedJobId === undefined ? undefined : store.uploadJobs.get(session.completedJobId);
  const serializedSession = serializeUploadSession(session);

  return {
    id: session.id,
    kind: "session",
    launchId: session.launchId,
    status: session.status,
    progress: sessionProgress(session),
    diagnostics: sessionDiagnostics(session, job),
    queue: queueWorkerStatus(store, session.launchId),
    session: serializedSession,
    ...(job !== undefined ? { job: serializeUploadJob(job) } : {}),
    results: job?.results ?? [],
    links: {
      self: `/api/v1/uploads/${session.id}/status`,
      launch: `/api/v1/launches/${session.launchId}`,
      session: `/api/v1/uploads/${session.id}/session`,
      ...(job !== undefined ? { job: `/api/v1/uploads/${job.id}` } : {})
    }
  };
}

export function buildJobIngestionStatus(
  store: AppStore,
  job: UploadJob
): UploadIngestionStatusReadModel {
  const session = Array.from(store.uploadSessions.values()).find(
    (item) => item.completedJobId === job.id
  );

  return {
    id: job.id,
    kind: "job",
    launchId: job.launchId,
    status: job.status,
    progress: jobProgress(job),
    diagnostics: jobDiagnostics(job),
    queue: queueWorkerStatus(store, job.launchId),
    job: serializeUploadJob(job),
    results: job.results ?? [],
    ...(session !== undefined ? { session: serializeUploadSession(session) } : {}),
    links: {
      self: `/api/v1/uploads/${job.id}/status`,
      launch: `/api/v1/launches/${job.launchId}`,
      job: `/api/v1/uploads/${job.id}`,
      ...(session !== undefined ? { session: `/api/v1/uploads/${session.id}/session` } : {})
    }
  };
}

export function buildLaunchIngestionStatus(
  store: AppStore,
  launch: Launch
): LaunchIngestionStatusReadModel {
  const sessions = Array.from(store.uploadSessions.values())
    .filter((session) => session.launchId === launch.id)
    .map(serializeUploadSession);
  const jobs = Array.from(store.uploadJobs.values())
    .filter((job) => job.launchId === launch.id)
    .map(serializeUploadJob);
  const diagnostics = [
    ...Array.from(store.uploadSessions.values())
      .filter((session) => session.launchId === launch.id)
      .flatMap((session) => sessionDiagnostics(session, undefined)),
    ...Array.from(store.uploadJobs.values())
      .filter((job) => job.launchId === launch.id)
      .flatMap(jobDiagnostics)
  ].slice(0, 50);

  return {
    launchId: launch.id,
    launchStatus: launch.status,
    progress: aggregateProgress(
      [
        ...Array.from(store.uploadSessions.values())
          .filter((session) => session.launchId === launch.id)
          .map(sessionProgress),
        ...Array.from(store.uploadJobs.values())
          .filter((job) => job.launchId === launch.id)
          .map(jobProgress)
      ],
      launch.status === "closed" || launch.status === "archived" || launch.status === "failed"
    ),
    diagnostics,
    queue: queueWorkerStatus(store, launch.id),
    sessions,
    jobs,
    totals: {
      sessions: sessions.length,
      jobs: jobs.length,
      openSessions: sessions.filter((session) => session.status === "open").length,
      processingJobs: jobs.filter((job) => job.status === "queued" || job.status === "processing")
        .length,
      completedJobs: jobs.filter(
        (job) => job.status === "completed" || job.status === "completed_with_errors"
      ).length,
      failedJobs: jobs.filter((job) => job.status === "failed").length,
      storedArtifacts: jobs.reduce((total, job) => total + job.storedArtifacts, 0),
      importedResults: jobs.reduce((total, job) => total + job.importedResults, 0),
      duplicateResults: jobs.reduce((total, job) => total + job.duplicateResults, 0)
    }
  };
}

export function buildEnterpriseIngestionReadiness(
  store: AppStore
): EnterpriseIngestionReadinessReadModel {
  for (const session of store.uploadSessions.values()) {
    expireSessionIfNeeded(session);
  }

  const queue = queueWorkerStatus(store);
  const queuedJobs = Array.from(store.uploadJobs.values()).filter((job) => job.status === "queued");
  const processingJobs = Array.from(store.uploadJobs.values()).filter(
    (job) => job.status === "processing"
  );
  const failedJobs = Array.from(store.uploadJobs.values()).filter((job) => job.status === "failed");
  const openSessions = Array.from(store.uploadSessions.values()).filter(
    (session) => session.status === "open" || session.status === "completing"
  );
  const backpressureAccepting = queue.backpressure?.accepting ?? true;
  const status =
    failedJobs.length > 0 ? "blocked" : backpressureAccepting ? "accepting" : "throttled";
  const policy = defaultArtifactPolicy();
  const recommendations = [
    "Use chunked or archive upload for enterprise-scale CI ingestion.",
    "Keep synchronous JSON batch upload for small compatibility imports only.",
    "Scale parser workers from queue depth and oldest queued job lag.",
    "Keep artifact cleanup enabled per project; default attachment retention is 14 days for the enterprise profile."
  ];

  if (!backpressureAccepting) {
    recommendations.unshift(
      `Throttle producers and retry after ${enterpriseBackpressureRetryAfterMs} ms.`
    );
  }
  if (failedJobs.length > 0) {
    recommendations.unshift("Drain or replay failed ingestion jobs before accepting full load.");
  }

  return {
    kind: "enterprise-ingestion-readiness",
    status,
    updatedAt: queue.updatedAt,
    profile: {
      users: enterpriseTargetUsers,
      resultCount: enterpriseTargetResults,
      windowHours: enterpriseTargetWindowHours,
      targetResultsPerHour: enterpriseTargetResults / enterpriseTargetWindowHours,
      targetResultsPerSecond: enterpriseTargetResults / enterpriseTargetWindowHours / 60 / 60
    },
    queue,
    totals: {
      launches: store.launches.size,
      sessions: store.uploadSessions.size,
      jobs: store.uploadJobs.size,
      openSessions: openSessions.length,
      queuedJobs: queuedJobs.length,
      processingJobs: processingJobs.length,
      failedJobs: failedJobs.length,
      receivedFiles: Array.from(store.uploadJobs.values()).reduce(
        (total, job) => total + job.receivedFiles,
        0
      ),
      importedResults: Array.from(store.uploadJobs.values()).reduce(
        (total, job) => total + job.importedResults,
        0
      ),
      storedArtifacts: Array.from(store.uploadJobs.values()).reduce(
        (total, job) => total + job.storedArtifacts,
        0
      )
    },
    uploadModes: {
      jsonBatch: {
        enterpriseRecommended: false,
        fileLimit: jsonBatchSyncFileLimit,
        byteLimit: jsonBatchSyncByteLimit
      },
      chunked: {
        enterpriseRecommended: true,
        chunkBytes: policy.chunkBytes,
        maxChunks: policy.maxUploadChunks,
        maxSessionBytes: policy.maxUploadSessionBytes
      },
      archive: {
        enterpriseRecommended: true,
        manifestEntriesLimit: maxArchiveManifestEntries,
        storesArchivePayloadOnApi: false
      }
    },
    recommendations
  };
}

export function artifactPolicyForProject(store: AppStore, projectId: string): ArtifactPolicy {
  const basePolicy = defaultArtifactPolicy();
  const retention = store.projects.get(projectId)?.artifactRetention;
  if (retention === undefined) {
    return basePolicy;
  }

  return normalizeArtifactPolicy({
    ...basePolicy,
    retentionDays: retention.attachmentRetentionDays,
    cleanupGraceDays: retention.cleanupGraceDays
  });
}

export function serializeUploadJob(job: UploadJob): UploadJobReadModel {
  const readModel: UploadJobReadModel & {
    lease?: { claimedBy: string; claimedAt: string; expiresAt: string; active: boolean };
  } = {
    id: job.id,
    launchId: job.launchId,
    status: job.status,
    receivedFiles: job.receivedFiles,
    importedResults: job.importedResults,
    duplicateResults: job.duplicateResults,
    storedArtifacts: job.storedArtifacts,
    results: job.results ?? [],
    errors: job.errors,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt
  };

  if (job.lease !== undefined) {
    readModel.lease = {
      claimedBy: job.lease.claimedBy,
      claimedAt: job.lease.claimedAt,
      expiresAt: job.lease.expiresAt,
      active: Date.parse(job.lease.expiresAt) > Date.now()
    };
  }

  return readModel;
}

export function toRuntimeUploadJob(job: PersistentUploadJob): UploadJob {
  return {
    id: job.id,
    launchId: job.launchId,
    status: job.status,
    receivedFiles: job.receivedFiles,
    importedResults: job.importedResults,
    duplicateResults: job.duplicateResults,
    storedArtifacts: job.storedArtifacts,
    errors: job.errors,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    ...(job.lease !== undefined ? { lease: job.lease } : {}),
    ...(job.source !== undefined ? { source: job.source } : {}),
    ...(job.results !== undefined ? { results: job.results } : {})
  };
}

function sessionProgress(session: UploadSession): UploadProgressReadModel {
  return {
    totalUnits: session.totalChunks,
    processedUnits: session.receivedChunks,
    percent: progressPercent(session.receivedChunks, session.totalChunks),
    ...(session.totalBytes !== undefined ? { totalBytes: session.totalBytes } : {}),
    processedBytes: session.receivedBytes
  };
}

export function jobProgress(job: UploadJob): UploadProgressReadModel {
  const diagnosticFiles = new Set(job.errors.map((error) => error.path));
  const terminal =
    job.status === "completed" || job.status === "completed_with_errors" || job.status === "failed";
  const processedUnits = terminal
    ? job.receivedFiles
    : Math.min(
        job.receivedFiles,
        job.importedResults + job.duplicateResults + diagnosticFiles.size
      );

  return {
    totalUnits: job.receivedFiles,
    processedUnits,
    percent:
      job.receivedFiles === 0 && terminal ? 100 : progressPercent(processedUnits, job.receivedFiles)
  };
}

function aggregateProgress(
  progressItems: UploadProgressReadModel[],
  terminalLaunch: boolean
): UploadProgressReadModel {
  const totalUnits = progressItems.reduce((total, item) => total + item.totalUnits, 0);
  const processedUnits = progressItems.reduce((total, item) => total + item.processedUnits, 0);
  const totalBytes = progressItems.reduce((total, item) => total + (item.totalBytes ?? 0), 0);
  const processedBytes = progressItems.reduce(
    (total, item) => total + (item.processedBytes ?? 0),
    0
  );

  return {
    totalUnits,
    processedUnits,
    percent: totalUnits === 0 && terminalLaunch ? 100 : progressPercent(processedUnits, totalUnits),
    ...(totalBytes > 0 ? { totalBytes } : {}),
    ...(processedBytes > 0 ? { processedBytes } : {})
  };
}

function sessionDiagnostics(
  session: UploadSession,
  job: UploadJob | undefined
): UploadDiagnosticReadModel[] {
  const diagnostics: UploadDiagnosticReadModel[] = [];

  if (session.status === "expired") {
    diagnostics.push({
      scope: "session",
      severity: "error",
      code: "upload.session.expired",
      message: "Upload session expired before completion"
    });
  }
  if (session.status === "aborted") {
    diagnostics.push({
      scope: "session",
      severity: "warning",
      code: "upload.session.aborted",
      message: "Upload session was aborted and buffered chunks were cleared"
    });
  }
  if (session.cleanup !== undefined) {
    diagnostics.push({
      scope: "session",
      severity: "info",
      code: "upload.session.cleanup",
      message: `Buffered chunks were cleared after ${session.cleanup.reason}`
    });
  }
  for (const file of Array.from(session.files.values()).slice(0, 10)) {
    if (file.receivedChunks < file.totalChunks) {
      diagnostics.push({
        scope: "file",
        severity: "info",
        code: "upload.file.awaiting_chunks",
        path: file.path,
        message: `${file.totalChunks - file.receivedChunks} chunk(s) are still missing`
      });
    }
    if (file.totalBytes !== undefined && file.receivedBytes !== file.totalBytes) {
      diagnostics.push({
        scope: "file",
        severity: "info",
        code: "upload.file.awaiting_bytes",
        path: file.path,
        message: `${file.totalBytes - file.receivedBytes} byte(s) are still missing`
      });
    }
  }

  if (job !== undefined) {
    diagnostics.push(...jobDiagnostics(job));
  }

  return diagnostics.slice(0, 50);
}

function jobDiagnostics(job: UploadJob): UploadDiagnosticReadModel[] {
  const diagnostics: UploadDiagnosticReadModel[] = [];

  if (job.status === "queued" || job.status === "processing") {
    diagnostics.push({
      scope: "job",
      severity: "info",
      code: "upload.job.in_progress",
      message: `Upload job is ${job.status}`
    });
  }
  if (job.status === "failed") {
    diagnostics.push({
      scope: "job",
      severity: "error",
      code: "upload.job.failed",
      message: "Upload job failed"
    });
  }
  if (job.duplicateResults > 0) {
    diagnostics.push({
      scope: "job",
      severity: "info",
      code: "upload.job.duplicates",
      message: `${job.duplicateResults} duplicate result(s) were ignored`
    });
  }
  for (const diagnostic of job.errors.slice(0, 50)) {
    for (const warning of diagnostic.warnings) {
      diagnostics.push({
        scope: "file",
        severity: "warning",
        code: "upload.file.warning",
        path: diagnostic.path,
        message: warning
      });
    }
    for (const error of diagnostic.errors) {
      diagnostics.push({
        scope: "file",
        severity: "error",
        code: "upload.file.error",
        path: diagnostic.path,
        message: error
      });
    }
  }

  return diagnostics.slice(0, 50);
}

export function queueWorkerStatus(store: AppStore, launchId?: string): QueueWorkerStatusReadModel {
  const jobs = Array.from(store.uploadJobs.values()).filter(
    (job) => launchId === undefined || job.launchId === launchId
  );
  const depth = jobs.filter((job) => job.status === "queued").length;
  const inFlight = jobs.filter((job) => job.status === "processing").length;
  const deadLetters = jobs.filter((job) => job.status === "failed").length;
  const policy = defaultArtifactPolicy();
  const targetResultsPerHour = enterpriseTargetResults / enterpriseTargetWindowHours;
  const estimatedResultsPerHourCapacity =
    enterpriseParserWorkerConcurrency * enterpriseEstimatedResultsPerWorkerHour;
  const capacityMargin = estimatedResultsPerHourCapacity / targetResultsPerHour;
  const reason =
    deadLetters > 0
      ? "dead_letters"
      : depth >= enterpriseQueueDepthWatermark
        ? "queue_depth_watermark"
        : inFlight >= enterpriseInFlightWatermark
          ? "inflight_watermark"
          : "below_watermark";
  const accepting = reason === "below_watermark";
  const status =
    deadLetters > 0 ? "blocked" : inFlight > 0 ? "busy" : depth > 0 ? "accepting" : "idle";
  const updatedAt = new Date().toISOString();

  return {
    mode: "queue",
    queue: {
      name: "ingestion.parse",
      status,
      depth,
      inFlight,
      deadLetters
    },
    workers: [
      {
        name: "parser-worker-pool",
        status: inFlight > 0 ? "busy" : "idle",
        concurrency: enterpriseParserWorkerConcurrency,
        activeJobs: inFlight,
        heartbeatAt: updatedAt
      },
      {
        name: "artifact-worker-pool",
        status: "idle",
        concurrency: enterpriseArtifactWorkerConcurrency,
        activeJobs: 0,
        heartbeatAt: updatedAt
      }
    ],
    capacity: {
      targetUsers: enterpriseTargetUsers,
      targetResults: enterpriseTargetResults,
      targetWindowHours: enterpriseTargetWindowHours,
      targetResultsPerHour,
      targetResultsPerSecond: targetResultsPerHour / 60 / 60,
      estimatedResultsPerHourCapacity,
      capacityMargin: Math.round(capacityMargin * 100) / 100,
      status: capacityMargin >= 1.2 ? "ok" : capacityMargin >= 1 ? "at_risk" : "insufficient"
    },
    backpressure: {
      enabled: true,
      accepting,
      reason,
      retryAfterMs: accepting ? 0 : enterpriseBackpressureRetryAfterMs,
      queueDepthWatermark: enterpriseQueueDepthWatermark,
      inFlightWatermark: enterpriseInFlightWatermark,
      queueDepthRatio: Math.round((depth / enterpriseQueueDepthWatermark) * 10000) / 10000,
      inFlightRatio: Math.round((inFlight / enterpriseInFlightWatermark) * 10000) / 10000
    },
    limits: {
      jsonBatchSyncFileLimit,
      jsonBatchSyncByteLimit,
      chunkBytes: policy.chunkBytes,
      maxUploadChunks: policy.maxUploadChunks,
      maxUploadSessionBytes: policy.maxUploadSessionBytes,
      maxArtifactBytes: policy.maxArtifactBytes,
      defaultArtifactRetentionDays: policy.retentionDays
    },
    updatedAt
  };
}

export function expireLaunchSessions(store: AppStore, launchId: string) {
  for (const session of store.uploadSessions.values()) {
    if (session.launchId === launchId) {
      expireSessionIfNeeded(session);
    }
  }
}

function progressPercent(processed: number, total: number): number {
  if (total <= 0) {
    return 0;
  }
  return Math.round((processed / total) * 10000) / 100;
}
