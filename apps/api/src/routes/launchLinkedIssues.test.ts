import type { NormalizedTestResult } from "@testhistory/contracts";
import type { FastifyInstance } from "fastify";
import { afterEach, expect, it } from "vitest";
import { createApiApp } from "../app.js";
import { createProject, createProjectLaunch } from "../appTestHelpers.js";
import { createAppStore } from "../store.js";

let app: FastifyInstance | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

it("lists unique linked issue IDs across the complete launch with stable pagination", async () => {
  const store = createAppStore();
  app = await createApiApp(store);
  const project = await createProject(app);
  const launch = await createProjectLaunch(app, project.id, "Linked issue launch");
  const otherLaunch = await createProjectLaunch(app, project.id, "Other launch");
  store.launches
    .get(launch.id)!
    .results.push(
      ...Array.from({ length: 30 }, (_, index) => result(`plain-${index + 1}`, [])),
      result("linked-31", ["BUG-2", "BUG-1", " BUG-1 ", " "]),
      result("linked-32", ["BUG-1", "BUG-3"])
    );
  store.launches.get(otherLaunch.id)!.results.push(result("other-result", ["BUG-OTHER"]));

  const first = await app.inject({
    method: "GET",
    url: `/api/v1/launches/${launch.id}/linked-issues?limit=2`
  });
  expect(first.statusCode).toBe(200);
  expect(first.json()).toEqual({
    kind: "launch-linked-issues",
    launchId: launch.id,
    page: {
      limit: 2,
      cursor: null,
      offset: 0,
      returned: 2,
      total: 3,
      nextCursor: "2",
      hasMore: true
    },
    items: [
      { id: "BUG-1", resultUuid: "linked-31", resultName: "Test linked-31" },
      { id: "BUG-2", resultUuid: "linked-31", resultName: "Test linked-31" }
    ]
  });

  const second = await app.inject({
    method: "GET",
    url: `/api/v1/launches/${launch.id}/linked-issues?limit=2&cursor=2`
  });
  expect(second.statusCode).toBe(200);
  expect(second.json()).toEqual({
    kind: "launch-linked-issues",
    launchId: launch.id,
    page: {
      limit: 2,
      cursor: "2",
      offset: 2,
      returned: 1,
      total: 3,
      nextCursor: null,
      hasMore: false
    },
    items: [{ id: "BUG-3", resultUuid: "linked-32", resultName: "Test linked-32" }]
  });
  const byOffset = await app.inject({
    method: "GET",
    url: `/api/v1/launches/${launch.id}/linked-issues?limit=2&offset=2`
  });
  expect(byOffset.statusCode).toBe(200);
  expect(byOffset.json()).toEqual(second.json());
  expect(app.swagger().paths?.["/api/v1/launches/{launchId}/linked-issues"]?.get).toBeDefined();
});

it("enforces launch read scope and validates pagination controls", async () => {
  const store = createAppStore();
  app = await createApiApp(store);
  const project = await createProject(app);
  const launch = await createProjectLaunch(app, project.id, "Protected launch");
  store.launches.get(launch.id)!.results.push(result("linked", ["BUG-PRIVATE"]));
  const path = `/api/v1/launches/${launch.id}/linked-issues`;

  const denied = await app.inject({
    method: "GET",
    url: path,
    headers: {
      "x-testhistory-actor-id": "scope-limited-reader",
      "x-testhistory-project-scope": project.id,
      "x-testhistory-scopes": "projects:read"
    }
  });
  expect(denied.statusCode).toBe(403);
  expect(denied.body).not.toContain("BUG-PRIVATE");

  const invalid = await app.inject({ method: "GET", url: `${path}?limit=0` });
  expect(invalid.statusCode).toBe(400);
  expect(invalid.json()).toEqual({
    code: "launch.pagination.invalid",
    message: "invalid linked issue list query controls",
    redacted: true
  });

  const missing = await app.inject({
    method: "GET",
    url: "/api/v1/launches/missing/linked-issues"
  });
  expect(missing.statusCode).toBe(404);
});

function result(uuid: string, issues: string[]): NormalizedTestResult {
  const name = `Test ${uuid}`;
  return {
    uuid,
    name,
    status: "passed",
    labels: { issue: issues },
    parameters: [],
    attachments: [],
    steps: [],
    raw: { uuid, name, status: "passed" }
  };
}
