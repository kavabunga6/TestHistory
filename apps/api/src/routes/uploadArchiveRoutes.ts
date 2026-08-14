import { randomUUID } from "node:crypto";
import { normalizeAllureArchiveManifest } from "@testhistory/allure-parser";
import { defaultArtifactPolicy } from "@testhistory/artifacts";
import type { FastifyInstance } from "fastify";
import { summarizeStoredLaunch, type AppStore, type Launch, type UploadJob } from "../store.js";
import { toPersistentUploadJob } from "../storeMappers.js";
import { authorizeProjectMutation } from "./project-auth.js";

import {
  validateJsonBatchUploadSize,
  importFiles,
  ensureLaunchAcceptsUploads,
  archiveProcessingContract,
  archiveOversizedDiagnostic,
  archiveEntryDiagnostics,
  redactArchiveName
} from "./uploadCore.js";
import {
  actorIdHeader,
  archiveStatusAccess,
  authorizeArchiveStatusRead,
  parseArchiveDiagnosticPagination,
  parseArchiveStatusPagination,
  paginate
} from "./uploadArchiveAuth.js";
import {
  getArchiveJobs,
  serializeArchiveUploadStatus,
  archiveJobDiagnostics,
  archiveStatusSummary
} from "./uploadArchiveStatus.js";
import { serializeUploadJob } from "./uploadSerialization.js";
import {
  maxArchiveDiagnosticLimit,
  maxArchiveDiagnostics,
  maxArchiveManifestEntries,
  maxArchiveStatusLimit,
  uploadWriteRoles,
  type ArchiveDiagnosticsQuery,
  type ArchiveManifestUploadRequest,
  type ArchiveStatusQuery,
  type ChunkEncoding
} from "./uploadTypes.js";

