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
