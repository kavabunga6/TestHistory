import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const baseUrl = (process.env.TESTHISTORY_API_URL ?? "http://127.0.0.1:18080").replace(/\/$/, "");
const outputDir =
  process.env.TESTHISTORY_SYNTHETIC_ALLURE_DIR ??
  path.join(process.cwd(), ".tmp", "testhistory-synthetic-allure-results");

const now = Date.now();
const projectKey = `SYNTH-HISTORY-${now}`;
const projectName = "Synthetic history seed";
const launchPrefix = "Synthetic Allure history";

import { caseCatalog, launchPlans } from "./seed-synthetic-allure-data.mjs";
if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  await main();
}

async function main() {
  await mkdir(outputDir, { recursive: true });
  await waitForApi();

  const project = await postJson("/api/v1/projects", {
    key: projectKey,
    name: projectName
  });

  const launchSummaries = [];
  for (let launchIndex = 0; launchIndex < launchPlans.length; launchIndex += 1) {
    const plan = launchPlans[launchIndex];
    const launchName = `${launchPrefix} #${String(launchIndex + 1).padStart(2, "0")}`;
    const buildNumber = `synthetic-${String(launchIndex + 1).padStart(2, "0")}`;
    const fixtures = buildFixtures({ launchIndex, launchName });

    await writeFixtureFiles(fixtures.files);

    const launch = await postJson(`/api/v1/projects/${project.id}/launches`, {
      name: launchName,
      branch: plan.branch,
      buildNumber,
      commitSha: `synthetic-${String(launchIndex + 1).padStart(2, "0")}`
    });
    const uploadBatches = buildUploadBatches(fixtures.files);
    let importedResults = 0;
    let storedArtifacts = 0;
    for (const batch of uploadBatches) {
      const upload = await postJson(`/api/v1/launches/${launch.id}/results/json`, {
        files: batch
      });
      if ((upload.job?.errors?.length ?? 0) > 0) {
        throw new Error(
          `Synthetic upload failed for ${launchName}: ${upload.job.errors.length} file errors`
        );
      }
      importedResults += upload.job?.importedResults ?? 0;
      storedArtifacts += upload.job?.storedArtifacts ?? 0;
    }
    if (importedResults !== plan.cases.length) {
      throw new Error(
        `Synthetic upload imported ${importedResults} of ${plan.cases.length} results for ${launchName}`
      );
    }
    const closedLaunch = await postJson(`/api/v1/launches/${launch.id}/close`, {});
    const details = await getJson(`/api/v1/launches/${launch.id}`);

    launchSummaries.push({
      launchId: launch.id,
      launchName,
      branch: plan.branch,
      buildNumber,
      uploadBatches: uploadBatches.length,
      importedResults,
      storedArtifacts,
      status: closedLaunch.status,
      counters: details.counters,
      resultNames: details.results.map((result) => `${result.status}: ${result.name}`)
    });
  }

  console.log(
    JSON.stringify(
      {
        outputDir,
        projectId: project.id,
        projectKey,
        projectName,
        launchCount: launchSummaries.length,
        launches: launchSummaries
      },
      null,
      2
    )
  );
}

async function writeFixtureFiles(files) {
  const directories = new Set(files.map((file) => path.dirname(path.join(outputDir, file.path))));
  await Promise.all([...directories].map((directory) => mkdir(directory, { recursive: true })));
  for (let offset = 0; offset < files.length; offset += 32) {
    await Promise.all(
      files
        .slice(offset, offset + 32)
        .map((file) =>
          writeFile(
            path.join(outputDir, file.path),
            file.contentEncoding === "base64" ? Buffer.from(file.content, "base64") : file.content
          )
        )
    );
  }
}

