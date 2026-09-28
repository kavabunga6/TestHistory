import { describe, expect, it } from "vitest";

import { isLikelyThqlQuery } from "./thqlQueryDetection.js";

describe("THQL query detection", () => {
  it("keeps ordinary test names in full-project text search", () => {
    expect(isLikelyThqlQuery("Sign in")).toBe(false);
    expect(isLikelyThqlQuery("Authentication: accepts a valid request")).toBe(false);
    expect(isLikelyThqlQuery("broken and skipped")).toBe(false);
  });

  it("recognizes field comparisons and membership expressions", () => {
    expect(isLikelyThqlQuery('tag = "checkout"')).toBe(true);
    expect(isLikelyThqlQuery('status in ["failed", "broken"]')).toBe(true);
    expect(isLikelyThqlQuery("duration > 1000")).toBe(true);
  });
});
