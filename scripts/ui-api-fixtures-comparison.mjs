export const baselineLaunch = {
  id: "L-1288",
  projectId: "project-1",
  name: "Main Checkout Regression",
  status: "closed",
  counters: { broken: 4, failed: 9, passed: 75, skipped: 8, unknown: 4 },
  branch: "main",
  commitSha: "7bc91e2",
  buildNumber: "7839",
  createdAt: "2026-06-02T09:41:00.000Z"
};

export const earlierLaunch = {
  ...baselineLaunch,
  id: "L-1287",
  name: "Checkout Regression · предыдущая неделя",
  createdAt: "2026-05-26T09:41:00.000Z",
  buildNumber: "7821"
};

const comparisonRows = [
  {
    testCaseId: "PAY-1042",
    name: "Оплата картой после повторной авторизации",
    change: "regressed",
    durationTrend: "slower",
    durationDeltaMs: 360,
    base: { resultUuid: "PAY-1042", status: "passed", durationMs: 880 },
    target: { resultUuid: "PAY-1042", status: "failed", durationMs: 1240 }
  },
  {
    testCaseId: "PAY-1043",
    name: "Восстановление заказа после ошибки сети",
    change: "fixed",
    durationTrend: "faster",
    durationDeltaMs: -180,
    base: { resultUuid: "PAY-1043", status: "failed", durationMs: 1400 },
    target: { resultUuid: "PAY-1043", status: "passed", durationMs: 1220 }
  },
  {
    testCaseId: "PAY-1044",
    name: "Повторная отправка платежа",
    change: "regressed",
    durationTrend: "slower",
    durationDeltaMs: 420,
    base: { resultUuid: "PAY-1044", status: "passed", durationMs: 910 },
    target: { resultUuid: "PAY-1044", status: "broken", durationMs: 1330 }
  },
  {
    testCaseId: "PAY-1045",
    name: "Проверка лимита скидки",
    change: "new",
    durationTrend: "unavailable",
    target: { resultUuid: "PAY-1045", status: "passed", durationMs: 640 }
  },
  {
    testCaseId: "PAY-1046",
    name: "Сохранение адреса доставки",
    change: "unchanged",
    durationTrend: "unchanged",
    durationDeltaMs: 0,
    base: { resultUuid: "PAY-1046", status: "passed", durationMs: 720 },
    target: { resultUuid: "PAY-1046", status: "passed", durationMs: 720 }
  }
];

export function createLaunchComparisonFixtureResponse(pathname, search = "") {
  if (pathname === "/api/v1/projects/project-1/launches/compare/matrix") {
    return createLaunchMatrixFixtureResponse(search);
  }
  if (pathname !== "/api/v1/projects/project-1/launches/compare") return undefined;

  const params = new URLSearchParams(search);
  if (
    params.get("baseLaunchId") !== baselineLaunch.id ||
    params.get("targetLaunchId") !== "L-1289"
  ) {
    return undefined;
  }
  const filter = params.get("change");
  const filteredRows = filter
    ? comparisonRows.filter((row) => row.change === filter)
    : comparisonRows;
  const limit = Math.max(1, Number(params.get("limit")) || 25);
  const offset = Math.max(0, Number(params.get("offset")) || 0);
  const rows = filteredRows.slice(offset, offset + limit);

  return {
    kind: "launch-comparison",
    base: {
      id: baselineLaunch.id,
      name: baselineLaunch.name,
      metrics: { passRate: 0.75, averageDurationMs: 820 }
    },
    target: {
      id: "L-1289",
      name: "PR-1289 Checkout Regression",
      metrics: { passRate: 0.62, averageDurationMs: 1035 }
    },
    summary: {
      new: 1,
      removed: 0,
      fixed: 1,
      regressed: 2,
      "status-changed": 0,
      unchanged: 1,
      durationRegressions: 2
    },
    metricDeltas: { passRate: -0.13, averageDurationMs: 215 },
    page: {
      limit,
      offset,
      returned: rows.length,
      total: filteredRows.length,
      hasMore: offset + rows.length < filteredRows.length
    },
    rows
  };
}

