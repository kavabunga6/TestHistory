import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const baseUrl = (process.env.TESTHISTORY_API_URL ?? "http://127.0.0.1:18080").replace(/\/$/, "");
const outputDir =
  process.env.TESTHISTORY_HISTORY_ALLURE_DIR ??
  path.join(process.cwd(), ".tmp", "history-allure-results");

const runId = process.env.TESTHISTORY_SYNTHETIC_RUN_ID ?? String(Date.now());
const projectKey = process.env.TESTHISTORY_SYNTHETIC_PROJECT_KEY ?? `HIST-SYNTHETIC-${runId}`;
const projectName = "Synthetic Android History Demo";
const launchCount = 10;
const baseStart = Date.UTC(2026, 4, 21, 9, 0, 0);
const branchByLaunch = ["develop", "develop", "release/2026.05", "develop", "main"];
const deviceByLaunch = ["Pixel 8", "Galaxy S24", "Pixel Tablet", "Moto G Power"];

const cases = [
  {
    id: "case-auth-login",
    allureId: "4613",
    historyId: "synthetic.android.auth.login.demo-credential",
    fullName: "synthetic.android.auth.LoginTest.loginWithDemoCredential",
    name: "Synthetic login with demo credential",
    owner: "Synthetic Auth Team",
    severity: "critical",
    layer: "UI",
    tags: ["synthetic", "smoke", "auth", "android"],
    customFields: {
      Epic: "Synthetic Authentication",
      Feature: "Login",
      Priority: "P0",
      Component: "Auth"
    },
    issue: "SYN-AUTH-912",
    testKey: "SYN-AUTH-TC-4613",
    statuses: [
      "failed",
      "passed",
      "passed",
      "failed",
      "passed",
      "broken",
      "passed",
      "passed",
      "skipped",
      "passed"
    ]
  },
  {
    id: "case-checkout-payment",
    allureId: "4821",
    historyId: "synthetic.android.checkout.saved-card",
    fullName: "synthetic.android.checkout.PaymentTest.savedCard",
    name: "Synthetic saved-card checkout",
    owner: "Synthetic Checkout Team",
    severity: "critical",
    layer: "E2E",
    tags: ["synthetic", "checkout", "payment", "regression", "android"],
    customFields: {
      Epic: "Synthetic Payments",
      Feature: "Saved card",
      Priority: "P0",
      Component: "Checkout"
    },
    issue: "SYN-PAY-1042",
    testKey: "SYN-PAY-TC-4821",
    statuses: [
      "passed",
      "passed",
      "failed",
      "passed",
      "passed",
      "passed",
      "failed",
      "passed",
      "passed",
      "passed"
    ]
  },
  {
    id: "case-profile-avatar",
    allureId: "4890",
    historyId: "synthetic.android.profile.avatar-upload",
    fullName: "synthetic.android.profile.ProfileTest.avatarUpload",
    name: "Synthetic profile avatar upload",
    owner: "Synthetic Profile Team",
    severity: "normal",
    layer: "UI",
    tags: ["synthetic", "profile", "media", "android"],
    customFields: {
      Epic: "Synthetic Profile",
      Feature: "Avatar",
      Priority: "P1",
      Component: "Accounts"
    },
    issue: "SYN-ACC-203",
    testKey: "SYN-ACC-TC-4890",
    statuses: [
      "broken",
      "broken",
      "passed",
      "passed",
      "passed",
      "passed",
      "passed",
      "failed",
      "passed",
      "passed"
    ]
  },
  {
    id: "case-catalog-search",
    allureId: "5012",
    historyId: "synthetic.android.catalog.search",
    fullName: "synthetic.android.catalog.SearchTest.findMovie",
    name: "Synthetic catalog search",
    owner: "Synthetic Catalog Team",
    severity: "normal",
    layer: "UI",
    tags: ["synthetic", "catalog", "search", "regression", "android"],
    customFields: {
      Epic: "Synthetic Catalog",
      Feature: "Search",
      Priority: "P1",
      Component: "Discovery"
    },
    issue: "",
    testKey: "SYN-CAT-TC-5012",
    statuses: [
      "passed",
      "passed",
      "passed",
      "passed",
      "passed",
      "passed",
      "passed",
      "passed",
      "passed",
      "passed"
    ]
  },
  {
    id: "case-report-export",
    allureId: "5105",
    historyId: "synthetic.android.analytics.export-csv",
    fullName: "synthetic.android.analytics.ReportTest.exportCsv",
    name: "Synthetic analytics CSV export",
    owner: "Synthetic Analytics Team",
    severity: "minor",
    layer: "API",
    tags: ["synthetic", "analytics", "export", "android"],
    customFields: {
      Epic: "Synthetic Analytics",
      Feature: "Export",
      Priority: "P2",
      Component: "Reports"
    },
    issue: "SYN-ANL-77",
    testKey: "SYN-ANL-TC-5105",
    statuses: [
      "skipped",
      "skipped",
      "passed",
      "failed",
      "passed",
      "passed",
      "skipped",
      "passed",
      "passed",
      "passed"
    ]
  },
  {
    id: "case-api-contract",
    allureId: "5230",
    historyId: "synthetic.android.api.launch-contract",
    fullName: "synthetic.android.api.ContractTest.launchSchema",
    name: "Synthetic launch API contract",
    owner: "Synthetic Platform Team",
    severity: "normal",
    layer: "API",
    tags: ["synthetic", "api", "contract", "platform"],
    customFields: {
      Epic: "Synthetic Platform",
      Feature: "Launch API",
      Priority: "P1",
      Component: "API"
    },
    issue: "",
    testKey: "SYN-API-TC-5230",
    statuses: [
      "passed",
      "passed",
      "passed",
      "passed",
      "broken",
      "passed",
      "passed",
      "passed",
      "passed",
      "passed"
    ]
  }
];

