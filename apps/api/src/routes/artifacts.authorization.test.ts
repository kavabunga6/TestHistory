import type { FastifyInstance } from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createApiApp } from "../app.js";
import { createAppStore } from "../store.js";
import { createProject } from "../appTestHelpers.js";

let app: FastifyInstance | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
  vi.unstubAllEnvs();
});

describe("artifact retention authorization", () => {
  it("denies unauthenticated project preview and cleanup when project auth is required", async () => {
    app = await createApiApp(createAppStore());
    const project = await createProject(app);
    vi.stubEnv("TESTHISTORY_REQUIRE_PROJECT_AUTH", "true");

    const preview = await app.inject({
      method: "POST",
      url: "/api/v1/artifacts/retention/preview",
      payload: { projectId: project.id }
    });
    const execute = await app.inject({
      method: "POST",
      url: "/api/v1/artifacts/retention/execute",
      payload: { projectId: project.id, dryRun: true }
    });
    const list = await app.inject({
      method: "GET",
      url: "/api/v1/artifacts"
    });

    expect(preview.statusCode).toBe(403);
    expect(execute.statusCode).toBe(403);
    expect(list.statusCode).toBe(403);
    expect(preview.json()).toEqual(expect.objectContaining({ redacted: true }));
    expect(execute.json()).toEqual(expect.objectContaining({ redacted: true }));
  });

  it("allows a project owner with the exact artifact scopes", async () => {
    app = await createApiApp(createAppStore());
    const project = await createProject(app);
    vi.stubEnv("TESTHISTORY_REQUIRE_PROJECT_AUTH", "true");

    const projectHeaders = {
      "x-testhistory-actor-id": "project-owner",
      "x-testhistory-project-scope": project.id
    };
    const preview = await app.inject({
      method: "POST",
      url: "/api/v1/artifacts/retention/preview",
      headers: { ...projectHeaders, "x-testhistory-scopes": "artifacts:read" },
      payload: { projectId: project.id }
    });
    const execute = await app.inject({
      method: "POST",
      url: "/api/v1/artifacts/retention/execute",
      headers: { ...projectHeaders, "x-testhistory-scopes": "artifacts:write" },
      payload: { projectId: project.id, dryRun: true }
    });

    expect(preview.statusCode).toBe(200);
    expect(execute.statusCode).toBe(200);
  });

  it("requires global scope for cleanup across all projects", async () => {
    app = await createApiApp(createAppStore());
    vi.stubEnv("TESTHISTORY_REQUIRE_PROJECT_AUTH", "true");

    const denied = await app.inject({
      method: "POST",
      url: "/api/v1/artifacts/retention/execute",
      headers: {
        "x-testhistory-actor-id": "project-owner",
        "x-testhistory-project-scope": "one-project",
        "x-testhistory-scopes": "artifacts:write"
      },
      payload: { dryRun: true }
    });
    const allowed = await app.inject({
      method: "POST",
      url: "/api/v1/artifacts/retention/execute",
      headers: {
        "x-testhistory-actor-id": "admin-service",
        "x-testhistory-project-scope": "*",
        "x-testhistory-scopes": "artifacts:write"
      },
      payload: { dryRun: true }
    });

    expect(denied.statusCode).toBe(403);
    expect(allowed.statusCode).toBe(200);
  });
});
