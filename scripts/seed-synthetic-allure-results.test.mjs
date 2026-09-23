import assert from "node:assert/strict";
import { test } from "node:test";
import { caseCatalog, launchPlans } from "./seed-synthetic-allure-data.mjs";
import { buildFixtures, buildUploadBatches } from "./seed-synthetic-allure-results.mjs";

test("synthetic Allure history has 100 varied results and resolved evidence in every launch", () => {
  assert.equal(caseCatalog.length, 100);
  assert.equal(launchPlans.length, 10);
  assert.equal(new Set(caseCatalog.map((item) => item.id)).size, 100);
  const expectedHistoryIds = new Set(caseCatalog.map((item) => `synthetic.${item.id}`));

  for (const [launchIndex, plan] of launchPlans.entries()) {
    assert.equal(plan.cases.length, 100);
    const { files } = buildFixtures({
      launchIndex,
      launchName: `Synthetic launch ${launchIndex + 1}`
    });
    const byPath = new Map(files.map((file) => [file.path, file]));
    assert.equal(byPath.size, files.length, `launch ${launchIndex + 1} has duplicate paths`);
    const batches = buildUploadBatches(files);
    assert.deepEqual(
      new Set(batches.flatMap((batch) => batch.map((file) => file.path))),
      new Set(files.map((file) => file.path))
    );
    assert.ok(
      batches.every(
        (batch) => batch.filter((file) => file.path.endsWith("-result.json")).length <= 20
      )
    );
    assert.ok(
      batches.every((batch) => Buffer.byteLength(JSON.stringify({ files: batch })) <= 512 * 1024)
    );
    const results = files
      .filter((file) => file.path.endsWith("-result.json"))
      .map((file) => JSON.parse(file.content));
    assert.equal(results.length, 100);
    assert.deepEqual(new Set(results.map((result) => result.historyId)), expectedHistoryIds);
    assert.equal(new Set(results.map((result) => result.uuid)).size, 100);
    assert.deepEqual(
      new Set(results.map((result) => result.status)),
      new Set(["passed", "failed", "broken", "skipped"])
    );
    assert.deepEqual(
      new Set(
        results.flatMap((result) =>
          result.labels.filter((label) => label.name === "layer").map((label) => label.value)
        )
      ),
      new Set(["web", "api", "mobile", "desktop"])
    );

    for (const result of results) {
      assert.ok(result.stop > result.start);
      assert.ok(result.attachments.length >= 3);
      assert.ok(maxStepDepth(result.steps) >= 5);
      for (const attachment of [...result.attachments, ...stepAttachments(result.steps)]) {
        assert.ok(byPath.has(attachment.source), `${result.uuid}: ${attachment.source} is missing`);
        assert.equal(
          attachment.content,
          undefined,
          "Allure descriptors must not embed file content"
        );
        const batch = batches.find((item) =>
          item.some((file) => file.path.endsWith(`${result.uuid}-result.json`))
        );
        assert.ok(batch?.some((file) => file.path === attachment.source));
      }
    }
    assert.ok(files.some((file) => file.contentEncoding === "base64"));
    assert.ok(files.length <= 5_000);
    assert.ok(
      files.reduce((sum, file) => sum + Buffer.byteLength(file.content, "utf8"), 0) <
        25 * 1024 * 1024
    );
  }
});

function maxStepDepth(steps, depth = 1) {
  return Math.max(0, ...steps.map((step) => Math.max(depth, maxStepDepth(step.steps, depth + 1))));
}

function stepAttachments(steps) {
  return steps.flatMap((step) => [...step.attachments, ...stepAttachments(step.steps)]);
}