assertSyntheticSeedShape();

await mkdir(outputDir, { recursive: true });
await waitForApi();

const project = await postJson("/api/v1/projects", { key: projectKey, name: projectName });
const launchSummaries = [];

for (let launchIndex = 0; launchIndex < launchCount; launchIndex += 1) {
  const launchStartedAt = baseStart + launchIndex * 24 * 60 * 60 * 1000;
  const launchName = `${launchIndex % 2 === 0 ? "Synthetic nightly" : "Synthetic validation"} #${29230 + launchIndex}`;
  const includedCases = cases.filter((_, caseIndex) => (launchIndex + caseIndex) % 5 !== 3);
  const files = buildLaunchFiles(includedCases, launchIndex, launchStartedAt);
  const launchDir = path.join(outputDir, `launch-${String(launchIndex + 1).padStart(2, "0")}`);
  const branch = branchByLaunch[launchIndex % branchByLaunch.length];

  await mkdir(launchDir, { recursive: true });
  await Promise.all(
    files.map((file) => writeFile(path.join(launchDir, file.path), file.content, "utf8"))
  );

  const launch = await postJson(`/api/v1/projects/${project.id}/launches`, {
    name: launchName,
    branch,
    buildNumber: `synthetic-history-${launchIndex + 1}`,
    commitSha: `synthetic-demo-${String(launchIndex + 1).padStart(2, "0")}`
  });
  const upload = await postJson(`/api/v1/launches/${launch.id}/results/json`, { files });
  const closed = await postJson(`/api/v1/launches/${launch.id}/close`, {});
  const details = await getJson(`/api/v1/launches/${launch.id}`);

  launchSummaries.push({
    id: launch.id,
    name: launchName,
    status: closed.status,
    importedResults: upload.job?.importedResults,
    storedArtifacts: upload.job?.storedArtifacts,
    counters: details.counters
  });
}

console.log(
  JSON.stringify(
    {
      synthetic: true,
      outputDir,
      projectId: project.id,
      projectKey,
      projectName,
      stableIdentityFields: ["testCaseId", "historyId"],
      launchCount: launchSummaries.length,
      launches: launchSummaries
    },
    null,
    2
  )
);

