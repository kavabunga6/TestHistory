import type { NormalizedTestResult } from "@testhistory/contracts";
import type { Launch } from "@testhistory/domain";
import { afterEach, describe, expect, it } from "vitest";
import { createApiApp } from "../app.js";
import { createAppStore } from "../store.js";

describe("launch comparison route", () => {
  const apps: Awaited<ReturnType<typeof createApiApp>>[] = [];
  afterEach(async () => Promise.all(apps.splice(0).map((app) => app.close())));

  it("returns a paged, project-scoped regression comparison", async () => {
    const store = createAppStore();
    const projectId = "project-compare";
    store.projects.set(projectId, {
      id: projectId,
      key: "compare",
      name: "Compare",
      createdAt: "2026-08-01T00:00:00.000Z"
    });
    store.launches.set("base", launch(projectId, "base", [result("login", "passed", 100)]));
    store.launches.set("target", launch(projectId, "target", [result("login", "failed", 250)]));
    const app = await createApiApp(store);
    apps.push(app);

    const response = await app.inject({
      method: "GET",
      url: `/api/v1/projects/${projectId}/launches/compare?baseLaunchId=base&targetLaunchId=target&change=regressed&limit=10`
    });

    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toMatchObject({
      kind: "launch-comparison",
      projectId,
      summary: { regressed: 1, durationRegressions: 1 },
      metricDeltas: { passRate: -1, averageDurationMs: 150 },
      page: { returned: 1, total: 1, hasMore: false },
      rows: [{ testCaseId: "login", change: "regressed", durationTrend: "slower" }]
    });
  });

  it("rejects cross-project and identical comparisons", async () => {
    const store = createAppStore();
    for (const projectId of ["project-a", "project-b"]) {
      store.projects.set(projectId, {
        id: projectId,
        key: projectId,
        name: projectId,
        createdAt: "2026-08-01T00:00:00.000Z"
      });
    }
    store.launches.set("a", launch("project-a", "a", []));
    store.launches.set("b", launch("project-b", "b", []));
    const app = await createApiApp(store);
    apps.push(app);

    expect(
      (
        await app.inject({
          method: "GET",
          url: "/api/v1/projects/project-a/launches/compare?baseLaunchId=a&targetLaunchId=a"
        })
      ).statusCode
    ).toBe(400);
    expect(
      (
        await app.inject({
          method: "GET",
          url: "/api/v1/projects/project-a/launches/compare?baseLaunchId=a&targetLaunchId=b"
        })
      ).statusCode
    ).toBe(400);
  });
});

function launch(projectId: string, id: string, results: NormalizedTestResult[]): Launch {
  return {
    id,
    projectId,
    name: id,
    status: "closed",
    createdAt: `2026-08-0${id === "base" ? "1" : "2"}T00:00:00.000Z`,
    results
  };
}

function result(
  testCaseId: string,
  status: NormalizedTestResult["status"],
  durationMs: number
): NormalizedTestResult {
  const uuid = `${testCaseId}-${status}`;
  return {
    uuid,
    testCaseId,
    name: testCaseId,
    status,
    durationMs,
    labels: {},
    parameters: [],
    attachments: [],
    steps: [],
    raw: { uuid, name: testCaseId, status }
  };
}
