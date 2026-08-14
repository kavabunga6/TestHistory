import type { ResultStatus, TestResult } from "../m1Workspace.js";
import type {
  MetricKind,
  SavedDashboardWidget,
  WidgetEvaluation,
  WidgetGroup
} from "./DashboardReferenceModel.js";
import { statusLabels, statusOrder } from "./DashboardReferenceModel.js";

export function evaluateWidget(
  widget: SavedDashboardWidget,
  results: TestResult[]
): WidgetEvaluation {
  const filteredResults = filterResultsByThql(results, widget.thql);
  const metricKind = detectMetricKind(widget);
  const groups = groupResults(filteredResults, detectGroupBy(widget));
  const passedRate = calculatePassRate(filteredResults);
  const averageDuration = formatDurationSeconds(calculateAverageDurationSeconds(filteredResults));
  const retryCount = filteredResults.reduce(
    (total, result) => total + (result.retryAttempts?.length ?? 0),
    0
  );
  const value = formatMetricValue(metricKind, {
    averageDuration,
    filteredResults,
    passedRate,
    retryCount
  });

  return {
    averageDuration,
    filteredResults,
    groups,
    metricKind,
    passedRate,
    retryCount,
    series: buildSeries(filteredResults, metricKind),
    tableRows: filteredResults.slice(0, 20),
    value
  };
}

export function filterResultsByThql(results: TestResult[], thql: string): TestResult[] {
  const whereClause = extractWhereClause(thql);
  const explicitMutedFilter = /\bmuted\b/i.test(whereClause);
  const terms = whereClause
    .split(/\s+and\s+/i)
    .map((term) => term.trim())
    .filter(Boolean);

  return results.filter((result) => {
    if (!explicitMutedFilter && result.muted) {
      return false;
    }
    return terms.every((term) => matchTerm(result, term));
  });
}

export function extractWhereClause(thql: string): string {
  const normalized = thql.trim();
  const whereMatch = normalized.match(
    /\bwhere\b([\s\S]*?)(?:\bgroup\s+by\b|\border\s+by\b|\bmeasure\b|\blimit\b|$)/i
  );

  if (whereMatch?.[1]) {
    return whereMatch[1].trim();
  }

  if (/^[a-z.]+:/i.test(normalized)) {
    return normalized;
  }

  return "";
}

export function matchTerm(result: TestResult, term: string): boolean {
  const normalized = term.replace(/[()]/g, "").trim();

  if (normalized.length === 0) {
    return true;
  }

  const equalityMatch = normalized.match(/^([a-zA-Z0-9_.]+)\s*(?::|=)\s*(.+)$/);
  if (equalityMatch === null) {
    return true;
  }

  const field = equalityMatch[1]!.trim().toLowerCase();
  const value = unquote(equalityMatch[2]!.trim()).toLowerCase();

  if (field === "muted") {
    return String(result.muted) === value;
  }
  if (field === "status") {
    return result.status.toLowerCase() === value;
  }
  if (field === "tag" || field === "tags") {
    return result.tags.some((tag) => tag.toLowerCase() === value);
  }
  if (field === "text" || field === "name") {
    return result.name.toLowerCase().includes(value);
  }
  if (field === "owner") {
    return result.owner.toLowerCase() === value;
  }
  if (field === "severity") {
    return result.severity.toLowerCase() === value;
  }
  if (field === "layer") {
    return result.layer.toLowerCase() === value;
  }
  if (field === "suite") {
    return result.suite.toLowerCase().includes(value);
  }
  if (field.startsWith("custom.")) {
    const customField = field.slice("custom.".length);
    return result.customFields.some(
      (item) => item.label.toLowerCase() === customField && item.value.toLowerCase() === value
    );
  }

  return true;
}

export function detectGroupBy(widget: SavedDashboardWidget): string {
  const thqlGroupBy = widget.thql.match(/\bgroup\s+by\s+([a-zA-Z0-9_.]+)/i)?.[1];
  return (thqlGroupBy ?? widget.groupBy ?? "status").trim();
}

export function detectMetricKind(widget: SavedDashboardWidget): MetricKind {
  const source = `${widget.metric} ${widget.thql}`.toLowerCase();

  if (source.includes("passrate") || source.includes("доля успеш")) {
    return "passRate";
  }
  if (source.includes("average") || source.includes("avg") || source.includes("средняя")) {
    return "averageDuration";
  }
  if (source.includes("retry") || source.includes("ретра")) {
    return "retryCount";
  }
  return "count";
}

export function groupResults(results: TestResult[], groupBy: string): WidgetGroup[] {
  const normalizedGroupBy = groupBy.toLowerCase();
  const grouped = new Map<string, TestResult[]>();

  for (const result of results) {
    for (const key of getGroupKeys(result, normalizedGroupBy)) {
      grouped.set(key, [...(grouped.get(key) ?? []), result]);
    }
  }

  const maxValue = Math.max(...[...grouped.values()].map((items) => items.length), 1);
  const groups = [...grouped.entries()].map(([key, items]) => {
    const group: WidgetGroup = {
      key,
      label: formatGroupLabel(key),
      percent: (items.length / maxValue) * 100,
      value: items.length
    };

    if (isResultStatus(key)) {
      group.status = key;
    }

    return group;
  });

  return groups.sort((left, right) => sortGroups(left, right));
}

