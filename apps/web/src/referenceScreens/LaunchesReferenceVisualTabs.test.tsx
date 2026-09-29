// @vitest-environment jsdom

import type { LaunchDurationChartReadModel } from "@testhistory/contracts";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DurationChartContent, LaunchProgressBar } from "./LaunchesReferenceVisualTabs.js";

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
    expect(markup).toContain("1,5 с");
    expect(markup).toContain("1–10 с: 75 из 100");
    expect(markup).toContain("Основной интервал");
    expect(markup).toContain("Быстрее 1 с");
    expect(markup).toContain("От 10 с");
    expect(markup).not.toContain("Страница результатов");
  });

  it("shows average durations over a minute in Russian", () => {
    const markup = renderToStaticMarkup(
      <DurationChartContent chart={{ ...chart, averageDurationMs: 65_000 }} />
    );
    expect(markup).toContain("1 мин 05 с");
    expect(markup).not.toContain("1m 05s");

    const roundedMinute = renderToStaticMarkup(
      <DurationChartContent chart={{ ...chart, averageDurationMs: 119_600 }} />
    );
    expect(roundedMinute).toContain("2 мин 00 с");
    expect(roundedMinute).not.toContain("1 мин 60 с");
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

  it("explains an empty launch instead of showing an unlabeled blank bar", () => {
    const markup = renderToStaticMarkup(
      <LaunchProgressBar
        counters={{ broken: 0, failed: 0, muted: 0, passed: 0, skipped: 0, unknown: 0 }}
        total={0}
      />
    );
    expect(markup).toContain("Результатов пока нет");
  });

  it("keeps every nonzero count in the bar and gives each segment a status hint", () => {
    const host = document.createElement("div");
    host.innerHTML = renderToStaticMarkup(
      <LaunchProgressBar
        counters={{ broken: 10, failed: 20, muted: 0, passed: 50, skipped: 10, unknown: 10 }}
        total={100}
        onStatusClick={() => undefined}
      />
    );

    expect(host.querySelector(".launches-reference-progress-legend")).toBeNull();
    const segments = Array.from(
      host.querySelectorAll<HTMLButtonElement>(".launches-reference-progress button")
    );
    expect(segments).toHaveLength(5);
    expect(segments.map((segment) => segment.textContent?.trim())).toEqual([
      "20",
      "10",
      "10",
      "50",
      "10"
    ]);
    for (const segment of segments) {
      expect(segment.title).toMatch(/:\s*\d+/);
      expect(segment.getAttribute("aria-label")).toContain(segment.textContent?.trim());
    }
  });
});
