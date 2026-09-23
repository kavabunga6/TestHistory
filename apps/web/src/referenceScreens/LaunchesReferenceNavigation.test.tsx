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
});
