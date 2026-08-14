import { spawn } from "node:child_process";

const apiPort = process.env.API_PORT ?? "18080";
const configuredBaseUrl = process.env.SMOKE_API_BASE_URL ?? process.env.TESTHISTORY_API_URL;
const baseUrl = (configuredBaseUrl ?? `http://127.0.0.1:${apiPort}`).replace(/\/$/, "");
const shouldSpawnServer = configuredBaseUrl === undefined;

const server = shouldSpawnServer
  ? spawn(process.execPath, ["apps/api/dist/server.js"], {
      env: { ...process.env, API_PORT: apiPort },
      stdio: ["ignore", "pipe", "pipe"]
    })
  : undefined;

let output = "";
server?.stdout.on("data", (chunk) => {
  output += chunk.toString();
});
server?.stderr.on("data", (chunk) => {
  output += chunk.toString();
});

try {
  await waitForEndpoint(`${baseUrl}/health`);
  await expectJson(`${baseUrl}/health`, { status: "ok" });
  await smokeUploadCloseUiSlice();
  console.log("Upload close UI smoke passed");
} finally {
  server?.kill();
}

async function smokeUploadCloseUiSlice() {
  const runId = Date.now();
  const testCaseId = `case-upload-close-ui-${runId}`;
  const historyId = `history-upload-close-ui-${runId}`;

  const project = await postJson(`${baseUrl}/api/v1/projects`, {
    key: `UI-SMOKE-${runId}`,
    name: "Upload close UI smoke project"
  });
  expectField(project, "id");

  const launch = await postJson(`${baseUrl}/api/v1/projects/${project.id}/launches`, {
    name: `Upload close UI smoke ${runId}`,
    branch: "smoke/upload-close-ui",
    commitSha: "feed1234",
    buildNumber: String(runId)
  });
  expectField(launch, "id");
  expectEqual(launch.status, "open", "created launch status");

  const upload = await postJson(`${baseUrl}/api/v1/launches/${launch.id}/results/json`, {
    files: [
      {
        path: "upload-close-ui-first-result.json",
        content: JSON.stringify({
          uuid: "upload-close-ui-first",
          testCaseId,
          historyId,
          fullName: "smoke.uploadCloseUi.checkout",
          name: "upload close UI smoke checkout",
          status: "failed",
          stage: "finished",
          start: 100,
          stop: 160,
          statusDetails: { message: "synthetic first attempt failure" },
          parameters: [{ name: "browser", value: "chromium" }],
          labels: [{ name: "tag", value: "upload-close-ui" }]
        })
      },
      {
        path: "upload-close-ui-retry-result.json",
        content: JSON.stringify({
          uuid: "upload-close-ui-retry",
          testCaseId,
          historyId,
          fullName: "smoke.uploadCloseUi.checkout",
          name: "upload close UI smoke checkout",
          status: "passed",
          stage: "finished",
          start: 200,
          stop: 260,
          retry: true,
          statusDetails: { flaky: true, message: "synthetic retry recovered" },
          parameters: [{ name: "browser", value: "chromium" }],
          labels: [{ name: "tag", value: "upload-close-ui" }]
        })
      }
    ]
  });
  expectEqual(upload.job?.status, "completed", "upload job status");
  expectEqual(upload.job?.importedResults, 2, "upload imported result count");
  expectEqual(upload.launch?.counters?.failed, 1, "upload failed counter");
  expectEqual(upload.launch?.counters?.passed, 1, "upload passed counter");

  const openLaunch = await getJson(`${baseUrl}/api/v1/launches/${launch.id}`);
  expectEqual(openLaunch.status, "open", "launch remains open before close");
  expectEqual(openLaunch.results?.length, 2, "launch detail embedded results");

  const closedLaunch = await postJson(`${baseUrl}/api/v1/launches/${launch.id}/close`, {});
  expectEqual(closedLaunch.status, "closed", "closed launch status");
  expectEqual(closedLaunch.processedTestCases, 2, "closed launch processed test cases");
  expectEqual(closedLaunch.closePipeline?.status, "closed", "close pipeline status");

  const launchList = await getJson(
    `${baseUrl}/api/v1/projects/${project.id}/launches?status=closed&limit=5`
  );
  expectEqual(launchList.kind, "launch-list", "launch list kind");
  expectIncludes(
    launchList.items?.map((item) => item.id),
    launch.id,
    "closed launch list"
  );

  const resultList = await getJson(
    `${baseUrl}/api/v1/launches/${launch.id}/results?testCaseId=${testCaseId}&limit=5`
  );
  expectEqual(resultList.kind, "launch-result-list", "result list kind");
  expectEqual(resultList.page?.returned, 2, "result list returned count");
  expectIncludes(
    resultList.items?.map((item) => item.uuid),
    "upload-close-ui-retry",
    "result list retry row"
  );

  const testCases = await getJson(
    `${baseUrl}/api/v1/test-cases?projectId=${project.id}&q=upload%20close%20UI&limit=5`
  );
  expectEqual(testCases.kind, "test-case-list", "test case list kind");
  expectIncludes(
    testCases.items?.map((item) => item.id),
    testCaseId,
    "test case list row"
  );

  const testCase = await getJson(
    `${baseUrl}/api/v1/test-cases/${testCaseId}?projectId=${project.id}`
  );
  expectEqual(testCase.id, testCaseId, "test case detail id");
  expectEqual(testCase.history?.length, 2, "test case detail history count");

  const history = await getJson(
    `${baseUrl}/api/v1/test-cases/${testCaseId}/history?projectId=${project.id}&limit=5`
  );
  expectEqual(history.kind, "test-case-history", "history kind");
  expectEqual(history.totalPoints, 2, "history total points");
  expectIncludes(
    history.points?.map((point) => point.resultUuid),
    "upload-close-ui-retry",
    "history retry point"
  );
  const retryPoint = history.points?.find((point) => point.resultUuid === "upload-close-ui-retry");
  expectEqual(retryPoint?.status, "passed", "history retry status");
  expectEqual(retryPoint?.retry, true, "history retry flag");
  expectEqual(retryPoint?.flaky, true, "history flaky flag");

  const analytics = await postJson(`${baseUrl}/api/v1/analytics/run`, {
    query: {
      entity: "results",
      projectId: project.id,
      metrics: ["count", "statusCounters", "passRate"],
      groupBy: ["status"],
      limit: 10
    }
  });
  expectEqual(analytics.kind, "analytics-run", "analytics kind");
  expectEqual(analytics.valid, true, "analytics validity");
  expectEqual(analytics.result?.metrics?.count, 2, "analytics result count");
  expectEqual(analytics.result?.metrics?.statusCounters?.failed, 1, "analytics failed counter");
  expectEqual(analytics.result?.metrics?.statusCounters?.passed, 1, "analytics passed counter");

  const qualityGate = await getJson(`${baseUrl}/api/v1/launches/${launch.id}/quality-gate`);
  expectEqual(qualityGate.status, "failed", "quality gate status");
  expectEqual(qualityGate.metrics?.total, 2, "quality gate total");
  expectEqual(qualityGate.metrics?.passRate, 50, "quality gate pass rate");
}

