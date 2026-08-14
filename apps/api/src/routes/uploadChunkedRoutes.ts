import { randomUUID } from "node:crypto";
import { defaultArtifactPolicy } from "@testhistory/artifacts";
import type { FastifyInstance } from "fastify";
import {
  type AppStore,
  type Launch,
  type UploadSession,
  type UploadSessionFile
} from "../store.js";
import { toPersistentUploadJob, toPersistentUploadSession } from "../storeMappers.js";
import { authorizeProjectMutation } from "./project-auth.js";

import { ensureLaunchAcceptsUploads } from "./uploadCore.js";
import {
  buildJobIngestionStatus,
  buildSessionIngestionStatus,
  serializeUploadJob,
  serializeUploadSession
} from "./uploadSerialization.js";
import { enqueueChunkedSessionJob } from "./uploadAllureCtl.js";
import {
  decodeChunk,
  expireSessionIfNeeded,
  getIncompleteFiles,
  normalizeChunkedUploadFiles,
  normalizeOptionalChunkedPath,
  persistUploadChunk,
  deleteUploadChunk,
  refreshUploadSessionCounters,
  resolveSessionFile,
  validateChunkedUploadFiles
} from "./uploadChunked.js";
import { sha256, sum } from "./uploadCore.js";
import {
  uploadWriteRoles,
  type ChunkEncoding,
  type ChunkedUploadFileInput
} from "./uploadTypes.js";

