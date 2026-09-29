import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { demoM1Workspace, type LaunchResultPage } from "../m1Workspace.js";
import { ChartsTab } from "./LaunchesReferenceVisualTabs.js";

describe("launch chart data scope", () => {
  const results = demoM1Workspace.results.slice(0, 2);

  it("states the visible page and total when the chart uses paginated results", () => {
    const page: LaunchResultPage = {
      cursor: "25",
      hasMore: true,
      limit: 25,
      nextCursor: "50",
      offset: 25,
      returned: 2,
      total: 100
    };
    const markup = renderToStaticMarkup(<ChartsTab page={page} results={results} />);

    expect(markup).toContain("Страница результатов: 26–27 из 100");
    expect(markup).toContain("Средняя по показанным");
  });

  it("states the sample size without pagination metadata", () => {
    const markup = renderToStaticMarkup(<ChartsTab results={results} />);
    expect(markup).toContain("Результатов на графике: 2");
  });
});
