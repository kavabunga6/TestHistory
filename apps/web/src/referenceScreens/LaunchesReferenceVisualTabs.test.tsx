import type { LaunchDurationChartReadModel } from "@testhistory/contracts";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DurationChartContent } from "./LaunchesReferenceVisualTabs.js";

const chart: LaunchDurationChartReadModel = {
  kind: "launch-duration-chart",
  launchId: "launch-1",
  projectId: "project-1",
  totalResults: 100,
  measuredResults: 100,
  averageDurationMs: 1_500,
  buckets: [
    { label: "<100ms", count: 25 },
    { label: "100ms-1s", count: 0 },
    { label: "1s-10s", count: 75 },
    { label: "10s-1m", count: 0 },
    { label: "1m-5m", count: 0 },
    { label: "5m-30m", count: 0 },
    { label: "30m-1h", count: 0 },
    { label: "1h+", count: 0 }
  ]
};

describe("launch chart data scope", () => {
  it("shows the whole launch and its server aggregate", () => {
    const markup = renderToStaticMarkup(<DurationChartContent chart={chart} />);
    expect(markup).toContain("Весь запуск: 100 результатов");
    expect(markup).toContain("Средняя по запуску");
    expect(markup).toContain("1.5s");
    expect(markup).toContain("1s-10s: 75");
    expect(markup).not.toContain("Страница результатов");
  });

  it("labels missing durations instead of putting them into the first bucket", () => {
    const markup = renderToStaticMarkup(
      <DurationChartContent chart={{ ...chart, measuredResults: 99 }} />
    );
    expect(markup).toContain("длительность указана для 99 из 100 результатов");
  });

  it("shows loading until the server aggregate arrives", () => {
    const markup = renderToStaticMarkup(<DurationChartContent />);
    expect(markup).toContain("Загружаем данные всего запуска");
  });
});
