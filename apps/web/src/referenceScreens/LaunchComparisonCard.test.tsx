// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { getJson } from "../apiHttp.js";
import { demoM1Workspace } from "../m1Workspace.js";
import { LaunchComparisonScreen, type LaunchComparisonReadModel } from "./LaunchComparisonCard.js";

vi.mock("../apiHttp.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../apiHttp.js")>();
  return { ...actual, getJson: vi.fn() };
});

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  vi.mocked(getJson).mockImplementation(async (url) =>
    String(url).includes("/compare?")
      ? (comparisonFor(String(url)) as never)
      : ({ items: [], page: { hasMore: false, nextCursor: null } } as never)
  );
});

it("loads candidates beyond the current launch list page", async () => {
  const launch = { ...demoM1Workspace.launchItems[0]!, projectId: "project-1" };
  vi.mocked(getJson).mockImplementation(async (url) => {
    if (String(url).includes("cursor=500")) {
      return {
        items: [
          {
            id: "older-launch",
            projectId: "project-1",
            name: "Более ранний запуск",
            status: "closed",
            createdAt: "2025-01-01T00:00:00.000Z",
            counters: { passed: 1, failed: 0, broken: 0, skipped: 0, unknown: 0 }
          }
        ],
        page: { hasMore: false, nextCursor: null }
      } as never;
    }
    return { items: [], page: { hasMore: true, nextCursor: "500" } } as never;
  });

  await act(async () =>
    root.render(
      <LaunchComparisonScreen
        launch={launch}
        launchItems={[launch]}
        onSelectResult={() => undefined}
      />
    )
  );
  expect(container.textContent).not.toContain("Сравнение станет доступно после появления");
  expect(container.textContent).toContain("Показать более ранние");

  await act(async () =>
    Array.from(container.querySelectorAll<HTMLButtonElement>("button"))
      .find((button) => button.textContent === "Показать более ранние")
      ?.click()
  );
  expect(String(vi.mocked(getJson).mock.lastCall?.[0])).toContain("cursor=500");
  expect(container.querySelector('option[value="older-launch"]')?.textContent).toContain(
    "Более ранний запуск"
  );
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.mocked(getJson).mockReset();
});

it("pages comparison rows on the server and filters by change", async () => {
  const launches = demoM1Workspace.launchItems.map((item) => ({
    ...item,
    projectId: "project-1"
  }));
  await act(async () =>
    root.render(
      <LaunchComparisonScreen
        initialSession={{ baselineId: launches[1]!.id }}
        launch={launches[0]!}
        launchItems={launches}
        onSelectResult={() => undefined}
      />
    )
  );

  await act(async () =>
    container.querySelector<HTMLButtonElement>(".launches-reference-comparison-submit")?.click()
  );
  expect(String(vi.mocked(getJson).mock.lastCall?.[0])).toContain("limit=25&offset=0");
  expect(container.textContent).toContain("1–25 из 60");
  expect(container.textContent).toContain("Тест 1");
  expect(container.textContent).not.toContain("Тест 26");

  await act(async () =>
    container
      .querySelector<HTMLButtonElement>('[aria-label="Следующая страница: сравнение запусков"]')
      ?.click()
  );
  expect(String(vi.mocked(getJson).mock.lastCall?.[0])).toContain("limit=25&offset=25");
  expect(container.textContent).toContain("26–50 из 60");
  expect(container.textContent).toContain("Тест 26");

  const size = container.querySelector<HTMLSelectElement>(
    '[aria-label="Количество записей на странице: сравнение запусков"]'
  )!;
  await act(async () => {
    size.value = "50";
    size.dispatchEvent(new Event("change", { bubbles: true }));
  });
  expect(String(vi.mocked(getJson).mock.lastCall?.[0])).toContain("limit=50&offset=0");
  expect(container.textContent).toContain("1–50 из 60");

  const filter = container.querySelector<HTMLSelectElement>(
    '[aria-label="Фильтр изменений в сравнении"]'
  )!;
  await act(async () => {
    filter.value = "regressed";
    filter.dispatchEvent(new Event("change", { bubbles: true }));
  });
  expect(String(vi.mocked(getJson).mock.lastCall?.[0])).toContain("change=regressed");
  expect(container.textContent).toContain("1–2 из 2");
});

it("opens the baseline result for a test removed from the current launch", async () => {
  const launches = demoM1Workspace.launchItems.map((item) => ({ ...item, projectId: "project-1" }));
  const onSelectResult = vi.fn();
  vi.mocked(getJson).mockImplementation(async (url) => {
    if (!String(url).includes("/compare?")) {
      return { items: [], page: { hasMore: false, nextCursor: null } } as never;
    }
    const model = comparisonFor(String(url));
    model.base.id = launches[1]!.id;
    model.page = { limit: 25, offset: 0, returned: 1, total: 1, hasMore: false };
    model.rows = [
      {
        testCaseId: "removed-case",
        name: "Удалённый тест",
        change: "removed",
        durationTrend: "unavailable",
        base: { resultUuid: "base-result", status: "failed" }
      }
    ];
    return model as never;
  });

  await act(async () =>
    root.render(
      <LaunchComparisonScreen
        initialSession={{ baselineId: launches[1]!.id }}
        launch={launches[0]!}
        launchItems={launches}
        onSelectResult={onSelectResult}
      />
    )
  );
  await act(async () =>
    container.querySelector<HTMLButtonElement>(".launches-reference-comparison-submit")?.click()
  );
  await act(async () =>
    container
      .querySelector<HTMLButtonElement>(".launches-reference-comparison-row.is-removed")
      ?.click()
  );
  expect(onSelectResult).toHaveBeenCalledWith("base-result", launches[1]!.id);
});

function comparisonFor(url: string): LaunchComparisonReadModel {
  const params = new URL(url, "http://localhost").searchParams;
  const limit = Number(params.get("limit"));
  const offset = Number(params.get("offset"));
  const total = params.get("change") === "regressed" ? 2 : 60;
  const returned = Math.max(0, Math.min(limit, total - offset));
  return {
    kind: "launch-comparison",
    base: { id: "base", name: "Базовый", metrics: { passRate: 1, averageDurationMs: 100 } },
    target: { id: "target", name: "Текущий", metrics: { passRate: 0, averageDurationMs: 200 } },
    metricDeltas: { passRate: -1, averageDurationMs: 100 },
    summary: {
      new: 0,
      removed: 0,
      fixed: 0,
      regressed: 2,
      "status-changed": 0,
      unchanged: 58,
      durationRegressions: 2
    },
    page: { limit, offset, returned, total, hasMore: offset + returned < total },
    rows: Array.from({ length: returned }, (_, index) => ({
      testCaseId: `case-${offset + index + 1}`,
      name: `Тест ${offset + index + 1}`,
      change: "regressed",
      durationTrend: "slower",
      durationDeltaMs: 100,
      base: { resultUuid: `base-${index}`, status: "passed", durationMs: 100 },
      target: { resultUuid: `target-${index}`, status: "failed", durationMs: 200 }
    }))
  };
}
