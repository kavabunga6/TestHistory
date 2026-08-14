import { describe, expect, it } from "vitest";
import { canTransitionAutomationJob, normalizeAutomatedTestSelector } from "./automation.js";

describe("automated test planning", () => {
  it("normalizes selectors without introducing manual test semantics", () => {
    expect(
      normalizeAutomatedTestSelector({
        thql: ' status = "failed" ',
        testCaseIds: ["case-1", "case-1", " "],
        tags: ["smoke", "smoke"]
      })
    ).toEqual({
      thql: 'status = "failed"',
      testCaseIds: ["case-1"],
      tags: ["smoke"]
    });
    expect(() => normalizeAutomatedTestSelector({})).toThrow(/selector must contain/i);
  });

  it("keeps automation job state transitions terminal and retry-safe", () => {
    expect(canTransitionAutomationJob("queued", "running")).toBe(true);
    expect(canTransitionAutomationJob("queued", "succeeded")).toBe(true);
    expect(canTransitionAutomationJob("running", "succeeded")).toBe(true);
    expect(canTransitionAutomationJob("succeeded", "running")).toBe(false);
    expect(canTransitionAutomationJob("failed", "queued")).toBe(false);
  });
});
