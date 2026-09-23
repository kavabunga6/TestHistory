import type { SavedDashboardWidget } from "./DashboardReferenceModel.js";
import {
  dashboardWidgetStorageKey,
  defaultDashboardWidgets,
  widgetTypes
} from "./DashboardReferenceModel.js";

function widgetStorageKey(scope?: string): string {
  return scope === undefined
    ? dashboardWidgetStorageKey
    : `${dashboardWidgetStorageKey}:${encodeURIComponent(scope)}`;
}

export function loadSavedDashboardWidgets(scope?: string): SavedDashboardWidget[] {
  if (typeof window === "undefined") {
    return defaultDashboardWidgets;
  }

  try {
    const storageKey = widgetStorageKey(scope);
    let rawWidgets = window.localStorage.getItem(storageKey);
    if (rawWidgets === null && scope !== undefined) {
      rawWidgets = window.localStorage.getItem(dashboardWidgetStorageKey);
      if (rawWidgets !== null) {
        window.localStorage.setItem(storageKey, rawWidgets);
        window.localStorage.removeItem(dashboardWidgetStorageKey);
      }
    }
    if (rawWidgets === null) {
      return defaultDashboardWidgets;
    }
    const parsedWidgets: unknown = rawWidgets ? JSON.parse(rawWidgets) : [];

    if (!Array.isArray(parsedWidgets)) {
      return defaultDashboardWidgets;
    }

    return parsedWidgets.filter(isSavedDashboardWidget).map((widget) => ({
      ...widget,
      title:
        widget.id === "dashboard-default-pass-rate" && widget.title === "Успешность среза"
          ? "Успешность запуска"
          : widget.id === "dashboard-default-slow-tests" &&
              widget.title === "Медленные и рисковые тесты"
            ? "Самые долгие тесты"
            : widget.title
    }));
  } catch {
    return defaultDashboardWidgets;
  }
}

export function saveDashboardWidgets(widgets: SavedDashboardWidget[], scope?: string) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(widgetStorageKey(scope), JSON.stringify(widgets));
  } catch {
    // Widget edits remain usable for this session when storage is disabled.
  }
}

function isSavedDashboardWidget(value: unknown): value is SavedDashboardWidget {
  if (!value || typeof value !== "object") {
    return false;
  }

  const widget = value as Partial<Record<keyof SavedDashboardWidget, unknown>>;

  return (
    typeof widget.id === "string" &&
    typeof widget.title === "string" &&
    typeof widget.entity === "string" &&
    typeof widget.metric === "string" &&
    typeof widget.groupBy === "string" &&
    typeof widget.thql === "string" &&
    typeof widget.kind === "string" &&
    widgetTypes.some((type) => type.id === widget.kind)
  );
}
