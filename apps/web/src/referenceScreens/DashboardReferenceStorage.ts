import type { SavedDashboardWidget } from "./DashboardReferenceModel.js";
import {
  dashboardWidgetStorageKey,
  defaultDashboardWidgets,
  widgetTypes
} from "./DashboardReferenceModel.js";

export function loadSavedDashboardWidgets(): SavedDashboardWidget[] {
  if (typeof window === "undefined") {
    return defaultDashboardWidgets;
  }

  try {
    const rawWidgets = window.localStorage.getItem(dashboardWidgetStorageKey);
    if (rawWidgets === null) {
      return defaultDashboardWidgets;
    }
    const parsedWidgets: unknown = rawWidgets ? JSON.parse(rawWidgets) : [];

    if (!Array.isArray(parsedWidgets)) {
      return defaultDashboardWidgets;
    }

    return parsedWidgets.filter(isSavedDashboardWidget);
  } catch {
    return defaultDashboardWidgets;
  }
}

export function saveDashboardWidgets(widgets: SavedDashboardWidget[]) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(dashboardWidgetStorageKey, JSON.stringify(widgets));
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
    typeof widget.period === "string" &&
    typeof widget.thql === "string" &&
    typeof widget.kind === "string" &&
    widgetTypes.some((type) => type.id === widget.kind)
  );
}
