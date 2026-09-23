import assert from "node:assert/strict";
import { test } from "node:test";
import { createApiApp } from "../apps/api/src/app.ts";
import { createAppStore } from "../apps/api/src/store.ts";
import { buildFixtures, buildUploadBatches } from "./seed-synthetic-allure-results.mjs";

test("the API imports a 100-result synthetic launch with PNG evidence and five step levels", async () => {
  const store = createAppStore();
  const app = await createApiApp(store);
  try {
    const project = await app.inject({
      method: "POST",
      url: "/api/v1/projects",
      payload: { key: "SYNTH-100", name: "Synthetic 100-result import" }
    });
    assert.equal(project.statusCode, 201, project.body);
    const projectId = project.json().id;
    const launch = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/launches`,
      payload: { name: "Synthetic 100-result import" }
    });
    assert.equal(launch.statusCode, 201, launch.body);
    const launchId = launch.json().id;
    const { files } = buildFixtures({ launchIndex: 0, launchName: "Synthetic 100-result import" });
    let importedResults = 0;
    for (const batch of buildUploadBatches(files)) {
      const upload = await app.inject({
        method: "POST",
        url: `/api/v1/launches/${launchId}/results/json`,
        payload: { files: batch }
      });
      assert.equal(upload.statusCode, 200, upload.body);
      const body = upload.json();
      assert.deepEqual(body.job.errors, []);
      importedResults += body.job.importedResults;
    }
    assert.equal(importedResults, 100);
    const closed = await app.inject({
      method: "POST",
      url: `/api/v1/launches/${launchId}/close`,
      payload: {}
    });
    assert.equal(closed.statusCode, 200, closed.body);
    assert.equal(closed.json().status, "closed");

    const stored = store.launches.get(launchId);
    assert.equal(stored?.results.length, 100);
    assert.deepEqual(
      new Set(stored.results.map((result) => result.status)),
      new Set(["passed", "failed", "broken", "skipped"])
    );
    assert.ok(stored.results.every((result) => maxStepDepth(result.steps) >= 5));
    const artifacts = [...store.artifacts.values()];
    assert.ok(artifacts.some((artifact) => artifact.contentType === "image/png"));
    assert.ok(artifacts.some((artifact) => artifact.path.endsWith("level-5-assertion.log")));
    assert.ok(stored.results.some((result) => stepAttachments(result.steps).length >= 4));
  } finally {
    await app.close();
  }
});

function maxStepDepth(steps, depth = 1) {
  return Math.max(0, ...steps.map((step) => Math.max(depth, maxStepDepth(step.steps, depth + 1))));
}

function stepAttachments(steps) {
  return steps.flatMap((step) => [
    ...(step.attachments ?? []),
    ...stepAttachments(step.steps ?? [])
  ]);
}
