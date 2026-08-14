import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

let baseUrl = "";

export async function smokeApi(targetBaseUrl) {
  baseUrl = targetBaseUrl;
  await waitForEndpoint(`${baseUrl}/health`);
  await expectJson(`${baseUrl}/health`, { status: "ok" });
  await expectStatus(`${baseUrl}/docs`, 200);
  await expectJson(`${baseUrl}/api/v1/capabilities`, { apiVersion: "v1" });
  await smokeLaunchLifecycle();
}

const archiveMaterializedFixtureNames = [
  "corrupt",
  "empty",
  "denied",
  "partial",
  "duplicate",
  "retry"
];
const archiveMaterializedFixtureFalseFields = [
  "rawArchivePayloadsIncluded",
  "manifestEntriesIncluded",
  "resultFilesIncluded",
  "localPathsIncluded",
  "storageRefsIncluded",
  "signedUrlsIncluded",
  "tokensIncluded"
];
const archiveMaterializedFixtureExpectedSummary = {
  materializedRecordCount: 6,
  supportedFiles: 10,
  attachmentFiles: 3,
  ignoredFiles: 1,
  warningCount: 6,
  parseErrors: 1,
  attemptGroups: 4,
  retryAwareCount: 1,
  duplicateAwareCount: 1,
  deniedFixtureCount: 1,
  deterministic: true,
  projectScoped: true,
  readOnly: true,
  mutation: false,
  redactionPassed: true,
  mutationBoundary: "api-materialized-fixture-read-only-no-rest-or-worker-mutation"
};
const archiveMaterializedFixturePlannedOperations = [
  "archive_diagnostic.replay_fixture.contract_project",
  "archive_diagnostic.replay_fixture.materialized_read"
];

async function smokeLaunchLifecycle() {
  const project = await postJson(`${baseUrl}/api/v1/projects`, {
    key: `SMOKE-${Date.now()}`,
    name: "Smoke project"
  });
  const launch = await postJson(`${baseUrl}/api/v1/projects/${project.id}/launches`, {
    name: "Smoke launch",
    branch: "smoke",
    commitSha: "abc1234"
  });

  const upload = await postJson(`${baseUrl}/api/v1/launches/${launch.id}/results/json`, {
    files: [
      {
        path: "smoke-result.json",
        content: JSON.stringify({
          uuid: "smoke-result",
          testCaseId: "smoke-case",
          historyId: "smoke-history",
          name: "smoke test passes",
          status: "passed"
        })
      }
    ]
  });
  if (upload.job?.status !== "completed" || upload.launch?.counters?.passed !== 1) {
    throw new Error(`Unexpected upload response: ${JSON.stringify(upload)}`);
  }

  await smokeArchiveStatus(project.id);
  await smokeArchiveMaterializedFixtureRegression(project.id);

  const closedLaunch = await postJson(`${baseUrl}/api/v1/launches/${launch.id}/close`, {});
  if (closedLaunch.status !== "closed") {
    throw new Error(`Launch close returned ${closedLaunch.status}`);
  }

  const qualityGate = await getJson(`${baseUrl}/api/v1/launches/${launch.id}/quality-gate`);
  if (qualityGate.status !== "passed") {
    throw new Error(`Quality gate returned ${qualityGate.status}`);
  }
}

