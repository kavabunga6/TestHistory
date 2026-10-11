// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { demoM1Workspace } from "../m1Workspace.js";
import { getLaunchTotal } from "./LaunchesReferenceModel.js";
import { OverviewTab } from "./LaunchesReferenceOverview.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => vi.restoreAllMocks());

describe("launch overview data scope", () => {
  it("does not present an unfetched defect count as zero", () => {
    const source = demoM1Workspace.launchItems[0]!;
    const launch = { ...source, counters: { ...source.counters, failed: 2, passed: 100 } };
    const markup = renderToStaticMarkup(
      <OverviewTab
        launch={launch}
        results={[]}
        onSelectAll={() => undefined}
        onSelectProblemResults={() => undefined}
        onSelectResult={() => undefined}
        onSelectStatus={() => undefined}
      />
    );

    expect(markup).toContain("Проблемные результаты");
    expect(markup).toContain("из них 0 загружено");
    expect(markup).toContain(`<em>${launch.counters.failed + launch.counters.broken}</em>`);
    expect(markup).toContain("Все проблемные");
    expect(markup).toContain("Загружаем связанные дефекты");
    expect(markup).not.toContain("На загруженной странице нет дефектов.");
    expect(markup).not.toContain("Остальные страницы не учтены.");
    expect(markup).toContain("Среди загруженных результатов нет проваленных или сломанных.");
    expect(markup).toContain("Результаты запуска");
    expect(markup).not.toContain("<h2>Распределение результатов</h2>");
    expect(markup).not.toContain("launches-reference-overview-donut");
    expect(markup).toContain('class="launches-reference-overview-score"');
    expect(markup).toContain("Успешно");
    const total = getLaunchTotal(launch);
    const passRate = Math.round((launch.counters.passed / total) * 100);
    expect(markup).toContain(
      `aria-label="Успешные: 100 из ${total} (${passRate}%). Открыть успешные результаты"`
    );
    expect(markup).toContain(`>${passRate}<span>%</span>`);
    expect(markup).toContain('aria-label="Распределение результатов по статусам"');
    expect(markup).toContain(
      `aria-label="Проваленные: 2 (${Math.round((2 / total) * 100)}%). Открыть результаты с этим статусом"`
    );
    expect(markup).not.toContain("launches-reference-overview-content is-clear");
  });

  it("opens the passed filter from the KPI and the selected status from a chart segment", async () => {
    const launch = demoM1Workspace.launchItems[0]!;
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({
        kind: "launch-linked-issues",
        launchId: launch.id,
        page: { limit: 5, offset: 0, returned: 0, total: 0 },
        items: []
      })
    );
    const onSelectStatus = vi.fn();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    try {
      await act(async () => {
        root.render(
          <OverviewTab
            launch={launch}
            results={[]}
            onSelectAll={() => undefined}
            onSelectResult={() => undefined}
            onSelectStatus={onSelectStatus}
          />
        );
      });
      await act(async () =>
        container.querySelector<HTMLButtonElement>(".launches-reference-overview-score")?.click()
      );
      expect(onSelectStatus).toHaveBeenCalledWith("passed");

      await act(async () =>
        container
          .querySelector<HTMLButtonElement>(".launches-reference-overview-distribution .is-failed")
          ?.click()
      );
      expect(onSelectStatus).toHaveBeenLastCalledWith("failed");
    } finally {
      await act(async () => root.unmount());
      container.remove();
    }
  });
});
