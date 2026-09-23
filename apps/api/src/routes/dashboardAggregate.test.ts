import type {
  LaunchDashboardAggregateReadModel,
  LaunchDashboardAggregateRequest,
  NormalizedTestResult
} from "@testhistory/contracts";
import type { FastifyInstance } from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import { createApiApp } from "../app.js";
import { createProject, createProjectLaunch } from "../appTestHelpers.js";
import { createAppStore } from "../store.js";
import { buildLaunchDashboardAggregate } from "./dashboardAggregateModel.js";

let app: FastifyInstance | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

const widgets: LaunchDashboardAggregateRequest["widgets"] = [
  {
    id: "pass",
    kind: "metric",
    metric: "Успешность",
    groupBy: "status",
    thql: "from results where muted = false measure passRate()"
  },
  {
    id: "status",
    kind: "bar",
    metric: "Количество",
    groupBy: "status",
    thql: "from results where muted = false group by status measure count()"
  },
  {
    id: "slow",
    kind: "table",
    metric: "Длительность",
    groupBy: "suite",
    thql: "from results where muted = false order by duration desc limit 5"
  }
];

describe("launch dashboard aggregation", () => {
  it("counts the entire launch and returns bounded rows without private result data", async () => {
    const store = createAppStore();
    app = await createApiApp(store);
    const project = await createProject(app);
    const launch = await createProjectLaunch(app, project.id, "Large launch");
    const results = Array.from({ length: 2_101 }, (_, index) =>
      result({
        uuid: `result-${index}`,
        name: `Test ${index}`,
        status: index % 10 === 0 ? "failed" : "passed",
        durationMs: index
      })
    );
    results[2_100]!.raw.description = "private-description";
    results[2_100]!.raw.parameters = [{ name: "token", value: "private-token" }];
    store.launches.get(launch.id)!.results.push(...results);

    const response = await app.inject({
      method: "POST",
      url: `/api/v1/launches/${launch.id}/dashboard/aggregate`,
      payload: { widgets }
    });
    expect(response.statusCode).toBe(200);
    const read = response.json<LaunchDashboardAggregateReadModel>();
    expect(read.totalResults).toBe(2_101);
    expect(read.projectId).toBe(project.id);
    expect(read.widgets[0]).toEqual(
      expect.objectContaining({
        id: "pass",
        status: "ready",
        filteredCount: 2_101,
        passedCount: 1_890
      })
    );
    expect(read.widgets[1]).toEqual(
      expect.objectContaining({
        id: "status",
        status: "ready",
        groupCount: 2,
        groupsTruncated: false,
        groups: [
          expect.objectContaining({ key: "failed", value: 211 }),
          expect.objectContaining({ key: "passed", value: 1_890 })
        ]
      })
    );
    expect(read.widgets[2]).toEqual(
      expect.objectContaining({
        id: "slow",
        status: "ready",
        filteredCount: 2_101
      })
    );
    if (read.widgets[2]?.status === "ready") {
      expect(read.widgets[2].tableRows).toHaveLength(5);
      expect(read.widgets[2].tableRows[0]).toEqual(
        expect.objectContaining({
          uuid: "result-2100",
          launchId: launch.id
        })
      );
    }
    expect(response.body).not.toContain("private-description");
    expect(response.body).not.toContain("private-token");

    const openapi = app.swagger();
    expect(openapi.paths?.["/api/v1/launches/{launchId}/dashboard/aggregate"]?.post).toBeDefined();
  });

  it("marks unsupported queries and enforces request bounds and project read access", async () => {
    const store = createAppStore();
    app = await createApiApp(store);
    const project = await createProject(app);
    const launch = await createProjectLaunch(app, project.id, "Launch");
    store.launches.get(launch.id)!.results.push(result({ uuid: "safe", name: "Safe" }));
    const response = await app.inject({
      method: "POST",
      url: `/api/v1/launches/${launch.id}/dashboard/aggregate`,
      payload: {
        widgets: [
          { ...widgets[0], id: "line", kind: "line" },
          { ...widgets[0], id: "retry", metric: "Количество ретраев" },
          {
            ...widgets[0],
            id: "unknown",
            thql: "from results where owner = Team OR status = failed"
          },
          { ...widgets[0], id: "garbage", thql: "from results surprise" },
          { ...widgets[0], id: "empty-where", thql: "from results where" }
        ]
      }
    });
    expect(response.statusCode).toBe(200);
    expect(response.json<LaunchDashboardAggregateReadModel>().widgets).toEqual([
      expect.objectContaining({ id: "line", status: "unsupported" }),
      expect.objectContaining({ id: "retry", status: "unsupported" }),
      expect.objectContaining({ id: "unknown", status: "unsupported" }),
      expect.objectContaining({ id: "garbage", status: "unsupported" }),
      expect.objectContaining({ id: "empty-where", status: "unsupported" })
    ]);

    const oversized = await app.inject({
      method: "POST",
      url: `/api/v1/launches/${launch.id}/dashboard/aggregate`,
      payload: {
        widgets: Array.from({ length: 25 }, (_, index) => ({ ...widgets[0], id: String(index) }))
      }
    });
    expect(oversized.statusCode).toBe(400);

    const denied = await app.inject({
      method: "POST",
      url: `/api/v1/launches/${launch.id}/dashboard/aggregate`,
      headers: { authorization: "Bearer invalid-project-api-token" },
      payload: { widgets }
    });
    expect(denied.statusCode).toBe(403);
    expect(denied.body).not.toContain("Safe");
  });

  it("keeps muted results out by default and reports truncated groups", () => {
    const launch = {
      id: "launch-1",
      projectId: "project-1",
      results: [
        result({ uuid: "muted", name: "Muted", status: "failed" }),
        ...Array.from({ length: 35 }, (_, index) =>
          result({
            uuid: `tag-${index}`,
            name: `Tag ${index}`,
            labels: { tag: [`tag-${index}`] }
          })
        )
      ]
    } as Parameters<typeof buildLaunchDashboardAggregate>[0];
    const aggregate = buildLaunchDashboardAggregate(
      launch,
      {
        widgets: [
          {
            id: "tags",
            kind: "donut",
            metric: "Количество",
            groupBy: "tag",
            thql: "from results group by tag measure count()"
          },
          {
            id: "muted",
            kind: "bar",
            metric: "Количество",
            groupBy: "status",
            thql: "from results where muted = true group by status measure count()"
          }
        ]
      },
      new Set(["muted"])
    );
    expect(aggregate.widgets[0]).toEqual(
      expect.objectContaining({
        filteredCount: 35,
        groupCount: 35,
        groupsTruncated: true
      })
    );
    if (aggregate.widgets[0]?.status === "ready") {
      expect(aggregate.widgets[0].groups).toHaveLength(30);
      expect(aggregate.widgets[0].groups.at(-1)).toEqual(
        expect.objectContaining({ key: "__remaining_groups__", value: 6 })
      );
      expect(aggregate.widgets[0].groups.reduce((total, group) => total + group.value, 0)).toBe(35);
    }
    expect(aggregate.widgets[1]).toEqual(
      expect.objectContaining({
        filteredCount: 1,
        passedCount: 0,
        passRate: 0,
        groups: [expect.objectContaining({ key: "muted", value: 1, status: "muted" })]
      })
    );
  });

  it("includes zero-duration results in the average and honors the requested measure", () => {
    const launch = {
      id: "launch-metrics",
      projectId: "project-metrics",
      results: [
        result({ uuid: "instant", name: "Instant", durationMs: 0 }),
        result({ uuid: "slow", name: "Slow", durationMs: 100 })
      ]
    } as Parameters<typeof buildLaunchDashboardAggregate>[0];
    const aggregate = buildLaunchDashboardAggregate(
      launch,
      {
        widgets: [
          {
            id: "average",
            kind: "metric",
            metric: "Average duration",
            groupBy: "status",
            thql: "from results measure averageDuration()"
          },
          {
            id: "count",
            kind: "metric",
            metric: "passRate label",
            groupBy: "status",
            thql: "from results measure count()"
          }
        ]
      },
      new Set()
    );
    expect(aggregate.widgets[0]).toEqual(
      expect.objectContaining({ metricKind: "averageDuration", averageDurationMs: 50 })
    );
    expect(aggregate.widgets[1]).toEqual(
      expect.objectContaining({ metricKind: "count", value: "2" })
    );
  });
});

function result(input: {
  uuid: string;
  name: string;
  status?: NormalizedTestResult["status"];
  durationMs?: number;
  labels?: Record<string, string[]>;
}): NormalizedTestResult {
  const status = input.status ?? "passed";
  return {
    uuid: input.uuid,
    name: input.name,
    status,
    ...(input.durationMs !== undefined ? { durationMs: input.durationMs } : {}),
    labels: input.labels ?? {},
    parameters: [],
    attachments: [],
    steps: [],
    raw: { uuid: input.uuid, name: input.name, status }
  };
}