export function getGroupKeys(result: TestResult, groupBy: string): string[] {
  if (groupBy === "status") {
    return [result.status];
  }
  if (groupBy === "tag" || groupBy === "tags") {
    return result.tags.length > 0 ? result.tags : ["Не задано"];
  }
  if (groupBy === "owner") {
    return [result.owner || "Не задано"];
  }
  if (groupBy === "severity") {
    return [result.severity];
  }
  if (groupBy === "layer") {
    return [result.layer];
  }
  if (groupBy === "suite") {
    return [result.suite || "Не задано"];
  }
  if (groupBy.startsWith("custom.")) {
    const customField = groupBy.slice("custom.".length);
    const values = result.customFields
      .filter((field) => field.label.toLowerCase() === customField)
      .map((field) => field.value);
    return values.length > 0 ? values : ["Не задано"];
  }
  return ["Все"];
}

export function buildSeries(results: TestResult[], metricKind: MetricKind): WidgetGroup[] {
  const points = new Map<string, TestResult[]>();

  for (const result of results) {
    const historyPoint = result.historyPoints?.[0];
    const label = historyPoint?.startedAt
      ? new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit" }).format(
          new Date(historyPoint.startedAt)
        )
      : result.allureId;
    points.set(label, [...(points.get(label) ?? []), result]);
  }

  return [...points.entries()].slice(-8).map(([key, items]) => {
    const value =
      metricKind === "passRate"
        ? Math.round(calculatePassRate(items))
        : metricKind === "averageDuration"
          ? Math.round(calculateAverageDurationSeconds(items))
          : items.length;

    return {
      key,
      label: key,
      percent: 0,
      value
    };
  });
}

export function calculatePassRate(results: TestResult[]): number {
  const counted = results.filter((result) => result.status !== "muted");
  if (counted.length === 0) {
    return 0;
  }
  return (counted.filter((result) => result.status === "passed").length / counted.length) * 100;
}

export function calculateAverageDurationSeconds(results: TestResult[]): number {
  const durations = results
    .map((result) => parseDurationSeconds(result.duration))
    .filter((item) => item > 0);
  if (durations.length === 0) {
    return 0;
  }
  return durations.reduce((sum, item) => sum + item, 0) / durations.length;
}

export function formatMetricValue(
  metricKind: MetricKind,
  data: {
    averageDuration: string;
    filteredResults: TestResult[];
    passedRate: number;
    retryCount: number;
  }
): string {
  if (metricKind === "passRate") {
    return formatPercent(data.passedRate);
  }
  if (metricKind === "averageDuration") {
    return data.averageDuration;
  }
  if (metricKind === "retryCount") {
    return String(data.retryCount);
  }
  return String(data.filteredResults.length);
}

export function metricDescription(evaluation: WidgetEvaluation): string {
  if (evaluation.metricKind === "passRate") {
    return `${evaluation.filteredResults.filter((result) => result.status === "passed").length} успешных из ${evaluation.filteredResults.length}`;
  }
  if (evaluation.metricKind === "averageDuration") {
    return "средняя продолжительность результатов";
  }
  if (evaluation.metricKind === "retryCount") {
    return "попыток повторного запуска внутри лончей";
  }
  return "результатов по условиям THQL";
}

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

export function buildDonutGradient(groups: WidgetGroup[]): string {
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

export function groupColor(group: WidgetGroup, index: number): string {
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

export function emptyGroupRows(): WidgetGroup[] {
  return [{ key: "empty", label: "Нет данных", percent: 0, value: 0 }];
}

export function sortGroups(left: WidgetGroup, right: WidgetGroup): number {
  const leftStatusIndex = left.status ? statusOrder.indexOf(left.status) : -1;
  const rightStatusIndex = right.status ? statusOrder.indexOf(right.status) : -1;

  if (leftStatusIndex !== -1 || rightStatusIndex !== -1) {
    return (
      (leftStatusIndex === -1 ? 99 : leftStatusIndex) -
      (rightStatusIndex === -1 ? 99 : rightStatusIndex)
    );
  }

  return right.value - left.value || left.label.localeCompare(right.label);
}

export function formatGroupLabel(key: string): string {
  return isResultStatus(key) ? statusLabels[key] : key;
}

export function isResultStatus(value: string): value is ResultStatus {
  return statusOrder.includes(value as ResultStatus);
}

export function parseDurationSeconds(duration: string): number {
  const normalized = duration.trim().toLowerCase();
  const msMatch = normalized.match(/^([\d.]+)\s*ms$/);
  if (msMatch?.[1]) {
    return Number(msMatch[1]) / 1_000;
  }
  const secondsMatch = normalized.match(/^([\d.]+)\s*s$/);
  if (secondsMatch?.[1]) {
    return Number(secondsMatch[1]);
  }
  const minutesMatch = normalized.match(/^([\d.]+)\s*m$/);
  if (minutesMatch?.[1]) {
    return Number(minutesMatch[1]) * 60;
  }
  return Number(normalized) || 0;
}

export function formatDurationSeconds(duration: number): string {
  if (duration === 0) {
    return "0s";
  }
  if (duration < 1) {
    return `${Math.round(duration * 1_000)}ms`;
  }
  if (duration < 60) {
    return `${duration.toFixed(2)}s`;
  }
  return `${Math.round(duration / 60)}m`;
}

export function formatPercent(value: number): string {
  return `${value.toFixed(value >= 10 ? 1 : 2)}%`;
}

export function unquote(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}
