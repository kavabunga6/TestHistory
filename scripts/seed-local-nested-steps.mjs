import { pathToFileURL } from "node:url";

const showcaseLaunchName = "Nested steps UI fixture v6 · 100 varied tests";
const showcaseBuildNumber = "nested-steps-v6-100";

export async function seedLocalNestedSteps(options = {}) {
  const baseUrl = (
    options.baseUrl ??
    process.env.TESTHISTORY_API_URL ??
    "http://127.0.0.1:18080"
  ).replace(/\/$/, "");
  await waitForApi(baseUrl);

  const projects = await getJson(baseUrl, "/api/v1/projects");
  const project = options.projectId
    ? projects.find((candidate) => candidate.id === options.projectId)
    : (projects[0] ??
      (await postJson(baseUrl, "/api/v1/projects", { key: "WS", name: "Web Sandbox" })));
  if (project === undefined) {
    throw new Error(`Project ${options.projectId} is not available for the UI fixture`);
  }
  const launches = await loadProjectLaunches(baseUrl, project.id);
  const showcase = await seedShowcaseLaunch(baseUrl, project.id, launches);
  return { projectId: project.id, showcase };
}

async function seedShowcaseLaunch(baseUrl, projectId, launches) {
  const existing = launches.find(
    (launch) => launch.name === showcaseLaunchName && launch.buildNumber === showcaseBuildNumber
  );
  const fixture = buildShowcaseFixture(Date.now());
  assertShowcaseFixture(fixture);
  if (existing?.status === "closed") {
    await verifyShowcaseLaunch(baseUrl, existing.id, fixture.results);
    return {
      created: false,
      launchId: existing.id,
      launchName: showcaseLaunchName,
      buildNumber: showcaseBuildNumber,
      results: 100,
      status: "closed"
    };
  }
  const launch =
    existing ??
    (await postJson(baseUrl, `/api/v1/projects/${projectId}/launches`, {
      branch: "develop",
      buildNumber: showcaseBuildNumber,
      commitSha: "synthetic-nested-steps-v6",
      name: showcaseLaunchName
    }));
  if (launch.status !== undefined && launch.status !== "open") {
    throw new Error(`Cannot complete showcase fixture launch ${launch.id}: ${launch.status}`);
  }

  const batches = chunk(fixture.entries, 10);
  for (const entries of batches) {
    const upload = await postJson(baseUrl, `/api/v1/launches/${launch.id}/results/json`, {
      files: entries.flatMap((entry) => entry.files)
    });
    if (
      upload.job?.errors?.length > 0 ||
      (upload.job?.importedResults ?? 0) + (upload.job?.duplicateResults ?? 0) !== entries.length
    ) {
      throw new Error(`Showcase fixture upload failed for launch ${launch.id}`);
    }
  }
  await verifyShowcaseLaunch(baseUrl, launch.id, fixture.results);
  const closed = await postJson(baseUrl, `/api/v1/launches/${launch.id}/close`, {});
  if (closed.status !== "closed") {
    throw new Error(`Showcase fixture launch ${launch.id} did not close: ${closed.status}`);
  }
  return {
    created: existing === undefined,
    launchId: launch.id,
    launchName: showcaseLaunchName,
    buildNumber: showcaseBuildNumber,
    batches: batches.length,
    results: 100,
    status: "closed"
  };
}

async function verifyShowcaseLaunch(baseUrl, launchId, expectedResults) {
  const payload = await getJson(
    baseUrl,
    `/api/v1/launches/${encodeURIComponent(launchId)}/results?limit=100`
  );
  const actualResults = payload.items ?? [];
  const expectedIds = new Set(expectedResults.map((result) => result.uuid));
  const actualIds = new Set(actualResults.map((result) => result.uuid));
  const expectedStatuses = new Map(expectedResults.map((result) => [result.uuid, result.status]));
  if (
    payload.page?.total !== 100 ||
    actualResults.length !== 100 ||
    actualIds.size !== 100 ||
    actualResults.some(
      (result) =>
        !expectedIds.has(result.uuid) || expectedStatuses.get(result.uuid) !== result.status
    )
  ) {
    throw new Error(
      `Showcase fixture launch ${launchId} must contain exactly 100 expected results`
    );
  }
}

