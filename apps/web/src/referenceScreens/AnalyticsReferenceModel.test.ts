import type { AnalyticsResultListReadModel } from "@testhistory/contracts";
import { describe, expect, it } from "vitest";

import {
  buildServerAnalyticsModel,
  excludePrioritySignals,
  formatDurationMilliseconds
} from "./AnalyticsReferenceModel.js";

describe("project analytics display model", () => {
  it("uses complete filtered totals while keeping the signal list paginated", () => {
    const read: AnalyticsResultListReadModel = {
      kind: "analytics-result-list",
      projectId: "project-1",
      page: {
        limit: 2,
        cursor: null,
        offset: 0,
        returned: 2,
        total: 4,
        nextCursor: "2",
        hasMore: true
      },
      metrics: {
        total: 8,
        matched: 4,
        statusCounters: { failed: 1, broken: 0, passed: 1, skipped: 0, unknown: 1, muted: 1 },
        averageDurationMs: 1500,
        flakyCount: 1,
        flakyDataComplete: false,
        slowCount: 2,
        openRisks: 1
      },
      prioritySignals: [summary("failed-result", "failed")],
      slowSignals: [
        summary("failed-result", "failed", 3000),
        summary("slow-result", "passed", 2500)
      ],
      items: [summary("failed-result", "failed"), summary("muted-result", "failed", 800, true)]
    };

    const model = buildServerAnalyticsModel(read);

    expect(model.total).toBe(8);
    expect(model.filteredTotal).toBe(4);
    expect(model.visibleSignals).toHaveLength(2);
    expect(model.statusMetrics.map(({ status, count }) => [status, count])).toEqual([
      ["failed", 1],
      ["broken", 0],
      ["unknown", 1],
      ["passed", 1],
      ["skipped", 0],
      ["muted", 1]
    ]);
    expect(model.visibleSignals[1]?.status).toBe("muted");
    expect(model.slowCount).toBe(2);
    expect(model.flakyCount).toBe(1);
    expect(model.averageDuration).toBe("1,5 с");
    expect(model.visibleSignals.map((signal) => signal.duration)).toEqual(["1,2 с", "800 мс"]);
    expect(
      excludePrioritySignals(model.prioritySignals, model.slowSignals).map((signal) => signal.id)
    ).toEqual(["launch-1:slow-result"]);
  });

  it("uses Russian duration units and carries rounded seconds into minutes", () => {
    expect(formatDurationMilliseconds(61_250)).toBe("1 мин 1 с");
    expect(formatDurationMilliseconds(59_900)).toBe("59,9 с");
  });
});

function summary(
  uuid: string,
  status: "failed" | "passed",
  durationMs = 1200,
  muted = false
): AnalyticsResultListReadModel["items"][number] {
  return {
    uuid,
    launchId: "launch-1",
    projectId: "project-1",
    name: uuid,
    status,
    durationMs,
    tags: [],
    issues: [],
    testKeys: [],
    muted,
    flaky: false,
    flakyKnown: true,
    history: [status]
  };
}
