import type { LaunchDurationChartReadModel } from "@testhistory/contracts";
import type { FastifyInstance } from "fastify";
import type { AppStore, Launch } from "../store.js";
import { authorizeProjectVisibilityRead } from "./project-auth.js";

const boundariesMs = [100, 1_000, 10_000, 60_000, 300_000, 1_800_000, 3_600_000];
const labels = ["<100ms", "100ms-1s", "1s-10s", "10s-1m", "1m-5m", "5m-30m", "30m-1h", "1h+"];

export function buildLaunchDurationChart(launch: Launch): LaunchDurationChartReadModel {
  const buckets = labels.map((label) => ({ label, count: 0 }));
  let measuredResults = 0;
  let durationTotalMs = 0;

  for (const result of launch.results) {
    const durationMs = result.durationMs;
    if (durationMs === undefined || !Number.isFinite(durationMs) || durationMs < 0) {
      continue;
    }

    measuredResults += 1;
    durationTotalMs += durationMs;
    const bucketIndex = boundariesMs.findIndex((boundary) => durationMs < boundary);
    buckets[bucketIndex < 0 ? buckets.length - 1 : bucketIndex]!.count += 1;
  }

  return {
    kind: "launch-duration-chart",
    launchId: launch.id,
    projectId: launch.projectId,
    totalResults: launch.results.length,
    measuredResults,
    averageDurationMs: measuredResults === 0 ? null : durationTotalMs / measuredResults,
    buckets
  };
}

export function registerLaunchDurationChartRoutes(app: FastifyInstance, store: AppStore) {
  app.get<{ Params: { launchId: string } }>(
    "/api/v1/launches/:launchId/charts/duration",
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
            required: [
              "kind",
              "launchId",
              "projectId",
              "totalResults",
              "measuredResults",
              "averageDurationMs",
              "buckets"
            ],
            additionalProperties: false,
            properties: {
              kind: { type: "string", const: "launch-duration-chart" },
              launchId: { type: "string" },
              projectId: { type: "string" },
              totalResults: { type: "integer", minimum: 0 },
              measuredResults: { type: "integer", minimum: 0 },
              averageDurationMs: { anyOf: [{ type: "number", minimum: 0 }, { type: "null" }] },
              buckets: {
                type: "array",
                minItems: labels.length,
                maxItems: labels.length,
                items: {
                  type: "object",
                  required: ["label", "count"],
                  additionalProperties: false,
                  properties: {
                    label: { type: "string" },
                    count: { type: "integer", minimum: 0 }
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
      if (launch === undefined) {
        return reply.code(404).send({ message: "Launch not found" });
      }
      const project = store.projects.get(launch.projectId);
      if (project === undefined) {
        return reply.code(404).send({ message: "Project not found" });
      }
      const denial = authorizeProjectVisibilityRead(request, project, "launches:read");
      if (denial !== undefined) {
        return reply.code(403).send(denial);
      }
      return buildLaunchDurationChart(launch);
    }
  );
}