async function smokeArchiveStatus(projectId) {
  const launch = await postJson(`${baseUrl}/api/v1/projects/${projectId}/launches`, {
    name: "Smoke archive status launch",
    branch: "smoke",
    commitSha: "archive123"
  });
  const launchId = launch.id;

  const archiveIntake = await postJson(`${baseUrl}/api/v1/launches/${launchId}/uploads/archive`, {
    archiveName: "smoke-archive.zip",
    advertisedCompressedBytes: 128,
    entries: [
      { path: "smoke-archive-result.json", size: 120, compressedSizeBytes: 60 },
      { path: "attachments/smoke-archive-screen.png", size: 512, compressedSizeBytes: 120 },
      { path: "tmp/smoke-debug.bin", size: 8, compressedSizeBytes: 4 }
    ]
  });
  if (archiveIntake.kind !== "archive-upload-intake" || archiveIntake.accepted !== true) {
    throw new Error(`Unexpected archive intake response: ${JSON.stringify(archiveIntake)}`);
  }
  if (archiveIntake.processing?.storesArchivePayload !== false) {
    throw new Error(
      `Archive intake must not claim stored payloads: ${JSON.stringify(archiveIntake)}`
    );
  }

  const uploadId = archiveIntake.job?.id;
  if (!uploadId) {
    throw new Error(`Archive intake did not return a job id: ${JSON.stringify(archiveIntake)}`);
  }

  const list = await getJson(
    `${baseUrl}/api/v1/launches/${launchId}/uploads/archive/status?limit=1&diagnosticsLimit=1`
  );
  if (list.kind !== "archive-upload-status-list") {
    throw new Error(`Archive status list returned ${list.kind}`);
  }
  if (list.launch?.projectId !== projectId || list.launch?.id !== launchId) {
    throw new Error(`Archive status list escaped launch scope: ${JSON.stringify(list.launch)}`);
  }
  if (list.page?.limit !== 1 || list.page?.returned !== 1 || list.page?.total !== 1) {
    throw new Error(`Archive status list pagination drifted: ${JSON.stringify(list.page)}`);
  }
  if (list.items?.[0]?.id !== uploadId) {
    throw new Error(`Archive status list returned the wrong upload: ${JSON.stringify(list.items)}`);
  }

  const detail = await getJson(`${baseUrl}/api/v1/uploads/${uploadId}/archive/status?limit=1`);
  if (detail.kind !== "archive-upload-status" || detail.id !== uploadId) {
    throw new Error(`Archive status detail returned the wrong upload: ${JSON.stringify(detail)}`);
  }
  if (
    detail.archive?.storesArchivePayload !== false ||
    detail.archive?.payloadsAcceptedOnThisEndpoint !== false ||
    detail.worker?.payloadsAvailable !== false
  ) {
    throw new Error(
      `Archive status detail claims mutable payload access: ${JSON.stringify(detail)}`
    );
  }

  expectNoArchiveStatusLeakage({ archiveIntake, list, detail });
}

async function smokeArchiveMaterializedFixtureRegression(projectId) {
  const headers = {
    "X-TestHistory-Scopes": "uploads:read,launches:read",
    "X-TestHistory-Project-Scope": projectId,
    "X-TestHistory-Actor-Id": "archive-materialized-fixture-smoke"
  };
  const fixtures = await getJsonWithHeaders(
    `${baseUrl}/api/v1/projects/${projectId}/archive/diagnostics/replay/fixtures/materialized?limit=2`,
    headers
  );

  if (fixtures.kind !== "archive-diagnostic-replay-fixture-materialized-list") {
    throw new Error(`Materialized fixture read returned ${fixtures.kind}`);
  }
  if (fixtures.project?.id !== projectId || fixtures.project?.scoped !== true) {
    throw new Error(
      `Materialized fixture read escaped project scope: ${JSON.stringify(fixtures.project)}`
    );
  }
  if (
    fixtures.actor?.id !== "archive-materialized-fixture-smoke" ||
    fixtures.actor?.scoped !== true
  ) {
    throw new Error(
      `Materialized fixture read lost actor scope: ${JSON.stringify(fixtures.actor)}`
    );
  }
  if (
    fixtures.page?.limit !== 2 ||
    fixtures.page?.returned !== 2 ||
    fixtures.page?.total !== 6 ||
    fixtures.page?.hasMore !== true
  ) {
    throw new Error(`Materialized fixture pagination drifted: ${JSON.stringify(fixtures.page)}`);
  }
  if (
    fixtures.summary?.materializedRecordCount !== 6 ||
    fixtures.summary?.readOnly !== true ||
    fixtures.summary?.mutation !== false ||
    fixtures.summary?.redactionPassed !== true
  ) {
    throw new Error(`Materialized fixture summary drifted: ${JSON.stringify(fixtures.summary)}`);
  }
  for (const flag of [
    "rawArchivePayloadsIncluded",
    "manifestEntriesIncluded",
    "resultFilesIncluded",
    "localPathsIncluded",
    "storageRefsIncluded",
    "signedUrlsIncluded",
    "tokensIncluded"
  ]) {
    if (fixtures.summary?.[flag] !== false || fixtures.materialization?.[flag] !== false) {
      throw new Error(`Materialized fixture ${flag} must stay false: ${JSON.stringify(fixtures)}`);
    }
  }
  expectArchiveMaterializedFixtureSummary(fixtures.summary, projectId);
  expectArchiveMaterializedFixtureMaterialization(fixtures.materialization);
  if (!Array.isArray(fixtures.items) || fixtures.items.length !== 2) {
    throw new Error(
      `Materialized fixture read must stay bounded to two items: ${JSON.stringify(fixtures.items)}`
    );
  }
  for (const item of fixtures.items) {
    if (item.kind !== "archive-diagnostic-replay-fixture-materialized") {
      throw new Error(`Unexpected materialized fixture item kind: ${JSON.stringify(item)}`);
    }
    if (item.projectId !== projectId || item.materialization?.readOnly !== true) {
      throw new Error(`Materialized fixture item scope/read mode drifted: ${JSON.stringify(item)}`);
    }
    if (
      item.materialization?.rawArchivePayloadsIncluded !== false ||
      item.materialization?.manifestEntriesIncluded !== false ||
      item.materialization?.resultFilesIncluded !== false ||
      item.materialization?.localPathsIncluded !== false ||
      item.materialization?.storageRefsIncluded !== false ||
      item.materialization?.signedUrlsIncluded !== false ||
      item.materialization?.tokensIncluded !== false
    ) {
      throw new Error(`Materialized fixture item exposed raw material: ${JSON.stringify(item)}`);
    }
    expectArchiveMaterializedFixtureEvidence(item.evidence);
    if (
      item.execution?.replayStarted !== false ||
      item.execution?.workerJobEnqueued !== false ||
      item.execution?.archivePayloadOpened !== false ||
      item.execution?.mutation !== false ||
      item.execution?.deletionStarted !== false ||
      item.execution?.providerIntegration !== false
    ) {
      throw new Error(
        `Materialized fixture item execution controls drifted: ${JSON.stringify(item.execution)}`
      );
    }
  }

  expectNoArchiveMaterializedFixtureLeakage(fixtures);
  expectArchiveMaterializedFixtureParityEvidence();
}

