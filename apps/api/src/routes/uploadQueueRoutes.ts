import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { type AppStore, type Launch } from "../store.js";

import {
  authorizeArchiveStatusRead,
  parseUploadJobQueuePagination,
  paginate
} from "./uploadArchiveAuth.js";
import {
  buildEnterpriseIngestionReadiness,
  buildLaunchIngestionStatus,
  jobProgress,
  queueWorkerStatus,
  serializeUploadJob,
  expireLaunchSessions,
  toRuntimeUploadJob
} from "./uploadSerialization.js";
import {
  defaultUploadJobQueueLimit,
  defaultUploadJobLeaseMs,
  maxUploadJobLeaseMs,
  maxUploadJobQueueLimit,
  type UploadJobClaimRequest,
  type UploadJobQueueQuery
} from "./uploadTypes.js";

export async function registerUploadQueueRoutes(app: FastifyInstance, store: AppStore) {
  app.get(
    "/api/v1/ingestion/readiness",
    {
      schema: {
        tags: ["uploads"],
        response: {
          200: {
            type: "object",
            additionalProperties: true
          }
        }
      }
    },
    async () => buildEnterpriseIngestionReadiness(store)
  );

  app.get<{ Params: { launchId: string } }>(
    "/api/v1/launches/:launchId/ingestion/status",
    {
      schema: {
        tags: ["uploads"],
        params: {
          type: "object",
          required: ["launchId"],
          properties: { launchId: { type: "string" } }
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

      expireLaunchSessions(store, launch.id);
      return buildLaunchIngestionStatus(store, launch);
    }
  );

  app.get<{ Querystring: UploadJobQueueQuery }>(
    "/api/v1/uploads/jobs",
    {
      schema: {
        tags: ["uploads"],
        querystring: {
          type: "object",
          properties: {
            status: {
              type: "string",
              enum: ["queued", "processing", "completed", "completed_with_errors", "failed"]
            },
            source: { type: "string", enum: ["chunked-session"] },
            limit: { type: "integer", minimum: 1, maximum: maxUploadJobQueueLimit },
            cursor: { type: "string" }
          }
        },
        response: {
          200: {
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
      const pagination = parseUploadJobQueuePagination(request.query);
      if (typeof pagination === "string") {
        return reply.code(400).send({ message: pagination });
      }

      const jobs = Array.from(store.uploadJobs.values())
        .filter((job) => request.query.status === undefined || job.status === request.query.status)
        .filter(
          (job) => request.query.source === undefined || job.source?.mode === request.query.source
        )
        .sort((left, right) => {
          const createdCompare = left.createdAt.localeCompare(right.createdAt);
          return createdCompare === 0 ? left.id.localeCompare(right.id) : createdCompare;
        });
      const page = paginate(jobs, pagination.limit, pagination.offset);

      return {
        kind: "upload-job-queue",
        workerBoundary: "chunked-session-import",
        safeForPolling: true,
        redacted: true,
        queue: queueWorkerStatus(store),
        query: {
          status: request.query.status ?? null,
          source: request.query.source ?? null,
          limit: pagination.limit,
          cursor: pagination.offset > 0 ? String(pagination.offset) : null
        },
        page: page.metadata,
        items: page.items.map((job) => ({
          job: serializeUploadJob(job),
          source: {
            mode: job.source?.mode ?? null,
            payloadAvailable: job.source?.payloadAvailable ?? false
          },
          progress: jobProgress(job),
          links: {
            status: `/api/v1/uploads/${job.id}/status`,
            process: `/api/v1/uploads/${job.id}/process`,
            launchIngestion: `/api/v1/launches/${job.launchId}/ingestion/status`
          }
        }))
      };
    }
  );

  app.post<{ Body: UploadJobClaimRequest }>(
    "/api/v1/uploads/jobs/claim",
    {
      schema: {
        tags: ["uploads"],
        body: {
          type: "object",
          additionalProperties: false,
          properties: {
            source: { type: "string", enum: ["chunked-session"] },
            limit: { type: "integer", minimum: 1, maximum: maxUploadJobQueueLimit },
            workerId: { type: "string", minLength: 1, maxLength: 128 },
            leaseMs: { type: "integer", minimum: 1000, maximum: maxUploadJobLeaseMs }
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
      const pagination = parseUploadJobQueuePagination({
        limit: request.body?.limit ?? defaultUploadJobQueueLimit
      });
      if (typeof pagination === "string") {
        return reply.code(400).send({ message: pagination });
      }

      const leaseMsCandidate = request.body?.leaseMs ?? defaultUploadJobLeaseMs;
      if (
        !Number.isInteger(leaseMsCandidate) ||
        leaseMsCandidate < 1000 ||
        leaseMsCandidate > maxUploadJobLeaseMs
      ) {
        return reply.code(400).send({
          message: `leaseMs must be an integer between 1000 and ${maxUploadJobLeaseMs}`
        });
      }

      const source = request.body?.source ?? "chunked-session";
      const workerId = request.body?.workerId?.trim() || "anonymous-upload-worker";
      const now = new Date();
      const nowIso = now.toISOString();
      const leaseExpiresAt = new Date(now.getTime() + leaseMsCandidate).toISOString();
      const claimToken = randomUUID();
      const claimedPage = await store.repositories.uploadJobs.claimQueued({
        source,
        limit: pagination.limit,
        workerId,
        claimedAt: nowIso,
        leaseExpiresAt,
        claimToken
      });
      const claimedJobs = claimedPage.items.map(toRuntimeUploadJob);

      return {
        kind: "upload-job-claim",
        workerBoundary: "chunked-session-import",
        safeForPolling: true,
        redacted: true,
        claim: {
          claimedBy: workerId,
          claimedAt: nowIso,
          leaseMs: leaseMsCandidate,
          expiresAt: leaseExpiresAt,
          source,
          requestedLimit: pagination.limit,
          returned: claimedJobs.length
        },
        queue: queueWorkerStatus(store),
        items: claimedJobs.map((job) => ({
          job: serializeUploadJob(job),
          claim: {
            token: job.lease?.claimToken,
            claimedBy: job.lease?.claimedBy,
            claimedAt: job.lease?.claimedAt,
            expiresAt: job.lease?.expiresAt
          },
          source: {
            mode: job.source?.mode ?? null,
            payloadAvailable: job.source?.payloadAvailable ?? false
          },
          progress: jobProgress(job),
          links: {
            status: `/api/v1/uploads/${job.id}/status`,
            process: `/api/v1/uploads/${job.id}/process`,
            launchIngestion: `/api/v1/launches/${job.launchId}/ingestion/status`
          }
        }))
      };
    }
  );

  app.get<{ Params: { uploadId: string } }>(
    "/api/v1/uploads/:uploadId",
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
      const job = store.uploadJobs.get(request.params.uploadId);
      if (!job) {
        return reply.code(404).send({ message: "Upload not found" });
      }
      return job;
    }
  );
}
