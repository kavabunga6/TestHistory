import { randomUUID } from "node:crypto";
import { defaultArtifactPolicy } from "@testhistory/artifacts";
import type { Launch as DomainLaunch } from "@testhistory/domain";
import type { FastifyReply } from "fastify";
import {
  summarizeStoredLaunch,
  syncTestCasesFromLaunch,
  type AppStore,
  type Launch,
  type LaunchClosePendingUpload,
  type LaunchClosePipeline,
  type LaunchCloseProcessingSummary,
  type UploadJob,
  type UploadSession
} from "../store.js";
import { toPersistentLaunch, toPersistentProject } from "../storeMappers.js";
import { enqueueLaunchNotifications } from "../integrationDeliveryService.js";

import { importFiles, ensureLaunchAcceptsUploads } from "./uploadCore.js";
import { serializeUploadJob } from "./uploadSerialization.js";
import {
  type AllureCtlLaunchRequest,
  type AllureCtlQuery,
  type AllureCtlSessionRequest,
  type AllureCtlUploadRequest,
  type ChunkEncoding,
  type UploadFile
} from "./uploadTypes.js";

export function enqueueChunkedSessionJob(store: AppStore, session: UploadSession): UploadJob {
  const existingJob =
    session.completedJobId === undefined ? undefined : store.uploadJobs.get(session.completedJobId);
  if (existingJob !== undefined) {
    return existingJob;
  }

  const now = new Date().toISOString();
  const job: UploadJob = {
    id: randomUUID(),
    launchId: session.launchId,
    status: "queued",
    receivedFiles: session.files.size,
    importedResults: 0,
    duplicateResults: 0,
    storedArtifacts: 0,
    errors: [],
    createdAt: now,
    updatedAt: now,
    source: {
      mode: "chunked-session",
      sessionId: session.id,
      payloadAvailable: true
    }
  };
  store.uploadJobs.set(job.id, job);
  return job;
}

export function resolveAllureCtlProjectId(
  bodyProjectId: string | number | undefined,
  queryProjectId: string | undefined
): string | undefined {
  const candidate = bodyProjectId ?? queryProjectId;
  if (candidate === undefined) {
    return undefined;
  }

  const value = String(candidate).trim();
  return value.length > 0 ? value : undefined;
}

export function ensureAllureCtlProject(store: AppStore, projectId: string) {
  if (store.projects.has(projectId)) {
    return;
  }

  const now = new Date().toISOString();
  store.projects.set(projectId, {
    id: projectId,
    key: `ALLURE-${projectId}`,
    name: `Allure project ${projectId}`,
    createdAt: now
  });
}

export function createAllureCtlLaunch(
  store: AppStore,
  projectId: string,
  input: AllureCtlLaunchRequest
): Launch {
  const now = new Date().toISOString();
  const launch: Launch = {
    id: randomUUID(),
    projectId,
    name: normalizeAllureCtlLaunchName(input.launchName ?? input.name),
    status: "open",
    ...(input.branch !== undefined ? { branch: input.branch } : {}),
    ...(input.commitSha !== undefined ? { commitSha: input.commitSha } : {}),
    ...(input.buildNumber !== undefined ? { buildNumber: input.buildNumber } : {}),
    createdAt: now,
    results: []
  };
  store.launches.set(launch.id, launch as DomainLaunch);
  return launch;
}

export function resolveOrCreateAllureCtlLaunch(
  store: AppStore,
  body: AllureCtlSessionRequest | AllureCtlUploadRequest,
  query: AllureCtlQuery
): Launch | undefined {
  const launchId = body.launchId ?? query.launchId;
  if (launchId !== undefined) {
    return store.launches.get(launchId) as Launch | undefined;
  }

  const projectId = resolveAllureCtlProjectId(body.projectId, query.projectId);
  if (projectId === undefined) {
    return undefined;
  }

  ensureAllureCtlProject(store, projectId);
  const launchName = body.launchName ?? query.launchName ?? query.name;
  return createAllureCtlLaunch(store, projectId, {
    projectId,
    ...(launchName !== undefined ? { launchName } : {})
  });
}