async function waitForEndpoint(url) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 15000) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      await sleep(300);
    }
  }

  throw new Error(`Timed out waiting for ${url}\n${output}`);
}

async function getJson(url) {
  const response = await fetch(url);
  return responseJson(response, "GET", url);
}

async function postJson(url, payload) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
  return responseJson(response, "POST", url);
}

async function responseJson(response, method, url) {
  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : undefined;
  } catch {
    throw new Error(`${method} ${url} returned non-JSON ${response.status}: ${text}`);
  }
  if (!response.ok) {
    throw new Error(`${method} ${url} returned ${response.status}: ${JSON.stringify(body)}`);
  }
  return body;
}

async function expectJson(url, expected) {
  const actual = await getJson(url);
  for (const [key, value] of Object.entries(expected)) {
    expectEqual(actual?.[key], value, `${url} ${key}`);
  }
}

function expectField(value, field) {
  if (value?.[field] === undefined || value?.[field] === null || value?.[field] === "") {
    throw new Error(`Expected field ${field}: ${JSON.stringify(value)}`);
  }
}

function expectEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(
      `${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
    );
  }
}

function expectIncludes(values, expected, label) {
  if (!Array.isArray(values) || !values.includes(expected)) {
    throw new Error(`${label}: expected ${JSON.stringify(values)} to include ${expected}`);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
