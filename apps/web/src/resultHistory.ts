import type { TestCaseHistoryPoint, TestResult, TestResultAttempt } from "./m1WorkspaceTypes.js";

export function collapseHistoryToFinalRunResults(
  points: TestCaseHistoryPoint[]
): TestCaseHistoryPoint[] {
  const finalByRun = new Map<string, TestCaseHistoryPoint>();

  for (const point of points) {
    const runKey = point.launchId.trim() || point.resultUuid;
    const current = finalByRun.get(runKey);
    if (current === undefined || point.attempt >= current.attempt) {
      finalByRun.set(runKey, point);
    }
  }

  return [...finalByRun.values()];
}

export function getCurrentRunAttempts(result: TestResult): TestResultAttempt[] {
  return [...(result.retryAttempts ?? [])].sort((left, right) => left.attempt - right.attempt);
}

export function mapCurrentLaunchAttempts(
  points: TestCaseHistoryPoint[],
  currentResultUuid: string
): TestResultAttempt[] {
  const currentPoint =
    points.find((point) => point.resultUuid === currentResultUuid) ?? points.at(-1);
  if (currentPoint === undefined || currentPoint.launchId.trim() === "") {
    return [];
  }

  const currentRunPoints = points
    .filter((point) => point.launchId === currentPoint.launchId)
    .sort((left, right) => left.attempt - right.attempt);
  const finalAttempt = Math.max(...currentRunPoints.map((point) => point.attempt));

  return currentRunPoints.map((point) => ({
    attempt: point.attempt,
    status: point.status,
    duration: point.duration,
    ...(point.startedAt.trim() !== "" ? { startedAt: point.startedAt } : {}),
    final: point.attempt === finalAttempt
  }));
}

export function getCurrentRunRetryCount(result: TestResult): number {
  return Math.max(0, getCurrentRunAttempts(result).length - 1);
}
