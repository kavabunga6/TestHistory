import type { Launch } from "@testhistory/domain";
import { describe, expect, it } from "vitest";

import { buildHistoryPoints } from "./testCaseHistory.js";
import { buildHistoryComparePermissionAuditEvents } from "./testCasePermissionAudit.js";

function launch(id: string, resultUuid: string, start: number): Launch {
  return {
    id,
    projectId: "project-history",
    name: id,
    status: "closed",
    createdAt: new Date(start).toISOString(),
    results: [
      {
        uuid: resultUuid,
        testCaseId: "case-history",
        fullName: "sample.HistoryTest.caseHistory",
        name: "case history",
        status: "failed",
        durationMs: 100,
        labels: {},
        parameters: [],
        attachments: [],
        steps: [],
        raw: {
          uuid: resultUuid,
          testCaseId: "case-history",
          fullName: "sample.HistoryTest.caseHistory",
          name: "case history",
          status: "failed",
          start,
          stop: start + 100
        }
      }
    ]
  };
}

describe("test-case history attempt grouping", () => {
  it("does not treat a result from another launch as a retry", () => {
    const points = buildHistoryPoints(
      [launch("launch-1", "result-1", 1_000), launch("launch-2", "result-2", 2_000)],
      "case-history"
    );

    expect(
      points.map(({ launchId, attemptNumber, retry }) => ({ launchId, attemptNumber, retry }))
    ).toEqual([
      { launchId: "launch-1", attemptNumber: 1, retry: false },
      { launchId: "launch-2", attemptNumber: 1, retry: false }
    ]);
  });

  it("keeps attempts inside one launch in the retry group", () => {
    const repeatedLaunch = launch("launch-1", "result-1", 1_000);
    repeatedLaunch.results.push({
      ...repeatedLaunch.results[0]!,
      uuid: "result-2",
      raw: {
        ...repeatedLaunch.results[0]!.raw,
        uuid: "result-2",
        start: 2_000,
        stop: 2_100
      }
    });

    const points = buildHistoryPoints([repeatedLaunch], "case-history");

    expect(points.map(({ attemptNumber, retry }) => ({ attemptNumber, retry }))).toEqual([
      { attemptNumber: 1, retry: false },
      { attemptNumber: 2, retry: true }
    ]);
  });

  it("skips an implicit comparison when imported launches reuse a result UUID", () => {
    const launches = [
      launch("launch-1", "shared-result", 1_000),
      launch("launch-2", "shared-result", 2_000)
    ];

    expect(
      buildHistoryComparePermissionAuditEvents({
        launches,
        projectId: "project-history",
        testCaseId: "case-history",
        actorId: "history-reader"
      })
    ).toEqual([]);
  });
});
