import type { NormalizedTestResult } from "@testhistory/contracts";
import { describe, expect, it } from "vitest";
import { compareLaunchResults, type ComparableLaunch } from "./launch-comparison.js";

describe("launch comparison", () => {
  it("classifies regressions, fixes, additions, removals and duration changes", () => {
    const base = launch("base", [
      result("login", "passed", 100),
      result("checkout", "failed", 400),
      result("removed", "passed", 100),
      result("slow", "passed", 100)
    ]);
    const target = launch("target", [
      result("login", "failed", 120),
      result("checkout", "passed", 200),
      result("added", "passed", 80),
      result("slow", "passed", 300)
    ]);

    const comparison = compareLaunchResults(base, target);

    expect(comparison.summary).toMatchObject({
      regressed: 1,
      fixed: 1,
      new: 1,
      removed: 1,
      unchanged: 1,
      durationRegressions: 1
    });
    expect(comparison.rows.map((row) => [row.testCaseId, row.change])).toEqual([
      ["login", "regressed"],
      ["added", "new"],
      ["checkout", "fixed"],
      ["removed", "removed"],
      ["slow", "unchanged"]
    ]);
    expect(comparison.rows.find((row) => row.testCaseId === "slow")).toMatchObject({
      durationTrend: "slower",
      durationDeltaMs: 200,
      durationRatio: 3
    });
    expect(comparison.base.metrics.passRate).toBe(0.75);
    expect(comparison.target.metrics.passRate).toBe(0.75);
  });

  it("uses the final retry for a stable test identity and rejects cross-project input", () => {
    const base = launch("base", [result("login", "failed", 100)]);
    const target = launch("target", [
      result("login", "failed", 100, "retry-1"),
      result("login", "passed", 90, "retry-2")
    ]);

    expect(compareLaunchResults(base, target).rows[0]).toMatchObject({
      change: "fixed",
      target: { resultUuid: "retry-2", status: "passed" }
    });
    expect(() => compareLaunchResults(base, { ...target, projectId: "another-project" })).toThrow(
      "Compared launches must belong to one project."
    );
  });
});

function launch(id: string, results: NormalizedTestResult[]): ComparableLaunch {
  return {
    id,
    projectId: "project-1",
    name: id,
    branch: "main",
    createdAt: `2026-08-0${id === "base" ? "1" : "2"}T10:00:00.000Z`,
    results
  };
}

function result(
  testCaseId: string,
  status: NormalizedTestResult["status"],
  durationMs: number,
  uuid = `${testCaseId}-${status}`
): NormalizedTestResult {
  return {
    uuid,
    testCaseId,
    name: testCaseId,
    status,
    durationMs,
    labels: {},
    parameters: [],
    attachments: [],
    steps: [],
    raw: { uuid, name: testCaseId, status }
  };
}
