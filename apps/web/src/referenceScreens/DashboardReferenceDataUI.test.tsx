// @vitest-environment jsdom

import type { LaunchDashboardAggregateReadModel } from "@testhistory/contracts";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DashboardReferenceScreen } from "./DashboardReferenceScreen.js";
import { dashboardWidgetStorageKey, defaultDashboardWidgets } from "./DashboardReferenceModel.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("dashboard aggregate states", () => {
  let container: HTMLDivElement;
  let root: Root;

  afterEach(() => {
    if (root) {
      act(() => root.unmount());
    }
    container?.remove();
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it("shows the whole launch and opens an aggregated table result", async () => {
    window.localStorage.setItem(dashboardWidgetStorageKey, JSON.stringify(defaultDashboardWidgets));
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(jsonResponse(aggregate(10_000)));
    const onOpenResult = vi.fn();
    mount();

    act(() => root.render(screen(onOpenResult)));
    expect(container.textContent).toContain("Расчёт показателей запуска");
    expect(container.textContent).not.toContain("10 000 результатов");

    await act(async () => {
      await Promise.resolve();
    });
    expectDashboardSummary("Nightly", "10 000");
    expect(container.textContent?.replaceAll("\u00a0", " ")).toContain(
      "Успешных результатов: 9 000"
    );
    expect(container.textContent).not.toContain("Ретраи 0");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/v1/launches/launch-1/dashboard/aggregate");

    const result = container.querySelector<HTMLButtonElement>(".dashboard-reference-result-link");
    expect(result?.textContent).toBe("Risky test");
    await act(async () => result?.click());
    expect(onOpenResult).toHaveBeenCalledWith("result-1", "launch-1");
  });

  it("shows an error and retries without exposing stale values", async () => {
    window.localStorage.setItem(dashboardWidgetStorageKey, JSON.stringify(defaultDashboardWidgets));
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("error", { status: 500 }))
      .mockResolvedValueOnce(jsonResponse(aggregate(1)));
    mount();

    await act(async () => root.render(screen()));
    await act(async () => {
      await Promise.resolve();
    });
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    expect(container.querySelector(".dashboard-reference-widget-grid")).toBeNull();

    const retry = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Повторить загрузку")
    );
    await act(async () => retry?.click());
    await act(async () => {
      await Promise.resolve();
    });
    expectDashboardSummary("Nightly", "1");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("changes the selected launch and requests its own aggregate", async () => {
    window.localStorage.setItem(dashboardWidgetStorageKey, JSON.stringify(defaultDashboardWidgets));
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const launchId = String(url).includes("launch-2") ? "launch-2" : "launch-1";
      return jsonResponse({ ...aggregate(launchId === "launch-2" ? 2 : 1), launchId });
    });
    mount();
    await act(async () =>
      root.render(
        <DashboardReferenceScreen
          launchItems={[launch("launch-1", "First"), launch("launch-2", "Second")]}
        />
      )
    );
    expectDashboardSummary("First", "1");

    const select = container.querySelector<HTMLSelectElement>(
      ".dashboard-reference-launch-picker select"
    )!;
    await act(async () => {
      select.value = "launch-2";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(container.textContent).toContain("Second");
    expectDashboardSummary("Second", "2");
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toContain(
      "/api/v1/launches/launch-2/dashboard/aggregate"
    );
  });

  it("loads another catalog page and opens a launch beyond the initial 25", async () => {
    window.localStorage.setItem(dashboardWidgetStorageKey, JSON.stringify(defaultDashboardWidgets));
    const firstPage = Array.from({ length: 100 }, (_, index) =>
      apiLaunch(`launch-${index + 1}`, `Run ${index + 1}`)
    );
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const path = String(url);
      if (path.includes("/projects/project-1/launches?")) {
        return path.includes("cursor=100")
          ? jsonResponse({
              items: [apiLaunch("old-launch", "Old run")],
              page: { nextCursor: null, hasMore: false, total: 101 }
            })
          : jsonResponse({
              items: firstPage,
              page: { nextCursor: "100", hasMore: true, total: 101 }
            });
      }
      const launchId = path.includes("old-launch") ? "old-launch" : "launch-1";
      return jsonResponse({ ...aggregate(launchId === "old-launch" ? 12 : 1), launchId });
    });
    mount();

    await act(async () =>
      root.render(
        <DashboardReferenceScreen
          launchItems={firstPage.slice(0, 25).map((item) => launch(item.id, item.name))}
          projectId="project-1"
        />
      )
    );
    expect(container.textContent).toContain("100 из 101 запусков");
    const loadMore = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Показать более ранние")
    );
    await act(async () => loadMore?.click());

    const select = container.querySelector<HTMLSelectElement>(
      ".dashboard-reference-launch-picker select"
    )!;
    expect(Array.from(select.options).some((option) => option.value === "old-launch")).toBe(true);
    await act(async () => {
      select.value = "old-launch";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expectDashboardSummary("Old run", "12");
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toContain(
      "/api/v1/launches/old-launch/dashboard/aggregate"
    );
  });

  it("does not claim there are no launches while the catalog is loading or failed", async () => {
    window.localStorage.setItem(dashboardWidgetStorageKey, JSON.stringify(defaultDashboardWidgets));
    let rejectList: ((reason: Error) => void) | undefined;
    vi.spyOn(globalThis, "fetch").mockImplementation(
      () =>
        new Promise<Response>((_resolve, reject) => {
          rejectList = reject;
        })
    );
    mount();
    await act(async () => root.render(<DashboardReferenceScreen projectId="project-1" />));

    expect(container.textContent).toContain("Загружаем список запусков");
    expect(container.textContent).not.toContain("Пока нет запусков");
    await act(async () => rejectList?.(new Error("network")));
    expect(container.textContent).toContain("Не удалось загрузить запуски");
    expect(container.textContent).not.toContain("Пока нет запусков");
  });

  it("explains an empty launch while keeping widgets available to configure", async () => {
    window.localStorage.setItem(dashboardWidgetStorageKey, JSON.stringify(defaultDashboardWidgets));
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(aggregate(0)));
    mount();
    await act(async () => root.render(screen()));

    expect(container.textContent).toContain("Один запуск");
    expect(container.textContent).toContain("Выбранный запуск");
    expect(container.textContent).toContain("В этом запуске пока нет результатов");
    expect(container.querySelector(".dashboard-reference-widget-grid")).not.toBeNull();
  });

  it("links status counts to filtered results when the launch counters are complete", async () => {
    window.localStorage.setItem(dashboardWidgetStorageKey, JSON.stringify(defaultDashboardWidgets));
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(aggregate(10)));
    mount();
    await act(async () =>
      root.render(
        <DashboardReferenceScreen
          launchItems={[
            {
              ...launch("launch-1", "Nightly"),
              counters: { passed: 5, failed: 2, broken: 2, skipped: 1, unknown: 0, muted: 0 }
            }
          ]}
        />
      )
    );

    const failed = container.querySelector<HTMLAnchorElement>(
      ".dashboard-launch-summary__metric.is-failed"
    );
    expect(failed?.textContent).toContain("Проваленные");
    expect(failed?.querySelector("strong")?.textContent).toBe("2");
    expect(failed?.getAttribute("href")).toContain("status+%3D+%22failed%22");
    expect(container.querySelectorAll(".dashboard-launch-summary__distribution span")).toHaveLength(
      4
    );
  });

  it("renders an explicitly grouped table as groups rather than individual results", async () => {
    const ownersWidget = {
      ...defaultDashboardWidgets[2]!,
      id: "owners",
      title: "Проблемные тесты по владельцам",
      groupBy: "owner",
      thql: 'from results where status in ["failed", "broken"] group by owner measure count()'
    };
    window.localStorage.setItem(dashboardWidgetStorageKey, JSON.stringify([ownersWidget]));
    const ownerAggregate = aggregate(3);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({
        ...ownerAggregate,
        widgets: [
          {
            ...ownerAggregate.widgets[2],
            id: "owners",
            groupCount: 2,
            groups: [
              { key: "Web QA", label: "Web QA", value: 2, percent: 100 },
              { key: "API QA", label: "API QA", value: 1, percent: 50 }
            ]
          }
        ]
      })
    );
    mount();
    await act(async () => root.render(screen()));

    const groupedTable = container.querySelector('[aria-label="Таблица по группам"]');
    expect(groupedTable?.textContent).toContain("Владелец");
    expect(groupedTable?.textContent).toContain("Web QA");
    expect(groupedTable?.textContent).toContain("API QA");
    expect(groupedTable?.textContent).not.toContain("Risky test");
  });

  function mount() {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  }

  function expectDashboardSummary(name: string, total: string) {
    expect(container.querySelector(".dashboard-launch-summary__title-row h2")?.textContent).toBe(
      name
    );
    expect(
      container
        .querySelector(".dashboard-launch-summary__metric.is-total strong")
        ?.textContent?.replaceAll("\u00a0", " ")
    ).toBe(total);
  }
});

