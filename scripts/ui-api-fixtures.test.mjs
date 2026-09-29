import assert from "node:assert/strict";
import { test } from "node:test";
import { createUiFixtureApiResponse } from "./ui-api-fixtures.mjs";

const read = (path, search = "") => createUiFixtureApiResponse(path, "GET", null, search);
const launchId = "L-1289";
const resultsPath = `/api/v1/launches/${launchId}/results`;
const automationBase = "/api/v1/projects/project-1";

function maxStepDepth(steps, depth = 1) {
  return Math.max(
    0,
    ...steps.map((step) => Math.max(depth, maxStepDepth(step.steps ?? [], depth + 1)))
  );
}

function collectAttachments(steps) {
  return steps.flatMap((step) => [
    ...(step.attachments ?? []),
    ...collectAttachments(step.steps ?? [])
  ]);
}

function assertStepTiming(steps, parent) {
  for (const step of steps) {
    assert.ok(step.start <= step.stop, `Invalid duration: ${step.name}`);
    if (parent !== undefined) {
      assert.ok(step.start >= parent.start, `Step starts before parent: ${step.name}`);
      assert.ok(step.stop <= parent.stop, `Step ends after parent: ${step.name}`);
    }
    assertStepTiming(step.steps ?? [], step);
  }
}

test("UI fixture exposes 100 varied results with navigable details and evidence", () => {
  const launch = read("/api/v1/projects/project-1/launches").items[0];
  const page = read(resultsPath, "?limit=100");

  assert.equal(page.page.total, 100);
  assert.equal(page.items.length, 100);
  assert.equal(new Set(page.items.map((item) => item.uuid)).size, 100);
  assert.deepEqual(launch.counters, {
    broken: 8,
    failed: 18,
    passed: 62,
    skipped: 8,
    unknown: 4
  });
  assert.deepEqual(
    Object.fromEntries(
      Object.keys(launch.counters).map((status) => [
        status,
        page.items.filter((item) => item.status === status).length
      ])
    ),
    launch.counters
  );
  assert.deepEqual(
    new Set(page.items.map((item) => item.labels.layer[0])),
    new Set(["UI", "API", "E2E"])
  );

  for (const item of page.items) {
    const details = read(`${resultsPath}/${item.uuid}`);
    assert.equal(details.uuid, item.uuid);
    assert.ok(details.attachments.length >= 2);
    assert.ok(maxStepDepth(details.steps) >= 2);
    assert.ok(collectAttachments(details.steps).length >= 2);
    assertStepTiming(details.steps);
  }
  const selected = read(`${resultsPath}/PAY-1042`);
  assert.ok(maxStepDepth(selected.steps) >= 6);
  assert.ok(selected.attachments.some((attachment) => attachment.type === "video/mp4"));
  assert.ok(
    selected.attachments.some((attachment) => attachment.previewUrl?.startsWith("data:image/"))
  );
});

test("UI fixture pagination, analytics and dashboard agree on 100 results", () => {
  const first = read(resultsPath, "?limit=25");
  const second = read(resultsPath, `?limit=25&cursor=${first.page.nextCursor}`);
  assert.equal(first.page.total, 100);
  assert.equal(first.items.length, 25);
  assert.equal(second.items.length, 25);
  assert.equal(new Set([...first.items, ...second.items].map((item) => item.uuid)).size, 50);

  const failed = read(resultsPath, "?limit=25&status=failed");
  assert.equal(failed.page.total, 18);
  assert.ok(failed.items.every((item) => item.status === "failed"));
  const broken = read(resultsPath, "?limit=25&status=broken");
  assert.equal(broken.page.total, 8);
  const brokenWithUnknown = read(resultsPath, "?limit=25&status=broken,unknown");
  assert.equal(brokenWithUnknown.page.total, 12);
  assert.ok(brokenWithUnknown.items.every((item) => ["broken", "unknown"].includes(item.status)));
  const problematic = read(
    resultsPath,
    `?limit=25&q=${encodeURIComponent('status in ["failed", "broken"]')}`
  );
  assert.equal(problematic.page.total, 26);
  const quarantined = read(resultsPath, "?limit=25&q=muted%20%3D%20true");
  assert.equal(quarantined.page.total, 0);

  const analytics = read("/api/v1/analytics/results", "?limit=50");
  assert.equal(analytics.metrics.total, 100);
  assert.equal(analytics.metrics.matched, 100);
  assert.equal(analytics.page.total, 100);
  assert.equal(analytics.items.length, 50);
  assert.equal(analytics.metrics.openRisks, 26);
  assert.equal(analytics.metrics.statusCounters.passed, 62);

  const aggregate = createUiFixtureApiResponse(
    `/api/v1/launches/${launchId}/dashboard/aggregate`,
    "POST",
    JSON.stringify({
      widgets: [
        {
          id: "pass",
          kind: "metric",
          metric: "Успешность",
          groupBy: "status",
          thql: "from results measure passRate()"
        },
        {
          id: "status",
          kind: "bar",
          metric: "Количество",
          groupBy: "status",
          thql: "from results group by status measure count()"
        },
        {
          id: "slow",
          kind: "table",
          metric: "Длительность",
          groupBy: "suite",
          thql: "from results order by duration desc limit 5"
        }
      ]
    })
  );
  assert.equal(aggregate.totalResults, 100);
  assert.equal(aggregate.widgets[0].passRate, 62);
  assert.equal(
    aggregate.widgets[1].groups.reduce((sum, group) => sum + group.value, 0),
    100
  );
  assert.equal(aggregate.widgets[2].tableRows.length, 5);
  assert.ok(
    aggregate.widgets[2].tableRows[0].durationMs >= aggregate.widgets[2].tableRows[1].durationMs
  );
});

