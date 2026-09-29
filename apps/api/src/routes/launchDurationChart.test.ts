import type { NormalizedTestResult } from "@testhistory/contracts";
import type { FastifyInstance } from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import { createApiApp } from "../app.js";
import { createProject, createProjectLaunch } from "../appTestHelpers.js";
import { createAppStore } from "../store.js";

let app: FastifyInstance | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

describe("launch duration chart", () => {
  it("aggregates every result beyond the first page and excludes missing durations", async () => {
    const store = createAppStore();
    app = await createApiApp(store);
    const project = await createProject(app);
    const launch = await createProjectLaunch(app, project.id, "Chart launch");
    const results = Array.from({ length: 100 }, (_, index) =>
      result(`result-${index}`, index < 25 ? 50 : 2_000)
    );
    results.push(result("boundary-100", 100), result("missing"));
    store.launches.get(launch.id)!.results.push(...results);

    const response = await app.inject({
      method: "GET",
      url: `/api/v1/launches/${launch.id}/charts/duration`
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      kind: "launch-duration-chart",
      launchId: launch.id,
      projectId: project.id,
      totalResults: 102,
      measuredResults: 101,
      averageDurationMs: (25 * 50 + 75 * 2_000 + 100) / 101,
      buckets: [
        { label: "<100ms", count: 25 },
        { label: "100ms-1s", count: 1 },
        { label: "1s-10s", count: 75 },
        { label: "10s-1m", count: 0 },
        { label: "1m-5m", count: 0 },
        { label: "5m-30m", count: 0 },
        { label: "30m-1h", count: 0 },
        { label: "1h+", count: 0 }
      ]
    });
    const openapi = app.swagger();
    expect(openapi.paths?.["/api/v1/launches/{launchId}/charts/duration"]?.get).toBeDefined();
  });

  it("returns an empty chart for a launch without results", async () => {
    const store = createAppStore();
    app = await createApiApp(store);
    const project = await createProject(app);
    const launch = await createProjectLaunch(app, project.id, "Empty launch");

    const response = await app.inject({
      method: "GET",
      url: `/api/v1/launches/${launch.id}/charts/duration`
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(
      expect.objectContaining({
        totalResults: 0,
        measuredResults: 0,
        averageDurationMs: null
      })
    );
  });
});

function result(uuid: string, durationMs?: number): NormalizedTestResult {
  return {
    uuid,
    name: uuid,
    status: "passed",
    ...(durationMs === undefined ? {} : { durationMs }),
    labels: {},
    parameters: [],
    attachments: [],
    steps: [],
    raw: { uuid, name: uuid, status: "passed" }
  };
}
