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
    vi.unstubAllGlobals();
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

  it("shows a status opened from the launch bar in the picker and clears its route query", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ kind: "thql-filter-list", items: [] })
    } as Response);
    const onOpenTab = vi.fn();
    await act(async () =>
      root.render(
        <LaunchesReferenceScreen
          launchItems={demoM1Workspace.launchItems}
          onOpenTab={onOpenTab}
          projectId="project-sandbox"
          results={demoM1Workspace.results}
          routeLaunchId={demoM1Workspace.launchItems[0]!.id}
          routeLaunchTab="results"
          routeQuery={'status = "failed"'}
        />
      )
    );

    const statusFilter = container.querySelector<HTMLSelectElement>(
      'select[aria-label="Фильтр по статусу"]'
    );
    const query = container.querySelector<HTMLInputElement>(
      'input[aria-label="THQL поиск результатов запуска"]'
    );
    expect(statusFilter?.value).toBe("failed");
    expect(query?.value).toBe('status = "failed"');

    await act(async () => {
      statusFilter!.value = "";
      statusFilter!.dispatchEvent(new Event("change", { bubbles: true }));
    });

    expect(query?.value).toBe("");
    expect(statusFilter?.value).toBe("");
    expect(onOpenTab).toHaveBeenCalledWith("results");
  });

  it("clears a routed status query when browser navigation returns to unfiltered results", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ kind: "thql-filter-list", items: [] })
    } as Response);
    const props = {
      launchItems: demoM1Workspace.launchItems,
      projectId: "project-sandbox",
      results: demoM1Workspace.results,
      routeLaunchId: demoM1Workspace.launchItems[0]!.id,
      routeLaunchTab: "results"
    };

    await act(async () =>
      root.render(<LaunchesReferenceScreen {...props} routeQuery={'status = "failed"'} />)
    );
    const query = container.querySelector<HTMLInputElement>(
      'input[aria-label="THQL поиск результатов запуска"]'
    );
    const statusFilter = container.querySelector<HTMLSelectElement>(
      'select[aria-label="Фильтр по статусу"]'
    );
    expect(query?.value).toBe('status = "failed"');
    expect(statusFilter?.value).toBe("failed");

    await act(async () => root.render(<LaunchesReferenceScreen {...props} />));
    expect(query?.value).toBe("");
    expect(statusFilter?.value).toBe("");
  });

  it("follows result route changes between mobile list and detail", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ kind: "thql-filter-list", items: [] })
    } as Response);
    const onOpenTab = vi.fn();
    const props = {
      launchItems: demoM1Workspace.launchItems,
      onOpenTab,
      projectId: "project-sandbox",
      results: demoM1Workspace.results,
      routeLaunchId: demoM1Workspace.launchItems[0]!.id,
      routeLaunchTab: "results"
    };

    await act(async () => root.render(<LaunchesReferenceScreen {...props} />));
    expect(
      container.querySelector(".launches-reference-results-split.is-mobile-list")
    ).not.toBeNull();

    await act(async () =>
      root.render(
        <LaunchesReferenceScreen {...props} routeResultId={demoM1Workspace.results[0]!.id} />
      )
    );
    expect(
      container.querySelector(".launches-reference-results-split.is-mobile-detail")
    ).not.toBeNull();
    await act(async () =>
      container.querySelector<HTMLButtonElement>(".launches-reference-mobile-back")!.click()
    );
    expect(onOpenTab).toHaveBeenCalledWith("results");

    await act(async () => root.render(<LaunchesReferenceScreen {...props} />));
    expect(
      container.querySelector(".launches-reference-results-split.is-mobile-list")
    ).not.toBeNull();
  });

  it("does not mark a default result as selected in the mobile list", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ kind: "thql-filter-list", items: [] })
    } as Response);
    const listeners = new Set<() => void>();
    const media = {
      matches: true,
      addEventListener: (_: string, listener: () => void) => listeners.add(listener),
      removeEventListener: (_: string, listener: () => void) => listeners.delete(listener)
    };
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => media)
    );

    await act(async () =>
      root.render(
        <LaunchesReferenceScreen
          launchItems={demoM1Workspace.launchItems}
          projectId="project-sandbox"
          results={demoM1Workspace.results}
          routeLaunchId={demoM1Workspace.launchItems[0]!.id}
          routeLaunchTab="results"
          selectedResultId={demoM1Workspace.results[0]!.id}
        />
      )
    );

    expect(
      container.querySelector(".launches-reference-result-table > button.selected")
    ).toBeNull();
    expect(
      container.querySelector('.launches-reference-result-table > button[aria-current="true"]')
    ).toBeNull();

    media.matches = false;
    await act(async () => listeners.forEach((listener) => listener()));
    expect(
      container.querySelector(".launches-reference-result-table > button.selected")
    ).not.toBeNull();
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

    const rows = container.querySelectorAll<HTMLElement>(".launches-reference-list-row");
    expect(rows).toHaveLength(13);
    expect(rows[0]!.textContent).toContain("Запуск 51");
    expect(rows[12]!.textContent).toContain("Запуск 63");
  });

  it("shows the complete short launch ID in the list", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ kind: "thql-filter-list", items: [] })
    } as Response);
    await act(async () =>
      root.render(
        <LaunchesReferenceScreen
          launchItems={[{ ...demoM1Workspace.launchItems[0]!, id: "L-1289" }]}
          projectId="project-sandbox"
          results={[]}
        />
      )
    );
    expect(container.querySelector(".launches-reference-list-id")?.textContent).toBe("ID L-1289");
  });

  it("shows the complete UUID and opens each status filter directly from its segment", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ kind: "thql-filter-list", items: [] })
    } as Response);
    const launchId = "f8e55c2f-ba23-47d5-b356-a7059bd24a08";
    const onOpenLaunch = vi.fn();
    const onOpenLaunchStatus = vi.fn();
    const launch = {
      ...demoM1Workspace.launchItems[0]!,
      id: launchId,
      counters: {
        broken: 10,
        failed: 20,
        muted: 0,
        passed: 50,
        skipped: 10,
        unknown: 10
      }
    };
    const counts = { broken: "10", failed: "20", passed: "50", skipped: "10", unknown: "10" };

    for (const status of ["failed", "broken", "unknown", "passed", "skipped"] as const) {
      await act(async () =>
        root.render(
          <LaunchesReferenceScreen
            key={status}
            launchItems={[launch]}
            onOpenLaunch={onOpenLaunch}
            onOpenLaunchStatus={onOpenLaunchStatus}
            projectId="project-sandbox"
            results={[]}
          />
        )
      );

      const row = container.querySelector<HTMLElement>(".launches-reference-list-row");
      expect(row?.querySelector(".launches-reference-list-id")?.textContent).toBe(`ID ${launchId}`);
      expect(row?.querySelector(".launches-reference-progress-legend")).toBeNull();
      expect(row?.querySelector("button button")).toBeNull();

      const segment = row?.querySelector<HTMLButtonElement>(
        `.launches-reference-progress button.is-${status}`
      );
      expect(segment?.textContent?.trim()).toBe(counts[status]);
      await act(async () => segment!.click());
      expect(onOpenLaunchStatus).toHaveBeenCalledExactlyOnceWith(launchId, status);
      onOpenLaunchStatus.mockClear();
    }
    expect(onOpenLaunch).not.toHaveBeenCalled();
  });

  it("opens the launch overview from its separate title button", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ kind: "thql-filter-list", items: [] })
    } as Response);
    const launchId = "f8e55c2f-ba23-47d5-b356-a7059bd24a08";
    const onOpenLaunch = vi.fn();
    const onOpenLaunchStatus = vi.fn();
    await act(async () =>
      root.render(
        <LaunchesReferenceScreen
          launchItems={[{ ...demoM1Workspace.launchItems[0]!, id: launchId }]}
          onOpenLaunch={onOpenLaunch}
          onOpenLaunchStatus={onOpenLaunchStatus}
          projectId="project-sandbox"
          results={[]}
        />
      )
    );

    const row = container.querySelector<HTMLElement>(".launches-reference-list-row");
    await act(async () =>
      row!.querySelector<HTMLButtonElement>(".launches-reference-list-open")!.click()
    );
    expect(onOpenLaunch).toHaveBeenCalledExactlyOnceWith(launchId);
    expect(onOpenLaunchStatus).not.toHaveBeenCalled();
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
