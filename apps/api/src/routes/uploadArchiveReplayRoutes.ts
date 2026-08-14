import type { FastifyInstance } from "fastify";
import { summarizeStoredLaunch, type AppStore, type Launch } from "../store.js";

import {
  actorIdHeader,
  archiveStatusAccess,
  authorizeArchiveStatusRead,
  parseArchiveDiagnosticPagination,
  paginate
} from "./uploadArchiveAuth.js";
import { serializeArchiveUploadStatus } from "./uploadArchiveStatus.js";
import {
  defaultArchiveStatusLimit,
  maxArchiveDiagnosticLimit,
  maxArchiveStatusLimit,
  type ArchiveDiagnosticsQuery
} from "./uploadTypes.js";
import {
  buildArchiveDiagnosticReplayFixtureContracts,
  buildArchiveDiagnosticReplayMaterializedFixtureRecords,
  buildArchiveDiagnosticReplayProjections,
  summarizeArchiveDiagnosticReplayFixtureContracts,
  summarizeArchiveDiagnosticReplayMaterializedFixtureRecords,
  summarizeArchiveDiagnosticReplayProjections,
  archiveDiagnosticReplayFixtureMaterializedAt,
  archiveDiagnosticReplayWorkerContract,
  hashArchiveDiagnosticReplayParts
} from "./uploadArchiveReplay.js";
import {
  authorizeArchiveDiagnosticReplayFixtureRead,
  authorizeArchiveDiagnosticReplayMaterializedFixtureRead,
  authorizeArchiveDiagnosticReplayRead,
  parseArchivePagination
} from "./uploadArchiveAuth.js";
import {
  defaultArchiveDiagnosticFixtureLimit,
  maxArchiveDiagnosticFixtureLimit,
  type ArchiveDiagnosticReplayFixtureQuery,
  type ArchiveDiagnosticReplayQuery
} from "./uploadTypes.js";

