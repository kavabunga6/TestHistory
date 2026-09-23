import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { demoM1Workspace } from "../m1Workspace.js";
import { DefectsReferenceScreen } from "./DefectsReferenceScreen.js";

describe("defect navigation", () => {
  it("keeps a routed defect visible when it falls outside the first 50 rows", () => {
    const result = demoM1Workspace.results[0]!;
    const results = Array.from({ length: 51 }, (_, index) => ({
      ...result,
      id: `result-${index}`,
      defect: `BUG-${String(index).padStart(3, "0")}`,
      name: `Failure ${index}`,
      status: "failed" as const
    }));

    const markup = renderToStaticMarkup(
      <DefectsReferenceScreen results={results} routeDefectId="BUG-050" />
    );

    expect(markup).toContain('aria-pressed="true"');
    expect(markup).toContain("BUG-050");
    expect(markup).toContain("Failure 50");
    expect(markup).not.toContain("BUG-049");
  });
});
