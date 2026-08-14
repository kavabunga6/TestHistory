import type { AllureStatus, NormalizedTestResult } from "@testhistory/contracts";
import { createEmptyCounters, getTestCaseIdentity } from "./launchAnalytics.js";

const failureStatuses = new Set<AllureStatus>(["failed", "broken"]);
const durationRatioThreshold = 1.25;
const durationDeltaThresholdMs = 100;

export type ComparableLaunch = {
  id: string;
  projectId: string;
  name: string;
  branch?: string;
  createdAt: string;
  results: NormalizedTestResult[];
};

export type LaunchComparisonChange =
  "new" | "removed" | "fixed" | "regressed" | "status-changed" | "unchanged";

export type LaunchComparisonDurationTrend = "slower" | "faster" | "unchanged" | "unavailable";

export type LaunchComparisonPoint = {
  resultUuid: string;
  status: AllureStatus;
  durationMs?: number;
};

export type LaunchComparisonRow = {
  testCaseId: string;
  name: string;
  change: LaunchComparisonChange;
  durationTrend: LaunchComparisonDurationTrend;
  durationDeltaMs?: number;
  durationRatio?: number;
  base?: LaunchComparisonPoint;
  target?: LaunchComparisonPoint;
};

export type LaunchComparisonMetrics = {
  total: number;
  statusCounters: Record<AllureStatus, number>;
  passRate: number | null;
  totalDurationMs: number;
  averageDurationMs: number | null;
};

export type LaunchComparison = {
  kind: "launch-comparison";
  projectId: string;
  base: LaunchComparisonLaunch;
  target: LaunchComparisonLaunch;
  summary: Record<LaunchComparisonChange, number> & {
    durationRegressions: number;
  };
  counterDeltas: Record<AllureStatus, number>;
  metricDeltas: {
    passRate: number | null;
    averageDurationMs: number | null;
  };
  rows: LaunchComparisonRow[];
};

export type LaunchComparisonLaunch = {
  id: string;
  name: string;
  branch?: string;
  createdAt: string;
  metrics: LaunchComparisonMetrics;
};

export function compareLaunchResults(
  base: ComparableLaunch,
  target: ComparableLaunch
): LaunchComparison {
  if (base.projectId !== target.projectId) {
    throw new Error("Compared launches must belong to one project.");
  }
  if (base.id === target.id) {
    throw new Error("Compared launches must be different.");
  }

  const baseResults = indexFinalResults(base.results);
  const targetResults = indexFinalResults(target.results);
  const identities = [...new Set([...baseResults.keys(), ...targetResults.keys()])];
  const rows = identities
    .map((testCaseId) =>
      buildComparisonRow(testCaseId, baseResults.get(testCaseId), targetResults.get(testCaseId))
    )
    .sort(compareRows);
  const baseMetrics = launchMetrics([...baseResults.values()]);
  const targetMetrics = launchMetrics([...targetResults.values()]);

  return {
    kind: "launch-comparison",
    projectId: base.projectId,
    base: launchPoint(base, baseMetrics),
    target: launchPoint(target, targetMetrics),
    summary: {
      new: countChange(rows, "new"),
      removed: countChange(rows, "removed"),
      fixed: countChange(rows, "fixed"),
      regressed: countChange(rows, "regressed"),
      "status-changed": countChange(rows, "status-changed"),
      unchanged: countChange(rows, "unchanged"),
      durationRegressions: rows.filter((row) => row.durationTrend === "slower").length
    },
    counterDeltas: Object.fromEntries(
      Object.keys(targetMetrics.statusCounters).map((status) => [
        status,
        targetMetrics.statusCounters[status as AllureStatus] -
          baseMetrics.statusCounters[status as AllureStatus]
      ])
    ) as Record<AllureStatus, number>,
    metricDeltas: {
      passRate: nullableDelta(baseMetrics.passRate, targetMetrics.passRate),
      averageDurationMs: nullableDelta(
        baseMetrics.averageDurationMs,
        targetMetrics.averageDurationMs
      )
    },
    rows
  };
}

