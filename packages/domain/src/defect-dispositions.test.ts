import { describe, expect, it } from "vitest";
import {
  appendDefectDispositionEvent,
  applyDefectDispositionEvents,
  type DefectDispositionEvent
} from "./defect-dispositions.js";
import type { DefectClusterReadModel } from "./defects.js";

const event: DefectDispositionEvent = {
  id: "disposition-1",
  projectId: "project-1",
  defectId: "defect:signature",
  action: "result_unlinked",
  occurrences: [{ launchId: "launch-2", resultUuid: "result-2" }],
  actorId: "owner",
  reason: "Incorrect automatic grouping",
  occurredAt: "2026-08-09T00:00:00.000Z"
};

describe("defect dispositions", () => {
  it("removes only recorded occurrences and preserves the immutable defect history source", () => {
    const source = cluster();
    const projected = applyDefectDispositionEvents([source], [event]);

    expect(projected).toEqual([
      expect.objectContaining({
        id: source.id,
        state: "resolved-ish",
        occurrenceCount: 1,
        affectedTestIds: ["case-1"]
      })
    ]);
    expect(projected[0]?.occurrences.map((occurrence) => occurrence.resultUuid)).toEqual([
      "result-1"
    ]);
    expect(source.occurrences).toHaveLength(2);
  });

  it("is append-only and idempotent for the same event", () => {
    expect(appendDefectDispositionEvent([event], event)).toEqual([event]);
    expect(() =>
      appendDefectDispositionEvent([event], { ...event, reason: "Replacement" })
    ).toThrow(/append-only/);
  });
});

function cluster(): DefectClusterReadModel {
  return {
    id: "defect:signature",
    state: "recurring",
    signature: { hash: "signature", normalizedReason: "failure", sources: ["status"] },
    affectedTestIds: ["case-1", "case-2"],
    currentAffectedTestIds: ["case-2"],
    occurrenceCount: 2,
    firstSeenAt: "2026-08-07T00:00:00.000Z",
    lastSeenAt: "2026-08-08T00:00:00.000Z",
    firstSeenLaunchId: "launch-1",
    lastSeenLaunchId: "launch-2",
    occurrences: [
      {
        launchId: "launch-1",
        launchName: "Launch 1",
        launchCreatedAt: "2026-08-07T00:00:00.000Z",
        resultUuid: "result-1",
        testId: "case-1",
        status: "failed"
      },
      {
        launchId: "launch-2",
        launchName: "Launch 2",
        launchCreatedAt: "2026-08-08T00:00:00.000Z",
        resultUuid: "result-2",
        testId: "case-2",
        status: "failed"
      }
    ]
  };
}