function buildLaunchFiles(includedCases, launchIndex, launchStartedAt) {
  const files = [];
  for (const [caseIndex, testCase] of includedCases.entries()) {
    const status = testCase.statuses[launchIndex] ?? "passed";
    const started = launchStartedAt + caseIndex * 75_000;
    const duration = status === "skipped" ? 0 : 900 + caseIndex * 250 + launchIndex * 35;
    const attachments = buildAttachments(testCase, status, launchIndex);
    const steps = buildSteps(testCase, status, launchIndex, started);
    const branch = branchByLaunch[launchIndex % branchByLaunch.length];
    const result = {
      uuid: `${testCase.id}-run-${String(launchIndex + 1).padStart(2, "0")}`,
      historyId: testCase.historyId,
      testCaseId: testCase.id,
      name: testCase.name,
      fullName: testCase.fullName,
      stage: "finished",
      status,
      start: started,
      stop: started + duration,
      description: `Synthetic-only history seed result for ${testCase.name}. This fixture contains demo validation data only.`,
      ...(status === "failed" || status === "broken"
        ? { statusDetails: buildStatusDetails(testCase, status) }
        : {}),
      labels: [
        { name: "package", value: testCase.fullName.split(".").slice(0, -1).join(".") },
        { name: "suite", value: testCase.fullName.split(".").slice(-2, -1)[0] ?? "SyntheticSuite" },
        { name: "owner", value: testCase.owner },
        { name: "severity", value: testCase.severity },
        { name: "layer", value: testCase.layer },
        { name: "allure_id", value: testCase.allureId },
        { name: "synthetic_seed", value: "history-demo-v1" },
        ...testCase.tags.map((value) => ({ name: "tag", value })),
        ...Object.entries(testCase.customFields).map(([name, value]) => ({
          name: `custom_field:${name}`,
          value
        })),
        ...(testCase.issue ? [{ name: "issue", value: testCase.issue }] : []),
        { name: "tms", value: testCase.testKey },
        { name: "member", value: testCase.owner }
      ],
      links: [
        {
          name: testCase.testKey,
          type: "tms",
          url: `https://example.invalid/testhistory/tests/${testCase.testKey}`
        },
        {
          name: "Synthetic runbook",
          type: "custom",
          url: "https://example.invalid/testhistory/synthetic-history-seed"
        },
        ...(testCase.issue
          ? [
              {
                name: testCase.issue,
                type: "issue",
                url: `https://example.invalid/testhistory/issues/${testCase.issue}`
              }
            ]
          : [])
      ],
      parameters: [
        { name: "device", value: deviceByLaunch[launchIndex % deviceByLaunch.length] },
        { name: "os", value: "Android Synthetic 15" },
        { name: "branch", value: branch },
        {
          name: "demoCredentialProfile",
          value: "[synthetic-redacted]",
          mode: "masked",
          excluded: true
        }
      ],
      attachments: attachments.map(toAllureAttachment),
      steps
    };

    files.push({ path: `${result.uuid}-result.json`, content: JSON.stringify(result, null, 2) });
    collectAttachmentFiles(files, attachments);
    collectStepAttachmentFiles(files, steps);
  }

  files.push({
    path: "environment.properties",
    content: `Dataset=synthetic\nDevice=${deviceByLaunch[launchIndex % deviceByLaunch.length]}\nRun=${launchIndex + 1}\n`
  });
  files.push({
    path: "executor.json",
    content: JSON.stringify(
      { name: "TestHistory synthetic history seed", type: "local", buildName: "synthetic-demo" },
      null,
      2
    )
  });
  return files;
}

function buildStatusDetails(testCase, status) {
  return {
    message:
      status === "failed"
        ? `Synthetic assertion mismatch for ${testCase.name}`
        : `Synthetic infrastructure interruption for ${testCase.name}`,
    trace: `${status === "failed" ? "AssertionError" : "RuntimeError"}: synthetic ${status}\n    at ${testCase.fullName}`
  };
}