export async function registerUploadArchiveRoutes(app: FastifyInstance, store: AppStore) {
  app.post<{
    Params: { launchId: string };
    Body: { files: Array<{ path: string; content: string; contentEncoding?: ChunkEncoding }> };
  }>(
    "/api/v1/launches/:launchId/results/json",
    {
      schema: {
        tags: ["uploads"],
        params: {
          type: "object",
          required: ["launchId"],
          properties: { launchId: { type: "string" } }
        },
        body: {
          type: "object",
          required: ["files"],
          properties: {
            files: {
              type: "array",
              items: {
                type: "object",
                required: ["path", "content"],
                properties: {
                  path: { type: "string" },
                  content: { type: "string" },
                  contentEncoding: { type: "string", enum: ["utf8", "base64"] }
                }
              }
            }
          }
        }
      }
    },
    async (request, reply) => {
      const launch = store.launches.get(request.params.launchId) as Launch | undefined;
      if (!launch) {
        return reply.code(404).send({ message: "Launch not found" });
      }
      const project = store.projects.get(launch.projectId);
      if (project === undefined) {
        return reply.code(404).send({ message: "Project not found" });
      }
      const authDenial = authorizeProjectMutation(
        request,
        project,
        "uploads:write",
        uploadWriteRoles,
        "Actor role is not allowed to upload launch results"
      );
      if (authDenial !== undefined) {
        return reply.code(403).send(authDenial);
      }
      const uploadStateError = ensureLaunchAcceptsUploads(launch);
      if (uploadStateError !== undefined) {
        return reply.code(409).send(uploadStateError);
      }

      const backpressure = validateJsonBatchUploadSize(request.body.files);
      if (backpressure !== undefined) {
        return reply.code(413).send(backpressure);
      }

      const result = await importFiles(store, launch.id, decodeJsonUploadFiles(request.body.files));
      return reply.code(result.job.errors.length > 0 ? 207 : 200).send(result);
    }
  );

  app.post<{
    Params: { launchId: string };
    Body: ArchiveManifestUploadRequest;
  }>(
    "/api/v1/launches/:launchId/uploads/archive",
    {
      schema: {
        tags: ["uploads"],
        params: {
          type: "object",
          required: ["launchId"],
          properties: { launchId: { type: "string" } }
        },
        body: {
          type: "object",
          required: ["entries"],
          additionalProperties: false,
          properties: {
            archiveName: { type: "string" },
            advertisedCompressedBytes: { type: "integer", minimum: 0 },
            entries: {
              type: "array",
              maxItems: maxArchiveManifestEntries,
              items: {
                anyOf: [
                  { type: "string" },
                  {
                    type: "object",
                    additionalProperties: true,
                    properties: {
                      path: { type: "string" },
                      name: { type: "string" },
                      fileName: { type: "string" },
                      size: { type: "integer", minimum: 0 },
                      uncompressedSize: { type: "integer", minimum: 0 },
                      compressedSize: { type: "integer", minimum: 0 },
                      compressedSizeBytes: { type: "integer", minimum: 0 },
                      directory: { type: "boolean" },
                      isDirectory: { type: "boolean" }
                    }
                  }
                ]
              }
            }
          }
        },
        response: {
          202: {
            type: "object",
            additionalProperties: true
          },
          400: {
            type: "object",
            additionalProperties: true
          }
        }
      }
    },
    async (request, reply) => {
      const launch = store.launches.get(request.params.launchId) as Launch | undefined;
      if (!launch) {
        return reply.code(404).send({ message: "Launch not found" });
      }
      const project = store.projects.get(launch.projectId);
      if (project === undefined) {
        return reply.code(404).send({ message: "Project not found" });
      }
      const authDenial = authorizeProjectMutation(
        request,
        project,
        "uploads:write",
        uploadWriteRoles,
        "Actor role is not allowed to upload launch results"
      );
      if (authDenial !== undefined) {
        return reply.code(403).send(authDenial);
      }
      const uploadStateError = ensureLaunchAcceptsUploads(launch);
      if (uploadStateError !== undefined) {
        return reply.code(409).send(uploadStateError);
      }

      const policy = defaultArtifactPolicy();
      const processing = archiveProcessingContract(policy);
      if (request.body.entries.length > maxArchiveManifestEntries) {
        return reply.code(400).send({
          message: `Archive manifest exceeds max entry count of ${maxArchiveManifestEntries}`,
          launch: summarizeStoredLaunch(launch),
          processing,
          diagnostics: [
            {
              scope: "archive",
              severity: "error",
              code: "archive_manifest.too_many_entries",
              message: `Archive manifest exceeds max entry count of ${maxArchiveManifestEntries}`
            }
          ]
        });
      }

      const parsed = normalizeAllureArchiveManifest(request.body.entries);
      if (!parsed.ok) {
        return reply.code(400).send({
          message: "Archive manifest metadata is invalid",
          launch: summarizeStoredLaunch(launch),
          processing,
          diagnostics: parsed.errors.slice(0, maxArchiveDiagnostics).map((error) => ({
            scope: "archive",
            severity: "error",
            code: "archive_manifest.invalid",
            message: error
          }))
        });
      }

      const unsafeDiagnostics = parsed.warnings
        .filter((warning) => warning.includes("unsafe") || warning.includes("malformed"))
        .map((warning) => ({
          scope: "entry" as const,
          severity: "error" as const,
          code: "archive_entry.unsafe_path",
          message: warning
        }));
      const oversizedDiagnostic = archiveOversizedDiagnostic(
        parsed.value.totalUncompressedBytes,
        request.body.advertisedCompressedBytes,
        policy.maxUploadSessionBytes
      );
      const diagnostics = [
        ...unsafeDiagnostics,
        ...(oversizedDiagnostic === undefined ? [] : [oversizedDiagnostic]),
        ...archiveEntryDiagnostics(parsed.value.entries)
      ].slice(0, maxArchiveDiagnostics);

      if (unsafeDiagnostics.length > 0 || oversizedDiagnostic !== undefined) {
        return reply.code(400).send({
          message:
            unsafeDiagnostics.length > 0
              ? "Archive manifest contains unsafe entry metadata"
              : "Archive manifest exceeds bounded processing limits",
          launch: summarizeStoredLaunch(launch),
          manifest: {
            ...parsed.value,
            entries: parsed.value.entries.slice(0, maxArchiveDiagnostics)
          },
          processing,
          diagnostics
        });
      }

      const now = new Date().toISOString();
      const archiveName = redactArchiveName(request.body.archiveName);
      const job: UploadJob = {
        id: randomUUID(),
        launchId: launch.id,
        status: "queued",
        receivedFiles: parsed.value.supportedFiles,
        importedResults: 0,
        duplicateResults: 0,
        storedArtifacts: 0,
        errors: [],
        createdAt: now,
        updatedAt: now,
        archive: {
          ...(archiveName !== undefined ? { name: archiveName } : {}),
          format: parsed.value.format,
          totalEntries: parsed.value.entries.length,
          supportedFiles: parsed.value.supportedFiles,
          attachmentFiles: parsed.value.attachmentFiles,
          ignoredFiles: parsed.value.ignoredFiles,
          totalUncompressedBytes: parsed.value.totalUncompressedBytes,
          totalCompressedBytes: parsed.value.totalCompressedBytes,
          workerBoundary: "archive-unpack-planned",
          storesArchivePayload: false,
          payloadsAcceptedOnThisEndpoint: false
        }
      };
      store.uploadJobs.set(job.id, job);
      if (store.driver === "postgres") {
        await store.repositories.uploadJobs.save(toPersistentUploadJob(job));
      }

      return reply.code(202).send({
        kind: "archive-upload-intake",
        accepted: true,
        launch: summarizeStoredLaunch(launch),
        job: serializeUploadJob(job),
        archive: {
          ...(archiveName !== undefined ? { name: archiveName } : {}),
          format: parsed.value.format
        },
        manifest: {
          ...parsed.value,
          entries: parsed.value.entries.slice(0, maxArchiveDiagnostics)
        },
        processing,
        diagnostics
      });
    }
  );

  app.get<{
    Params: { launchId: string };
    Querystring: ArchiveStatusQuery;
  }>(
    "/api/v1/launches/:launchId/uploads/archive/status",
    {
      schema: {
        tags: ["uploads"],
        params: {
          type: "object",
          required: ["launchId"],
          properties: { launchId: { type: "string" } }
        },
        querystring: {
          type: "object",
          properties: {
            status: {
              type: "string",
              enum: ["queued", "processing", "completed", "completed_with_errors", "failed"]
            },
            limit: { type: "integer", minimum: 1, maximum: maxArchiveStatusLimit },
            cursor: { type: "string" },
            diagnosticsLimit: {
              type: "integer",
              minimum: 1,
              maximum: maxArchiveDiagnosticLimit
            },
            diagnosticsCursor: { type: "string" }
          }
        },
        response: {
          200: {
            type: "object",
            additionalProperties: true
          }
        }
      }
    },
    async (request, reply) => {
      const launch = store.launches.get(request.params.launchId) as Launch | undefined;
      if (!launch) {
        return reply.code(404).send({ message: "Launch not found" });
      }
      const denial = authorizeArchiveStatusRead(store, request, launch.projectId);
      if (denial !== undefined) {
        return reply.code(403).send(denial);
      }

      const pagination = parseArchiveStatusPagination(request.query);
      if (typeof pagination === "string") {
        return reply.code(400).send({ message: pagination });
      }
      const diagnosticQuery: ArchiveDiagnosticsQuery = {
        ...(request.query.diagnosticsLimit !== undefined
          ? { limit: request.query.diagnosticsLimit }
          : {}),
        ...(request.query.diagnosticsCursor !== undefined
          ? { cursor: request.query.diagnosticsCursor }
          : {})
      };
      const diagnosticPagination = parseArchiveDiagnosticPagination(diagnosticQuery);
      if (typeof diagnosticPagination === "string") {
        return reply.code(400).send({ message: diagnosticPagination });
      }

      const archiveJobs = getArchiveJobs(store, launch.id).filter(
        (job) => request.query.status === undefined || job.status === request.query.status
      );
      const jobPage = paginate(archiveJobs, pagination.limit, pagination.offset);
      const diagnostics = archiveJobs.flatMap(archiveJobDiagnostics);
      const diagnosticPage = paginate(
        diagnostics,
        diagnosticPagination.limit,
        diagnosticPagination.offset
      );
      const actorId = actorIdHeader(request);

      return {
        kind: "archive-upload-status-list",
        launch: summarizeStoredLaunch(launch),
        access: archiveStatusAccess(actorId),
        processing: archiveProcessingContract(defaultArtifactPolicy()),
        page: jobPage.metadata,
        summary: archiveStatusSummary(archiveJobs),
        diagnostics: {
          page: diagnosticPage.metadata,
          items: diagnosticPage.items
        },
        items: jobPage.items.map((job) =>
          serializeArchiveUploadStatus(
            store,
            job,
            diagnosticPagination.limit,
            diagnosticPagination.offset,
            actorId
          )
        )
      };
    }
  );
}

function decodeJsonUploadFiles(
  files: Array<{ path: string; content: string; contentEncoding?: ChunkEncoding }>
) {
  return files.map((file) => ({
    path: file.path,
    content: file.contentEncoding === "base64" ? Buffer.from(file.content, "base64") : file.content
  }));
}
