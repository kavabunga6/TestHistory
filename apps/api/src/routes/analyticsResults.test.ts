import type { AnalyticsResultListReadModel, NormalizedTestResult } from "@testhistory/contracts";
import type { FastifyInstance } from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import { createApiApp } from "../app.js";
import { createAppStore } from "../store.js";
import { createProject, createProjectLaunch } from "../appTestHelpers.js";

let app: FastifyInstance | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

describe("full result analytics", () => {
  it("searches the whole project, calculates metrics before paging, and keeps project data isolated", async () => {
    const store = createAppStore();
    app = await createApiApp(store);
    const project = await createProject(app);
    const otherProject = await createProject(app);
    const launch = await createProjectLaunch(app, project.id, "Nightly");
    const secondLaunch = await createProjectLaunch(app, project.id, "Previous");
    const otherLaunch = await createProjectLaunch(app, otherProject.id, "Other project");
    const results = Array.from({ length: 120 }, (_, index) =>
      result({
        uuid: `result-${index.toString().padStart(3, "0")}`,
        historyId: `history-${index}`,
        name: index === 75 ? "Needle checkout" : `Result ${index}`,
        status: index === 75 ? "failed" : index === 101 ? "broken" : "passed",
        durationMs: index === 75 ? 7_000 : index === 101 ? 5_000 : index,
        labels: index === 75 ? { owner: ["Team Search"], tag: ["payment"], issue: ["BUG-75"] } : {}
      })
    );
    results[75]!.raw.description = "private-result-description";
    results[75]!.raw.statusDetails = { message: "private-failure-trace" };
    results[75]!.raw.parameters = [{ name: "apiToken", value: "private-token-value" }];
    store.launches.get(launch.id)!.results.push(...results);
    store.launches
      .get(secondLaunch.id)!
      .results.push(
        result({ uuid: "prior-needle", historyId: "history-75", name: "Earlier checkout" })
      );
    store.launches
      .get(otherLaunch.id)!
      .results.push(result({ uuid: "cross-project-secret", name: "Cross project private result" }));

    const filtered = await app.inject({
      method: "GET",
      url: `/api/v1/analytics/results?projectId=${project.id}&launchId=${launch.id}&q=Team%20Search&limit=1`
    });
    expect(filtered.statusCode).toBe(200);
    const filteredPage = filtered.json<AnalyticsResultListReadModel>();
    expect(filteredPage).toEqual(
      expect.objectContaining({
        kind: "analytics-result-list",
        projectId: project.id,
        launchId: launch.id,
        page: expect.objectContaining({ total: 1, returned: 1, nextCursor: null }),
        metrics: expect.objectContaining({
          total: 120,
          matched: 1,
          statusCounters: {
            failed: 1,
            broken: 0,
            passed: 0,
            skipped: 0,
            unknown: 0,
            muted: 0
          },
          averageDurationMs: 7_000,
          flakyCount: 1,
          flakyDataComplete: true,
          slowCount: 1,
          openRisks: 1
        })
      })
    );
    expect(filteredPage.items[0]).toEqual(
      expect.objectContaining({
        uuid: "result-075",
        name: "Needle checkout",
        owner: "Team Search",
        tags: ["payment"],
        issues: ["BUG-75"],
        flaky: true,
        flakyKnown: true
      })
    );
    expect(filteredPage.prioritySignals.map((item) => item.uuid)).toEqual(["result-075"]);
    expect(filteredPage.slowSignals.map((item) => item.uuid)).toEqual(["result-075"]);
    expect(filtered.body).not.toContain("private-result-description");
    expect(filtered.body).not.toContain("private-failure-trace");
    expect(filtered.body).not.toContain("private-token-value");

    for (const search of ["Needle", "payment", "BUG-75"]) {
      const response = await app.inject({
        method: "GET",
        url: `/api/v1/analytics/results?projectId=${project.id}&launchId=${launch.id}&q=${encodeURIComponent(search)}`
      });
      expect(response.json<AnalyticsResultListReadModel>().items.map((item) => item.uuid)).toEqual([
        "result-075"
      ]);
    }

    const firstOfAll = await app.inject({
      method: "GET",
      url: `/api/v1/analytics/results?projectId=${project.id}&launchId=${launch.id}&limit=1`
    });
    const firstOfAllPayload = firstOfAll.json<AnalyticsResultListReadModel>();
    expect(firstOfAllPayload.items).toHaveLength(1);
    expect(firstOfAllPayload.metrics).toEqual(
      expect.objectContaining({ total: 120, matched: 120, openRisks: 2, slowCount: 2 })
    );
    expect(firstOfAllPayload.prioritySignals.map((item) => item.uuid)).toEqual([
      "result-075",
      "result-101"
    ]);
    expect(firstOfAllPayload.slowSignals.map((item) => item.uuid)).toEqual([
      "result-075",
      "result-101"
    ]);

    const seen = new Set<string>();
    let cursor: string | null = null;
    do {
      const pageUrl: string = `/api/v1/analytics/results?projectId=${project.id}&launchId=${launch.id}&limit=25${
        cursor === null ? "" : `&cursor=${cursor}`
      }`;
      const pageResponse = await app.inject({
        method: "GET",
        url: pageUrl
      });
      expect(pageResponse.statusCode).toBe(200);
      const page: AnalyticsResultListReadModel = pageResponse.json();
      expect(page.metrics.total).toBe(120);
      expect(page.metrics.matched).toBe(120);
      for (const item of page.items) {
        expect(item.projectId).toBe(project.id);
        expect(seen.has(item.uuid)).toBe(false);
        seen.add(item.uuid);
      }
      cursor = page.page.nextCursor;
    } while (cursor !== null);
    expect(seen.size).toBe(120);
    expect(seen.has("result-075")).toBe(true);

    const crossProject = await app.inject({
      method: "GET",
      url: `/api/v1/analytics/results?projectId=${project.id}&launchId=${otherLaunch.id}`
    });
    expect(crossProject.statusCode).toBe(404);
    expect(crossProject.body).not.toContain("Cross project private result");

    await app.ready();
    const openapi = app.swagger() as {
      paths: Record<string, { get?: { parameters?: unknown[] } }>;
    };
    expect(openapi.paths["/api/v1/analytics/results"]?.get?.parameters).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "projectId" })])
    );
  });

  it("counts quarantined results separately and rejects invalid or unauthorized queries", async () => {
    const store = createAppStore();
    app = await createApiApp(store);
    const project = await createProject(app);
    const launch = await createProjectLaunch(app, project.id, "Nightly");
    store.launches
      .get(launch.id)!
      .results.push(
        result({ uuid: "unstable", name: "Unstable", status: "failed", durationMs: 2_500 }),
        result({ uuid: "unnamed-identity", name: "No stable identity" })
      );
    const quarantine = await app.inject({
      method: "POST",
      url: `/api/v1/launches/${launch.id}/results/unstable/quarantine`,
      payload: { reason: "Known failure" }
    });
    expect(quarantine.statusCode).toBe(201);

    const resultResponse = await app.inject({
      method: "GET",
      url: `/api/v1/analytics/results?projectId=${project.id}&status=muted`
    });
    expect(resultResponse.statusCode).toBe(200);
    const payload = resultResponse.json<AnalyticsResultListReadModel>();
    expect(payload.metrics).toEqual(
      expect.objectContaining({
        total: 2,
        matched: 1,
        statusCounters: expect.objectContaining({ muted: 1, failed: 0 }),
        openRisks: 0
      })
    );
    expect(payload.items[0]).toEqual(
      expect.objectContaining({ uuid: "unstable", status: "failed", muted: true })
    );
    expect(payload.prioritySignals).toEqual([]);

    const all = await app.inject({
      method: "GET",
      url: `/api/v1/analytics/results?projectId=${project.id}`
    });
    expect(all.json<AnalyticsResultListReadModel>().metrics.flakyDataComplete).toBe(false);

    for (const invalid of ["limit=101", "cursor=-1", "status=invalid", `q=${"x".repeat(201)}`]) {
      const response = await app.inject({
        method: "GET",
        url: `/api/v1/analytics/results?projectId=${project.id}&${invalid}`
      });
      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({
        code: "analytics.results.invalid",
        message: "Invalid analytics results query",
        redacted: true
      });
    }
    const denied = await app.inject({
      method: "GET",
      url: `/api/v1/analytics/results?projectId=${project.id}`,
      headers: { authorization: "Bearer invalid-project-api-token" }
    });
    expect(denied.statusCode).toBe(403);
    expect(denied.body).not.toContain("Unstable");
  });
});

function result(input: {
  uuid: string;
  name: string;
  historyId?: string;
  status?: NormalizedTestResult["status"];
  durationMs?: number;
  labels?: Record<string, string[]>;
}): NormalizedTestResult {
  const status = input.status ?? "passed";
  return {
    uuid: input.uuid,
    ...(input.historyId !== undefined ? { historyId: input.historyId } : {}),
    name: input.name,
    status,
    ...(input.durationMs !== undefined ? { durationMs: input.durationMs } : {}),
    labels: input.labels ?? {},
    parameters: [],
    attachments: [],
    steps: [],
    raw: {
      uuid: input.uuid,
      name: input.name,
      status,
      ...(input.historyId !== undefined ? { historyId: input.historyId } : {})
    }
  };
}