function normalizeAllureCtlLaunchName(value: string | undefined): string {
  const normalized = value?.trim();
  return normalized && normalized.length > 0 ? normalized : `allurectl ${new Date().toISOString()}`;
}

export function createAllureCtlSession(store: AppStore, launch: Launch): UploadSession {
  const now = new Date().toISOString();
  const policy = defaultArtifactPolicy();
  const session: UploadSession = {
    id: randomUUID(),
    launchId: launch.id,
    path: "__allurectl__",
    status: "open",
    totalChunks: 0,
    receivedChunks: 0,
    receivedBytes: 0,
    files: new Map(),
    createdAt: now,
    updatedAt: now,
    expiresAt: new Date(Date.parse(now) + policy.uploadSessionTtlMinutes * 60 * 1000).toISOString()
  };
  store.uploadSessions.set(session.id, session);
  return session;
}

export function normalizeAllureCtlFiles(
  body: AllureCtlUploadRequest,
  query: AllureCtlQuery
): UploadFile[] {
  const fallbackPath = body.path ?? body.name ?? body.fileName ?? query.path ?? query.fileName;
  const rawFiles: Array<{
    path?: string;
    name?: string;
    fileName?: string;
    content?: string;
    contentEncoding?: ChunkEncoding;
  }> = body.files ?? [
    {
      ...(fallbackPath !== undefined ? { path: fallbackPath } : {}),
      ...(body.content !== undefined ? { content: body.content } : {}),
      ...(body.contentEncoding !== undefined ? { contentEncoding: body.contentEncoding } : {})
    }
  ];

  return rawFiles.flatMap((file) => {
    const path = file.path ?? file.name ?? file.fileName;
    if (path === undefined || file.content === undefined) {
      return [];
    }

    const content =
      file.contentEncoding === "base64" ? Buffer.from(file.content, "base64") : file.content;
    return [{ path, content }];
  });
}

export function updateAllureCtlSessionFromFiles(session: UploadSession, files: UploadFile[]) {
  for (const file of files) {
    const bytes = Buffer.isBuffer(file.content)
      ? file.content.byteLength
      : Buffer.byteLength(file.content, "utf8");
    session.files.set(file.path, {
      path: file.path,
      totalChunks: 1,
      receivedChunks: 1,
      totalBytes: bytes,
      receivedBytes: bytes,
      chunks: new Map()
    });
  }
  session.totalChunks = session.files.size;
  session.receivedChunks = session.files.size;
  session.totalBytes = Array.from(session.files.values()).reduce(
    (total, file) => total + (file.totalBytes ?? 0),
    0
  );
  session.receivedBytes = Array.from(session.files.values()).reduce(
    (total, file) => total + file.receivedBytes,
    0
  );
  session.updatedAt = new Date().toISOString();
}

export async function handleAllureCtlBatchUpload(
  store: AppStore,
  body: AllureCtlUploadRequest,
  query: AllureCtlQuery,
  host: string | undefined,
  reply: FastifyReply
) {
  const launch = resolveOrCreateAllureCtlLaunch(store, body, query);
  if (launch === undefined) {
    return reply.code(400).send(allureCtlError("allurectl.launch.required"));
  }

  const uploadStateError = ensureLaunchAcceptsUploads(launch);
  if (uploadStateError !== undefined) {
    return reply.code(409).send(uploadStateError);
  }

  const files = normalizeAllureCtlFiles(body, query);
  if (files.length === 0) {
    return reply.code(400).send(allureCtlError("allurectl.files.required"));
  }

  if (store.driver === "postgres") {
    await store.transaction(async (repositories) => {
      await repositories.projects.save(toPersistentProject(store.projects.get(launch.projectId)!));
      await repositories.launches.save(toPersistentLaunch(launch));
    });
  }

  const result = await importFiles(store, launch.id, files);
  if (body.closeLaunch === true || query.closeLaunch === "true") {
    const closeResult = closeAllureCtlLaunch(store, launch);
    if (closeResult.closed === false) {
      return reply.code(409).send({
        message: "Launch has pending uploads",
        ...allureCtlLaunchResponse(launch, host),
        closePipeline: launch.closePipeline
      });
    }
    if (store.driver === "postgres") {
      await store.repositories.launches.save(toPersistentLaunch(launch));
    }
    await enqueueLaunchNotifications(store, launch, {
      type: "service",
      serviceId: "allurectl"
    });
  }

  return reply.code(result.job.errors.length > 0 ? 207 : 200).send({
    kind: "allurectl-upload",
    accepted: true,
    launch: allureCtlLaunchResponse(launch, host),
    upload: serializeUploadJob(result.job),
    imported: result.imported,
    results: result.results,
    compatibilityFiles: result.compatibilityFiles,
    artifacts: result.artifacts
  });
}

