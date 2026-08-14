import { describe, expect, it } from "vitest";

import type { TestCaseHistoryPoint, TestResult } from "./m1Workspace.js";
import {
  collapseHistoryToFinalRunResults,
  getCurrentRunAttempts,
  getCurrentRunRetryCount
} from "./resultHistory.js";

function historyPoint(
  launchId: string,
  resultUuid: string,
  attempt: number,
  status: TestCaseHistoryPoint["status"]
): TestCaseHistoryPoint {
  return {
    launchId,
    launchName: launchId,
    resultUuid,
    startedAt: "2026-08-08T08:00:00.000Z",
    status,
    duration: `${attempt}s`,
    retry: attempt > 1,
    flaky: false,
    attempt
  };
}

describe("result history presentation", () => {
  it("keeps only the final attempt for each launch in result history", () => {
    const points = [
      historyPoint("launch-1", "result-1-a", 1, "failed"),
      historyPoint("launch-1", "result-1-b", 2, "passed"),
      historyPoint("launch-2", "result-2-a", 1, "broken")
    ];

    expect(collapseHistoryToFinalRunResults(points)).toEqual([points[1], points[2]]);
  });

  it("counts only additional attempts in the current launch", () => {
    const result = {
      retryAttempts: [
        { attempt: 2, status: "passed", duration: "2s", final: true },
        { attempt: 1, status: "failed", duration: "1s", final: false }
      ]
    } as TestResult;

    expect(getCurrentRunAttempts(result).map((attempt) => attempt.attempt)).toEqual([1, 2]);
    expect(getCurrentRunRetryCount(result)).toBe(1);
  });
});
