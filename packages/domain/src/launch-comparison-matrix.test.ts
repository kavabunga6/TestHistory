import type { NormalizedTestResult } from "@testhistory/contracts";
import { describe, expect, it } from "vitest";
import { compareLaunchMatrix } from "./launch-comparison-matrix.js";
import type { ComparableLaunch } from "./launch-comparison.js";

describe("launch comparison matrix", () => {
  it("keeps tests that occur only in an intermediate launch and selects final retries", () => {
    const matrix = compareLaunchMatrix([
      launch("first", [result("login", "passed")]),
      launch("middle", [result("login", "failed"), result("intermediate", "broken")]),
      launch("current", [
        result("login", "failed", "retry-1"),
        result("login", "passed", "retry-2"),
        result("new", "broken")
      ])
    ]);

    expect(matrix.launches.map((launch) => launch.metrics.passRate)).toEqual([1, 0, 1 / 2]);
    expect(matrix.summary).toEqual({
      testCases: 3,
      currentProblems: 1,
      changed: 3,
      new: 1,
      removed: 1
    });
    expect(matrix.rows.map((row) => row.testCaseId)).toEqual(["new", "intermediate", "login"]);
    expect(matrix.rows.find((row) => row.testCaseId === "intermediate")?.points).toEqual([
      null,
      { resultUuid: "intermediate-broken", status: "broken" },
      null
    ]);
    expect(matrix.rows.find((row) => row.testCaseId === "login")?.points[2]).toMatchObject({
      resultUuid: "retry-2",
      status: "passed"
    });
  });

  it("does not mark a test seen in an intermediate launch as new when it returns", () => {
    const matrix = compareLaunchMatrix([
      launch("first", []),
      launch("middle", [result("returning", "passed")]),
      launch("current", [result("returning", "failed")])
    ]);

    expect(matrix.summary.new).toBe(0);
    expect(matrix.summary.removed).toBe(0);
    expect(matrix.rows[0]?.changed).toBe(true);
  });

  it("requires two to five distinct launches from one project", () => {
    const first = launch("first", []);
    expect(() => compareLaunchMatrix([first])).toThrow("between two and five");
    expect(() => compareLaunchMatrix([first, first])).toThrow("different");
    expect(() =>
      compareLaunchMatrix([first, { ...launch("second", []), projectId: "elsewhere" }])
    ).toThrow("one project");
  });
});

function launch(id: string, results: NormalizedTestResult[]): ComparableLaunch {
  return {
    id,
    projectId: "project-1",
    name: id,
    createdAt: "2026-09-01T00:00:00.000Z",
    results
  };
}

function result(
  testCaseId: string,
  status: NormalizedTestResult["status"],
  uuid = `${testCaseId}-${status}`
): NormalizedTestResult {
  return {
    uuid,
    testCaseId,
    name: testCaseId,
    status,
    labels: {},
    parameters: [],
    attachments: [],
    steps: [],
    raw: { uuid, name: testCaseId, status }
  };
}
