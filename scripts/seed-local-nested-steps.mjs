const baseUrl = (process.env.TESTHISTORY_API_URL ?? "http://127.0.0.1:18080").replace(/\/$/, "");
const launchName = "Nested steps UI fixture v3";
const baseStart = Date.UTC(2026, 7, 9, 8, 0, 0);

await waitForApi();

const projects = await getJson("/api/v1/projects");
const project =
  projects[0] ?? (await postJson("/api/v1/projects", { key: "WS", name: "Web Sandbox" }));
const launchesPayload = await getJson(
  `/api/v1/projects/${encodeURIComponent(project.id)}/launches?limit=100`
);
const launches = Array.isArray(launchesPayload) ? launchesPayload : (launchesPayload.items ?? []);
const existing = launches.find((launch) => launch.name === launchName);

if (existing !== undefined) {
  console.log(
    JSON.stringify(
      { created: false, launchId: existing.id, launchName, projectId: project.id },
      null,
      2
    )
  );
} else {
  const fixtures = buildFixtures();
  assertFixtureShape(fixtures.results, fixtures.files);
  const launch = await postJson(`/api/v1/projects/${project.id}/launches`, {
    branch: "develop",
    buildNumber: "nested-steps-v1",
    commitSha: "synthetic-nested-steps-v1",
    name: launchName
  });
  const upload = await postJson(`/api/v1/launches/${launch.id}/results/json`, {
    files: fixtures.files
  });
  await postJson(`/api/v1/launches/${launch.id}/close`, {});
  console.log(
    JSON.stringify(
      {
        created: true,
        importedResults: upload.job?.importedResults,
        launchId: launch.id,
        launchName,
        projectId: project.id,
        resultNames: fixtures.results.map((result) => result.name)
      },
      null,
      2
    )
  );
}

function buildFixtures() {
  const files = [];
  const definitions = [
    {
      id: "nested-passed",
      name: "deep nested steps are collapsed when successful",
      status: "passed"
    },
    { id: "nested-failed", name: "deep failed step expands its parent chain", status: "failed" },
    {
      id: "nested-broken",
      name: "deep broken step exposes diagnostic attachments",
      status: "broken"
    }
  ];
  const results = definitions.map((definition, index) => {
    const start = baseStart + index * 10_000;
    const steps = buildDeepSteps(definition, start, files);
    const result = {
      description:
        "Synthetic UI fixture with a five-level scenario tree and attachments on levels three and four.",
      fullName: `com.testhistory.synthetic.NestedStepsTest.${definition.id}`,
      historyId: `synthetic.nested-steps.${definition.id}`,
      labels: [
        { name: "suite", value: "NestedStepsTest" },
        { name: "owner", value: "UI Platform" },
        { name: "severity", value: "normal" },
        { name: "layer", value: "E2E" },
        { name: "tag", value: "nested-steps" },
        { name: "tag", value: "deep-tree" },
        { name: "allure_id", value: `NESTED-${index + 1}` }
      ],
      name: definition.name,
      stage: "finished",
      start,
      status: definition.status,
      steps,
      stop: start + 1_250,
      testCaseId: `synthetic-${definition.id}`,
      uuid: `synthetic-${definition.id}-result-v1`,
      ...(definition.status === "passed"
        ? {}
        : {
            statusDetails: {
              message: `Synthetic ${definition.status} assertion at scenario level five`,
              trace: `Synthetic${definition.status === "failed" ? "Assertion" : "Runtime"}Error: nested level five`
            }
          })
    };
    files.push({ path: `${result.uuid}-result.json`, content: JSON.stringify(result, null, 2) });
    return result;
  });
  files.push({ path: "environment.properties", content: "Fixture=nested-steps-v1\nDepth=5\n" });
  return { files, results };
}

function buildDeepSteps(definition, start, files) {
  const thirdLevelSource = `${definition.id}-level-3.json`;
  const fourthLevelSource = `${definition.id}-level-4.log`;
  const fourthLevelXmlSource = `${definition.id}-level-4.xml`;
  files.push({
    path: thirdLevelSource,
    content: JSON.stringify({ fixture: true, level: 3, result: definition.id }, null, 2)
  });
  files.push({
    path: fourthLevelSource,
    content: [
      "Synthetic nested-step diagnostic",
      "token=synthetic-preview-secret",
      "level=4",
      `result=${definition.id}`,
      ...Array.from(
        { length: 2_500 },
        (_, index) =>
          `diagnostic line ${String(index + 1).padStart(4, "0")}: bounded preview fixture`
      )
    ].join("\n")
  });
  files.push({
    path: fourthLevelXmlSource,
    content: `<diagnostic level="4"><result>${definition.id}</result><status>${definition.status}</status></diagnostic>`
  });

  const branchStatus = definition.status;
  return [
    step("Prepare isolated test data", "passed", start, 100),
    step("Execute nested checkout scenario", branchStatus, start + 100, 1_100, [
      step("Open checkout workflow", branchStatus, start + 120, 1_000, [
        step(
          "Build order request",
          branchStatus,
          start + 150,
          900,
          [
            step(
              "Submit order to backend",
              branchStatus,
              start + 190,
              760,
              [
                step(
                  definition.status === "passed"
                    ? "Verify successful order response"
                    : `Trigger synthetic ${definition.status} at level five`,
                  definition.status,
                  start + 240,
                  500
                )
              ],
              [
                attachment("Level 4 execution log", "text/plain", fourthLevelSource),
                attachment("Level 4 diagnostic XML", "application/xml", fourthLevelXmlSource)
              ]
            )
          ],
          [attachment("Level 3 request payload", "application/json", thirdLevelSource)]
        )
      ])
    ])
  ];
}

function step(name, status, start, duration, steps = [], attachments = []) {
  return { attachments, name, stage: "finished", start, status, steps, stop: start + duration };
}

function attachment(name, type, source) {
  return { name, source, type };
}

function assertFixtureShape(results, files) {
  for (const result of results) {
    const measurements = [];
    visitSteps(result.steps, 1, measurements);
    const maxDepth = Math.max(...measurements.map((item) => item.depth));
    const attachmentDepths = measurements
      .filter((item) => item.attachments > 0)
      .map((item) => item.depth);
    if (maxDepth !== 5) throw new Error(`${result.name} must have exactly five step levels`);
    if (!attachmentDepths.includes(3) || !attachmentDepths.includes(4)) {
      throw new Error(`${result.name} must have attachments on levels three and four`);
    }
  }
  const largeLogs = files.filter((file) => file.path.endsWith(".log"));
  if (
    largeLogs.length !== results.length ||
    largeLogs.some((file) => Buffer.byteLength(file.content, "utf8") <= 32 * 1024)
  ) {
    throw new Error("Each nested step fixture must include a large text attachment");
  }
}

function visitSteps(steps, depth, measurements) {
  for (const current of steps) {
    measurements.push({ attachments: current.attachments?.length ?? 0, depth });
    visitSteps(current.steps ?? [], depth + 1, measurements);
  }
}

async function waitForApi() {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try {
      if ((await getJson("/health")).status === "ok") return;
    } catch {
      // Retry until the bounded local deadline.
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`TestHistory API is not ready at ${baseUrl}`);
}

async function getJson(path) {
  return responseJson(await fetch(`${baseUrl}${path}`), "GET", path);
}

async function postJson(path, body) {
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