export async function registerUploadChunkedRoutes(app: FastifyInstance, store: AppStore) {
  app.get<{ Params: { uploadId: string } }>(
    "/api/v1/uploads/:uploadId/status",
    {
      schema: {
        tags: ["uploads"],
        params: {
          type: "object",
          required: ["uploadId"],
          properties: { uploadId: { type: "string" } }
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
      const session = store.uploadSessions.get(request.params.uploadId);
      if (session !== undefined) {
        expireSessionIfNeeded(session, store.artifactObjects);
        return buildSessionIngestionStatus(store, session);
      }

      const job = store.uploadJobs.get(request.params.uploadId);
      if (job !== undefined) {
        return buildJobIngestionStatus(store, job);
      }

      return reply.code(404).send({ message: "Upload status not found" });
    }
  );

  app.post<{
    Params: { launchId: string };
    Body: {
      path?: string;
      totalChunks?: number;
      totalBytes?: number;
      files?: ChunkedUploadFileInput[];
    };
  }>(
    "/api/v1/launches/:launchId/uploads/chunked",
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
          properties: {
            path: { type: "string" },
            totalChunks: { type: "number", minimum: 1 },
            totalBytes: { type: "number", minimum: 0 },
            files: {
              type: "array",
              items: {
                type: "object",
                required: ["path", "totalChunks"],
                properties: {
                  path: { type: "string" },
                  totalChunks: { type: "number", minimum: 1 },
                  totalBytes: { type: "number", minimum: 0 }
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

      const policy = defaultArtifactPolicy();
      const files = normalizeChunkedUploadFiles(request.body);
      const validation = validateChunkedUploadFiles(files, policy);
      if (validation !== undefined) {
        return reply.code(400).send({ message: validation });
      }

      const now = new Date().toISOString();
      const fileStates = new Map<string, UploadSessionFile>(
        files.map((file) => [
          file.path,
          {
            path: file.path,
            totalChunks: file.totalChunks,
            receivedChunks: 0,
            ...(file.totalBytes !== undefined ? { totalBytes: file.totalBytes } : {}),
            receivedBytes: 0,
            chunks: new Map()
          }
        ])
      );
      const session: UploadSession = {
        id: randomUUID(),
        launchId: launch.id,
        path: files.length === 1 ? files[0]!.path : "__parallel__",
        status: "open",
        totalChunks: sum(files.map((file) => file.totalChunks)),
        receivedChunks: 0,
        ...(files.every((file) => file.totalBytes !== undefined)
          ? { totalBytes: sum(files.map((file) => file.totalBytes ?? 0)) }
          : {}),
        receivedBytes: 0,
        files: fileStates,
        createdAt: now,
        updatedAt: now,
        expiresAt: new Date(
          Date.parse(now) + policy.uploadSessionTtlMinutes * 60 * 1000
        ).toISOString()
      };
      store.uploadSessions.set(session.id, session);
      if (store.driver === "postgres") {
        await store.repositories.uploadSessions.save(toPersistentUploadSession(session));
      }

      return reply.code(201).send(serializeUploadSession(session));
    }
  );

  app.put<{
    Params: { uploadId: string; index: string };
    Body: { content: string; path?: string; contentEncoding?: ChunkEncoding; sha256?: string };
  }>(
    "/api/v1/uploads/:uploadId/chunks/:index",
    {
      schema: {
        tags: ["uploads"],
        params: {
          type: "object",
          required: ["uploadId", "index"],
          properties: {
            uploadId: { type: "string" },
            index: { type: "string" }
          }
        },
        body: {
          type: "object",
          required: ["content"],
          properties: {
            content: { type: "string" },
            path: { type: "string" },
            contentEncoding: { type: "string", enum: ["utf8", "base64"] },
            sha256: { type: "string" }
          }
        }
      }
    },
    async (request, reply) => {
      const session = store.uploadSessions.get(request.params.uploadId);
      if (!session) {
        return reply.code(404).send({ message: "Upload session not found" });
      }
      if (session.status !== "open") {
        return reply.code(409).send({ message: `Upload session is ${session.status}` });
      }
      const launch = store.launches.get(session.launchId) as Launch | undefined;
      if (!launch) {
        return reply.code(404).send({ message: "Launch not found" });
      }
      const uploadStateError = ensureLaunchAcceptsUploads(launch);
      if (uploadStateError !== undefined) {
        return reply.code(409).send(uploadStateError);
      }
      if (expireSessionIfNeeded(session, store.artifactObjects)) {
        return reply
          .code(409)
          .send({ message: "Upload session is expired", session: serializeUploadSession(session) });
      }

      const chunkIndex = Number(request.params.index);
      const requestedPath = normalizeOptionalChunkedPath(request.body.path);
      if (requestedPath === false) {
        return reply.code(400).send({ message: "Chunk path must be a safe relative path" });
      }
      const fileState = resolveSessionFile(session, requestedPath);
      if (fileState === undefined) {
        return reply.code(400).send({ message: "Chunk path does not match this upload session" });
      }
      if (!Number.isInteger(chunkIndex) || chunkIndex < 0 || chunkIndex >= fileState.totalChunks) {
        return reply.code(400).send({ message: "Chunk index is out of range" });
      }

      const policy = defaultArtifactPolicy();
      const decoded = decodeChunk(request.body.content, request.body.contentEncoding ?? "utf8");
      if (decoded.byteLength > policy.chunkBytes) {
        return reply
          .code(413)
          .send({ message: `Chunk exceeds max chunk size of ${policy.chunkBytes} bytes` });
      }
      if (request.body.sha256 !== undefined && sha256(decoded) !== request.body.sha256) {
        return reply.code(400).send({ message: "Chunk checksum mismatch" });
      }

      const existing = fileState.chunks.get(chunkIndex);
      if (existing !== undefined) {
        if (existing.sha256 !== sha256(decoded) || existing.bytes !== decoded.byteLength) {
          return reply.code(409).send({ message: "Chunk already received with different content" });
        }
        return serializeUploadSession(session);
      }

      const nextFileBytes = fileState.receivedBytes + decoded.byteLength;
      if (fileState.totalBytes !== undefined && nextFileBytes > fileState.totalBytes) {
        return reply
          .code(413)
          .send({ message: `Received bytes exceed declared total for ${fileState.path}` });
      }
      if (session.receivedBytes + decoded.byteLength > policy.maxUploadSessionBytes) {
        return reply.code(413).send({
          message: `Upload session exceeds max size of ${policy.maxUploadSessionBytes} bytes`
        });
      }

      const chunkPayload = await persistUploadChunk(store, session, fileState, chunkIndex, decoded);
      const concurrentExisting = fileState.chunks.get(chunkIndex);
      if (concurrentExisting !== undefined) {
        await deleteUploadChunk(chunkPayload, store.artifactObjects);
        if (
          concurrentExisting.sha256 !== chunkPayload.sha256 ||
          concurrentExisting.bytes !== chunkPayload.bytes
        ) {
          return reply.code(409).send({ message: "Chunk already received with different content" });
        }
        refreshUploadSessionCounters(session);
        session.updatedAt = new Date().toISOString();
        if (store.driver === "postgres") {
          await store.repositories.uploadSessions.save(toPersistentUploadSession(session));
        }
        return serializeUploadSession(session);
      }
      fileState.chunks.set(chunkIndex, chunkPayload);
      refreshUploadSessionCounters(session);
      session.updatedAt = new Date().toISOString();
      if (store.driver === "postgres") {
        await store.repositories.uploadSessions.save(toPersistentUploadSession(session));
      }

      return serializeUploadSession(session);
    }
  );

  app.get<{ Params: { uploadId: string } }>(
    "/api/v1/uploads/:uploadId/session",
    {
      schema: {
        tags: ["uploads"],
        params: {
          type: "object",
          required: ["uploadId"],
          properties: { uploadId: { type: "string" } }
        }
      }
    },
    async (request, reply) => {
      const session = store.uploadSessions.get(request.params.uploadId);
      if (!session) {
        return reply.code(404).send({ message: "Upload session not found" });
      }
      expireSessionIfNeeded(session, store.artifactObjects);
      return serializeUploadSession(session);
    }
  );

  app.post<{ Params: { uploadId: string } }>(
    "/api/v1/uploads/:uploadId/complete",
    {
      schema: {
        tags: ["uploads"],
        params: {
          type: "object",
          required: ["uploadId"],
          properties: { uploadId: { type: "string" } }
        }
      }
    },
    async (request, reply) => {
      const session = store.uploadSessions.get(request.params.uploadId);
      if (!session) {
        return reply.code(404).send({ message: "Upload session not found" });
      }
      if (session.status !== "open") {
        return reply.code(409).send({ message: `Upload session is ${session.status}` });
      }
      if (expireSessionIfNeeded(session, store.artifactObjects)) {
        return reply
          .code(409)
          .send({ message: "Upload session is expired", session: serializeUploadSession(session) });
      }
      const incomplete = getIncompleteFiles(session);
      if (incomplete.length > 0) {
        return reply.code(409).send({
          message: "Upload session is incomplete",
          missing: incomplete,
          session: serializeUploadSession(session)
        });
      }
      const launch = store.launches.get(session.launchId) as Launch | undefined;
      if (!launch) {
        return reply.code(404).send({ message: "Launch not found" });
      }
      const uploadStateError = ensureLaunchAcceptsUploads(launch);
      if (uploadStateError !== undefined) {
        return reply.code(409).send(uploadStateError);
      }

      session.status = "completed";
      session.updatedAt = new Date().toISOString();
      session.closedAt = new Date().toISOString();
      const job = enqueueChunkedSessionJob(store, session);
      session.completedJobId = job.id;
      session.updatedAt = new Date().toISOString();
      if (store.driver === "postgres") {
        await store.transaction(async (repositories) => {
          await repositories.uploadSessions.save(toPersistentUploadSession(session));
          await repositories.uploadJobs.save(toPersistentUploadJob(job));
        });
      }

      return reply.code(202).send({
        session: serializeUploadSession(session),
        job: serializeUploadJob(job),
        accepted: true,
        processing: {
          mode: "queue",
          queue: "ingestion.parse",
          workerBoundary: "chunked-session-import",
          payloadAvailable: true,
          chunksRetainedUntilWorkerCompletion: true
        },
        links: {
          status: `/api/v1/uploads/${job.id}/status`,
          process: `/api/v1/uploads/${job.id}/process`,
          launchIngestion: `/api/v1/launches/${session.launchId}/ingestion/status`
        }
      });
    }
  );
}
