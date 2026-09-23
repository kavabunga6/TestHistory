import { replayDefectMuteAuditEvents } from "@testhistory/domain";
import type { LaunchDashboardAggregateRequest } from "@testhistory/contracts";
import type { FastifyInstance } from "fastify";
import type { AppStore, Launch } from "../store.js";
import { findActiveDefectMuteForResult, loadProjectDefectMuteEvents } from "./defectMutations.js";
import { authorizeProjectVisibilityRead } from "./project-auth.js";
import { buildLaunchDashboardAggregate } from "./dashboardAggregateModel.js";

const statuses = ["failed", "broken", "passed", "skipped", "unknown", "muted"] as const;
const widgetKinds = ["metric", "bar", "donut", "table", "line"] as const;

export function registerDashboardAggregateRoutes(app: FastifyInstance, store: AppStore) {
  app.post<{ Params: { launchId: string }; Body: LaunchDashboardAggregateRequest }>(
    "/api/v1/launches/:launchId/dashboard/aggregate",
    {
      attachValidation: true,
      schema: {
        tags: ["dashboards", "launches"],
        params: {
          type: "object",
          required: ["launchId"],
          additionalProperties: false,
          properties: { launchId: { type: "string", minLength: 1 } }
        },
        body: {
          type: "object",
          required: ["widgets"],
          additionalProperties: false,
          properties: {
            widgets: {
              type: "array",
              maxItems: 24,
              items: {
                type: "object",
                required: ["id", "kind", "metric", "groupBy", "thql"],
                additionalProperties: false,
                properties: {
                  id: { type: "string", minLength: 1, maxLength: 120 },
                  kind: { type: "string", enum: widgetKinds },
                  metric: { type: "string", maxLength: 120 },
                  groupBy: { type: "string", maxLength: 120 },
                  thql: { type: "string", minLength: 1, maxLength: 2_000 },
                  entity: { type: "string", maxLength: 120 }
                }
              }
            }
          }
        },
        response: {
          200: responseSchema,
          400: errorSchema,
          403: { type: "object", additionalProperties: true },
          404: { type: "object", additionalProperties: true }
        }
      }
    },
    async (request, reply) => {
      if (request.validationError) {
        return reply.code(400).send({
          code: "dashboard.aggregate.invalid",
          message: "Invalid dashboard aggregate request",
          redacted: true
        });
      }
      const launch = store.launches.get(request.params.launchId) as Launch | undefined;
      if (launch === undefined) {
        return reply.code(404).send({ message: "Launch not found" });
      }
      const project = store.projects.get(launch.projectId);
      if (project === undefined) {
        return reply.code(404).send({ message: "Project not found" });
      }
      const denied = authorizeProjectVisibilityRead(request, project, "launches:read");
      if (denied !== undefined) {
        return reply.code(403).send(denied);
      }

      const events = await loadProjectDefectMuteEvents(store, project.id);
      const activeMutes = replayDefectMuteAuditEvents(events, {
        projectId: project.id
      }).activeRecords;
      const mutedUuids = new Set(
        launch.results
          .filter((result) => findActiveDefectMuteForResult(activeMutes, result) !== undefined)
          .map((result) => result.uuid)
      );
      return buildLaunchDashboardAggregate(launch, request.body, mutedUuids);
    }
  );
}

const errorSchema = {
  type: "object",
  additionalProperties: false,
  required: ["code", "message", "redacted"],
  properties: {
    code: { type: "string" },
    message: { type: "string" },
    redacted: { type: "boolean" }
  }
} as const;

const groupSchema = {
  type: "object",
  additionalProperties: false,
  required: ["key", "label", "value", "percent"],
  properties: {
    key: { type: "string" },
    label: { type: "string" },
    value: { type: "integer" },
    percent: { type: "number" },
    status: { type: "string", enum: statuses }
  }
} as const;

const tableRowSchema = {
  type: "object",
  additionalProperties: false,
  required: ["id", "uuid", "launchId", "name", "status", "duration"],
  properties: {
    id: { type: "string" },
    uuid: { type: "string" },
    launchId: { type: "string" },
    name: { type: "string" },
    status: { type: "string", enum: statuses },
    duration: { type: "string" },
    durationMs: { type: "number" }
  }
} as const;

const responseSchema = {
  type: "object",
  additionalProperties: false,
  required: ["kind", "launchId", "projectId", "totalResults", "widgets"],
  properties: {
    kind: { type: "string", const: "launch-dashboard-aggregate" },
    launchId: { type: "string" },
    projectId: { type: "string" },
    totalResults: { type: "integer" },
    widgets: {
      type: "array",
      items: {
        oneOf: [
          {
            type: "object",
            additionalProperties: false,
            required: [
              "id",
              "status",
              "filteredCount",
              "passedCount",
              "passRate",
              "averageDurationMs",
              "averageDuration",
              "retryCount",
              "metricKind",
              "value",
              "groupCount",
              "groupsTruncated",
              "groups",
              "tableRows"
            ],
            properties: {
              id: { type: "string" },
              status: { type: "string", const: "ready" },
              filteredCount: { type: "integer" },
              passedCount: { type: "integer" },
              passRate: { type: "number" },
              averageDurationMs: { anyOf: [{ type: "number" }, { type: "null" }] },
              averageDuration: { type: "string" },
              retryCount: { type: "null" },
              metricKind: {
                type: "string",
                enum: ["count", "passRate", "averageDuration", "retryCount"]
              },
              value: { type: "string" },
              groupCount: { type: "integer" },
              groupsTruncated: { type: "boolean" },
              groups: { type: "array", maxItems: 30, items: groupSchema },
              tableRows: { type: "array", maxItems: 20, items: tableRowSchema }
            }
          },
          {
            type: "object",
            additionalProperties: false,
            required: ["id", "status", "reason"],
            properties: {
              id: { type: "string" },
              status: { type: "string", const: "unsupported" },
              reason: { type: "string" }
            }
          }
        ]
      }
    }
  }
} as const;
