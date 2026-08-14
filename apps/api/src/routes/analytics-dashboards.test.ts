import type { FastifyInstance } from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import { createApiApp } from "../app.js";

let app: FastifyInstance | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

describe("query, analytics, and dashboard API slice", () => {
  it("validates and previews read-only launch queries", async () => {
    app = await createApiApp();
    const project = await createProject(app);
    const launch = await createLaunch(app, project.id);

    const validateResponse = await app.inject({
      method: "POST",
      url: "/api/v1/query/validate",
      payload: { query: { entity: "launches", projectId: project.id } }
    });
    const previewResponse = await app.inject({
      method: "POST",
      url: "/api/v1/query/preview",
      payload: { query: { entity: "launches", projectId: project.id }, limit: 10 }
    });
    const invalidResponse = await app.inject({
      method: "POST",
      url: "/api/v1/query/validate",
      payload: { query: { entity: "unknown" } }
    });

    expect(validateResponse.statusCode).toBe(200);
    expect(validateResponse.json()).toEqual(
      expect.objectContaining({
        kind: "query-validation",
        valid: true
      })
    );
    expect(previewResponse.statusCode).toBe(200);
    expect(previewResponse.json()).toEqual(
      expect.objectContaining({
        kind: "query-preview",
        rows: [expect.objectContaining({ id: launch.id, projectId: project.id })]
      })
    );
    expect(invalidResponse.statusCode).toBe(200);
    expect(invalidResponse.json()).toEqual(
      expect.objectContaining({
        valid: false,
        errors: [expect.objectContaining({ code: "query.entity.unsupported" })]
      })
    );
  });

  it("runs minimal analytics over the in-memory result read model", async () => {
    app = await createApiApp();
    const project = await createProject(app);
    const launch = await createLaunch(app, project.id);

    const uploadResponse = await app.inject({
      method: "POST",
      url: `/api/v1/launches/${launch.id}/results/json`,
      payload: {
        files: [
          {
            path: "analytics-result.json",
            content: JSON.stringify({
              uuid: "analytics-result",
              name: "analytics result",
              status: "passed",
              start: 1_000,
              stop: 1_300
            })
          }
        ]
      }
    });
    const analyticsResponse = await app.inject({
      method: "POST",
      url: "/api/v1/analytics/run",
      payload: {
        query: {
          entity: "results",
          launchId: launch.id,
          groupBy: ["status"]
        }
      }
    });

    expect(uploadResponse.statusCode).toBe(200);
    expect(analyticsResponse.statusCode).toBe(200);
    expect(analyticsResponse.json()).toEqual(
      expect.objectContaining({
        kind: "analytics-run",
        result: expect.objectContaining({
          rowCount: 1,
          metrics: expect.objectContaining({
            count: 1,
            statusCounters: expect.objectContaining({ passed: 1 }),
            passRate: 1
          }),
          groups: [
            expect.objectContaining({
              key: { status: "passed" },
              count: 1,
              averageDurationMs: 300,
              p95DurationMs: 300
            })
          ],
          series: [
            expect.objectContaining({
              id: launch.id,
              metrics: expect.objectContaining({ count: 1, passRate: 1, averageDurationMs: 300 })
            })
          ]
        })
      })
    );
  });

  it.each([
    { entity: "launches", thql: 'name ~= "night" and status in ["open"]' },
    { entity: "launches", thql: "resultCount >= 0" }
  ])("validates and previews THQL %s queries", async ({ entity, thql }) => {
    app = await createApiApp();
    const project = await createProject(app);
    const launch = await createLaunch(app, project.id);

    const validateResponse = await app.inject({
      method: "POST",
      url: "/api/v1/query/validate",
      payload: { query: { entity, projectId: project.id, thql } }
    });
    const previewResponse = await app.inject({
      method: "POST",
      url: "/api/v1/query/preview",
      payload: { query: { entity, projectId: project.id, thql } }
    });

    expect(validateResponse.statusCode).toBe(200);
    expect(validateResponse.json()).toEqual(expect.objectContaining({ valid: true }));
    expect(previewResponse.statusCode).toBe(200);
    expect(previewResponse.json()).toEqual(
      expect.objectContaining({
        rows: [expect.objectContaining({ id: launch.id, projectId: project.id })],
        valid: true
      })
    );
  });

  it.each([
    {
      code: "query.thql.syntax",
      thql: "status in [",
      title: "syntax errors"
    },
    {
      code: "query.thql.field.unsupported",
      thql: 'secret = "internal"',
      title: "unsupported fields"
    }
  ])("reports THQL $title", async ({ code, thql }) => {
    app = await createApiApp();
    const project = await createProject(app);

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/query/validate",
      payload: { query: { entity: "launches", projectId: project.id, thql } }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(
      expect.objectContaining({
        errors: [expect.objectContaining({ code })],
        valid: false
      })
    );
  });

  it("manages THQL filters with personal, project, and global permissions", async () => {
    app = await createApiApp();
    const project = await createProject(app);
    const adminToken = await login(app, "admin", "admin");

    const personalResponse = await app.inject({
      method: "POST",
      url: "/api/v1/thql/filters",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        entity: "testCases",
        name: "Admin personal failures",
        query: 'status = "failed"',
        scope: "personal"
      }
    });
    const projectResponse = await app.inject({
      method: "POST",
      url: "/api/v1/thql/filters",
      headers: projectHeaders(project.key.toLowerCase(), "project-owner", "settings:write"),
      payload: {
        entity: "launches",
        name: "Project develop",
        projectId: project.key.toLowerCase(),
        query: 'branch = "develop"',
        scope: "project"
      }
    });
    const globalResponse = await app.inject({
      method: "POST",
      url: "/api/v1/thql/filters",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        entity: "defects",
        name: "Global open defects",
        query: 'status = "open"',
        scope: "global"
      }
    });
    const deniedGlobalResponse = await app.inject({
      method: "POST",
      url: "/api/v1/thql/filters",
      payload: {
        entity: "defects",
        name: "Unsafe global",
        query: 'status = "open"',
        scope: "global"
      }
    });

    expect(personalResponse.statusCode).toBe(201);
    expect(projectResponse.statusCode).toBe(201);
    expect(globalResponse.statusCode).toBe(201);
    expect(deniedGlobalResponse.statusCode).toBe(401);

    const listResponse = await app.inject({
      method: "GET",
      url: `/api/v1/thql/filters?entity=launches&projectId=${project.key.toLowerCase()}`,
      headers: projectHeaders(project.key.toLowerCase(), "project-owner", "settings:read")
    });
    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json()).toEqual(
      expect.objectContaining({
        items: [
          expect.objectContaining({
            name: "Project develop",
            projectId: project.id,
            scope: "project"
          })
        ],
        kind: "thql-filter-list"
      })
    );

    const deleteResponse = await app.inject({
      method: "DELETE",
      url: `/api/v1/thql/filters/${projectResponse.json<{ filter: { id: string } }>().filter.id}`,
      headers: projectHeaders(project.id, "project-owner", "settings:write")
    });
    expect(deleteResponse.statusCode).toBe(200);
  });

  it("creates and updates dashboards and widgets in memory", async () => {
    app = await createApiApp();
    const project = await createProject(app);

    const dashboardResponse = await app.inject({
      method: "POST",
      url: "/api/v1/dashboards",
      payload: { projectId: project.id, name: "Release health" }
    });
    const dashboard = dashboardResponse.json<{ id: string }>();
    const widgetResponse = await app.inject({
      method: "POST",
      url: `/api/v1/dashboards/${dashboard.id}/widgets`,
      payload: { title: "Pass rate", type: "metric", query: { entity: "results" } }
    });
    const widget = widgetResponse.json<{ id: string }>();
    const patchResponse = await app.inject({
      method: "PATCH",
      url: `/api/v1/dashboards/${dashboard.id}/widgets/${widget.id}`,
      payload: { title: "Current pass rate" }
    });
    const listResponse = await app.inject({
      method: "GET",
      url: `/api/v1/dashboards?projectId=${project.id}`
    });

    expect(dashboardResponse.statusCode).toBe(201);
    expect(widgetResponse.statusCode).toBe(201);
    expect(patchResponse.statusCode).toBe(200);
    expect(patchResponse.json()).toEqual(
      expect.objectContaining({
        id: widget.id,
        title: "Current pass rate"
      })
    );
    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json()).toEqual(
      expect.objectContaining({
        kind: "dashboard-list",
        items: [
          expect.objectContaining({
            id: dashboard.id,
            widgets: [expect.objectContaining({ id: widget.id })]
          })
        ]
      })
    );
  });
});

async function createProject(
  target: FastifyInstance
): Promise<{ id: string; key: string; name: string }> {
  const response = await target.inject({
    method: "POST",
    url: "/api/v1/projects",
    payload: { key: "SHOP", name: "Shop" }
  });

  expect(response.statusCode).toBe(201);
  return response.json();
}

async function createLaunch(
  target: FastifyInstance,
  projectId: string
): Promise<{ id: string; projectId: string; name: string }> {
  const response = await target.inject({
    method: "POST",
    url: `/api/v1/projects/${projectId}/launches`,
    payload: { name: "Nightly" }
  });

  expect(response.statusCode).toBe(201);
  return response.json();
}

async function login(target: FastifyInstance, email: string, password: string): Promise<string> {
  const response = await target.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: { email, password }
  });
  expect(response.statusCode).toBe(200);
  return response.json<{ session: { token: string } }>().session.token;
}

function projectHeaders(projectId: string, actorId: string, scope: string) {
  return {
    "x-testhistory-actor-id": actorId,
    "x-testhistory-project-scope": projectId,
    "x-testhistory-scopes": scope
  };
}