function screen(onOpenResult?: (id: string, launchId: string) => void) {
  return (
    <DashboardReferenceScreen
      launchItems={[launch("launch-1", "Nightly")]}
      onOpenResult={onOpenResult}
    />
  );
}

function launch(id: string, name: string) {
  return {
    id,
    name,
    state: "closed" as const,
    metadata: [],
    defects: 0,
    members: 0,
    counters: { failed: 0, broken: 0, passed: 0, skipped: 0, muted: 0, unknown: 0 }
  };
}

function apiLaunch(id: string, name: string) {
  return {
    id,
    projectId: "project-1",
    name,
    status: "closed",
    counters: { failed: 0, broken: 0, passed: 1, skipped: 0, unknown: 0 }
  };
}

function aggregate(totalResults: number): LaunchDashboardAggregateReadModel {
  const ready = {
    status: "ready" as const,
    filteredCount: totalResults,
    passedCount: Math.round(totalResults * 0.9),
    passRate: 90,
    averageDurationMs: 120,
    averageDuration: "120ms",
    retryCount: null,
    metricKind: "count" as const,
    value: String(totalResults),
    groupCount: 1,
    groupsTruncated: false,
    groups: [
      {
        key: "passed",
        label: "Успешный",
        value: totalResults,
        percent: 100,
        status: "passed" as const
      }
    ],
    tableRows: [
      {
        id: "result-1",
        uuid: "result-1",
        launchId: "launch-1",
        name: "Risky test",
        status: "failed" as const,
        duration: "120ms"
      }
    ]
  };
  return {
    kind: "launch-dashboard-aggregate",
    launchId: "launch-1",
    projectId: "project-1",
    totalResults,
    widgets: defaultDashboardWidgets.map((widget) => ({
      ...ready,
      id: widget.id,
      metricKind: widget.kind === "metric" ? ("passRate" as const) : ("count" as const),
      value: widget.kind === "metric" ? "90.0%" : String(totalResults)
    }))
  };
}

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
}
