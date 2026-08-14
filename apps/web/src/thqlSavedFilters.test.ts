import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getAvailableThqlFilters,
  getVisibleThqlFilters,
  isDefaultThqlFilter,
  loadThqlFilterVisibility,
  saveThqlFilter,
  savePersonalThqlFilter,
  deleteThqlFilter,
  saveThqlFilterVisibility
} from "./thqlSavedFilters.js";

const originalLocalStorage = globalThis.localStorage;

afterEach(() => {
  if (originalLocalStorage === undefined) {
    Reflect.deleteProperty(globalThis, "localStorage");
  } else {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: originalLocalStorage
    });
  }
  vi.restoreAllMocks();
});

describe("THQL saved filters", () => {
  it("separates global, project, and personal filter visibility", () => {
    installMemoryLocalStorage();
    savePersonalThqlFilter("qa-lead", {
      id: "personal-owned",
      name: "Мой фильтр",
      query: 'owner = "QA Lead"'
    });

    const ownerFilters = getAvailableThqlFilters({ actorId: "qa-lead", projectId: "ws" });
    const otherUserFilters = getAvailableThqlFilters({ actorId: "viewer", projectId: "ws" });
    const otherProjectFilters = getAvailableThqlFilters({
      actorId: "qa-lead",
      projectId: "mobile"
    });

    expect(ownerFilters.map((filter) => filter.id)).toContain("personal-owned");
    expect(otherUserFilters.map((filter) => filter.id)).not.toContain("personal-owned");
    expect(ownerFilters.map((filter) => filter.id)).toContain("project-checkout");
    expect(otherProjectFilters.map((filter) => filter.id)).not.toContain("project-checkout");
    expect(otherProjectFilters.map((filter) => filter.id)).toContain("global-problem-results");
  });

  it("hides filters only for the current actor", () => {
    installMemoryLocalStorage();
    const filters = getAvailableThqlFilters({ actorId: "admin", projectId: "ws" });
    saveThqlFilterVisibility("admin", { hiddenFilterIds: ["global-problem-results"] });

    expect(loadThqlFilterVisibility("admin").hiddenFilterIds).toEqual(["global-problem-results"]);
    expect(
      getVisibleThqlFilters({ actorId: "admin", filters }).map((filter) => filter.id)
    ).not.toContain("global-problem-results");
    expect(
      getVisibleThqlFilters({ actorId: "other", filters }).map((filter) => filter.id)
    ).toContain("global-problem-results");
  });

  it("keeps saved filters scoped to the current searchable entity", () => {
    installMemoryLocalStorage();
    savePersonalThqlFilter("qa-lead", {
      entity: "defects",
      id: "personal-defects",
      name: "Мои дефекты",
      query: 'owner = "QA Lead"'
    });

    const defectFilters = getAvailableThqlFilters({
      actorId: "qa-lead",
      entity: "defects",
      projectId: "ws"
    }).map((filter) => filter.id);
    const testCaseFilters = getAvailableThqlFilters({
      actorId: "qa-lead",
      entity: "testCases",
      projectId: "ws"
    }).map((filter) => filter.id);

    expect(defectFilters).toContain("global-open-defects");
    expect(defectFilters).toContain("personal-defects");
    expect(defectFilters).not.toContain("project-checkout");
    expect(testCaseFilters).toContain("project-checkout");
    expect(testCaseFilters).not.toContain("personal-defects");
  });

  it("stores user-managed global and project filters with scope-aware visibility", () => {
    installMemoryLocalStorage();
    saveThqlFilter("admin", {
      entity: "launches",
      name: "Все ночные",
      query: 'name ~= "Nightly"',
      scope: "global"
    });
    const projectFilter = saveThqlFilter("admin", {
      entity: "launches",
      name: "Только WS",
      projectId: "ws",
      query: 'branch = "develop"',
      scope: "project"
    });

    expect(
      getAvailableThqlFilters({ actorId: "viewer", entity: "launches", projectId: "ws" }).map(
        (filter) => filter.name
      )
    ).toEqual(expect.arrayContaining(["Все ночные", "Только WS"]));
    expect(
      getAvailableThqlFilters({ actorId: "viewer", entity: "launches", projectId: "mobile" }).map(
        (filter) => filter.name
      )
    ).not.toContain("Только WS");

    deleteThqlFilter("admin", projectFilter.id);
    expect(
      getAvailableThqlFilters({ actorId: "viewer", entity: "launches", projectId: "ws" }).map(
        (filter) => filter.id
      )
    ).not.toContain(projectFilter.id);
  });

  it("does not delete built-in filters from local management", () => {
    installMemoryLocalStorage();

    expect(isDefaultThqlFilter("global-open-defects")).toBe(true);
    deleteThqlFilter("admin", "global-open-defects");

    expect(
      getAvailableThqlFilters({ actorId: "admin", entity: "defects", projectId: "ws" }).map(
        (filter) => filter.id
      )
    ).toContain("global-open-defects");
  });

  it("merges server filters with local filters and keeps server data authoritative by id", () => {
    installMemoryLocalStorage();
    saveThqlFilter("admin", {
      entity: "testCases",
      id: "project-checkout",
      name: "Старый checkout",
      projectId: "ws",
      query: 'tag = "old"',
      scope: "project"
    });

    const filters = getAvailableThqlFilters({
      actorId: "admin",
      entity: "testCases",
      filters: [
        {
          entity: "testCases",
          id: "project-checkout",
          name: "Checkout API",
          projectId: "ws",
          query: 'tag = "checkout"',
          scope: "project"
        }
      ],
      projectId: "ws"
    });

    expect(filters.filter((filter) => filter.id === "project-checkout")).toHaveLength(1);
    expect(filters.find((filter) => filter.id === "project-checkout")?.name).toBe("Checkout API");
  });
});

function installMemoryLocalStorage() {
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      removeItem: (key: string) => {
        values.delete(key);
      },
      setItem: (key: string, value: string) => {
        values.set(key, value);
      }
    }
  });
}