async function loadProjectLaunches(baseUrl, projectId) {
  const launches = [];
  let cursor;
  do {
    const path = `/api/v1/projects/${encodeURIComponent(projectId)}/launches?limit=100${cursor === undefined ? "" : `&cursor=${encodeURIComponent(cursor)}`}`;
    const payload = await getJson(baseUrl, path);
    launches.push(...(Array.isArray(payload) ? payload : (payload.items ?? [])));
    cursor = Array.isArray(payload) ? undefined : (payload.page?.nextCursor ?? undefined);
  } while (cursor !== undefined);
  return launches;
}

function chunk(items, size) {
  const batches = [];
  for (let index = 0; index < items.length; index += size)
    batches.push(items.slice(index, index + size));
  return batches;
}

const showcaseSuites = [
  ["Authentication", "Identity", "UI"],
  ["Checkout", "Commerce", "E2E"],
  ["Payments", "Payments", "API"],
  ["Orders", "Commerce", "E2E"],
  ["Catalog", "Discovery", "UI"],
  ["Search", "Discovery", "API"],
  ["Profile", "Identity", "UI"],
  ["Notifications", "Messaging", "API"],
  ["Reports", "Analytics", "E2E"],
  ["Administration", "Platform", "UI"]
];
const showcaseScenarios = [
  "opens the main view",
  "accepts a valid request",
  "rejects invalid input",
  "recovers after a retry",
  "preserves state on refresh",
  "applies filters correctly",
  "handles an empty response",
  "shows a slow dependency",
  "updates related records",
  "respects access boundaries"
];
const showcaseStatuses = [
  "passed",
  "failed",
  "passed",
  "broken",
  "passed",
  "skipped",
  "passed",
  "unknown",
  "passed",
  "failed"
];
const tinyPngBase64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/z+8AAAAASUVORK5CYII=";

function buildShowcaseFixture(now) {
  const entries = [];
  const results = [];
  for (let suiteIndex = 0; suiteIndex < showcaseSuites.length; suiteIndex += 1) {
    const [suite, owner, layer] = showcaseSuites[suiteIndex];
    for (let scenarioIndex = 0; scenarioIndex < showcaseScenarios.length; scenarioIndex += 1) {
      const index = suiteIndex * showcaseScenarios.length + scenarioIndex;
      const number = String(index + 1).padStart(3, "0");
      const id = `nested-v6-${number}`;
      const status = showcaseStatuses[scenarioIndex];
      const depth = 1 + ((suiteIndex * 3 + scenarioIndex) % 6);
      const start = now - (100 - index) * 30_000;
      const duration = status === "skipped" ? 220 + depth * 25 : 300 + index * 17 + depth * 110;
      const statusDetails = showcaseStatusDetails(suite, scenarioIndex, status);
      const attachments = showcaseAttachments(id, index, depth, status, statusDetails);
      const result = {
        uuid: id,
        historyId: `showcase.nested-v6.${suiteIndex}.${scenarioIndex}`,
        testCaseId: `synthetic-case-${id}`,
        name: `${suite}: ${showcaseScenarios[scenarioIndex]}`,
        fullName: `com.testhistory.showcase.${suite}.${id}`,
        description: `${suite}: ${showcaseScenarios[scenarioIndex]}. ${depth} levels of steps; ${attachments.count} evidence files.`,
        stage: "finished",
        status,
        start,
        stop: start + duration,
        labels: [
          { name: "suite", value: `${suite} suite` },
          { name: "owner", value: owner },
          { name: "layer", value: layer },
          { name: "severity", value: ["blocker", "critical", "normal", "minor"][index % 4] },
          { name: "tag", value: "ui-showcase-v6" },
          { name: "tag", value: ["smoke", "regression", "integration"][index % 3] },
          { name: "allure_id", value: `SHOWCASE-${number}` }
        ],
        parameters: [
          { name: "browser", value: ["Chromium", "Firefox", "Mobile WebView"][index % 3] },
          { name: "region", value: ["eu-test", "us-test", "apac-test"][index % 3] }
        ],
        attachments: attachments.resultAttachments,
        steps: showcaseSteps({
          suite,
          scenario: showcaseScenarios[scenarioIndex],
          start,
          duration,
          depth,
          status,
          statusDetails,
          stepAttachments: attachments.stepAttachments
        }),
        ...(statusDetails === undefined ? {} : { statusDetails })
      };
      results.push(result);
      entries.push({
        result,
        files: [
          {
            path: `nested-v6/${id}/${id}-result.json`,
            content: JSON.stringify(result)
          },
          ...attachments.files
        ]
      });
    }
  }
  return { entries, results };
}

