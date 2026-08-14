import type { FastifyInstance } from "fastify";
import { afterEach, describe, expect, it } from "vitest";

import { createApiApp } from "../app.js";
import { createAppStore, type Launch } from "../store.js";
import { createProject, createProjectLaunch, previewRetentionArtifact } from "../appTestHelpers.js";

let app: FastifyInstance | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

describe("launch deletion", () => {
  it("rejects deletion of active launches", async () => {
    const store = createAppStore();
    app = await createApiApp(store);
    const project = await createProject(app);
    const launch = await createProjectLaunch(app, project.id, "Active launch");

    const response = await app.inject({
      method: "DELETE",
      url: `/api/v1/launches/${launch.id}`,
      headers: ownerHeaders(project.id)
    });

    expect(response.statusCode).toBe(409);
    expect(store.launches.has(launch.id)).toBe(true);
  });

  it("deletes a closed launch and all launch-owned records", async () => {
    const store = createAppStore();
    app = await createApiApp(store);
    const project = await createProject(app);
    const launch = await createProjectLaunch(app, project.id, "Closed launch");
    (store.launches.get(launch.id) as Launch).status = "closed";
    store.artifacts.set(
      "artifact-to-delete",
      previewRetentionArtifact({
        id: "artifact-to-delete",
        launchId: launch.id,
        projectId: project.id,
        resultStatus: "passed",
        retentionClass: "passed-short",
        observedAt: "2026-05-01T00:00:00.000Z",
        content: "artifact"
      })
    );

    const response = await app.inject({
      method: "DELETE",
      url: `/api/v1/launches/${launch.id}`,
      headers: ownerHeaders(project.id)
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(
      expect.objectContaining({
        kind: "launch-deletion",
        launchId: launch.id,
        removed: expect.objectContaining({ artifacts: 1, launches: 1 })
      })
    );
    expect(store.launches.has(launch.id)).toBe(false);
    expect(store.artifacts.has("artifact-to-delete")).toBe(false);
  });
});

function ownerHeaders(projectId: string) {
  return {
    "x-testhistory-actor-id": "project-owner",
    "x-testhistory-project-scope": projectId,
    "x-testhistory-scopes": "launches:write"
  };
}
