import type { FastifyInstance } from "fastify";
import { type AppStore } from "../store.js";
import { toPersistentUploadSession } from "../storeMappers.js";

import { serializeUploadSession } from "./uploadSerialization.js";
import { clearSessionChunks } from "./uploadChunked.js";
import { processUploadJob } from "./uploadCore.js";
import { type UploadJobProcessRequest } from "./uploadTypes.js";

export async function registerUploadJobProcessRoutes(app: FastifyInstance, store: AppStore) {
  app.post<{ Params: { uploadId: string }; Body?: UploadJobProcessRequest }>(
    "/api/v1/uploads/:uploadId/process",
    {
      preValidation: (request, _reply, done) => {
        (request as { body: UploadJobProcessRequest }).body ??= {};
        done();
      },
      schema: {
        tags: ["uploads"],
        params: {
          type: "object",
          required: ["uploadId"],
          properties: { uploadId: { type: "string" } }
        },
        body: {
          type: "object",
          additionalProperties: false,
          properties: {
            claimToken: { type: "string" }
          }
        },
        response: {
          200: {
            type: "object",
            additionalProperties: true
          },
          404: {
            type: "object",
            additionalProperties: true
          },
          409: {
            type: "object",
            additionalProperties: true
          }
        }
      }
    },
    async (request, reply) => {
      const job = store.uploadJobs.get(request.params.uploadId);
      if (job === undefined) {
        return reply.code(404).send({ message: "Upload job not found" });
      }

      const result = await processUploadJob(store, job, request.body?.claimToken);
      if (!result.ok) {
        return reply.code(result.statusCode).send(result.body);
      }

      return result.body;
    }
  );

  app.post<{ Params: { uploadId: string } }>(
    "/api/v1/uploads/:uploadId/abort",
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
      if (session.status === "completed") {
        return reply.code(409).send({ message: "Upload session is completed" });
      }

      session.status = "aborted";
      session.closedAt = new Date().toISOString();
      session.updatedAt = new Date().toISOString();
      await clearSessionChunks(session, "aborted", store.artifactObjects);
      if (store.driver === "postgres") {
        await store.repositories.uploadSessions.save(toPersistentUploadSession(session));
      }
      return serializeUploadSession(session);
    }
  );
}
