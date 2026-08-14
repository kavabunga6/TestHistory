import { buildTestCaseSummaries } from "@testhistory/domain";
import type { FastifyInstance } from "fastify";
import type { AppStore } from "../store.js";
import { authorizeProjectMutation } from "./project-auth.js";
import { buildHistoryPoints } from "./testCaseHistory.js";
import { registerTestCaseHistoryRoutes } from "./testCaseHistoryRoutes.js";
import { registerTestCasePermissionAuditRoutes } from "./testCasePermissionAuditRoutes.js";
import {
  applyTestCasePatch,
  authorizeTestCaseReadQuery,
  compareTestCases,
  enrichTestCaseSummary,
  filterTestCaseReadLaunches,
  findScopedLaunches,
  matchesTestCaseFilters,
  maxListLimit,
  paginate,
  parseListPagination,
  testCaseWriteRoles,
  testCaseWriteScope,
  type TestCaseListQuery,
  type TestCasePatch
} from "./testCaseRouteSupport.js";

export async function registerTestCaseRoutes(app: FastifyInstance, store: AppStore) {
  app.get<{ Querystring: TestCaseListQuery }>(
    "/api/v1/test-cases",
    {
      schema: {
        tags: ["test-cases"],
        querystring: {
          type: "object",
          properties: {
            projectId: { type: "string" },
            q: { type: "string" },
            search: { type: "string" },
            status: {
              type: "string",
              enum: ["failed", "broken", "passed", "skipped", "unknown"]
            },
            workflowStatus: {
              type: "string",
              enum: ["draft", "active", "deprecated", "archived"]
            },
            tag: { type: "string" },
            sort: {
              type: "string",
              enum: ["name", "lastStatus", "passRate", "flakyScore", "lastSeenAt", "totalResults"]
            },
            order: { type: "string", enum: ["asc", "desc"] },
            limit: { type: "integer", minimum: 1, maximum: maxListLimit },
            cursor: { type: "string" },
            offset: { type: "integer", minimum: 0 }
          }
        }
      }
    },
    async (request, reply) => {
      const query = request.query;
      const access = authorizeTestCaseReadQuery(store, request, query.projectId);
      if (access?.statusCode !== undefined) {
        return reply.code(access.statusCode).send(access.body);
      }

      const pagination = parseListPagination(query);
      if (typeof pagination === "string") {
        return reply.code(400).send({ message: pagination });
      }

      const scopedLaunches = filterTestCaseReadLaunches(
        store,
        request,
        findScopedLaunches(store, query.projectId)
      );
      const items = buildTestCaseSummaries(scopedLaunches)
        .map((summary) => enrichTestCaseSummary(store, summary))
        .filter((summary) => matchesTestCaseFilters(summary, query))
        .sort(compareTestCases(query.sort, query.order));

      const page = paginate(items, pagination.limit, pagination.offset);
      return {
        kind: "test-case-list",
        ...(query.projectId !== undefined ? { projectId: query.projectId } : {}),
        page: page.metadata,
        items: page.items
      };
    }
  );

  app.get<{ Params: { testCaseId: string }; Querystring: { projectId?: string } }>(
    "/api/v1/test-cases/:testCaseId",
    {
      schema: {
        tags: ["test-cases"],
        params: {
          type: "object",
          required: ["testCaseId"],
          properties: { testCaseId: { type: "string" } }
        },
        querystring: {
          type: "object",
          properties: {
            projectId: { type: "string" }
          }
        }
      }
    },
    async (request, reply) => {
      const record = store.testCases.get(request.params.testCaseId);
      const access = authorizeTestCaseReadQuery(
        store,
        request,
        request.query.projectId ?? record?.projectId
      );
      if (access?.statusCode !== undefined) {
        return reply.code(access.statusCode).send(access.body);
      }

      const scopedLaunches = filterTestCaseReadLaunches(
        store,
        request,
        findScopedLaunches(store, request.query.projectId)
      );
      const summary = buildTestCaseSummaries(scopedLaunches).find(
        (testCase) => testCase.id === request.params.testCaseId
      );
      if (
        !summary &&
        (!record ||
          (request.query.projectId !== undefined && record.projectId !== request.query.projectId))
      ) {
        return reply.code(404).send({ message: "Test case not found" });
      }

      return {
        ...(summary ? enrichTestCaseSummary(store, summary) : record),
        history: buildHistoryPoints(scopedLaunches, request.params.testCaseId)
      };
    }
  );

  app.patch<{ Params: { testCaseId: string }; Body: TestCasePatch }>(
    "/api/v1/test-cases/:testCaseId",
    {
      schema: {
        tags: ["test-cases"],
        params: {
          type: "object",
          required: ["testCaseId"],
          properties: { testCaseId: { type: "string" } }
        },
        body: {
          type: "object",
          properties: {
            allureId: { type: "string" },
            workflowStatus: { type: "string", enum: ["draft", "active", "deprecated", "archived"] },
            tags: { type: "array", items: { type: "string" } },
            layer: { type: "string" },
            description: { type: "string" },
            customFields: { type: "object", additionalProperties: { type: "string" } },
            members: { type: "array", items: { type: "string" } },
            links: {
              type: "array",
              items: {
                type: "object",
                required: ["url"],
                properties: {
                  name: { type: "string" },
                  url: { type: "string" },
                  type: { type: "string" }
                }
              }
            },
            issues: { type: "array", items: { type: "string" } },
            testKeys: { type: "array", items: { type: "string" } },
            relations: { type: "array", items: { type: "string" } },
            scenario: { type: "string" },
            expectedResult: { type: "string" }
          }
        }
      }
    },
    async (request, reply) => {
      const record = store.testCases.get(request.params.testCaseId);
      if (!record) {
        return reply.code(404).send({ message: "Test case not found" });
      }
      const project = store.projects.get(record.projectId);
      if (project === undefined) {
        return reply.code(404).send({ message: "Project not found" });
      }
      const authDenial = authorizeProjectMutation(
        request,
        project,
        testCaseWriteScope,
        testCaseWriteRoles,
        "Actor role is not allowed to mutate test cases"
      );
      if (authDenial !== undefined) {
        return reply.code(403).send(authDenial);
      }

      applyTestCasePatch(record, request.body);
      record.updatedAt = new Date().toISOString();
      return record;
    }
  );

  registerTestCaseHistoryRoutes(app, store);
  registerTestCasePermissionAuditRoutes(app, store);
}