test("automation screenshot fixtures retain the empty state and populate all review tabs", () => {
  const paths = [
    `${automationBase}/test-plans`,
    `${automationBase}/automation-jobs`,
    `${automationBase}/integrations/notifications`,
    `${automationBase}/integrations/issue-trackers`,
    `${automationBase}/integration-deliveries`
  ];
  for (const path of paths) {
    const empty = createUiFixtureApiResponse(path, "GET", null, "", "automation");
    const filled = createUiFixtureApiResponse(path, "GET", null, "", "automation-plans");
    assert.equal(empty.items.length, 0, `${path} must stay empty in automation.png`);
    assert.ok(filled.items.length > 0, `${path} must be populated in automation tabs`);
  }

  const plans = createUiFixtureApiResponse(paths[0], "GET", null, "", "automation-plans");
  const jobs = createUiFixtureApiResponse(paths[1], "GET", null, "", "automation-jobs");
  const notifications = createUiFixtureApiResponse(
    paths[2],
    "GET",
    null,
    "",
    "automation-integrations"
  );
  const trackers = createUiFixtureApiResponse(paths[3], "GET", null, "", "automation-integrations");
  const deliveries = createUiFixtureApiResponse(
    paths[4],
    "GET",
    null,
    "",
    "automation-integrations"
  );

  assert.deepEqual(
    plans.items.map((item) => item.status),
    ["active", "active", "disabled"]
  );
  assert.deepEqual(
    new Set(jobs.items.map((item) => item.status)),
    new Set(["succeeded", "running", "failed", "queued"])
  );
  assert.ok(jobs.items.every((item) => plans.items.some((plan) => plan.id === item.testPlanId)));
  assert.equal(notifications.items.length, 2);
  assert.equal(trackers.items.length, 2);
  assert.deepEqual(
    new Set(deliveries.items.map((item) => item.status)),
    new Set(["delivered", "retrying"])
  );
});

test("comparison screenshot fixture adds a baseline only to its own launch list", () => {
  const launchList = `/api/v1/projects/project-1/launches`;
  assert.equal(read(launchList, "?limit=100").items.length, 1);

  const comparisonList = createUiFixtureApiResponse(
    launchList,
    "GET",
    null,
    "?limit=100",
    "launch-comparison"
  );
  assert.deepEqual(
    comparisonList.items.map((item) => item.id),
    ["L-1289", "L-1288"]
  );

  const response = createUiFixtureApiResponse(
    `/api/v1/projects/project-1/launches/compare`,
    "GET",
    null,
    "?baseLaunchId=L-1288&targetLaunchId=L-1289&limit=25&offset=0",
    "launch-comparison"
  );
  assert.equal(response.kind, "launch-comparison");
  assert.equal(response.page.total, 5);
  assert.equal(response.summary.regressed, 2);
  assert.ok(response.rows.some((row) => row.change === "fixed"));
  assert.ok(response.rows.some((row) => row.change === "regressed"));
});