function expectNoArchiveStatusLeakage(value) {
  const serialized = JSON.stringify(value);
  if (hasLocalDownloadArtifactPath(serialized)) {
    throw new Error("Archive status smoke leaked a local download artifact path");
  }

  for (const forbidden of ["storageKey", "signedUrl", '"payload"', "token=", "Authorization:"]) {
    if (serialized.includes(forbidden)) {
      throw new Error(`Archive status smoke leaked forbidden marker: ${forbidden}`);
    }
  }
}

function expectNoArchiveMaterializedFixtureLeakage(value) {
  const serialized = JSON.stringify(value);
  if (hasLocalDownloadArtifactPath(serialized)) {
    throw new Error("Materialized fixture smoke leaked a local allure-results path");
  }

  for (const forbidden of [
    '"manifestEntries":',
    '"resultFiles":',
    '"content"',
    '"payload"',
    "raw archive payload",
    "storage://",
    "minio://",
    "blob://",
    "storageKey",
    '"signedUrl":',
    "X-Amz-Signature",
    "token=",
    "Authorization:",
    "Bearer "
  ]) {
    if (serialized.includes(forbidden)) {
      throw new Error(`Materialized fixture smoke leaked forbidden marker: ${forbidden}`);
    }
  }
}

function hasLocalDownloadArtifactPath(serialized) {
  const downloadsSegment = ["Down", "loads"].join("");
  const artifactSegment = ["allure", "results"].join("-");
  const windowsUserDownloadPattern = new RegExp(
    String.raw`[A-Za-z]:\\Users\\[^"\\]+\\${downloadsSegment}(?:\\${artifactSegment})?`,
    "i"
  );
  const macUserDownloadPattern = new RegExp(
    String.raw`/Users/[^/"']+/${downloadsSegment}(?:/${artifactSegment})?`,
    "i"
  );
  const relativeArtifactDownloadPattern = new RegExp(
    String.raw`${downloadsSegment}[\\/]+${artifactSegment}`,
    "i"
  );

  return (
    windowsUserDownloadPattern.test(serialized) ||
    macUserDownloadPattern.test(serialized) ||
    relativeArtifactDownloadPattern.test(serialized)
  );
}

