import { createResultDetails } from "./ui-api-fixture-evidence.mjs";

const project = { id: "project-1", key: "WS", name: "Web Sandbox" };
const launch = {
  id: "L-1289",
  projectId: project.id,
  name: "PR-1289 Checkout Regression",
  status: "closed",
  counters: { broken: 0, failed: 0, passed: 0, skipped: 0, unknown: 0 },
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

// Keep PAY-1042 as the stable deep-link target used by the visual guards. The rest of the
// launch is generated deterministically so a 100-result run exercises filters and dense lists.
const scenarioKinds = [
  {
    code: "UI",
    name: "Поиск товара в каталоге",
    suite: "web.catalog.SearchTest",
    layer: "UI",
    owner: "Web QA"
  },
  {
    code: "API",
    name: "Создание заказа через API",
    suite: "api.orders.CreateOrderTest",
    layer: "API",
    owner: "API QA"
  },
  {
    code: "MOB",
    name: "Оплата в мобильном приложении",
    suite: "mobile.checkout.PaymentTest",
    layer: "E2E",
    owner: "Mobile QA"
  },
  {
    code: "INT",
    name: "Синхронизация каталога",
    suite: "integration.catalog.SyncTest",
    layer: "API",
    owner: "Integration QA"
  },
  {
    code: "PERF",
    name: "Время ответа поиска",
    suite: "performance.search.LatencyTest",
    layer: "API",
    owner: "Performance QA"
  },
  {
    code: "SEC",
    name: "Проверка прав доступа",
    suite: "security.access.PermissionsTest",
    layer: "API",
    owner: "Security QA"
  },
  {
    code: "A11Y",
    name: "Навигация с клавиатуры",
    suite: "web.accessibility.KeyboardTest",
    layer: "UI",
    owner: "Accessibility QA"
  },
  {
    code: "E2E",
    name: "Возврат заказа",
    suite: "web.orders.RefundTest",
    layer: "E2E",
    owner: "Platform QA"
  }
];
const generatedStatuses = [
  ...Array(62).fill("passed"),
  ...Array(17).fill("failed"),
  ...Array(8).fill("broken"),
  ...Array(8).fill("skipped"),
  ...Array(4).fill("unknown")
];
const statusLabels = {
  broken: "Сломан",
  failed: "Провален",
  passed: "Успешный",
  skipped: "Пропущен",
  unknown: "Неизвестен"
};
const statusOrder = ["failed", "broken", "passed", "skipped", "unknown"];
function createGeneratedResult(index) {
  const kind = scenarioKinds[(index - 1) % scenarioKinds.length];
  const id = `${kind.code}-${String(index).padStart(4, "0")}`;
  const status = generatedStatuses[(index * 37) % generatedStatuses.length];
  const durationMs = index % 11 === 0 ? 10_000 + index * 37 : 380 + ((index * 173) % 4_800);
  const issue =
    status === "failed" || status === "broken"
      ? `BUG-${String(index).padStart(4, "0")}`
      : undefined;
  const description = `${kind.name}. Набор демонстрационных данных для проверки списка, фильтров, вложений и дерева шагов.`;
  const statusDetails =
    status === "failed" || status === "broken" || status === "unknown"
      ? {
          message: `Проверка ${id} завершилась со статусом ${status}`,
          trace: `AssertionError: ${id} (${status})`
        }
      : undefined;
  return {
    uuid: id,
    resultUuid: id,
    launchId: launch.id,
    projectId: project.id,
    historyId: `history-${id}`,
    testCaseId: id,
    fullName: `${kind.suite}.${String(index).padStart(3, "0")}`,
    name: `${kind.name} #${String(index).padStart(3, "0")}`,
    status,
    durationMs,
    labels: {
      owner: [kind.owner],
      member: [kind.owner],
      layer: [kind.layer],
      severity: [status === "failed" || status === "broken" ? "critical" : "normal"],
      tag: [kind.code.toLowerCase(), "regression", ...(index % 5 === 0 ? ["smoke"] : [])],
      ...(issue === undefined ? {} : { issue: [issue] })
    },
    ...(statusDetails === undefined ? {} : { statusDetails }),
    raw: {
      description,
      links:
        issue === undefined ? [] : [{ name: issue, url: `https://tracker.example.test/${issue}` }],
      parameters: [
        { name: "environment", value: index % 2 === 0 ? "staging" : "review" },
        { name: "dataset", value: `variant-${index % 7}` }
      ],
      ...(statusDetails === undefined ? {} : { statusDetails })
    }
  };
}

const results = [
  result,
  ...Array.from({ length: 99 }, (_, index) => createGeneratedResult(index + 1))
];
for (const item of results) launch.counters[item.status] += 1;

const resultDetails = createResultDetails(result, 0);
const generatedTestCases = results.slice(1).map((item) => ({
  id: item.testCaseId,
  name: item.name,
  fullName: item.fullName,
  historyIds: [item.historyId],
  totalResults: 1,
  lastStatus: item.status,
  passRate: item.status === "passed" ? 1 : 0,
  flakyScore: 0,
  medianDurationMs: item.durationMs,
  p95DurationMs: item.durationMs,
  firstSeenAt: launch.createdAt,
  lastSeenAt: launch.createdAt,
  history: [
    {
      launchId: launch.id,
      launchName: launch.name,
      launchCreatedAt: launch.createdAt,
      resultUuid: item.uuid,
      testCaseId: item.testCaseId,
      fullName: item.fullName,
      status: item.status,
      durationMs: item.durationMs,
      historyId: item.historyId,
      retry: false,
      flaky: false,
      attemptNumber: 1
    }
  ],
  testCase: {
    id: item.testCaseId,
    projectId: project.id,
    allureId: item.testCaseId,
    name: item.name,
    fullName: item.fullName,
    workflowStatus: "active",
    tags: item.labels.tag,
    layer: item.labels.layer[0],
    description: item.raw.description,
    members: item.labels.owner,
    issues: item.labels.issue ?? [],
    testKeys: [item.testCaseId]
  }
}));
const testCases = [testCase, ...generatedTestCases];
const generatedDefects = results
  .slice(1)
  .filter((item) => item.status === "failed" || item.status === "broken")
  .map((item) => ({
    id: item.labels.issue[0],
    status: "open",
    lifecycleState: "new",
    title: item.statusDetails.message,
    signature: { hash: `signature-${item.uuid}`, reason: item.statusDetails.message },
    affectedTestIds: [item.testCaseId],
    currentAffectedTestIds: [item.testCaseId],
    occurrenceCount: 1,
    firstSeenAt: launch.createdAt,
    lastSeenAt: launch.createdAt,
    firstSeenLaunchId: launch.id,
    lastSeenLaunchId: launch.id,
    results: [
      {
        launchId: launch.id,
        launchName: launch.name,
        launchCreatedAt: launch.createdAt,
        resultUuid: item.uuid,
        testId: item.testCaseId,
        status: item.status
      }
    ]
  }));
const defects = [defect, ...generatedDefects];

export {
  project,
  launch,
  historyPoint,
  result,
  resultDetails,
  results,
  testCase,
  testCases,
  defect,
  defects,
  statusLabels,
  statusOrder
};