export function buildFixtures({ launchIndex, launchName }) {
  const plan = launchPlans[launchIndex];
  const baseStart = now - (launchPlans.length - launchIndex) * 86_400_000;
  const files = [];
  const casesById = new Map(caseCatalog.map((testCase) => [testCase.id, testCase]));

  for (const [caseIndex, caseId] of plan.cases.entries()) {
    const testCase = casesById.get(caseId);
    if (!testCase) {
      throw new Error(`Unknown synthetic case id: ${caseId}`);
    }

    const status = testCase.statuses[launchIndex];
    const duration = Math.max(4_200, testCase.baseDuration + launchIndex * 87 + caseIndex * 53);
    const start = baseStart + caseIndex * 45_000;
    const runId = `launch-${String(launchIndex + 1).padStart(2, "0")}-${testCase.id}`;
    const attachments = buildAttachments(testCase, status, runId);
    const steps = buildSteps(testCase, status, start, runId);
    const result = {
      uuid: `synthetic-${runId}`,
      historyId: `synthetic.${testCase.id}`,
      testCaseId: testCase.testCaseId,
      name: testCase.name,
      fullName: testCase.fullName,
      stage: "finished",
      status,
      ...(status !== "passed" ? { statusDetails: statusDetails(testCase, status) } : {}),
      start,
      stop: start + duration,
      description: `Synthetic Allure result for ${testCase.feature}. Contains stable identity, labels, links, nested steps, and safe generated attachments.`,
      labels: labelsFor(testCase, status, launchIndex),
      links: linksFor(testCase),
      parameters: [
        { name: "browser", value: testCase.layer === "mobile" ? "Mobile WebView" : "Chromium" },
        { name: "environment", value: "synthetic" },
        { name: "dataset", value: `history-seed-${String(launchIndex + 1).padStart(2, "0")}` },
        { name: "region", value: launchIndex % 2 === 0 ? "eu-test" : "us-test" }
      ],
      attachments: attachments.map(toAllureAttachment),
      steps: toAllureSteps(steps)
    };

    files.push({
      path: `${runId}/${result.uuid}-result.json`,
      content: JSON.stringify(result, null, 2)
    });
    collectAttachmentFiles(files, attachments, runId);
    collectStepAttachmentFiles(files, steps);
  }

  files.push({
    path: `launch-${String(launchIndex + 1).padStart(2, "0")}/environment.properties`,
    content: [
      "Environment=synthetic",
      `Branch=${plan.branch}`,
      `Launch=${launchName}`,
      "ContainsSensitiveData=false"
    ].join("\n")
  });
  files.push({
    path: `launch-${String(launchIndex + 1).padStart(2, "0")}/executor.json`,
    content: JSON.stringify(
      {
        name: "TestHistory synthetic seed",
        type: "local",
        buildName: launchName,
        reportName: "Synthetic Allure history seed"
      },
      null,
      2
    )
  });

  return { files };
}

export function buildUploadBatches(files) {
  const maxResultsPerBatch = 20;
  const maxBodyBytes = 512 * 1024;
  const resultFiles = files.filter((file) => file.path.endsWith("-result.json"));
  const claimed = new Set();
  const batches = [];
  let current = [];
  let resultCount = 0;

  for (const resultFile of resultFiles) {
    const directory = `${path.dirname(resultFile.path)}/`;
    const group = files.filter((file) => file.path.startsWith(directory));
    group.forEach((file) => claimed.add(file.path));
    if (bodyBytes(group) > maxBodyBytes) {
      throw new Error(`Synthetic result ${resultFile.path} exceeds the upload batch limit`);
    }
    if (
      current.length > 0 &&
      (resultCount === maxResultsPerBatch || bodyBytes([...current, ...group]) > maxBodyBytes)
    ) {
      batches.push(current);
      current = [];
      resultCount = 0;
    }
    current.push(...group);
    resultCount += 1;
  }

  const remaining = files.filter((file) => !claimed.has(file.path));
  if (remaining.length > 0) {
    if (bodyBytes(remaining) > maxBodyBytes) {
      throw new Error("Synthetic launch metadata exceeds the upload batch limit");
    }
    if (current.length > 0 && bodyBytes([...current, ...remaining]) > maxBodyBytes) {
      batches.push(current);
      current = [];
    }
    current.push(...remaining);
  }
  if (current.length > 0) {
    batches.push(current);
  }
  return batches;
}

function bodyBytes(files) {
  return Buffer.byteLength(JSON.stringify({ files }), "utf8");
}