function showcaseStatusDetails(suite, scenarioIndex, status) {
  const source = `tests/${suite.toLowerCase()}.spec.ts`;
  if (status === "failed" && scenarioIndex === 1) {
    return {
      message: `Ожидалось: ${suite} принимает корректный запрос и возвращает HTTP 200.\nПолучено: HTTP 401; запрос отклонён до проверки ответа.`,
      trace: `AssertionError: expected HTTP 200, received 401\nat verifyValidRequest (${source}:42:7)`
    };
  }
  if (status === "failed" && scenarioIndex === 9) {
    return {
      message: `Ожидалось: ${suite} запрещает операцию без нужной роли (HTTP 403).\nПолучено: HTTP 200; ограничение доступа не сработало.`,
      trace: `AssertionError: expected HTTP 403, received 200\nat verifyAccessBoundary (${source}:91:7)`
    };
  }
  if (status === "broken") {
    return {
      message: `Ожидалось: ${suite} восстановится после повторного запроса.\nПолучено: зависимость не ответила за 5 с после трёх попыток.`,
      trace: `TimeoutError: dependency did not respond after 3 attempts\nat retryRequest (${source}:58:5)`
    };
  }
  if (status === "skipped") {
    return {
      message: `Сценарий ${suite} пропущен: в этом окружении выключен флаг FILTERS_V2.`,
      trace: ""
    };
  }
  if (status === "unknown") {
    return {
      message: `Ожидалось: ${suite} ответит за 2 с.\nПолучено: проверка прервана после 8 с; итоговый статус зависимости не определён.`,
      trace: `DependencyTimeoutError: no response within 8s\nat awaitDependency (${source}:73:9)`
    };
  }
  return undefined;
}

function showcaseAttachments(id, index, depth, status, statusDetails) {
  const files = [];
  const resultAttachments = [];
  const stepAttachments = new Map();
  const variant = index % 4;
  const add = (name, extension, type, content, level, contentEncoding) => {
    const source = `nested-v6/${id}/${name.toLowerCase().replaceAll(" ", "-")}.${extension}`;
    files.push({ path: source, content, ...(contentEncoding ? { contentEncoding } : {}) });
    const item = attachment(name, type, source);
    if (level === 0) resultAttachments.push(item);
    else stepAttachments.set(level, [...(stepAttachments.get(level) ?? []), item]);
  };
  const log = (lines) =>
    [
      `result=${id} status=${status}`,
      ...(statusDetails === undefined
        ? ["Scenario completed without an error"]
        : [statusDetails.message]),
      ...Array.from(
        { length: Math.max(0, lines - 2) },
        (_, line) => `step=${line + 1} result=${id} status=${status}`
      )
    ].join("\n");
  if (variant === 1) {
    add("Execution log", "log", "text/plain", log(index % 25 === 0 ? 1_200 : 20), depth);
  } else if (variant === 2) {
    add(
      "Request payload",
      "json",
      "application/json",
      JSON.stringify({ id, status }),
      Math.min(depth, 3)
    );
    add(
      "Response metadata",
      "xml",
      "application/xml",
      `<result id="${id}" status="${status}"/>`,
      depth
    );
  } else if (variant === 3) {
    add("Screenshot", "png", "image/png", tinyPngBase64, 0, "base64");
    add(
      "Metrics",
      "csv",
      "text/csv",
      `metric,value\nlatency,${300 + index * 17}\n`,
      Math.min(depth, 2)
    );
    add("Execution log", "log", "text/plain", log(index % 25 === 0 ? 1_200 : 20), depth);
  }
  return { count: files.length, files, resultAttachments, stepAttachments };
}

