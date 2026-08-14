import { createHash, randomUUID } from "node:crypto";
import type { Launch as DomainLaunch } from "@testhistory/domain";
import {
  normalizeAllureResult,
  parseAllureCompatibilityFile,
  type AllureArchiveManifestEntry
} from "@testhistory/allure-parser";
import {
  mapWithConcurrency,
  prepareArtifact,
  type ArtifactPolicy,
  type ArtifactResultStatus
} from "@testhistory/artifacts";
import {
  serializeArtifactChecksumDuplicates,
  serializeArtifactDescriptor
} from "./artifact-responses.js";
import {
  summarizeStoredLaunch,
  type AppStore,
  type Launch,
  type LaunchResultSource,
  type UploadJob
} from "../store.js";
import {
  toPersistentArtifact,
  toPersistentLaunch,
  toPersistentLaunchResult,
  toPersistentUploadJob,
  toPersistentUploadSession
} from "../storeMappers.js";

import {
  jsonBatchSyncByteLimit,
  jsonBatchSyncFileLimit,
  maxArchiveDiagnostics,
  maxArchiveManifestEntries,
  type ArchiveManifestDiagnostic,
  type CompatibilityFileImport,
  type JsonBatchBackpressureResponse,
  type UploadFile
} from "./uploadTypes.js";
import {
  artifactPolicyForProject,
  buildJobIngestionStatus,
  serializeUploadJob,
  serializeUploadSession
} from "./uploadSerialization.js";
import { assembleFile, clearSessionChunks } from "./uploadChunked.js";
import {
  buildAttachmentFileIndex,
  enrichResultAttachmentPreviews
} from "./uploadAttachmentPreviews.js";

export function validateJsonBatchUploadSize(
  files: Array<{ path: string; content: string }>
): JsonBatchBackpressureResponse | undefined {
  const observedBytes = files.reduce(
    (sum, file) => sum + Buffer.byteLength(file.content, "utf8"),
    0
  );

  if (files.length <= jsonBatchSyncFileLimit && observedBytes <= jsonBatchSyncByteLimit) {
    return undefined;
  }

  return {
    kind: "upload-backpressure",
    code: "upload.backpressure.batch_too_large",
    accepted: false,
    retryable: true,
    redacted: true,
    limits: {
      files: jsonBatchSyncFileLimit,
      bytes: jsonBatchSyncByteLimit
    },
    observed: {
      files: files.length,
      bytes: observedBytes
    },
    recommendation:
      "Use chunked upload or archive upload for high-volume result sets; JSON batch upload is reserved for small synchronous imports."
  };
}

export async function processUploadJob(
  store: AppStore,
  job: UploadJob,
  claimToken?: string
): Promise<
  | { ok: true; body: Record<string, unknown> }
  | { ok: false; statusCode: 409 | 404; body: Record<string, unknown> }
> {
  if (job.status === "completed" || job.status === "completed_with_errors") {
    return {
      ok: true,
      body: {
        job: serializeUploadJob(job),
        status: buildJobIngestionStatus(store, job),
        idempotent: true
      }
    };
  }

  if (job.status === "processing") {
    const lease = job.lease;
    if (
      lease === undefined ||
      lease.claimToken !== claimToken ||
      Date.parse(lease.expiresAt) <= Date.now()
    ) {
      return {
        ok: false,
        statusCode: 409,
        body: {
          message:
            lease === undefined
              ? "Upload job is already processing"
              : "Upload job is leased by another worker or the lease expired",
          job: serializeUploadJob(job),
          status: buildJobIngestionStatus(store, job)
        }
      };
    }
  }

  if (job.status === "failed") {
    return {
      ok: false,
      statusCode: 409,
      body: {
        message: "Upload job failed and requires replay",
        job: serializeUploadJob(job),
        status: buildJobIngestionStatus(store, job)
      }
    };
  }

  if (job.source?.mode !== "chunked-session") {
    return {
      ok: false,
      statusCode: 409,
      body: {
        message: "Upload job payload is not available to this worker boundary",
        job: serializeUploadJob(job),
        processing: {
          mode: job.archive === undefined ? "unknown" : "archive-manifest-intake",
          queue: "ingestion.parse",
          workerBoundary: job.archive?.workerBoundary ?? "chunked-session-import",
          payloadAvailable: false
        }
      }
    };
  }

  const session = store.uploadSessions.get(job.source.sessionId);
  if (session === undefined) {
    job.status = "failed";
    job.errors.push({
      path: "__session__",
      errors: ["Upload session payload is missing"],
      warnings: []
    });
    job.updatedAt = new Date().toISOString();
    return {
      ok: false,
      statusCode: 404,
      body: {
        message: "Upload session payload is missing",
        job: serializeUploadJob(job)
      }
    };
  }

  if (session.status !== "completed") {
    return {
      ok: false,
      statusCode: 409,
      body: {
        message: `Upload session is ${session.status}`,
        session: serializeUploadSession(session),
        job: serializeUploadJob(job)
      }
    };
  }

  const files = await Promise.all(
    Array.from(session.files.values()).map(async (file) => ({
      path: file.path,
      content: await assembleFile(file, store.artifactObjects)
    }))
  );

  try {
    const result = await importFiles(store, job.launchId, files, job);
    delete job.lease;
    await clearSessionChunks(session, "completed", store.artifactObjects);
    session.updatedAt = new Date().toISOString();
    if (store.driver === "postgres") {
      await store.repositories.uploadSessions.save(toPersistentUploadSession(session));
    }
    return {
      ok: true,
      body: {
        session: serializeUploadSession(session),
        ...result
      }
    };
  } catch (error) {
    job.status = "failed";
    delete job.lease;
    job.errors.push({
      path: "__worker__",
      errors: [error instanceof Error ? error.message : String(error)],
      warnings: []
    });
    job.updatedAt = new Date().toISOString();
    await clearSessionChunks(session, "failed", store.artifactObjects);
    session.status = "failed";
    session.updatedAt = new Date().toISOString();
    if (store.driver === "postgres") {
      await store.transaction(async (repositories) => {
        await repositories.uploadJobs.save(toPersistentUploadJob(job));
        await repositories.uploadSessions.save(toPersistentUploadSession(session));
      });
    }
    return {
      ok: false,
      statusCode: 409,
      body: {
        message: "Upload job failed during worker processing",
        job: serializeUploadJob(job),
        session: serializeUploadSession(session)
      }
    };
  }
}

