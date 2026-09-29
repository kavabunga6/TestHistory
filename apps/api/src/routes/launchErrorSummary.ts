import type { LaunchErrorSummaryReadModel, NormalizedTestResult } from "@testhistory/contracts";
import type { FastifyInstance } from "fastify";
import type { AppStore, Launch } from "../store.js";
import { authorizeProjectVisibilityRead } from "./project-auth.js";

const maxGroups = 50;
const maxExamplesPerGroup = 10;

type ErrorGroup = LaunchErrorSummaryReadModel["groups"][number];

export function buildLaunchErrorSummary(launch: Launch): LaunchErrorSummaryReadModel {
  const groups = new Map<string, ErrorGroup>();
  let failedResults = 0;
  let brokenResults = 0;

  for (const result of launch.results) {
    if (result.status !== "failed" && result.status !== "broken") continue;
    if (result.status === "failed") failedResults += 1;
    else brokenResults += 1;

    const name = errorCategory(result);
    const group = groups.get(name) ?? {
      name,
      failed: 0,
      broken: 0,
      resultsTruncated: false,
      examples: []
    };
    if (result.status === "failed") group.failed += 1;
    else group.broken += 1;
    if (group.examples.length < maxExamplesPerGroup) {
      group.examples.push({
        resultUuid: result.uuid,
        name: result.name,
        status: result.status,
        ...(result.durationMs !== undefined &&
        Number.isFinite(result.durationMs) &&
        result.durationMs >= 0
          ? { durationMs: result.durationMs }
          : {})
      });
    } else {
      group.resultsTruncated = true;
    }
    groups.set(name, group);
  }

  const sorted = [...groups.values()].sort(
    (left, right) =>
      right.failed + right.broken - (left.failed + left.broken) ||
      left.name.localeCompare(right.name)
  );
  return {
    kind: "launch-error-summary",
    launchId: launch.id,
    projectId: launch.projectId,
    totalResults: launch.results.length,
    failedResults,
    brokenResults,
    totalGroups: sorted.length,
    groupsTruncated: sorted.length > maxGroups,
    groups: sorted.slice(0, maxGroups)
  };
}

function errorCategory(result: NormalizedTestResult): string {
  const details = result.raw.statusDetails;
  const firstLine = (details?.message || details?.trace || "").split(/\r?\n/, 1)[0]?.trim() ?? "";
  return firstLine.split(":", 1)[0]?.trim().slice(0, 180) || "Без категории";
}

export function registerLaunchErrorSummaryRoutes(app: FastifyInstance, store: AppStore) {
  app.get<{ Params: { launchId: string } }>(
    "/api/v1/launches/:launchId/errors/summary",
    {
      schema: {
        tags: ["launches"],
        params: {
          type: "object",
          required: ["launchId"],
          additionalProperties: false,
          properties: { launchId: { type: "string", minLength: 1 } }
        },
        response: {
          200: {
            type: "object",
            additionalProperties: false,
            required: [
              "kind",
              "launchId",
              "projectId",
              "totalResults",
              "failedResults",
              "brokenResults",
              "totalGroups",
              "groupsTruncated",
              "groups"
            ],
            properties: {
              kind: { type: "string", const: "launch-error-summary" },
              launchId: { type: "string" },
              projectId: { type: "string" },
              totalResults: { type: "integer", minimum: 0 },
              failedResults: { type: "integer", minimum: 0 },
              brokenResults: { type: "integer", minimum: 0 },
              totalGroups: { type: "integer", minimum: 0 },
              groupsTruncated: { type: "boolean" },
              groups: {
                type: "array",
                maxItems: maxGroups,
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["name", "failed", "broken", "resultsTruncated", "examples"],
                  properties: {
                    name: { type: "string" },
                    failed: { type: "integer", minimum: 0 },
                    broken: { type: "integer", minimum: 0 },
                    resultsTruncated: { type: "boolean" },
                    examples: {
                      type: "array",
                      maxItems: maxExamplesPerGroup,
                      items: {
                        type: "object",
                        additionalProperties: false,
                        required: ["resultUuid", "name", "status"],
                        properties: {
                          resultUuid: { type: "string" },
                          name: { type: "string" },
                          status: { type: "string", enum: ["failed", "broken"] },
                          durationMs: { type: "number", minimum: 0 }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    async (request, reply) => {
      const launch = store.launches.get(request.params.launchId);
      if (launch === undefined) return reply.code(404).send({ message: "Launch not found" });
      const project = store.projects.get(launch.projectId);
      if (project === undefined) return reply.code(404).send({ message: "Project not found" });
      const denied = authorizeProjectVisibilityRead(request, project, "launches:read");
      if (denied !== undefined) return reply.code(403).send(denied);
      return buildLaunchErrorSummary(launch);
    }
  );
}