function showcaseSteps({
  suite,
  scenario,
  start,
  duration,
  depth,
  status,
  statusDetails,
  stepAttachments
}) {
  let nested = [];
  for (let level = depth; level >= 1; level -= 1) {
    const stepStatus =
      status === "failed" || status === "broken" ? status : level === depth ? status : "passed";
    nested = [
      step(
        level === depth ? `Verify ${scenario}` : `${suite} phase ${level}`,
        stepStatus,
        start + level * 25,
        Math.max(0, duration - level * 25),
        nested,
        stepAttachments.get(level) ?? [],
        level === depth ? statusDetails : undefined
      )
    ];
  }
  return [step("Prepare fixture data", "passed", start, 25), ...nested];
}

function assertShowcaseFixture(fixture) {
  const ids = new Set(fixture.results.map((result) => result.uuid));
  const statuses = new Set(fixture.results.map((result) => result.status));
  const depths = fixture.results.map((result) => {
    const measurements = [];
    visitSteps(result.steps, 1, measurements);
    return Math.max(...measurements.map((item) => item.depth));
  });
  const attachmentCounts = new Set(fixture.entries.map((entry) => entry.files.length - 1));
  if (fixture.results.length !== 100 || ids.size !== 100 || fixture.entries.length !== 100) {
    throw new Error("Showcase fixture must contain 100 unique results");
  }
  if (
    ["passed", "failed", "broken", "skipped", "unknown"].some((status) => !statuses.has(status))
  ) {
    throw new Error("Showcase fixture must cover all Allure statuses");
  }
  if (!depths.includes(5) || !depths.includes(6)) {
    throw new Error("Showcase fixture must include five- and six-level step trees");
  }
  if ([0, 1, 2, 3].some((count) => !attachmentCounts.has(count))) {
    throw new Error("Showcase fixture must include different attachment sets");
  }
}

function step(name, status, start, duration, steps = [], attachments = [], statusDetails) {
  return {
    attachments,
    name,
    stage: "finished",
    start,
    status,
    steps,
    stop: start + duration,
    ...(statusDetails !== undefined ? { statusDetails } : {})
  };
}

function attachment(name, type, source) {
  return { name, source, type };
}

function visitSteps(steps, depth, measurements) {
  for (const current of steps) {
    measurements.push({ attachments: current.attachments?.length ?? 0, depth });
    visitSteps(current.steps ?? [], depth + 1, measurements);
  }
}

async function waitForApi(baseUrl) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try {
      if ((await getJson(baseUrl, "/health")).status === "ok") return;
    } catch {
      // Retry until the bounded local deadline.
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`TestHistory API is not ready at ${baseUrl}`);
}

async function getJson(baseUrl, path) {
  return responseJson(await fetch(`${baseUrl}${path}`), "GET", path);
}

async function postJson(baseUrl, path, body) {
  return responseJson(
    await fetch(`${baseUrl}${path}`, {
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
      method: "POST"
    }),
    "POST",
    path
  );
}

async function responseJson(response, method, path) {
  const text = await response.text();
  if (!response.ok) throw new Error(`${method} ${path} returned ${response.status}: ${text}`);
  return text === "" ? undefined : JSON.parse(text);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    console.log(JSON.stringify(await seedLocalNestedSteps(), null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