function expectArchiveMaterializedFixtureParityEvidence() {
  const root = path.dirname(fileURLToPath(import.meta.url));
  const workspace = path.resolve(root, "..", "..");
  const openApi = readFileSync(path.join(workspace, "docs/openapi/openapi.yaml"), "utf8");
  const mcpServer = [
    readFileSync(path.join(workspace, "apps/mcp/src/mcpToolDefinitionsPart02.ts"), "utf8"),
    readFileSync(
      path.join(workspace, "apps/mcp/src/mcpArchiveDiagnosticReplayMaterializedFixtures.ts"),
      "utf8"
    )
  ].join("\n");
  const webApi = [
    readFileSync(path.join(workspace, "apps/web/src/apiArchiveState.ts"), "utf8"),
    readFileSync(path.join(workspace, "apps/web/src/apiArchiveIntake.ts"), "utf8")
  ].join("\n");
  const webMain = readFileSync(path.join(workspace, "apps/web/src/WorkspaceSurface.tsx"), "utf8");
  const requiredMarkers = [
    [
      "OpenAPI materialized fixture route",
      openApi,
      "/api/v1/projects/{projectId}/archive/diagnostics/replay/fixtures/materialized"
    ],
    [
      "OpenAPI materialized fixture response schema",
      openApi,
      "ArchiveDiagnosticReplayMaterializedFixtureListResponse"
    ],
    [
      "MCP materialized fixture read tool",
      mcpServer,
      "testhistory.archive-diagnostics.replay.fixtures.materialized.read"
    ],
    ["MCP raw payload exclusion", mcpServer, "rawPayloadsIncluded: false"],
    ["MCP synthetic-only policy", mcpServer, "syntheticOnly: true"],
    [
      "UI materialized fixture fetch",
      webApi,
      "/archive/diagnostics/replay/fixtures/materialized?limit=3"
    ],
    ["UI read-only smoke guidance", webMain, "статусы диагностики только для чтения"],
    ["UI raw archive smoke guidance", webMain, "исходные данные архива"]
  ];

  for (const [label, source, marker] of requiredMarkers) {
    if (!source.includes(marker)) {
      throw new Error(`${label} missing marker: ${marker}`);
    }
  }

  expectArchiveMaterializedFixtureSurfaceAlignment({ openApi, mcpServer, webApi, webMain });
}

function expectArchiveMaterializedFixtureSummary(summary, projectId) {
  for (const [field, expected] of Object.entries(archiveMaterializedFixtureExpectedSummary)) {
    if (summary?.[field] !== expected) {
      throw new Error(`Materialized fixture summary ${field} drifted: ${JSON.stringify(summary)}`);
    }
  }
  if (summary?.projectId !== projectId) {
    throw new Error(`Materialized fixture summary project drifted: ${JSON.stringify(summary)}`);
  }
  if (!arraysEqual(summary?.fixtureNames, archiveMaterializedFixtureNames)) {
    throw new Error(`Materialized fixture names drifted: ${JSON.stringify(summary?.fixtureNames)}`);
  }
  if (!arraysEqual(summary?.plannedOperations, archiveMaterializedFixturePlannedOperations)) {
    throw new Error(
      `Materialized fixture planned operations drifted: ${JSON.stringify(summary?.plannedOperations)}`
    );
  }
}

function expectArchiveMaterializedFixtureMaterialization(materialization) {
  const expected = {
    adapterKind: "api-read-model-archive-diagnostic-replay-fixture-materialized-wip",
    boundary: "worker-compatible-archive-diagnostic-replay-fixture-materialized-read",
    consistency: "synthetic-fixture-contracts-idempotent",
    source: "synthetic-archive-diagnostic-replay-fixture-contracts",
    readOnly: true,
    mutation: false,
    materializedRecordCount: 6,
    mutationBoundary: "rest-materialized-read-only-no-archive-or-worker-mutation"
  };
  for (const [field, expectedValue] of Object.entries(expected)) {
    if (materialization?.[field] !== expectedValue) {
      throw new Error(
        `Materialized fixture materialization ${field} drifted: ${JSON.stringify(materialization)}`
      );
    }
  }
}