function indexFinalResults(results: NormalizedTestResult[]): Map<string, NormalizedTestResult> {
  const indexed = new Map<string, NormalizedTestResult>();
  for (const result of results) indexed.set(getTestCaseIdentity(result), result);
  return indexed;
}

function buildComparisonRow(
  testCaseId: string,
  base: NormalizedTestResult | undefined,
  target: NormalizedTestResult | undefined
): LaunchComparisonRow {
  const change = classifyChange(base?.status, target?.status);
  const duration = compareDuration(base?.durationMs, target?.durationMs);
  return {
    testCaseId,
    name: target?.name ?? base?.name ?? testCaseId,
    change,
    durationTrend: duration.trend,
    ...(duration.deltaMs !== undefined ? { durationDeltaMs: duration.deltaMs } : {}),
    ...(duration.ratio !== undefined ? { durationRatio: duration.ratio } : {}),
    ...(base !== undefined ? { base: toPoint(base) } : {}),
    ...(target !== undefined ? { target: toPoint(target) } : {})
  };
}

function classifyChange(
  base: AllureStatus | undefined,
  target: AllureStatus | undefined
): LaunchComparisonChange {
  if (base === undefined) return "new";
  if (target === undefined) return "removed";
  if (base === target) return "unchanged";
  if (failureStatuses.has(base) && target === "passed") return "fixed";
  if (!failureStatuses.has(base) && failureStatuses.has(target)) return "regressed";
  return "status-changed";
}

function compareDuration(base: number | undefined, target: number | undefined) {
  if (base === undefined || target === undefined) return { trend: "unavailable" as const };
  const deltaMs = target - base;
  const ratio = base === 0 ? (target === 0 ? 1 : Number.POSITIVE_INFINITY) : target / base;
  const roundedRatio = Number.isFinite(ratio) ? Math.round(ratio * 100) / 100 : ratio;
  if (deltaMs >= durationDeltaThresholdMs && ratio >= durationRatioThreshold) {
    return { trend: "slower" as const, deltaMs, ratio: roundedRatio };
  }
  if (deltaMs <= -durationDeltaThresholdMs && ratio <= 1 / durationRatioThreshold) {
    return { trend: "faster" as const, deltaMs, ratio: roundedRatio };
  }
  return { trend: "unchanged" as const, deltaMs, ratio: roundedRatio };
}

function launchMetrics(results: NormalizedTestResult[]): LaunchComparisonMetrics {
  const statusCounters = createEmptyCounters();
  let totalDurationMs = 0;
  let durationCount = 0;
  for (const result of results) {
    statusCounters[result.status] += 1;
    if (result.durationMs !== undefined) {
      totalDurationMs += result.durationMs;
      durationCount += 1;
    }
  }
  return {
    total: results.length,
    statusCounters,
    passRate: results.length === 0 ? null : statusCounters.passed / results.length,
    totalDurationMs,
    averageDurationMs: durationCount === 0 ? null : Math.round(totalDurationMs / durationCount)
  };
}

function launchPoint(
  launch: ComparableLaunch,
  metrics: LaunchComparisonMetrics
): LaunchComparisonLaunch {
  return {
    id: launch.id,
    name: launch.name,
    ...(launch.branch !== undefined ? { branch: launch.branch } : {}),
    createdAt: launch.createdAt,
    metrics
  };
}

function toPoint(result: NormalizedTestResult): LaunchComparisonPoint {
  return {
    resultUuid: result.uuid,
    status: result.status,
    ...(result.durationMs !== undefined ? { durationMs: result.durationMs } : {})
  };
}

function countChange(rows: LaunchComparisonRow[], change: LaunchComparisonChange) {
  return rows.filter((row) => row.change === change).length;
}

function nullableDelta(base: number | null, target: number | null): number | null {
  if (base === null || target === null) return null;
  return Math.round((target - base) * 10_000) / 10_000;
}

function compareRows(left: LaunchComparisonRow, right: LaunchComparisonRow) {
  const order: Record<LaunchComparisonChange, number> = {
    regressed: 0,
    new: 1,
    "status-changed": 2,
    fixed: 3,
    removed: 4,
    unchanged: 5
  };
  return order[left.change] - order[right.change] || left.name.localeCompare(right.name);
}
