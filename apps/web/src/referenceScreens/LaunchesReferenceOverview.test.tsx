import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { demoM1Workspace } from "../m1Workspace.js";
import { OverviewTab } from "./LaunchesReferenceOverview.js";

describe("launch overview data scope", () => {
  it("labels defect count and empty state as page-limited when results are incomplete", () => {
    const source = demoM1Workspace.launchItems[0]!;
    const launch = { ...source, counters: { ...source.counters, passed: 100 } };
    const markup = renderToStaticMarkup(
      <OverviewTab
        launch={launch}
        results={[]}
        onSelectAll={() => undefined}
        onSelectResult={() => undefined}
        onSelectStatus={() => undefined}
      />
    );

    expect(markup).toContain("на загруженной странице");
    expect(markup).toContain("На загруженной странице нет дефектов.");
    expect(markup).toContain("Среди загруженных результатов нет неразобранных.");
  });
});
