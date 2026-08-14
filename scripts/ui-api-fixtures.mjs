const project = { id: "project-1", key: "WS", name: "Web Sandbox" };
const launch = {
  id: "L-1289",
  projectId: project.id,
  name: "PR-1289 Checkout Regression",
  status: "closed",
  counters: { broken: 0, failed: 1, passed: 2, skipped: 0, unknown: 0 },
  branch: "feature/card-retry",
  commitSha: "8f4d2a1",
  buildNumber: "7842",
  createdAt: "2026-06-03T09:41:00.000Z"
};
const historyPoint = {
  launchId: launch.id,
  launchName: launch.name,
  launchCreatedAt: launch.createdAt,
  resultUuid: "PAY-1042",
  testCaseId: "PAY-1042",
  fullName: "web.checkout.CheckoutTest.card payment",
  status: "failed",
  durationMs: 1240,
  historyId: "history-PAY-1042",
  retry: false,
  flaky: false,
  attemptNumber: 1
};
const result = {
  uuid: "PAY-1042",
  resultUuid: "PAY-1042",
  launchId: launch.id,
  projectId: project.id,
  historyId: "history-PAY-1042",
  testCaseId: "PAY-1042",
  fullName: historyPoint.fullName,
  name: "Оплата картой после повторной авторизации",
  status: "failed",
  durationMs: 1240,
  labels: {
    owner: ["Platform QA"],
    layer: ["E2E"],
    severity: ["critical"],
    tag: ["checkout", "regression"],
    issue: ["PAY-337"],
    member: ["Platform QA"]
  },
  statusDetails: {
    message: "Expected payment confirmation to be visible",
    trace: "AssertionError: expected payment confirmation to be visible"
  },
  raw: {
    description: "Проверяет оплату картой после повторной авторизации.",
    links: [{ name: "PAY-337", url: "https://tracker.example.test/PAY-337" }],
    parameters: [{ name: "browser", value: "Chrome" }],
    statusDetails: {
      message: "Expected payment confirmation to be visible",
      trace: "AssertionError: expected payment confirmation to be visible"
    }
  }
};
const resultDetails = {
  ...result,
  steps: [
    { name: "Open checkout", status: "passed", start: 0, stop: 240 },
    { name: "Submit card payment", status: "failed", start: 240, stop: 1240 }
  ],
  attachments: [],
  links: result.raw.links
};
const testCase = {
  id: "PAY-1042",
  name: result.name,
  fullName: result.fullName,
  historyIds: [result.historyId],
  totalResults: 3,
  lastStatus: "failed",
  passRate: 0.67,
  flakyScore: 0,
  medianDurationMs: 1240,
  p95DurationMs: 1480,
  firstSeenAt: "2026-05-20T09:41:00.000Z",
  lastSeenAt: launch.createdAt,
  history: [historyPoint],
  testCase: {
    id: "PAY-1042",
    projectId: project.id,
    allureId: "1042",
    name: result.name,
    fullName: result.fullName,
    workflowStatus: "active",
    tags: ["checkout", "regression"],
    layer: "E2E",
    description: result.raw.description,
    members: ["Platform QA"],
    issues: ["PAY-337"],
    testKeys: ["PAY-1042"]
  }
};
const defect = {
  id: "PAY-337",
  status: "open",
  lifecycleState: "recurring",
  title: "Payment confirmation is not visible",
  signature: { hash: "payment-confirmation", reason: result.statusDetails.message },
  affectedTestIds: [testCase.id],
  currentAffectedTestIds: [testCase.id],
  occurrenceCount: 2,
  firstSeenAt: "2026-05-20T09:41:00.000Z",
  lastSeenAt: launch.createdAt,
  firstSeenLaunchId: launch.id,
  lastSeenLaunchId: launch.id,
  results: [
    {
      launchId: launch.id,
      launchName: launch.name,
      launchCreatedAt: launch.createdAt,
      resultUuid: result.uuid,
      testId: testCase.id,
      status: result.status
    }
  ]
};

export function createUiFixtureApiResponse(pathname, method = "GET") {
  if (method !== "GET") {
    return undefined;
  }
  if (pathname === "/api/v1/projects") {
    return [project];
  }
  if (pathname === `/api/v1/projects/${project.id}/launches`) {
    return paged("launch-list", [launch], { projectId: project.id });
  }
  if (pathname === `/api/v1/launches/${launch.id}/results/${result.uuid}`) {
    return resultDetails;
  }
  if (pathname === `/api/v1/launches/${launch.id}/results`) {
    return paged("launch-result-list", [result], {
      launchId: launch.id,
      projectId: project.id
    });
  }
  if (pathname === `/api/v1/test-cases/${testCase.id}/history`) {
    return {
      kind: "test-case-history",
      testCaseId: testCase.id,
      projectId: project.id,
      totalPoints: 1,
      returnedPoints: 1,
      omittedPoints: 0,
      page: page(1),
      points: [historyPoint]
    };
  }
  if (pathname === `/api/v1/test-cases/${testCase.id}`) {
    return testCase;
  }
  if (pathname === "/api/v1/test-cases") {
    return paged("test-case-list", [testCase], { projectId: project.id });
  }
  if (pathname === "/api/v1/defects") {
    return paged("defect-list", [defect], { projectId: project.id });
  }
  return undefined;
}

export function createEmptyUiApiResponse(pathname) {
  if (pathname.includes("/launches")) {
    return paged("launch-list", []);
  }
  if (pathname.includes("/test-cases")) {
    return paged("test-case-list", []);
  }
  if (pathname.includes("/defects")) {
    return paged("defect-list", []);
  }
  return { items: [], page: page(0) };
}

function paged(kind, items, extra = {}) {
  return { kind, ...extra, items, page: page(items.length) };
}

function page(total) {
  return {
    cursor: null,
    hasMore: false,
    limit: Math.max(10, total),
    nextCursor: null,
    offset: 0,
    returned: total,
    total
  };
}