function expectArchiveMaterializedFixtureEvidence(evidence) {
  for (const flag of archiveMaterializedFixtureFalseFields) {
    if (evidence?.[flag] !== undefined && evidence?.[flag] !== false) {
      throw new Error(
        `Materialized fixture evidence ${flag} must stay false: ${JSON.stringify(evidence)}`
      );
    }
  }
  if (
    evidence?.compatibleSourceCount !== 3 ||
    evidence?.closedArchiveStatusReadCompatible !== true ||
    evidence?.closedArchiveDiagnosticsReadCompatible !== true ||
    evidence?.redactionPassed !== true
  ) {
    throw new Error(`Materialized fixture evidence drifted: ${JSON.stringify(evidence)}`);
  }
}

function expectArchiveMaterializedFixtureSurfaceAlignment({ openApi, mcpServer, webApi, webMain }) {
  const restAndUiSummaryMarkers = [
    ...Object.keys(archiveMaterializedFixtureExpectedSummary),
    ...archiveMaterializedFixtureFalseFields,
    "fixtureNames",
    "plannedOperations",
    "materializationDigest"
  ];
  expectMarkers("OpenAPI materialized fixture summary", openApi, restAndUiSummaryMarkers);
  expectMarkers("UI materialized fixture read type", webApi, restAndUiSummaryMarkers);

  expectMarkers("UI materialized fixture summary renderer", webApi, [
    "getArchiveFixtureEvidenceSummary",
    "data.summary.materializedRecordCount",
    "data.summary.supportedFiles",
    "data.summary.ignoredFiles",
    "data.summary.attemptGroups",
    "data.page.returned",
    "data.page.total",
    "data.page.limit",
    "rawArchivePayloadsIncluded"
  ]);
  expectMarkers("UI materialized fixture smoke guidance", webMain, [
    "материализованные синтетические фикстуры replay",
    "статусы диагностики только для чтения",
    "исходные данные архива",
    "синтетические, ограниченные, проектные, акторные и только для чтения"
  ]);

  expectMarkers("MCP materialized fixture summary schema", mcpServer, [
    "archive-diagnostics.replay.fixtures.materialized",
    "sanitizeArchiveDiagnosticReplayMaterializedFixtureSummary",
    "materializedRecordCount",
    "fixtureNames",
    "supportedFiles",
    "attachmentFiles",
    "ignoredFiles",
    "warningCount",
    "parseErrors",
    "attemptGroups",
    "retryAwareCount",
    "duplicateAwareCount",
    "deniedFixtureCount",
    "redactionPassed",
    "materializationDigest",
    "mutationBoundary"
  ]);
  expectMarkers("MCP materialized fixture policy", mcpServer, [
    'path: "/api/v1/projects/{projectId}/archive/diagnostics/replay/fixtures/materialized"',
    "equalOrNarrowerThanRest: true",
    "syntheticOnly: true",
    "mutationAllowed: false",
    "workerExecutionAllowed: false",
    "storageMutationAllowed: false",
    "rawManifestEntriesIncluded: false",
    "rawResultFilesIncluded: false",
    "resultContentIncluded: false",
    "rawPayloadsIncluded: false",
    "rawPathsIncluded: false",
    "storageRefsIncluded: false",
    "signedUrlsIncluded: false",
    "tokensIncluded: false",
    "credentialsIncluded: false",
    "paginationRequired: true"
  ]);
}

function expectMarkers(label, source, markers) {
  for (const marker of markers) {
    if (!source.includes(marker)) {
      throw new Error(`${label} missing marker: ${marker}`);
    }
  }
}

function arraysEqual(actual, expected) {
  return (
    Array.isArray(actual) &&
    actual.length === expected.length &&
    actual.every((value, index) => value === expected[index])
  );
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

async function expectStatus(url, status) {
  const response = await fetch(url);
  if (response.status !== status) {
    throw new Error(`${url} returned ${response.status}, expected ${status}`);
  }
}

async function expectJson(url, expected) {
  const json = await getJson(url);
  for (const [key, value] of Object.entries(expected)) {
    if (json[key] !== value) {
      throw new Error(`${url} returned ${key}=${json[key]}, expected ${value}`);
    }
  }
}

async function getJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${url} returned ${response.status}`);
  }

  return response.json();
}

async function getJsonWithHeaders(url, headers) {
  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(`${url} returned ${response.status}`);
  }

  return response.json();
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    throw new Error(`${url} returned ${response.status}: ${await response.text()}`);
  }

  return response.json();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
