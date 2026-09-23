import type { DashboardAggregateGroup } from "@testhistory/contracts";

import type { MetricKind } from "./DashboardReferenceModel.js";

export function metricLabel(metric: MetricKind): string {
  if (metric === "passRate") {
    return "Доля успешных";
  }
  if (metric === "averageDuration") {
    return "Средняя длительность";
  }
  if (metric === "retryCount") {
    return "Количество ретраев";
  }
  return "Количество";
}

export function buildDonutGradient(groups: DashboardAggregateGroup[]): string {
  if (groups.every((group) => group.value === 0)) {
    return "radial-gradient(circle at center, #fff 0 55%, transparent 56%), conic-gradient(#d7dee8 0 100%)";
  }

  const total = groups.reduce((sum, group) => sum + group.value, 0);
  let cursor = 0;
  const segments = groups.map((group, index) => {
    const start = cursor;
    cursor += (group.value / total) * 100;
    return `${groupColor(group, index)} ${start}% ${cursor}%`;
  });

  return `radial-gradient(circle at center, #fff 0 55%, transparent 56%), conic-gradient(${segments.join(", ")})`;
}

export function emptyGroupRows(): DashboardAggregateGroup[] {
  return [{ key: "empty", label: "Нет данных", percent: 0, value: 0 }];
}

export function formatPercent(value: number): string {
  return `${value.toFixed(value >= 10 ? 1 : 2)}%`;
}

function groupColor(group: DashboardAggregateGroup, index: number): string {
  if (group.status === "passed") {
    return "#3fa34d";
  }
  if (group.status === "failed") {
    return "#d9534f";
  }
  if (group.status === "broken") {
    return "#e39b3b";
  }
  if (group.status === "skipped") {
    return "#8a98aa";
  }
  if (group.status === "muted") {
    return "#7c8db5";
  }
  return ["#2f6fed", "#3fa34d", "#e39b3b", "#8b5cf6", "#14a3a0"][index % 5]!;
}