function labelsFor(testCase, status, launchIndex) {
  return [
    { name: "package", value: testCase.fullName.split(".").slice(0, -1).join(".") },
    { name: "suite", value: "Synthetic Allure History" },
    { name: "parentSuite", value: testCase.feature },
    { name: "subSuite", value: testCase.story },
    { name: "owner", value: testCase.owner },
    { name: "member", value: testCase.owner },
    { name: "severity", value: testCase.severity },
    { name: "layer", value: testCase.layer },
    { name: "feature", value: testCase.feature },
    { name: "story", value: testCase.story },
    { name: "scenario", value: testCase.scenario },
    { name: "tms", value: testCase.tms },
    { name: "testKey", value: testCase.testKey },
    { name: "issue", value: testCase.issue },
    { name: "custom_field:component", value: testCase.component },
    { name: "custom_field:service", value: testCase.service },
    { name: "custom_field:risk", value: riskFor(testCase.severity) },
    { name: "custom_field:synthetic_wave", value: `wave-${Math.floor(launchIndex / 2) + 1}` },
    { name: "tag", value: "synthetic" },
    { name: "tag", value: "history-seed" },
    { name: "tag", value: status },
    ...testCase.tags.map((tag) => ({ name: "tag", value: tag }))
  ];
}

function linksFor(testCase) {
  const linkBuilders = {
    issue: () => ({
      name: testCase.issue,
      type: "issue",
      url: `https://tracker.example.test/issues/${testCase.issue}`
    }),
    runbook: () => ({
      name: `${testCase.component} runbook`,
      type: "runbook",
      url: `https://docs.example.test/runbooks/${testCase.component}`
    }),
    spec: () => ({
      name: `${testCase.testKey} spec`,
      type: "spec",
      url: `https://docs.example.test/specs/${testCase.testKey}`
    }),
    story: () => ({
      name: `${testCase.feature} story`,
      type: "story",
      url: `https://tracker.example.test/stories/${testCase.component}`
    }),
    tms: () => ({
      name: testCase.tms,
      type: "tms",
      url: `https://tms.example.test/cases/${testCase.tms}`
    })
  };
  return testCase.links.map((type) => linkBuilders[type]());
}

function buildSteps(testCase, status, start, runId) {
  const outcomeStatus = status;
  return [
    step("Prepare synthetic preconditions", "passed", start + 100, 270, [
      step("Create generated fixture data", "passed", start + 140, 90),
      step("Select test profile", "passed", start + 240, 90)
    ]),
    step("Execute user journey", outcomeStatus, start + 420, 2_500, [
      step("Open target surface", "passed", start + 500, 160),
      step("Submit primary action", outcomeStatus, start + 720, 2_050, [
        step(
          "Build request and context",
          outcomeStatus,
          start + 830,
          1_800,
          [
            step(
              "Apply service response",
              outcomeStatus,
              start + 960,
              1_520,
              [
                step(
                  status === "skipped"
                    ? "Confirm feature flag is disabled"
                    : "Assert expected outcome",
                  outcomeStatus,
                  start + 1_120,
                  1_150,
                  [],
                  [
                    textAttachment(
                      `${runId}/level-5-assertion.log`,
                      `status=${status}\ncase=${testCase.id}\nfeature=${testCase.feature}\n`
                    ),
                    ...(status === "failed" || status === "broken"
                      ? [pngAttachment(`${runId}/level-5-screen.png`)]
                      : [])
                  ]
                )
              ],
              [
                textAttachment(
                  `${runId}/level-4-response.log`,
                  `synthetic_response=${status}\ncomponent=${testCase.component}\n`
                )
              ]
            )
          ],
          [
            jsonAttachment(`${runId}/level-3-request.json`, {
              caseId: testCase.id,
              scenario: testCase.scenario,
              synthetic: true
            })
          ]
        )
      ])
    ]),
    step(
      "Collect diagnostics",
      "passed",
      start + 3_100,
      450,
      [],
      [
        jsonAttachment(`${runId}/step-diagnostics.json`, {
          synthetic: true,
          component: testCase.component,
          status
        })
      ]
    )
  ];
}

function step(name, status, start, duration, steps = [], attachments = []) {
  return {
    name,
    status,
    stage: "finished",
    start,
    stop: start + duration,
    attachments,
    steps
  };
}

