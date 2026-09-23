import { replayDefectMuteAuditEvents } from "@testhistory/domain";
import type { FastifyInstance } from "fastify";
import type { AppStore, Launch } from "../store.js";
import { loadProjectDefectMuteEvents } from "./defectMutations.js";
import { authorizeProjectVisibilityRead } from "./project-auth.js";
import { buildAnalyticsResults, type AnalyticsResultsQuery } from "./analyticsResultsModel.js";

const maxPageLimit = 100;
const defaultPageLimit = 50;
const resultStatuses = ["failed", "broken", "passed", "skipped", "unknown", "muted"] as const;

export function registerAnalyticsResultRoutes(app: FastifyInstance, store: AppStore) {
  app.get<{ Querystring: AnalyticsResultsQuery }>(
    "/api/v1/analytics/results",
    {
      attachValidation: true,
      schema: {
        tags: ["analytics"],
        querystring: {
          type: "object",
          required: ["projectId"],
          additionalProperties: false,
          properties: {
            projectId: { type: "string", minLength: 1 },
            launchId: { type: "string", minLength: 1 },
            q: { type: "string", maxLength: 200 },
            status: { type: "string", enum: resultStatuses },
            limit: { type: "integer", minimum: 1, maximum: maxPageLimit },
            cursor: { type: "string", pattern: "^(0|[1-9][0-9]*)$", maxLength: 15 }
          }
        },
        response: {
          200: analyticsResultsResponseSchema,
          400: errorResponseSchema,
          403: { type: "object", additionalProperties: true },
          404: { type: "object", additionalProperties: true }
        }
      }
    },
    async (request, reply) => {
      if (request.validationError) {
        return reply.code(400).send(invalidQuery());
      }
      const query = request.query;
      const offset = query.cursor === undefined ? 0 : Number(query.cursor);
      if (!Number.isSafeInteger(offset) || offset < 0) {
        return reply.code(400).send(invalidQuery());
      }

      const project = store.projects.get(query.projectId);
      if (project === undefined) {
        return reply.code(404).send({ message: "Project not found" });
      }
      const launch = query.launchId === undefined ? undefined : store.launches.get(query.launchId);
      if (query.launchId !== undefined && launch?.projectId !== project.id) {
        return reply.code(404).send({ message: "Launch not found" });
      }
      const denial = authorizeProjectVisibilityRead(request, project, "analytics:read");
      if (denial !== undefined) {
        return reply.code(403).send(denial);
      }

      const launches = (Array.from(store.launches.values()) as Launch[]).filter(
        (candidate) => candidate.projectId === project.id
      );
      const events = await loadProjectDefectMuteEvents(store, project.id);
      const activeMutes = replayDefectMuteAuditEvents(events, {
        projectId: project.id
      }).activeRecords;
      const mutedTestIds = new Set(activeMutes.flatMap((record) => record.affectedTestIds));
      return buildAnalyticsResults(
        launches,
        mutedTestIds,
        query,
        query.limit ?? defaultPageLimit,
        offset
      );
    }
  );
}

function invalidQuery() {
  return {
    code: "analytics.results.invalid",
    message: "Invalid analytics results query",
    redacted: true
  };
}

const allureStatusSchema = {
  type: "string",
  enum: ["failed", "broken", "passed", "skipped", "unknown"]
} as const;
const resultItemSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "uuid",
    "launchId",
    "projectId",
    "name",
    "status",
    "tags",
    "issues",
    "testKeys",
    "muted",
    "flaky",
    "flakyKnown",
    "history"
  ],
  properties: {
    uuid: { type: "string" },
    launchId: { type: "string" },
    projectId: { type: "string" },
    name: { type: "string" },
    fullName: { type: "string" },
    historyId: { type: "string" },
    testCaseId: { type: "string" },
    status: allureStatusSchema,
    durationMs: { type: "number" },
    owner: { type: "string" },
    severity: { type: "string" },
    layer: { type: "string" },
    tags: { type: "array", items: { type: "string" } },
    issues: { type: "array", items: { type: "string" } },
    testKeys: { type: "array", items: { type: "string" } },
    muted: { type: "boolean" },
    flaky: { type: "boolean" },
    flakyKnown: { type: "boolean" },
    history: { type: "array", items: allureStatusSchema }
  }
} as const;
const analyticsResultsResponseSchema = {
  type: "object",
  additionalProperties: false,
  required: ["kind", "projectId", "page", "metrics", "prioritySignals", "slowSignals", "items"],
  properties: {
    kind: { type: "string", const: "analytics-result-list" },
    projectId: { type: "string" },
    launchId: { type: "string" },
    page: {
      type: "object",
      additionalProperties: false,
      required: ["limit", "cursor", "offset", "returned", "total", "nextCursor", "hasMore"],
      properties: {
        limit: { type: "integer" },
        cursor: { anyOf: [{ type: "string" }, { type: "null" }] },
        offset: { type: "integer" },
        returned: { type: "integer" },
        total: { type: "integer" },
        nextCursor: { anyOf: [{ type: "string" }, { type: "null" }] },
        hasMore: { type: "boolean" }
      }
    },
    metrics: {
      type: "object",
      additionalProperties: false,
      required: [
        "total",
        "matched",
        "statusCounters",
        "averageDurationMs",
        "flakyCount",
        "flakyDataComplete",
        "slowCount",
        "openRisks"
      ],
      properties: {
        total: { type: "integer" },
        matched: { type: "integer" },
        statusCounters: {
          type: "object",
          additionalProperties: false,
          required: [...resultStatuses],
          properties: Object.fromEntries(
            resultStatuses.map((status) => [status, { type: "integer" }])
          )
        },
        averageDurationMs: { anyOf: [{ type: "number" }, { type: "null" }] },
        flakyCount: { type: "integer" },
        flakyDataComplete: { type: "boolean" },
        slowCount: { type: "integer" },
        openRisks: { type: "integer" }
      }
    },
    prioritySignals: { type: "array", items: resultItemSchema },
    slowSignals: { type: "array", items: resultItemSchema },
    items: { type: "array", items: resultItemSchema }
  }
} as const;
const errorResponseSchema = {
  type: "object",
  additionalProperties: false,
  required: ["code", "message", "redacted"],
  properties: {
    code: { type: "string" },
    message: { type: "string" },
    redacted: { type: "boolean" }
  }
} as const;