export async function registerUploadArchiveReplayRoutes(app: FastifyInstance, store: AppStore) {
  app.get<{
    Params: { launchId: string };
    Querystring: ArchiveDiagnosticReplayQuery;
  }>(
    "/api/v1/launches/:launchId/archive/diagnostics/replay",
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
            archiveRef: { type: "string" },
            limit: { type: "integer", minimum: 1, maximum: maxArchiveStatusLimit },
            cursor: { type: "string" }
          }
        },
        response: {
          200: {
            type: "object",
            additionalProperties: true
          },
          403: {
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
      const denial = authorizeArchiveDiagnosticReplayRead(store, request, launch.projectId);
      if (denial !== undefined) {
        return reply.code(403).send(denial);
      }

      const pagination = parseArchivePagination(
        request.query.limit,
        request.query.cursor,
        defaultArchiveStatusLimit,
        maxArchiveStatusLimit,
        "archive diagnostic replay"
      );
      if (typeof pagination === "string") {
        return reply.code(400).send({ message: pagination });
      }

      const actorId = actorIdHeader(request);
      const projections = buildArchiveDiagnosticReplayProjections(store, launch).filter(
        (projection) =>
          request.query.archiveRef === undefined ||
          projection.archiveRef === request.query.archiveRef
      );
      const page = paginate(projections, pagination.limit, pagination.offset);

      return {
        kind: "archive-diagnostic-replay-summary-list",
        launch: summarizeStoredLaunch(launch),
        access: archiveStatusAccess(actorId),
        worker: archiveDiagnosticReplayWorkerContract(),
        query: {
          projectId: launch.projectId,
          launchId: launch.id,
          ...(request.query.archiveRef !== undefined
            ? { archiveRef: request.query.archiveRef }
            : {}),
          limit: pagination.limit,
          cursor: pagination.offset > 0 ? String(pagination.offset) : null
        },
        page: page.metadata,
        summary: summarizeArchiveDiagnosticReplayProjections(projections),
        items: page.items,
        links: {
          self: `/api/v1/launches/${launch.id}/archive/diagnostics/replay`,
          launch: `/api/v1/launches/${launch.id}`,
          archiveStatus: `/api/v1/launches/${launch.id}/uploads/archive/status`
        }
      };
    }
  );

  app.get<{
    Params: { projectId: string };
    Querystring: ArchiveDiagnosticReplayFixtureQuery;
  }>(
    "/api/v1/projects/:projectId/archive/diagnostics/replay/fixtures",
    {
      schema: {
        tags: ["uploads"],
        params: {
          type: "object",
          required: ["projectId"],
          properties: { projectId: { type: "string" } }
        },
        querystring: {
          type: "object",
          properties: {
            limit: {
              type: "integer",
              minimum: 1,
              maximum: maxArchiveDiagnosticFixtureLimit
            },
            cursor: { type: "string" }
          }
        },
        response: {
          200: {
            type: "object",
            additionalProperties: true
          },
          403: {
            type: "object",
            additionalProperties: true
          }
        }
      }
    },
    async (request, reply) => {
      const project = store.projects.get(request.params.projectId);
      if (project === undefined) {
        return reply.code(404).send({ message: "Project not found" });
      }
      const denial = authorizeArchiveDiagnosticReplayFixtureRead(store, request, project.id);
      if (denial !== undefined) {
        return reply.code(403).send(denial);
      }

      const pagination = parseArchivePagination(
        request.query.limit,
        request.query.cursor,
        defaultArchiveDiagnosticFixtureLimit,
        maxArchiveDiagnosticFixtureLimit,
        "archive diagnostic replay fixture"
      );
      if (typeof pagination === "string") {
        return reply.code(400).send({ message: pagination });
      }

      const actorId = actorIdHeader(request);
      const fixtures = buildArchiveDiagnosticReplayFixtureContracts(project.id);
      const page = paginate(fixtures, pagination.limit, pagination.offset);

      return {
        kind: "archive-diagnostic-replay-fixture-list",
        project: {
          id: project.id,
          scoped: true
        },
        actor: {
          id: actorId ?? "anonymous",
          scoped: actorId !== undefined
        },
        access: archiveStatusAccess(actorId),
        query: {
          projectId: project.id,
          limit: pagination.limit,
          cursor: pagination.offset > 0 ? String(pagination.offset) : null
        },
        page: page.metadata,
        summary: summarizeArchiveDiagnosticReplayFixtureContracts(fixtures),
        items: page.items,
        links: {
          self: `/api/v1/projects/${project.id}/archive/diagnostics/replay/fixtures`
        }
      };
    }
  );

  app.get<{
    Params: { projectId: string };
    Querystring: ArchiveDiagnosticReplayFixtureQuery;
  }>(
    "/api/v1/projects/:projectId/archive/diagnostics/replay/fixtures/materialized",
    {
      schema: {
        tags: ["uploads"],
        params: {
          type: "object",
          required: ["projectId"],
          properties: { projectId: { type: "string" } }
        },
        querystring: {
          type: "object",
          properties: {
            actorId: { type: "string" },
            digest: { type: "string" },
            name: {
              type: "string",
              enum: ["corrupt", "empty", "denied", "partial", "duplicate", "retry"]
            },
            limit: {
              type: "integer",
              minimum: 1,
              maximum: maxArchiveDiagnosticFixtureLimit
            },
            cursor: { type: "string" }
          }
        },
        response: {
          200: {
            type: "object",
            additionalProperties: true
          },
          403: {
            type: "object",
            additionalProperties: true
          }
        }
      }
    },
    async (request, reply) => {
      const project = store.projects.get(request.params.projectId);
      if (project === undefined) {
        return reply.code(404).send({ message: "Project not found" });
      }

      const actorId = request.query.actorId ?? actorIdHeader(request);
      const denial = authorizeArchiveDiagnosticReplayMaterializedFixtureRead(
        store,
        request,
        project.id,
        actorId
      );
      if (denial !== undefined) {
        return reply.code(403).send(denial);
      }

      const pagination = parseArchivePagination(
        request.query.limit,
        request.query.cursor,
        defaultArchiveDiagnosticFixtureLimit,
        maxArchiveDiagnosticFixtureLimit,
        "archive diagnostic replay materialized fixture"
      );
      if (typeof pagination === "string") {
        return reply.code(400).send({ message: pagination });
      }

      const records = buildArchiveDiagnosticReplayMaterializedFixtureRecords(project.id).filter(
        (record) =>
          (request.query.name === undefined || record.name === request.query.name) &&
          (request.query.digest === undefined || record.sourceDigest === request.query.digest)
      );
      const page = paginate(records, pagination.limit, pagination.offset);
      const materializationDigest = hashArchiveDiagnosticReplayParts(
        records.map((record) => record.recordDigest)
      );

      return {
        kind: "archive-diagnostic-replay-fixture-materialized-list",
        project: {
          id: project.id,
          scoped: true
        },
        actor: {
          id: actorId ?? "anonymous",
          scoped: actorId !== undefined
        },
        access: archiveStatusAccess(actorId),
        availability: {
          status: records.length === 0 ? "empty" : "ready",
          projectScoped: true,
          actorScoped: actorId !== undefined,
          redacted: true,
          partial: false,
          unavailable: []
        },
        query: {
          projectId: project.id,
          ...(actorId !== undefined ? { actorId } : {}),
          ...(request.query.name !== undefined ? { name: request.query.name } : {}),
          ...(request.query.digest !== undefined ? { digest: request.query.digest } : {}),
          limit: pagination.limit,
          cursor: pagination.offset > 0 ? String(pagination.offset) : null
        },
        materialization: {
          adapterKind: "api-read-model-archive-diagnostic-replay-fixture-materialized-wip",
          boundary: "worker-compatible-archive-diagnostic-replay-fixture-materialized-read",
          consistency: "synthetic-fixture-contracts-idempotent",
          source: "synthetic-archive-diagnostic-replay-fixture-contracts",
          readOnly: true,
          mutation: false,
          rawArchivePayloadsIncluded: false,
          manifestEntriesIncluded: false,
          resultFilesIncluded: false,
          localPathsIncluded: false,
          storageRefsIncluded: false,
          signedUrlsIncluded: false,
          tokensIncluded: false,
          materializedAt: archiveDiagnosticReplayFixtureMaterializedAt(),
          materializedRecordCount: records.length,
          materializationDigest,
          mutationBoundary: "rest-materialized-read-only-no-archive-or-worker-mutation"
        },
        summary: summarizeArchiveDiagnosticReplayMaterializedFixtureRecords(
          project.id,
          records,
          materializationDigest
        ),
        page: page.metadata,
        items: page.items,
        links: {
          self: `/api/v1/projects/${project.id}/archive/diagnostics/replay/fixtures/materialized`,
          fixtureContracts: `/api/v1/projects/${project.id}/archive/diagnostics/replay/fixtures`
        }
      };
    }
  );

  app.get<{
    Params: { uploadId: string };
    Querystring: ArchiveDiagnosticsQuery;
  }>(
    "/api/v1/uploads/:uploadId/archive/status",
    {
      schema: {
        tags: ["uploads"],
        params: {
          type: "object",
          required: ["uploadId"],
          properties: { uploadId: { type: "string" } }
        },
        querystring: {
          type: "object",
          properties: {
            limit: { type: "integer", minimum: 1, maximum: maxArchiveDiagnosticLimit },
            cursor: { type: "string" }
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
      const job = store.uploadJobs.get(request.params.uploadId);
      if (job?.archive === undefined) {
        return reply.code(404).send({ message: "Archive upload status not found" });
      }
      const launch = store.launches.get(job.launchId) as Launch | undefined;
      if (launch === undefined) {
        return reply.code(404).send({ message: "Archive upload status not found" });
      }
      const denial = authorizeArchiveStatusRead(store, request, launch.projectId);
      if (denial !== undefined) {
        return reply.code(403).send(denial);
      }

      const pagination = parseArchiveDiagnosticPagination(request.query);
      if (typeof pagination === "string") {
        return reply.code(400).send({ message: pagination });
      }

      return serializeArchiveUploadStatus(
        store,
        job,
        pagination.limit,
        pagination.offset,
        actorIdHeader(request)
      );
    }
  );
}