export function closeAllureCtlLaunch(
  store: AppStore,
  launch: Launch
):
  | { closed: true; processedTestCases: number }
  | { closed: false; pendingUploads: LaunchClosePendingUpload[] } {
  if (launch.status === "closed" || launch.status === "failed") {
    return { closed: true, processedTestCases: launch.closePipeline?.processedTestCases ?? 0 };
  }

  const now = new Date().toISOString();
  const pendingUploads = reconcileAllureCtlPendingUploads(store, launch.id);
  if (pendingUploads.length > 0) {
    launch.closePipeline = {
      status: "pending_uploads",
      requestedAt: launch.closePipeline?.requestedAt ?? now,
      updatedAt: now,
      pendingUploads,
      summary: buildAllureCtlProcessingSummary(store, launch, 0),
      processedTestCases: 0,
      errors: collectAllureCtlUploadErrors(store, launch.id)
    };
    return { closed: false, pendingUploads };
  }

  launch.status = "processing";
  launch.closePipeline = {
    status: "processing",
    requestedAt: launch.closePipeline?.requestedAt ?? now,
    startedAt: now,
    updatedAt: now,
    pendingUploads: [],
    summary: buildAllureCtlProcessingSummary(store, launch, 0),
    processedTestCases: 0,
    errors: collectAllureCtlUploadErrors(store, launch.id)
  };

  try {
    const processedTestCases = syncTestCasesFromLaunch(store, launch);
    const closedAt = new Date().toISOString();
    launch.status = "closed";
    launch.closedAt = closedAt;
    launch.closePipeline = {
      ...launch.closePipeline,
      status: "closed",
      updatedAt: closedAt,
      finishedAt: closedAt,
      pendingUploads: [],
      summary: buildAllureCtlProcessingSummary(store, launch, processedTestCases),
      processedTestCases,
      errors: collectAllureCtlUploadErrors(store, launch.id)
    };
    return { closed: true, processedTestCases };
  } catch (error) {
    const failedAt = new Date().toISOString();
    launch.status = "failed";
    launch.failedAt = failedAt;
    launch.closePipeline = {
      ...(launch.closePipeline as LaunchClosePipeline),
      status: "failed",
      updatedAt: failedAt,
      finishedAt: failedAt,
      summary: buildAllureCtlProcessingSummary(store, launch, 0),
      processedTestCases: 0,
      errors: [
        ...(launch.closePipeline?.errors ?? []),
        {
          scope: "close",
          message: error instanceof Error ? error.message : String(error)
        }
      ]
    };
    return { closed: true, processedTestCases: 0 };
  }
}

function reconcileAllureCtlPendingUploads(
  store: AppStore,
  launchId: string
): LaunchClosePendingUpload[] {
  const pendingSessions = Array.from(store.uploadSessions.values())
    .filter(
      (session) =>
        session.launchId === launchId &&
        (session.status === "open" || session.status === "completing")
    )
    .map((session) => ({
      kind: "session" as const,
      id: session.id,
      status: session.status,
      path: session.path,
      receivedChunks: session.receivedChunks,
      totalChunks: session.totalChunks,
      expiresAt: session.expiresAt
    }));

  const pendingJobs = Array.from(store.uploadJobs.values())
    .filter(
      (job) => job.launchId === launchId && (job.status === "queued" || job.status === "processing")
    )
    .map((job) => ({
      kind: "job" as const,
      id: job.id,
      status: job.status,
      receivedFiles: job.receivedFiles
    }));

  return [...pendingSessions, ...pendingJobs];
}

