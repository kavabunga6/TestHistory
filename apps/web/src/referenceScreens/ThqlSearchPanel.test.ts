// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getAllowedThqlFilterScopes,
  splitVisibleThqlFilters,
  ThqlSearchPanel
} from "./ThqlSearchPanel.js";
import type { ThqlSavedFilter } from "../thqlSavedFilters.js";

const originalLocalStorage = globalThis.localStorage;

const filters: ThqlSavedFilter[] = Array.from({ length: 8 }, (_, index) => ({
  entity: "testCases",
  id: `filter-${index + 1}`,
  name: `Фильтр ${index + 1}`,
  query: "status = passed",
  scope: "global"
}));

describe("THQL search panel filter ordering", () => {
  let root: Root | undefined;
  let container: HTMLDivElement | undefined;

  afterEach(() => {
    root?.unmount();
    container?.remove();
    root = undefined;
    container = undefined;
    vi.restoreAllMocks();

    if (originalLocalStorage === undefined) {
      Reflect.deleteProperty(globalThis, "localStorage");
    } else {
      Object.defineProperty(globalThis, "localStorage", {
        configurable: true,
        value: originalLocalStorage
      });
    }
  });

  it("promotes an active overflow filter to the first visible chip", () => {
    const { overflowFilters, pinnedFilters } = splitVisibleThqlFilters(filters, "filter-8");

    expect(pinnedFilters.map((filter) => filter.id)).toEqual([
      "filter-8",
      "filter-1",
      "filter-2",
      "filter-3",
      "filter-4",
      "filter-5"
    ]);
    expect(overflowFilters.map((filter) => filter.id)).toEqual(["filter-6", "filter-7"]);
  });

  it("keeps an active visible filter in its original position", () => {
    const { overflowFilters, pinnedFilters } = splitVisibleThqlFilters(filters, "filter-3");

    expect(pinnedFilters.map((filter) => filter.id)).toEqual([
      "filter-1",
      "filter-2",
      "filter-3",
      "filter-4",
      "filter-5",
      "filter-6"
    ]);
    expect(overflowFilters.map((filter) => filter.id)).toEqual(["filter-7", "filter-8"]);
  });

  it("returns the active filter to overflow when selection is cleared", () => {
    const { overflowFilters, pinnedFilters } = splitVisibleThqlFilters(filters, undefined);

    expect(pinnedFilters.map((filter) => filter.id)).toEqual([
      "filter-1",
      "filter-2",
      "filter-3",
      "filter-4",
      "filter-5",
      "filter-6"
    ]);
    expect(overflowFilters.map((filter) => filter.id)).toEqual(["filter-7", "filter-8"]);
  });

  it("allows every filter scope only to global admins", () => {
    installMemoryLocalStorage({ "testhistory.userRole": "admin" });

    expect(getAllowedThqlFilterScopes("admin")).toEqual(["personal", "project", "global"]);
  });

  it("keeps regular users limited to personal filters unless they own project settings", () => {
    installMemoryLocalStorage({ "testhistory.userRole": "user" });

    expect(getAllowedThqlFilterScopes("user")).toEqual(["personal"]);
  });

  it("allows project owners to manage project filters without global filter access", () => {
    installMemoryLocalStorage({ "testhistory.userRole": "user" });

    expect(getAllowedThqlFilterScopes("anna.qa@example.test")).toEqual(["personal", "project"]);
  });

  it("clears the query and active filter when an active chip is clicked again", async () => {
    installMemoryLocalStorage({});
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("server filters unavailable"));
    const onQueryChange = vi.fn();
    const onActiveFilterChange = vi.fn();

    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    await act(async () => {
      root!.render(
        React.createElement(ThqlSearchPanel, {
          activeFilterId: "global-problem-launch-results",
          actorId: "admin",
          entity: "launchResults",
          projectId: "ws",
          query: 'status in ["failed", "broken"]',
          onActiveFilterChange,
          onQueryChange
        })
      );
    });

    const activeChip = container.querySelector<HTMLButtonElement>(".thql-search__chip.active");
    expect(activeChip).not.toBeNull();

    await act(async () => {
      activeChip!.click();
    });

    expect(onQueryChange).toHaveBeenCalledWith("");
    expect(onActiveFilterChange).toHaveBeenCalledWith(undefined);
  });

  it("traps focus, closes on Escape, and returns focus to the manage button", async () => {
    installMemoryLocalStorage({ "testhistory.userRole": "admin" });
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("server filters unavailable"));

    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    await act(async () => {
      root!.render(
        React.createElement(ThqlSearchPanel, {
          actorId: "admin",
          entity: "launches",
          projectId: "ws",
          query: "",
          onActiveFilterChange: vi.fn(),
          onQueryChange: vi.fn()
        })
      );
    });

    const manageButton = container.querySelector<HTMLButtonElement>(".thql-search__manage");
    expect(manageButton).not.toBeNull();
    expect(manageButton!.getAttribute("aria-label")).toBe("Управление фильтрами");
    expect(manageButton!.textContent).toBe("");
    manageButton!.focus();

    await act(async () => {
      manageButton!.click();
    });

    const dialog = container.querySelector<HTMLElement>(".thql-dialog");
    const closeButton = container.querySelector<HTMLButtonElement>(".thql-dialog__close");
    const applyButton = container.querySelector<HTMLButtonElement>(
      ".thql-dialog > footer .primary"
    );
    expect(dialog).not.toBeNull();
    expect(closeButton).not.toBeNull();
    expect(applyButton).not.toBeNull();
    expect(document.activeElement).toBe(closeButton);

    applyButton!.focus();
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { cancelable: true, key: "Tab" }));
    });
    expect(document.activeElement).toBe(closeButton);

    await act(async () => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { cancelable: true, key: "Tab", shiftKey: true })
      );
    });
    expect(document.activeElement).toBe(applyButton);

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { cancelable: true, key: "Escape" }));
    });

    expect(container.querySelector(".thql-dialog")).toBeNull();
    expect(document.activeElement).toBe(manageButton);
  });
});

function installMemoryLocalStorage(values: Record<string, string>) {
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => values[key] ?? null,
      setItem: (key: string, value: string) => {
        values[key] = value;
      }
    }
  });
}