function toAllureSteps(steps) {
  return steps.map(({ attachments, steps: children, ...other }) => ({
    ...other,
    attachments: attachments.map(toAllureAttachment),
    steps: toAllureSteps(children)
  }));
}

function buildAttachments(testCase, status, runId) {
  return [
    textAttachment(
      `${runId}/console.log`,
      [
        `case=${testCase.id}`,
        `status=${status}`,
        "source=synthetic",
        "contains_sensitive_data=false"
      ].join("\n")
    ),
    jsonAttachment(`${runId}/network.json`, {
      synthetic: true,
      endpoint: `/synthetic/${testCase.component}/${testCase.scenario}`,
      statusCode: status === "failed" ? 422 : 200,
      testKey: testCase.testKey
    }),
    htmlAttachment(
      `${runId}/page.html`,
      `<main><h1>${escapeHtml(testCase.feature)}</h1><p>${escapeHtml(testCase.name)}</p></main>`
    ),
    ...(testCase.layer === "mobile"
      ? [
          xmlAttachment(
            `${runId}/device.xml`,
            `<device scenario="${escapeHtml(testCase.scenario)}" />`
          )
        ]
      : []),
    ...(testCase.component === "reports"
      ? [csvAttachment(`${runId}/report.csv`, "metric,value\nsynthetic,1\n")]
      : []),
    ...(status === "failed" || status === "broken" ? [pngAttachment(`${runId}/screen.png`)] : [])
  ];
}

function statusDetails(testCase, status) {
  if (status === "failed") {
    return {
      message: `Synthetic assertion failed for ${testCase.testKey}`,
      trace: `AssertionError: expected ${testCase.component} confirmation to be visible\n    at ${testCase.fullName}`
    };
  }
  if (status === "broken") {
    return {
      message: `Synthetic infrastructure interruption for ${testCase.testKey}`,
      trace: `RuntimeError: generated dependency was unavailable\n    at ${testCase.fullName}`
    };
  }
  return {
    message: `Synthetic skip for ${testCase.testKey}: feature is disabled in this launch`
  };
}

function riskFor(severity) {
  if (severity === "blocker" || severity === "critical") {
    return "high";
  }
  if (severity === "minor") {
    return "low";
  }
  return "medium";
}

function toAllureAttachment(attachment) {
  return {
    name: path.basename(attachment.source),
    type: attachment.type,
    source: attachment.source
  };
}

function textAttachment(source, content) {
  return { source, type: "text/plain", content };
}

function jsonAttachment(source, value) {
  return { source, type: "application/json", content: JSON.stringify(value, null, 2) };
}

function htmlAttachment(source, content) {
  return { source, type: "text/html", content };
}

function xmlAttachment(source, content) {
  return { source, type: "application/xml", content };
}

function csvAttachment(source, content) {
  return { source, type: "text/csv", content };
}

function pngAttachment(source) {
  return {
    source,
    type: "image/png",
    contentEncoding: "base64",
    content:
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII="
  };
}

function collectAttachmentFiles(files, attachments) {
  for (const attachment of attachments) {
    if (typeof attachment.content === "string") {
      files.push({
        path: attachment.source,
        content: attachment.content,
        ...(attachment.contentEncoding ? { contentEncoding: attachment.contentEncoding } : {})
      });
    }
  }
}

function collectStepAttachmentFiles(files, steps) {
  for (const item of steps) {
    collectAttachmentFiles(files, item.attachments ?? []);
    collectStepAttachmentFiles(files, item.steps ?? []);
  }
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

async function waitForApi() {
  const deadline = Date.now() + 15_000;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const health = await getJson("/health");
      if (health.status === "ok") {
        return;
      }
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(
    `API is not reachable at ${baseUrl}. Start it with: npm run dev -w @testhistory/api. Last error: ${lastError}`
  );
}

async function getJson(url) {
  const response = await fetch(`${baseUrl}${url}`);
  if (!response.ok) {
    throw new Error(`${url} returned ${response.status}: ${await response.text()}`);
  }
  return response.json();
}

async function postJson(url, body) {
  const response = await fetch(`${baseUrl}${url}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    throw new Error(`${url} returned ${response.status}: ${await response.text()}`);
  }
  return response.json();
}
