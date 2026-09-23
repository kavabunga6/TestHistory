import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { demoM1Workspace } from "../m1Workspace.js";
import { TestCaseDetailReferenceScreen } from "./TestCaseDetailReferenceScreen.js";

describe("test case navigation", () => {
  it("keeps a routed test case visible beyond the first 50 rows", () => {
    const result = demoM1Workspace.results[0]!;
    const results = Array.from({ length: 51 }, (_, index) => ({
      ...result,
      id: `case-${index}`,
      name: `Case ${index}`
    }));

    const markup = renderToStaticMarkup(
      <TestCaseDetailReferenceScreen results={results} selectedId="case-50" />
    );

    expect(markup).toContain("Case 50");
    expect(markup).toContain('class="tc-detail-reference-row selected');
    expect(markup).not.toContain("Case 49");
  });
});
