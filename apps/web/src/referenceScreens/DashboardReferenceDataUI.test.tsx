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
    const text = container.textContent?.replaceAll("\u00a0", " ");
    expect(text).toContain("10 000 результатов · весь запуск");
    expect(text).toContain("Успешных результатов: 9 000");
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
    expect(container.textContent).toContain("1 результат · весь запуск");
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
    expect(container.textContent).toContain("1 результат · весь запуск");

    const select = container.querySelector<HTMLSelectElement>(
      ".dashboard-reference-launch-picker select"
    )!;
    await act(async () => {
      select.value = "launch-2";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(container.textContent).toContain("Second");
    expect(container.textContent).toContain("2 результата · весь запуск");
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toContain(
      "/api/v1/launches/launch-2/dashboard/aggregate"
    );
  });

  function mount() {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
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
    counters: { failed: 0, broken: 0, passed: 0, skipped: 0, muted: 0 }
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
