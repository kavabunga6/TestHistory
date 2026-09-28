// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { demoM1Workspace } from "../m1Workspace.js";
import { LaunchesReferenceScreen } from "./LaunchesReferenceScreen.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("launch results navigation", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it("leaves a routed result when a new status filter is selected", async () => {
    const onOpenTab = vi.fn();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ kind: "thql-filter-list", items: [] })
    } as Response);
    await act(async () =>
      root.render(
        <LaunchesReferenceScreen
          launchItems={demoM1Workspace.launchItems}
          onOpenTab={onOpenTab}
          projectId="project-sandbox"
          results={demoM1Workspace.results}
          routeLaunchId={demoM1Workspace.launchItems[0]!.id}
          routeResultId={demoM1Workspace.results[0]!.id}
          routeLaunchTab="results"
        />
      )
    );

    const statusFilter = container.querySelector<HTMLSelectElement>(
      'select[aria-label="Фильтр по статусу"]'
    );
    expect(statusFilter).not.toBeNull();
    await act(async () => {
      statusFilter!.value = "failed";
      statusFilter!.dispatchEvent(new Event("change", { bubbles: true }));
    });

    expect(onOpenTab).toHaveBeenCalledWith("results");
    expect(fetchMock.mock.calls.map(([input]) => String(input))).toContain(
      "/api/v1/thql/filters?entity=launchResults&projectId=project-sandbox"
    );
  });

  it("keeps launches after the first 50 available through pagination", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ kind: "thql-filter-list", items: [] })
    } as Response);
    const launchItems = Array.from({ length: 63 }, (_, index) => ({
      ...demoM1Workspace.launchItems[0]!,
      id: `launch-${index + 1}`,
      name: `Запуск ${index + 1}`
    }));

    await act(async () =>
      root.render(
        <LaunchesReferenceScreen
          launchItems={launchItems}
          projectId="project-sandbox"
          results={[]}
        />
      )
    );
    expect(container.querySelectorAll(".launches-reference-list-row")).toHaveLength(25);

    const nextPage = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Следующая страница: Запуски"]'
    );
    await act(async () => nextPage!.click());
    await act(async () => nextPage!.click());

    const rows = container.querySelectorAll<HTMLButtonElement>(".launches-reference-list-row");
    expect(rows).toHaveLength(13);
    expect(rows[0]!.textContent).toContain("Запуск 51");
    expect(rows[12]!.textContent).toContain("Запуск 63");
  });

  it("uses the server page count and requests the next launch page", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ kind: "thql-filter-list", items: [] })
    } as Response);
    const onLaunchPageIndexChange = vi.fn();
    const launchItems = Array.from({ length: 25 }, (_, index) => ({
      ...demoM1Workspace.launchItems[0]!,
      id: `launch-${index + 26}`,
      name: `Запуск ${index + 26}`
    }));

    await act(async () =>
      root.render(
        <LaunchesReferenceScreen
          launchItems={launchItems}
          launchPage={{
            cursor: "25",
            hasMore: true,
            limit: 25,
            nextCursor: "50",
            offset: 25,
            returned: 25,
            total: 63
          }}
          launchPageIndex={1}
          launchPageSize={25}
          onLaunchPageIndexChange={onLaunchPageIndexChange}
          onLaunchPageSizeChange={vi.fn()}
          projectId="project-sandbox"
          results={[]}
        />
      )
    );

    expect(container.querySelectorAll(".launches-reference-list-row")).toHaveLength(25);
    expect(container.querySelector(".reference-list-pagination__range")?.textContent).toBe(
      "26–50 из 63"
    );
    await act(async () =>
      container
        .querySelector<HTMLButtonElement>('button[aria-label="Следующая страница: Запуски"]')!
        .click()
    );
    expect(onLaunchPageIndexChange).toHaveBeenCalledWith(2);
  });
});