function buildAllureCtlProcessingSummary(
  store: AppStore,
  launch: Launch,
  processedTestCases: number
): LaunchCloseProcessingSummary {
  const uploadJobs = Array.from(store.uploadJobs.values()).filter(
    (job) => job.launchId === launch.id
  );
  const base = summarizeStoredLaunch(launch);

  return {
    totalResults: launch.results.length,
    counters: base.counters,
    uploadJobs: {
      total: uploadJobs.length,
      queued: uploadJobs.filter((job) => job.status === "queued").length,
      processing: uploadJobs.filter((job) => job.status === "processing").length,
      completed: uploadJobs.filter((job) => job.status === "completed").length,
      completedWithErrors: uploadJobs.filter((job) => job.status === "completed_with_errors")
        .length,
      failed: uploadJobs.filter((job) => job.status === "failed").length,
      receivedFiles: uploadJobs.reduce((total, job) => total + job.receivedFiles, 0),
      importedResults: uploadJobs.reduce((total, job) => total + job.importedResults, 0),
      duplicateResults: uploadJobs.reduce((total, job) => total + job.duplicateResults, 0),
      storedArtifacts: uploadJobs.reduce((total, job) => total + job.storedArtifacts, 0)
    },
    processedTestCases
  };
}

function collectAllureCtlUploadErrors(
  store: AppStore,
  launchId: string
): LaunchClosePipeline["errors"] {
  return Array.from(store.uploadJobs.values())
    .filter((job) => job.launchId === launchId)
    .flatMap((job) =>
      job.errors.flatMap((error) =>
        error.errors.map((message) => ({
          scope: "upload" as const,
          id: job.id,
          path: error.path,
          message
        }))
      )
    );
}

export function allureCtlLaunchResponse(launch: Launch, host: string | undefined) {
  return {
    id: launch.id,
    launchId: launch.id,
    projectId: launch.projectId,
    name: launch.name,
    status: launch.status,
    url: allureCtlLaunchUrl(launch, host),
    links: {
      self: `/api/v1/launches/${encodeURIComponent(launch.id)}`,
      close: `/api/rs/launch/${encodeURIComponent(launch.id)}/close`,
      upload: `/api/allurectl/upload?launchId=${encodeURIComponent(launch.id)}`
    },
    counters: summarizeStoredLaunch(launch).counters
  };
}

export function allureCtlSessionResponse(
  session: UploadSession,
  launch: Launch,
  host: string | undefined
) {
  return {
    id: session.id,
    sessionId: session.id,
    uploadId: session.id,
    launchId: launch.id,
    projectId: launch.projectId,
    status: session.status,
    url: allureCtlLaunchUrl(launch, host),
    files: Array.from(session.files.values()).map((file) => ({
      path: file.path,
      totalBytes: file.totalBytes ?? file.receivedBytes,
      receivedBytes: file.receivedBytes
    })),
    links: {
      self: `/api/rs/session/${encodeURIComponent(session.id)}`,
      file: `/api/rs/session/${encodeURIComponent(session.id)}/file`,
      close: `/api/rs/session/${encodeURIComponent(session.id)}/close`,
      launch: `/api/v1/launches/${encodeURIComponent(launch.id)}`
    }
  };
}

function allureCtlLaunchUrl(launch: Launch, host: string | undefined): string {
  const base = host === undefined ? "" : `http://${host}`;
  return `${base}/#launch/${encodeURIComponent(launch.id)}`;
}

export function allureCtlError(code: string) {
  return {
    code,
    message: code,
    compatibleWith: "allurectl",
    redacted: true
  };
}