function createLaunchMatrixFixtureResponse(search) {
  const params = new URLSearchParams(search);
  if (params.get("launchIds") !== "L-1287,L-1288,L-1289") return undefined;
  const rows = [
    {
      testCaseId: "PAY-1042",
      name: "Оплата картой после повторной авторизации",
      changed: true,
      currentProblem: true,
      points: [
        { resultUuid: "PAY-1042", status: "passed", durationMs: 820 },
        { resultUuid: "PAY-1042", status: "passed", durationMs: 880 },
        { resultUuid: "PAY-1042", status: "failed", durationMs: 1240 }
      ]
    },
    {
      testCaseId: "PAY-1044",
      name: "Повторная отправка платежа",
      changed: true,
      currentProblem: true,
      points: [
        { resultUuid: "PAY-1044", status: "passed", durationMs: 800 },
        { resultUuid: "PAY-1044", status: "passed", durationMs: 910 },
        { resultUuid: "PAY-1044", status: "broken", durationMs: 1330 }
      ]
    },
    {
      testCaseId: "PAY-1043",
      name: "Восстановление заказа после ошибки сети",
      changed: true,
      currentProblem: false,
      points: [
        { resultUuid: "PAY-1043", status: "failed", durationMs: 1500 },
        { resultUuid: "PAY-1043", status: "failed", durationMs: 1400 },
        { resultUuid: "PAY-1043", status: "passed", durationMs: 1220 }
      ]
    },
    {
      testCaseId: "PAY-1045",
      name: "Проверка лимита скидки",
      changed: true,
      currentProblem: false,
      points: [null, null, { resultUuid: "PAY-1045", status: "passed", durationMs: 640 }]
    },
    {
      testCaseId: "PAY-1047",
      name: "Проверка возврата",
      changed: true,
      currentProblem: false,
      points: [null, { resultUuid: "PAY-1047", status: "failed", durationMs: 900 }, null]
    },
    {
      testCaseId: "PAY-1046",
      name: "Сохранение адреса доставки",
      changed: false,
      currentProblem: false,
      points: [
        { resultUuid: "PAY-1046", status: "passed", durationMs: 700 },
        { resultUuid: "PAY-1046", status: "passed", durationMs: 720 },
        { resultUuid: "PAY-1046", status: "passed", durationMs: 720 }
      ]
    }
  ];
  const focus = params.get("focus");
  const focused = rows.filter((row) =>
    focus === "problems" ? row.currentProblem : focus === "changed" ? row.changed : true
  );
  const limit = Math.max(1, Number(params.get("limit")) || 25);
  const offset = Math.max(0, Number(params.get("offset")) || 0);
  const pagedRows = focused.slice(offset, offset + limit);
  return {
    kind: "launch-comparison-matrix",
    launches: [
      {
        id: earlierLaunch.id,
        name: earlierLaunch.name,
        createdAt: earlierLaunch.createdAt,
        metrics: { total: 100, passRate: 0.76 }
      },
      {
        id: baselineLaunch.id,
        name: baselineLaunch.name,
        createdAt: baselineLaunch.createdAt,
        metrics: { total: 100, passRate: 0.75 }
      },
      {
        id: "L-1289",
        name: "PR-1289 Checkout Regression",
        createdAt: "2026-06-03T09:41:00.000Z",
        metrics: { total: 100, passRate: 0.62 }
      }
    ],
    summary: { testCases: 6, currentProblems: 2, changed: 5, new: 1, removed: 0 },
    page: {
      limit,
      offset,
      returned: pagedRows.length,
      total: focused.length,
      hasMore: offset + pagedRows.length < focused.length
    },
    rows: pagedRows
  };
}
