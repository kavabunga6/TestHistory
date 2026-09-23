// @vitest-environment jsdom

import { afterEach, expect, it } from "vitest";

import { dashboardWidgetStorageKey, defaultDashboardWidgets } from "./DashboardReferenceModel.js";
import { loadSavedDashboardWidgets, saveDashboardWidgets } from "./DashboardReferenceStorage.js";

afterEach(() => window.localStorage.clear());

it("migrates saved widgets once and keeps each user-project dashboard separate", () => {
  const legacyWidgets = [
    {
      ...defaultDashboardWidgets[0]!,
      title: "Успешность среза"
    }
  ];
  window.localStorage.setItem(dashboardWidgetStorageKey, JSON.stringify(legacyWidgets));

  const first = loadSavedDashboardWidgets("admin:project-a");
  expect(first[0]?.title).toBe("Успешность запуска");
  expect(window.localStorage.getItem(dashboardWidgetStorageKey)).toBeNull();

  saveDashboardWidgets([], "admin:project-b");
  expect(loadSavedDashboardWidgets("admin:project-b")).toEqual([]);
  expect(loadSavedDashboardWidgets("admin:project-a")).toEqual(first);
  expect(loadSavedDashboardWidgets("other-user:project-a")).toEqual(defaultDashboardWidgets);
});