export async function importFiles(
  store: AppStore,
  launchId: string,
  files: UploadFile[],
  existingJob?: UploadJob
) {
  const launch = store.launches.get(launchId) as Launch | undefined;
  if (!launch) {
    throw new Error(`Launch ${launchId} not found`);
  }

  const now = new Date().toISOString();
  const job: UploadJob =
    existingJob ??
    ({
      id: randomUUID(),
      launchId: launch.id,
      status: "processing",
      receivedFiles: files.length,
      importedResults: 0,
      duplicateResults: 0,
      storedArtifacts: 0,
      errors: [],
      createdAt: now,
      updatedAt: now
    } satisfies UploadJob);
  job.status = "processing";
  job.receivedFiles = files.length;
  job.importedResults = 0;
  job.duplicateResults = 0;
  job.storedArtifacts = 0;
  job.errors = [];
  job.updatedAt = now;
  store.uploadJobs.set(job.id, job);
  if (store.driver === "postgres") {
    await store.repositories.uploadJobs.save(toPersistentUploadJob(job));
  }

  const imported = [];
  const duplicateFileIndexes = new Set<number>();
  const compatibilityFiles: CompatibilityFileImport[] = [];
  const attachmentFilesByPath = buildAttachmentFileIndex(files);

  for (const [index, file] of files.entries()) {
    if (!isSupportedAllureCompatibilityFile(file.path)) {
      continue;
    }

    const parsed = parseAllureCompatibilityFile(file.path, toUtf8(file.content));
    if (!parsed.ok) {
      job.errors.push({ path: file.path, errors: parsed.errors, warnings: parsed.warnings });
      compatibilityFiles.push({
        path: file.path,
        kind: compatibilityKindFromPath(file.path),
        status: "diagnostic",
        warnings: parsed.warnings,
        errors: parsed.errors
      });
      continue;
    }

    if (parsed.value.kind === "executor") {
      launch.executor = toExecutorReadModel(parsed.value.value);
    }

    if (parsed.value.kind !== "result") {
      compatibilityFiles.push({
        path: file.path,
        kind: parsed.value.kind,
        status: "imported",
        warnings: parsed.warnings,
        errors: []
      });
      continue;
    }

    const normalized = enrichResultAttachmentPreviews(
      normalizeAllureResult(parsed.value.value),
      attachmentFilesByPath,
      launch.id
    );
    if (hasResultSource(launch, file.path, normalized.uuid)) {
      job.duplicateResults += 1;
      duplicateFileIndexes.add(index);
      compatibilityFiles.push({
        path: file.path,
        kind: "result",
        status: "duplicate",
        uuid: normalized.uuid,
        warnings: parsed.warnings,
        errors: []
      });
      continue;
    }

    launch.results.push(normalized);
    markResultSource(launch, file.path, normalized.uuid);
    job.importedResults += 1;
    imported.push({ path: file.path, uuid: normalized.uuid, warnings: parsed.warnings });
    compatibilityFiles.push({
      path: file.path,
      kind: "result",
      status: "imported",
      uuid: normalized.uuid,
      warnings: parsed.warnings,
      errors: []
    });
  }

  const policy = artifactPolicyForProject(store, launch.projectId);
  const filesToStore = files.filter((_, index) => !duplicateFileIndexes.has(index));
  const artifacts = [];
  const storedArtifactIds = new Set<string>();
  const preparedArtifacts = await mapWithConcurrency(
    filesToStore,
    policy.maxUploadConcurrency,
    async (file) => {
      try {
        return prepareArtifact({
          launchId: launch.id,
          projectId: launch.projectId,
          path: file.path,
          content: file.content,
          resultStatus: file.resultStatus ?? inferResultStatus(file),
          policy
        });
      } catch (error) {
        job.errors.push({
          path: file.path,
          errors: [error instanceof Error ? error.message : String(error)],
          warnings: []
        });
        return undefined;
      }
    }
  );

  for (const artifact of preparedArtifacts.filter((item) => item !== undefined)) {
    try {
      await store.artifactObjects.putObject({
        key: artifact.storageKey,
        body: artifact.payload,
        originalBytes: artifact.originalBytes,
        storedBytes: artifact.storedBytes,
        sha256: artifact.sha256,
        compression: artifact.compression,
        ...(artifact.contentType !== undefined ? { contentType: artifact.contentType } : {})
      });
    } catch (error) {
      job.errors.push({
        path: artifact.path,
        errors: [error instanceof Error ? error.message : String(error)],
        warnings: []
      });
      continue;
    }

    const descriptor = {
      id: artifact.id,
      launchId: artifact.launchId,
      ...(artifact.projectId !== undefined ? { projectId: artifact.projectId } : {}),
      path: artifact.path,
      kind: artifact.kind,
      ...(artifact.contentType !== undefined ? { contentType: artifact.contentType } : {}),
      originalBytes: artifact.originalBytes,
      storedBytes: artifact.storedBytes,
      sha256: artifact.sha256,
      compression: artifact.compression,
      compressionMetadata: artifact.compressionMetadata,
      storage: artifact.storage,
      storageKey: artifact.storageKey,
      expiresAt: artifact.expiresAt,
      retention: artifact.retention,
      cleanup: artifact.cleanup,
      upload: artifact.upload,
      createdAt: artifact.createdAt
    };
    store.artifacts.set(descriptor.id, descriptor);
    storedArtifactIds.add(descriptor.id);
    job.storedArtifacts += 1;
    artifacts.push(serializeArtifactDescriptor(descriptor));
  }

  job.status = job.errors.length > 0 ? "completed_with_errors" : "completed";
  job.updatedAt = new Date().toISOString();

  if (store.driver === "postgres") {
    await store.transaction(async (repositories) => {
      await repositories.launches.save(toPersistentLaunch(launch));
      await repositories.launchResults.saveMany(
        launch.results.map((result) =>
          toPersistentLaunchResult(launch as unknown as DomainLaunch, result)
        )
      );
      await repositories.artifacts.saveMany(
        [...storedArtifactIds].flatMap((id) => {
          const artifact = store.artifacts.get(id);
          return artifact === undefined ? [] : [toPersistentArtifact(artifact)];
        })
      );
      await repositories.uploadJobs.save(toPersistentUploadJob(job));
    });
  }

  return {
    job,
    imported,
    compatibilityFiles,
    artifacts,
    checksumDuplicates: serializeArtifactChecksumDuplicates(
      Array.from(store.artifacts.values()).filter((artifact) => artifact.launchId === launch.id),
      storedArtifactIds
    ),
    launch: summarizeStoredLaunch(launch)
  };
}

