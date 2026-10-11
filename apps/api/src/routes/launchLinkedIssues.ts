import type { FastifyInstance } from "fastify";
import type { AppStore, Launch } from "../store.js";
import {
  isPaginationValidationError,
  maxListLimit,
  paginate,
  paginationValidationError,
  parseListPagination,
  type ListQuery
} from "./launchHelpers.js";
import { authorizeProjectVisibilityRead } from "./project-auth.js";

type LinkedIssuesQuery = Pick<ListQuery, "limit" | "cursor" | "offset">;

type LinkedIssue = {
  id: string;
  resultUuid: string;
  resultName: string;
};

function collectLaunchLinkedIssues(launch: Launch): LinkedIssue[] {
  const byId = new Map<string, LinkedIssue>();
  for (const result of launch.results) {
    for (const id of result.labels.issue ?? []) {
      const normalizedId = id.trim();
      if (normalizedId === "" || byId.has(normalizedId)) continue;
      byId.set(normalizedId, {
        id: normalizedId,
        resultUuid: result.uuid,
        resultName: result.name
      });
    }
  }
  return [...byId.values()].sort((left, right) => left.id.localeCompare(right.id));
}

export function registerLaunchLinkedIssuesRoute(app: FastifyInstance, store: AppStore) {
  app.get<{ Params: { launchId: string }; Querystring: LinkedIssuesQuery }>(
    "/api/v1/launches/:launchId/linked-issues",
    {
      attachValidation: true,
      schema: {
        tags: ["launches"],
        params: {
          type: "object",
          required: ["launchId"],
          additionalProperties: false,
          properties: { launchId: { type: "string", minLength: 1 } }
        },
        querystring: {
          type: "object",
          additionalProperties: false,
          properties: {
            limit: { type: "integer", minimum: 1, maximum: maxListLimit },
            cursor: { type: "string" },
            offset: { type: "integer", minimum: 0 }
          }
        },
        response: {
          200: {
            type: "object",
            additionalProperties: false,
            required: ["kind", "launchId", "page", "items"],
            properties: {
              kind: { type: "string", const: "launch-linked-issues" },
              launchId: { type: "string" },
              page: {
                type: "object",
                additionalProperties: false,
                required: [
                  "limit",
                  "cursor",
                  "offset",
                  "returned",
                  "total",
                  "nextCursor",
                  "hasMore"
                ],
                properties: {
                  limit: { type: "integer", minimum: 1 },
                  cursor: { anyOf: [{ type: "string" }, { type: "null" }] },
                  offset: { type: "integer", minimum: 0 },
                  returned: { type: "integer", minimum: 0 },
                  total: { type: "integer", minimum: 0 },
                  nextCursor: { anyOf: [{ type: "string" }, { type: "null" }] },
                  hasMore: { type: "boolean" }
                }
              },
              items: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["id", "resultUuid", "resultName"],
                  properties: {
                    id: { type: "string" },
                    resultUuid: { type: "string" },
                    resultName: { type: "string" }
                  }
                }
              }
            }
          }
        }
      }
    },
    async (request, reply) => {
      if (request.validationError) {
        return reply
          .code(400)
          .send(paginationValidationError("invalid linked issue list query controls"));
      }
      const launch = store.launches.get(request.params.launchId);
      if (launch === undefined) return reply.code(404).send({ message: "Launch not found" });
      const project = store.projects.get(launch.projectId);
      if (project === undefined) return reply.code(404).send({ message: "Project not found" });
      const denial = authorizeProjectVisibilityRead(request, project, "launches:read");
      if (denial !== undefined) return reply.code(403).send(denial);

      const pagination = parseListPagination(request.query, []);
      if (isPaginationValidationError(pagination)) return reply.code(400).send(pagination);
      const page = paginate(collectLaunchLinkedIssues(launch), pagination.limit, pagination.offset);
      return {
        kind: "launch-linked-issues",
        launchId: launch.id,
        page: page.metadata,
        items: page.items
      };
    }
  );
}