function buildSteps(testCase, status, launchIndex, baseStepStart) {
  const middleStatus = status === "broken" ? "broken" : status === "failed" ? "failed" : "passed";
  const finalStatus = status === "skipped" ? "skipped" : status === "passed" ? "passed" : "skipped";
  return [
    step("Prepare synthetic test data", "passed", baseStepStart, 120 + launchIndex * 5, [
      step("Open synthetic application shell", "passed", baseStepStart + 10, 80),
      step("Select synthetic account profile", "passed", baseStepStart + 95, 140)
    ]),
    step(
      `Run scenario: ${testCase.name}`,
      middleStatus,
      baseStepStart + 250,
      520 + launchIndex * 20,
      [
        step("Navigate to target screen", "passed", baseStepStart + 270, 110),
        step(
          "Execute primary synthetic action",
          middleStatus,
          baseStepStart + 390,
          260,
          [],
          middleStatus === "passed"
            ? []
            : [
                textAttachment(
                  `${testCase.id}-step-${launchIndex + 1}.log`,
                  "synthetic step diagnostic\n"
                )
              ]
        )
      ]
    ),
    step(
      "Verify synthetic outcome",
      finalStatus,
      baseStepStart + 850,
      finalStatus === "skipped" ? 0 : 240
    )
  ];
}

function buildAttachments(testCase, status, launchIndex) {
  const base = [
    textAttachment(
      `${testCase.id}-console-${launchIndex + 1}.log`,
      `[synthetic]\ncase=${testCase.id}\nstatus=${status}\n`
    ),
    jsonAttachment(`${testCase.id}-metadata-${launchIndex + 1}.json`, {
      synthetic: true,
      testCaseId: testCase.id,
      historyId: testCase.historyId,
      run: launchIndex + 1,
      status
    }),
    htmlAttachment(
      `${testCase.id}-summary-${launchIndex + 1}.html`,
      `<html><body><h1>Synthetic result</h1><p>${testCase.id} ${status}</p></body></html>`
    )
  ];
  if (status === "failed" || status === "broken") {
    base.push(pngAttachment(`${testCase.id}-screen-${launchIndex + 1}.png`));
    base.push(
      xmlAttachment(
        `${testCase.id}-device-${launchIndex + 1}.xml`,
        `<device synthetic="true" status="${status}" />`
      )
    );
  }
  return base;
}

function step(name, status, start, duration, steps = [], attachments = []) {
  return {
    name,
    status,
    stage: "finished",
    start,
    stop: start + duration,
    attachments: attachments.map(toAllureAttachment),
    steps
  };
}

function toAllureAttachment(attachment) {
  return {
    name: attachment.name,
    type: attachment.type,
    source: attachment.source,
    ...(attachment.content !== undefined ? { content: attachment.content } : {})
  };
}

function textAttachment(source, content) {
  return { name: source, source, type: "text/plain", content };
}

function jsonAttachment(source, value) {
  return {
    name: source,
    source,
    type: "application/json",
    content: JSON.stringify(value, null, 2)
  };
}

function htmlAttachment(source, content) {
  return { name: source, source, type: "text/html", content };
}

function xmlAttachment(source, content) {
  return { name: source, source, type: "application/xml", content };
}

function pngAttachment(source) {
  return {
    name: source,
    source,
    type: "image/png",
    content:
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII="
  };
}

function collectAttachmentFiles(files, attachments) {
  for (const attachment of attachments) {
    if (attachment.content !== undefined) {
      files.push({ path: attachment.source, content: attachment.content });
    }
  }
}

function collectStepAttachmentFiles(files, steps) {
  for (const item of steps) {
    collectAttachmentFiles(files, item.attachments ?? []);
    collectStepAttachmentFiles(files, item.steps ?? []);
  }
}

function assertSyntheticSeedShape() {
  if (launchCount !== 10) {
    throw new Error("Synthetic history seed must create exactly 10 launches.");
  }

  const statuses = new Set(cases.flatMap((testCase) => testCase.statuses));
  for (const status of ["passed", "failed", "broken", "skipped"]) {
    if (!statuses.has(status)) {
      throw new Error(`Synthetic history seed is missing status ${status}.`);
    }
  }

  const identityPairs = new Set();
  for (const testCase of cases) {
    if (!testCase.id.startsWith("case-") || !testCase.historyId.startsWith("synthetic.")) {
      throw new Error(`Synthetic identity is not explicit for ${testCase.id}.`);
    }
    if (testCase.statuses.length !== launchCount) {
      throw new Error(`${testCase.id} must define ${launchCount} status samples.`);
    }
    const identityPair = `${testCase.id}:${testCase.historyId}`;
    if (identityPairs.has(identityPair)) {
      throw new Error(`Duplicate synthetic identity ${identityPair}.`);
    }
    identityPairs.add(identityPair);
  }
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