export function isSupportedAllureCompatibilityFile(path: string): boolean {
  const normalizedPath = path.replaceAll("\\", "/").toLowerCase();
  const basename = normalizedPath.split("/").at(-1) ?? normalizedPath;
  return (
    basename.endsWith("-result.json") ||
    basename.endsWith("-container.json") ||
    basename === "environment.properties" ||
    basename === "executor.json" ||
    basename === "categories.json" ||
    ((normalizedPath.startsWith("history/") || normalizedPath.includes("/history/")) &&
      basename.endsWith(".json"))
  );
}

export function compatibilityKindFromPath(path: string): CompatibilityFileImport["kind"] {
  const normalizedPath = path.replaceAll("\\", "/").toLowerCase();
  const basename = normalizedPath.split("/").at(-1) ?? normalizedPath;
  if (basename.endsWith("-result.json")) {
    return "result";
  }
  if (basename.endsWith("-container.json")) {
    return "container";
  }
  if (basename === "environment.properties") {
    return "environment";
  }
  if (basename === "executor.json") {
    return "executor";
  }
  if (basename === "categories.json") {
    return "categories";
  }
  if (
    (normalizedPath.startsWith("history/") || normalizedPath.includes("/history/")) &&
    basename.endsWith(".json")
  ) {
    return "history";
  }
  return "unsupported";
}

