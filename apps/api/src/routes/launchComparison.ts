import {
  compareLaunchMatrix,
  compareLaunchResults,
  type LaunchComparisonChange,
  type LaunchMatrixFocus
} from "@testhistory/domain";
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

type LaunchMatrixQuery = {
  launchIds: string;
  focus?: LaunchMatrixFocus;
  limit?: number;
  offset?: number;
};

const maxComparisonPageSize = 500;

export async function registerLaunchComparisonRoutes(app: FastifyInstance, store: AppStore) {
  app.get<{
    Params: { projectId: string };
    Querystring: LaunchMatrixQuery;
  }>(
    "/api/v1/projects/:projectId/launches/compare/matrix",
    {
      schema: {
        tags: ["launches"],
        params: projectParams,
        querystring: matrixQuerySchema
      }
    },
    async (request, reply) => {
      const project = store.projects.get(request.params.projectId);
      if (project === undefined) return reply.code(404).send({ message: "Project not found" });
      const denied = authorizeProjectVisibilityRead(request, project, "launches:read");
      if (denied !== undefined) return reply.code(403).send(denied);

      const ids = request.query.launchIds.split(",");
      if (
        ids.length < 2 ||
        ids.length > 5 ||
        ids.some((id) => id === "") ||
        new Set(ids).size !== ids.length
      ) {
        return reply.code(400).send({ message: "Select two to five different launches" });
      }
      const launches = ids.map((id) => store.launches.get(id) as Launch | undefined);
      if (launches.some((launch) => launch === undefined)) {
        return reply.code(404).send({ message: "Compared launch not found" });
      }
      if (launches.some((launch) => launch?.projectId !== project.id)) {
        return reply
          .code(400)
          .send({ message: "Compared launches must belong to the requested project" });
      }

      const matrix = compareLaunchMatrix(launches as Launch[]);
      const focusedRows = matrix.rows.filter((row) => {
        if (request.query.focus === "problems") return row.currentProblem;
        if (request.query.focus === "changed") return row.changed;
        return true;
      });
      const limit = request.query.limit ?? 100;
      const offset = request.query.offset ?? 0;
      const rows = focusedRows.slice(offset, offset + limit);
      return {
        ...matrix,
        rows,
        page: {
          limit,
          offset,
          returned: rows.length,
          total: focusedRows.length,
          hasMore: offset + rows.length < focusedRows.length
        }
      };
    }
  );

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

const matrixQuerySchema = {
  type: "object",
  additionalProperties: false,
  required: ["launchIds"],
  properties: {
    launchIds: { type: "string", minLength: 3, maxLength: 1004 },
    focus: { type: "string", enum: ["all", "problems", "changed"] },
    limit: { type: "integer", minimum: 1, maximum: maxComparisonPageSize },
    offset: { type: "integer", minimum: 0 }
  }
} as const;
