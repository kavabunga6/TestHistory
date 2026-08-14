import { compareLaunchResults, type LaunchComparisonChange } from "@testhistory/domain";
import type { FastifyInstance } from "fastify";
import type { AppStore, Launch } from "../store.js";
import { authorizeProjectVisibilityRead } from "./project-auth.js";

type LaunchComparisonQuery = {
  baseLaunchId: string;
  targetLaunchId: string;
  change?: LaunchComparisonChange;
  limit?: number;
  offset?: number;
};

const maxComparisonPageSize = 500;

export async function registerLaunchComparisonRoutes(app: FastifyInstance, store: AppStore) {
  app.get<{
    Params: { projectId: string };
    Querystring: LaunchComparisonQuery;
  }>(
    "/api/v1/projects/:projectId/launches/compare",
    {
      schema: {
        tags: ["launches"],
        params: projectParams,
        querystring: comparisonQuerySchema
      }
    },
    async (request, reply) => {
      const project = store.projects.get(request.params.projectId);
      if (project === undefined) return reply.code(404).send({ message: "Project not found" });
      const denied = authorizeProjectVisibilityRead(request, project, "launches:read");
      if (denied !== undefined) return reply.code(403).send(denied);

      const base = store.launches.get(request.query.baseLaunchId) as Launch | undefined;
      const target = store.launches.get(request.query.targetLaunchId) as Launch | undefined;
      if (base === undefined || target === undefined) {
        return reply.code(404).send({ message: "Compared launch not found" });
      }
      if (base.projectId !== project.id || target.projectId !== project.id) {
        return reply
          .code(400)
          .send({ message: "Compared launches must belong to the requested project" });
      }
      if (base.id === target.id) {
        return reply.code(400).send({ message: "Compared launches must be different" });
      }

      const comparison = compareLaunchResults(base, target);
      const filteredRows =
        request.query.change === undefined
          ? comparison.rows
          : comparison.rows.filter((row) => row.change === request.query.change);
      const limit = request.query.limit ?? 100;
      const offset = request.query.offset ?? 0;
      const rows = filteredRows.slice(offset, offset + limit);
      return {
        ...comparison,
        rows,
        page: {
          limit,
          offset,
          returned: rows.length,
          total: filteredRows.length,
          hasMore: offset + rows.length < filteredRows.length
        }
      };
    }
  );
}

const projectParams = {
  type: "object",
  additionalProperties: false,
  required: ["projectId"],
  properties: { projectId: { type: "string", minLength: 1, maxLength: 200 } }
} as const;

const comparisonQuerySchema = {
  type: "object",
  additionalProperties: false,
  required: ["baseLaunchId", "targetLaunchId"],
  properties: {
    baseLaunchId: { type: "string", minLength: 1, maxLength: 200 },
    targetLaunchId: { type: "string", minLength: 1, maxLength: 200 },
    change: {
      type: "string",
      enum: ["new", "removed", "fixed", "regressed", "status-changed", "unchanged"]
    },
    limit: { type: "integer", minimum: 1, maximum: maxComparisonPageSize },
    offset: { type: "integer", minimum: 0 }
  }
} as const;