export function toExecutorReadModel(
  value: Record<string, unknown>
): NonNullable<Launch["executor"]> {
  return {
    ...optionalStringProperty(value, "name"),
    ...optionalStringProperty(value, "type"),
    ...optionalStringProperty(value, "buildName"),
    ...optionalStringProperty(value, "buildUrl"),
    ...optionalStringProperty(value, "reportUrl")
  };
}

function optionalStringProperty<T extends "name" | "type" | "buildName" | "buildUrl" | "reportUrl">(
  value: Record<string, unknown>,
  key: T
): Pick<NonNullable<Launch["executor"]>, T> | object {
  const candidate = value[key];
  return typeof candidate === "string" ? { [key]: candidate } : {};
}

export function ensureLaunchAcceptsUploads(launch: Launch) {
  if (launch.status === "open") {
    return undefined;
  }

  return {
    message: `Launch does not accept uploads while ${launch.status}`,
    launch: summarizeStoredLaunch(launch)
  };
}

export function archiveProcessingContract(policy: ArtifactPolicy) {
  return {
    mode: "archive-manifest-intake",
    extraction: "deferred",
    storesArchivePayload: false,
    payloadsAcceptedOnThisEndpoint: false,
    queue: "ingestion.parse",
    workerBoundary: "archive-unpack-planned",
    bounded: {
      maxEntries: maxArchiveManifestEntries,
      maxDiagnostics: maxArchiveDiagnostics,
      maxUploadSessionBytes: policy.maxUploadSessionBytes,
      maxArtifactBytes: policy.maxArtifactBytes,
      maxUploadConcurrency: policy.maxUploadConcurrency,
      compression: "artifact-policy"
    }
  };
}

export function archiveOversizedDiagnostic(
  totalUncompressedBytes: number,
  advertisedCompressedBytes: number | undefined,
  maxUploadSessionBytes: number
): ArchiveManifestDiagnostic | undefined {
  const advertisedBytes = Math.max(totalUncompressedBytes, advertisedCompressedBytes ?? 0);
  if (advertisedBytes <= maxUploadSessionBytes) {
    return undefined;
  }

  return {
    scope: "archive",
    severity: "error",
    code: "archive_manifest.too_large",
    message: `Archive manifest advertises ${advertisedBytes} bytes, above max session size ${maxUploadSessionBytes}`
  };
}

export function archiveEntryDiagnostics(
  entries: AllureArchiveManifestEntry[]
): ArchiveManifestDiagnostic[] {
  return entries.map((entry, index) => ({
    scope: "entry",
    severity: entry.ignored ? "warning" : "info",
    code: entry.ignored ? "archive_entry.ignored" : "archive_entry.accepted",
    index,
    path: entry.path,
    kind: entry.kind,
    message: entry.ignored
      ? (entry.reason ?? "Archive entry will be ignored")
      : "Archive entry is eligible for bounded async processing"
  }));
}

export function redactArchiveName(name: string | undefined): string | undefined {
  if (name === undefined) {
    return undefined;
  }
  const normalized = name.replaceAll("\\", "/").split("/").at(-1)?.trim();
  return normalized === undefined || normalized.length === 0 ? undefined : normalized;
}

export function sha256(content: Buffer): string {
  return createHash("sha256").update(content).digest("hex");
}

export function toUtf8(content: Buffer | string): string {
  return Buffer.isBuffer(content) ? content.toString("utf8") : content;
}

export function inferResultStatus(file: UploadFile): ArtifactResultStatus {
  if (!file.path.endsWith("-result.json")) {
    return "other";
  }

  const parsed = parseAllureCompatibilityFile(file.path, toUtf8(file.content));
  return parsed.ok && parsed.value.kind === "result"
    ? (parsed.value.value.status ?? "other")
    : "other";
}

function hasResultSource(launch: Launch, path: string, uuid: string): boolean {
  return getResultSources(launch).has(resultSourceKey(path, uuid));
}

function markResultSource(launch: Launch, path: string, uuid: string) {
  getResultSources(launch).set(resultSourceKey(path, uuid), {
    path,
    uuid,
    importedAt: new Date().toISOString()
  });
}

function getResultSources(launch: Launch): Map<string, LaunchResultSource> {
  launch.resultSources ??= new Map();
  return launch.resultSources;
}

function resultSourceKey(path: string, uuid: string): string {
  return `${path}\0${uuid}`;
}

export function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}
