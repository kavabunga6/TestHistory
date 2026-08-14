import type { FastifyInstance } from "fastify";
import { type AppStore, type Launch } from "../store.js";
import { enqueueLaunchNotifications } from "../integrationDeliveryService.js";
import {
  toPersistentLaunch,
  toPersistentProject,
  toPersistentUploadSession
} from "../storeMappers.js";

import { importFiles, ensureLaunchAcceptsUploads } from "./uploadCore.js";
import { serializeUploadJob } from "./uploadSerialization.js";
import {
  allureCtlError,
  allureCtlLaunchResponse,
  allureCtlSessionResponse,
  closeAllureCtlLaunch,
  createAllureCtlLaunch,
  createAllureCtlSession,
  ensureAllureCtlProject,
  handleAllureCtlBatchUpload,
  normalizeAllureCtlFiles,
  resolveAllureCtlProjectId,
  resolveOrCreateAllureCtlLaunch,
  updateAllureCtlSessionFromFiles
} from "./uploadAllureCtl.js";
import {
  type AllureCtlLaunchRequest,
  type AllureCtlQuery,
  type AllureCtlSessionRequest,
  type AllureCtlUploadRequest
} from "./uploadTypes.js";

export async function registerUploadAllureCtlRoutes(app: FastifyInstance, store: AppStore) {
  app.post<{ Body: AllureCtlLaunchRequest; Querystring: AllureCtlQuery }>(
    "/api/rs/launch",
    {
      schema: {
        tags: ["uploads"],
        body: { type: "object", additionalProperties: true }
      }
    },
    async (request, reply) => {
      const projectId = resolveAllureCtlProjectId(request.body.projectId, request.query.projectId);
      if (projectId === undefined) {
        return reply.code(400).send(allureCtlError("allurectl.project_id.required"));
      }

      ensureAllureCtlProject(store, projectId);
      const launch = createAllureCtlLaunch(store, projectId, request.body);
      if (store.driver === "postgres") {
        await store.transaction(async (repositories) => {
          await repositories.projects.save(toPersistentProject(store.projects.get(projectId)!));
          await repositories.launches.save(toPersistentLaunch(launch));
        });
      }
      return reply.code(201).send(allureCtlLaunchResponse(launch, request.headers.host));
    }
  );

  app.post<{ Params: { launchId: string } }>(
    "/api/rs/launch/:launchId/close",
    { schema: { tags: ["uploads"], params: { type: "object", additionalProperties: true } } },
    async (request, reply) => {
      const launch = store.launches.get(request.params.launchId) as Launch | undefined;
      if (launch === undefined) {
        return reply.code(404).send({ message: "Launch not found" });
      }

      const closeResult = closeAllureCtlLaunch(store, launch);
      if (closeResult.closed === false) {
        return reply.code(409).send({
          message: "Launch has pending uploads",
          ...allureCtlLaunchResponse(launch, request.headers.host),
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
      return allureCtlLaunchResponse(launch, request.headers.host);
    }
  );

  app.post<{ Body: AllureCtlSessionRequest; Querystring: AllureCtlQuery }>(
    "/api/rs/session",
    { schema: { tags: ["uploads"], body: { type: "object", additionalProperties: true } } },
    async (request, reply) => {
      const launch = resolveOrCreateAllureCtlLaunch(store, request.body, request.query);
      if (launch === undefined) {
        return reply.code(400).send(allureCtlError("allurectl.launch.required"));
      }

      const uploadStateError = ensureLaunchAcceptsUploads(launch);
      if (uploadStateError !== undefined) {
        return reply.code(409).send(uploadStateError);
      }

      const session = createAllureCtlSession(store, launch);
      if (store.driver === "postgres") {
        await store.transaction(async (repositories) => {
          await repositories.projects.save(
            toPersistentProject(store.projects.get(launch.projectId)!)
          );
          await repositories.launches.save(toPersistentLaunch(launch));
          await repositories.uploadSessions.save(toPersistentUploadSession(session));
        });
      }
      return reply.code(201).send(allureCtlSessionResponse(session, launch, request.headers.host));
    }
  );

  app.post<{
    Params: { sessionId: string };
    Body: AllureCtlUploadRequest;
    Querystring: AllureCtlQuery;
  }>(
    "/api/rs/session/:sessionId/file",
    { schema: { tags: ["uploads"], body: { type: "object", additionalProperties: true } } },
    async (request, reply) => {
      const session = store.uploadSessions.get(request.params.sessionId);
      if (session === undefined) {
        return reply.code(404).send({ message: "Upload session not found" });
      }
      const launch = store.launches.get(session.launchId) as Launch | undefined;
      if (launch === undefined) {
        return reply.code(404).send({ message: "Launch not found" });
      }

      const files = normalizeAllureCtlFiles(request.body, request.query);
      if (files.length === 0) {
        return reply.code(400).send(allureCtlError("allurectl.files.required"));
      }

      const uploadStateError = ensureLaunchAcceptsUploads(launch);
      if (uploadStateError !== undefined) {
        return reply.code(409).send(uploadStateError);
      }

      const result = await importFiles(store, launch.id, files);
      updateAllureCtlSessionFromFiles(session, files);
      if (store.driver === "postgres") {
        await store.repositories.uploadSessions.save(toPersistentUploadSession(session));
      }
      return reply.code(result.job.errors.length > 0 ? 207 : 200).send({
        kind: "allurectl-file-upload",
        accepted: true,
        session: allureCtlSessionResponse(session, launch, request.headers.host),
        upload: serializeUploadJob(result.job),
        imported: result.imported,
        compatibilityFiles: result.compatibilityFiles,
        artifacts: result.artifacts,
        launch: result.launch
      });
    }
  );

  app.post<{ Params: { sessionId: string } }>(
    "/api/rs/session/:sessionId/close",
    { schema: { tags: ["uploads"], params: { type: "object", additionalProperties: true } } },
    async (request, reply) => {
      const session = store.uploadSessions.get(request.params.sessionId);
      if (session === undefined) {
        return reply.code(404).send({ message: "Upload session not found" });
      }
      const launch = store.launches.get(session.launchId) as Launch | undefined;
      if (launch === undefined) {
        return reply.code(404).send({ message: "Launch not found" });
      }

      session.status = "completed";
      session.closedAt = new Date().toISOString();
      session.updatedAt = session.closedAt;
      const closeResult = closeAllureCtlLaunch(store, launch);
      if (closeResult.closed === false) {
        return reply.code(409).send({
          message: "Launch has pending uploads",
          session: allureCtlSessionResponse(session, launch, request.headers.host),
          closePipeline: launch.closePipeline
        });
      }
      if (store.driver === "postgres") {
        await store.transaction(async (repositories) => {
          await repositories.uploadSessions.save(toPersistentUploadSession(session));
          await repositories.launches.save(toPersistentLaunch(launch));
        });
      }
      await enqueueLaunchNotifications(store, launch, {
        type: "service",
        serviceId: "allurectl"
      });
      return allureCtlSessionResponse(session, launch, request.headers.host);
    }
  );

  app.get<{ Params: { sessionId: string } }>(
    "/api/rs/session/:sessionId",
    { schema: { tags: ["uploads"], params: { type: "object", additionalProperties: true } } },
    async (request, reply) => {
      const session = store.uploadSessions.get(request.params.sessionId);
      if (session === undefined) {
        return reply.code(404).send({ message: "Upload session not found" });
      }
      const launch = store.launches.get(session.launchId) as Launch | undefined;
      if (launch === undefined) {
        return reply.code(404).send({ message: "Launch not found" });
      }
      return allureCtlSessionResponse(session, launch, request.headers.host);
    }
  );

  app.post<{
    Params: { projectId: string };
    Body: AllureCtlUploadRequest;
    Querystring: AllureCtlQuery;
  }>(
    "/api/rs/import/:projectId",
    { schema: { tags: ["uploads"], body: { type: "object", additionalProperties: true } } },
    async (request, reply) => {
      return handleAllureCtlBatchUpload(
        store,
        { ...request.body, projectId: request.body.projectId ?? request.params.projectId },
        request.query,
        request.headers.host,
        reply
      );
    }
  );

  app.post<{
    Body: AllureCtlUploadRequest;
    Querystring: AllureCtlQuery;
  }>(
    "/api/allurectl/upload",
    { schema: { tags: ["uploads"], body: { type: "object", additionalProperties: true } } },
    async (request, reply) => {
      return handleAllureCtlBatchUpload(
        store,
        request.body,
        request.query,
        request.headers.host,
        reply
      );
    }
  );
}
