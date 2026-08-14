import { readFile } from "node:fs/promises";

const sourceChecks = [
  {
    file: "apps/web/src/workspaceRouting.ts",
    constants: {
      LIST_PAGE_SIZE: 100,
      LAUNCH_PAGE_SIZE: 100
    },
    requiredFragments: []
  },
  {
    file: "apps/web/src/LaunchWorkspace.tsx",
    constants: {},
    requiredFragments: [
      "results.slice(0, LIST_PAGE_SIZE)",
      "launchItems.slice(0, LAUNCH_PAGE_SIZE)",
      "<ListWindowFooter"
    ]
  },
  {
    file: "apps/web/src/TestCaseWorkspace.tsx",
    constants: {},
    requiredFragments: ["filteredResults.slice(0, LIST_PAGE_SIZE)"]
  },
  {
    file: "apps/web/src/m1Workspace.ts",
    constants: {
      workspaceInitialLaunchLimit: 100,
      workspaceInitialResultHydrationLimit: 50,
      workspaceInitialHistoryLimit: 100,
      workspaceInitialTestCaseLimit: 100,
      workspaceInitialDefectLimit: 100
    },
    requiredFragments: [
      "launches?limit=${workspaceInitialLaunchLimit}",
      "results?limit=${workspaceInitialResultHydrationLimit}",
      "test-cases?projectId=${encodeURIComponent(",
      "limit=${workspaceInitialTestCaseLimit}",
      "test-case-detail",
      "defects?projectId=${encodeURIComponent(",
      "limit=${workspaceInitialDefectLimit}",
      "defect-detail",
      'return "result-detail"',
      "preferredResultId",
      "limit=${workspaceInitialHistoryLimit}"
    ]
  },
  {
    file: "apps/web/src/referenceScreens/DefectsReferenceScreen.tsx",
    constants: {
      DEFECT_REFERENCE_PAGE_SIZE: 100
    },
    requiredFragments: ["filteredDefects.slice(0, DEFECT_REFERENCE_PAGE_SIZE)"]
  },
  {
    file: "apps/web/src/referenceScreens/TestCaseDetailReferenceScreen.tsx",
    constants: {
      TEST_CASE_REFERENCE_PAGE_SIZE: 100
    },
    requiredFragments: ["filteredResults.slice(0, TEST_CASE_REFERENCE_PAGE_SIZE)"]
  },
  {
    file: "apps/api/src/routes/launchHelpers.ts",
    constants: {
      launchDetailEmbeddedLimit: 100,
      defaultListLimit: 100,
      maxListLimit: 500
    },
    requiredFragments: ["export function serializeLaunchResultSummary"]
  },
  {
    file: "apps/api/src/routes/defectsReadModel.ts",
    constants: {
      defaultProjectionLimit: 100,
      maxProjectionLimit: 500
    },
    requiredFragments: [
      "export function paginateProjection",
      "export function serializeDefectCluster"
    ]
  },
  {
    file: "apps/api/src/routes/defects.ts",
    constants: {},
    requiredFragments: [
      'kind: "defect-list"',
      "buildDefectClusters(launches)",
      "paginateProjection(clusters, pagination.limit, pagination.offset)",
      "page.items.map(serializeDefectCluster)"
    ]
  },
  {
    file: "apps/api/src/routes/launches.ts",
    constants: {},
    requiredFragments: [
      "resultsPage: embeddedResults.metadata",
      "artifactsPage: embeddedArtifacts.metadata",
      "serializeLaunchResultSummary(launch, result)",
      "results: `/api/v1/launches/${encodeURIComponent(launch.id)}/results?limit=${launchDetailEmbeddedLimit}`"
    ]
  },
  {
    file: "apps/api/src/routes/artifacts.ts",
    constants: {
      maxArtifactListLimit: 500
    },
    requiredFragments: [
      'kind: "artifact-list"',
      "page: page.metadata",
      "items: page.items",
      "if (request.query.limit === undefined && request.query.cursor === undefined)"
    ]
  },
  {
    file: "apps/api/src/routes/artifactPreviewRetentionResponses.ts",
    constants: {
      defaultArtifactListLimit: 100,
      maxArtifactListLimit: 500
    },
    requiredFragments: ["export function parseArtifactListPagination"]
  },
  {
    file: "apps/api/src/routes/uploadTypes.ts",
    constants: {
      defaultUploadJobQueueLimit: 25,
      maxUploadJobQueueLimit: 100,
      defaultUploadJobLeaseMs: 5 * 60 * 1000,
      maxUploadJobLeaseMs: 15 * 60 * 1000
    },
    requiredFragments: []
  },
  {
    file: "apps/api/src/routes/uploadQueueRoutes.ts",
    constants: {},
    requiredFragments: [
      '"/api/v1/uploads/jobs/claim"',
      "store.repositories.uploadJobs.claimQueued",
      "const claimToken = randomUUID()",
      "defaultUploadJobQueueLimit",
      "defaultUploadJobLeaseMs"
    ]
  },
  {
    file: "apps/api/src/routes/uploadCore.ts",
    constants: {},
    requiredFragments: ["lease === undefined"]
  },
  {
    file: "apps/worker/src/index.ts",
    constants: {},
    requiredFragments: ["WORKER_UPLOAD_QUEUE_LEASE_MS"]
  },
  {
    file: "apps/worker/src/workerApiUploadQueue.ts",
    constants: {},
    requiredFragments: [
      'new URL("/api/v1/uploads/jobs/claim", baseUrl)',
      "claimToken: item.claimToken"
    ]
  }
];

function assert(condition, message) {
  if (!condition) {
    console.error(`Frontend performance contract failed: ${message}`);
    process.exit(1);
  }
}

function extractConstant(source, name) {
  const match = source.match(
    new RegExp(`const\\s+${name}\\s*=\\s*(\\d+(?:\\s*\\*\\s*\\d+)*)\\s*;`)
  );
  return match === null
    ? undefined
    : match[1]
        .split("*")
        .map((part) => Number(part.trim()))
        .reduce((product, value) => product * value, 1);
}

for (const check of sourceChecks) {
  const source = await readFile(check.file, "utf8");

  for (const [constantName, maxValue] of Object.entries(check.constants)) {
    const value = extractConstant(source, constantName);

    assert(value !== undefined, `${check.file} must define ${constantName}`);
    assert(value > 0, `${check.file} ${constantName} must be positive`);
    assert(value <= maxValue, `${check.file} ${constantName}=${value} exceeds ${maxValue}`);
  }

  for (const fragment of check.requiredFragments) {
    assert(
      source.includes(fragment),
      `${check.file} must keep bounded render fragment: ${fragment}`
    );
  }
}

console.log("Frontend performance contract passed");
