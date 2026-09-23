import type {
  DashboardAggregateGroup,
  DashboardAggregateMetricKind,
  DashboardAggregateStatus,
  DashboardAggregateTableRow,
  LaunchDashboardAggregateReadModel,
  LaunchDashboardAggregateRequest,
  NormalizedTestResult
} from "@testhistory/contracts";
import type { Launch } from "../store.js";

type Widget = LaunchDashboardAggregateRequest["widgets"][number];
type Row = { result: NormalizedTestResult; status: DashboardAggregateStatus; muted: boolean };
type ParsedWidget = {
  filters: Array<{ field: string; value: string }>;
  groupBy: string;
  metricKind: DashboardAggregateMetricKind;
  order?: { field: "duration" | "name" | "status"; direction: 1 | -1 };
  limit: number;
};

const maxGroups = 30;
const maxTableRows = 20;
const supportedFields = new Set([
  "muted",
  "status",
  "tag",
  "tags",
  "text",
  "name",
  "owner",
  "severity",
  "layer",
  "suite"
]);
const groupedFields = new Set(["status", "tag", "tags", "owner", "severity", "layer", "suite"]);
const statusOrder: DashboardAggregateStatus[] = [
  "failed",
  "broken",
  "passed",
  "skipped",
  "unknown",
  "muted"
];
const statusLabels: Record<DashboardAggregateStatus, string> = {
  failed: "Провален",
  broken: "Сломан",
  passed: "Успешный",
  skipped: "Пропущен",
  unknown: "Неизвестен",
  muted: "Карантин"
};

export function buildLaunchDashboardAggregate(
  launch: Launch,
  request: LaunchDashboardAggregateRequest,
  mutedResultUuids: ReadonlySet<string>
): LaunchDashboardAggregateReadModel {
  const rows = launch.results.map((result): Row => {
    const muted = mutedResultUuids.has(result.uuid);
    return { result, muted, status: muted ? "muted" : result.status };
  });
  return {
    kind: "launch-dashboard-aggregate",
    launchId: launch.id,
    projectId: launch.projectId,
    totalResults: rows.length,
    widgets: request.widgets.map((widget) => evaluateWidget(launch.id, rows, widget))
  };
}

function evaluateWidget(launchId: string, rows: Row[], widget: Widget) {
  const parsed = parseWidget(widget);
  if (typeof parsed === "string") {
    return { id: widget.id, status: "unsupported" as const, reason: parsed };
  }

  const hasMutedFilter = parsed.filters.some(({ field }) => field === "muted");
  const filtered = rows.filter(
    (row) => (hasMutedFilter || !row.muted) && parsed.filters.every((term) => matches(row, term))
  );
  const passedCount = filtered.filter((row) => !row.muted && row.result.status === "passed").length;
  const counted = filtered.filter((row) => !row.muted).length;
  const passRate = counted === 0 ? 0 : (passedCount / counted) * 100;
  const durations = filtered
    .map((row) => row.result.durationMs)
    .filter(
      (duration): duration is number =>
        duration !== undefined && Number.isFinite(duration) && duration >= 0
    );
  const averageDurationMs =
    durations.length === 0
      ? null
      : durations.reduce((sum, duration) => sum + duration, 0) / durations.length;
  const averageDuration = formatDurationSeconds((averageDurationMs ?? 0) / 1_000);
  const metricKind = parsed.metricKind;
  const value =
    metricKind === "passRate"
      ? `${passRate.toFixed(passRate >= 10 ? 1 : 2)}%`
      : metricKind === "averageDuration"
        ? averageDuration
        : String(filtered.length);
  const allGroups =
    widget.kind === "bar" || widget.kind === "donut" ? groupResults(filtered, parsed.groupBy) : [];
  const groups =
    widget.kind === "donut" && allGroups.length > maxGroups
      ? [
          ...allGroups.slice(0, maxGroups - 1),
          {
            key: "__remaining_groups__",
            label: "Остальные",
            value: allGroups.slice(maxGroups - 1).reduce((total, group) => total + group.value, 0),
            percent: 0
          }
        ]
      : allGroups.slice(0, maxGroups);
  const tableRows = widget.kind === "table" ? buildTableRows(filtered, launchId, parsed) : [];

  return {
    id: widget.id,
    status: "ready" as const,
    filteredCount: filtered.length,
    passedCount,
    passRate,
    averageDurationMs,
    averageDuration,
    retryCount: null,
    metricKind,
    value,
    groupCount: allGroups.length,
    groupsTruncated: allGroups.length > maxGroups,
    groups,
    tableRows
  };
}

function parseWidget(widget: Widget): ParsedWidget | string {
  if (widget.entity !== undefined && widget.entity !== "Результаты тестов") {
    return "Данные этой сущности пока не подключены к виджетам.";
  }
  if (widget.kind === "line") {
    return "Для временного графика нужна история результатов, а не один запуск.";
  }
  if (/\b(?:retry|retries)\b|ретра/i.test(`${widget.metric} ${widget.thql}`)) {
    return "Число повторных попыток нельзя надежно получить из результатов запуска.";
  }

  const query = widget.thql.trim();
  const shorthand = /^[a-z.]+\s*:/i.test(query);
  if (!/^from\s+results\b/i.test(query) && !shorthand) {
    return "Используйте запрос по результатам: from results where …";
  }
  if (!shorthand) {
    const tail = query.replace(/^from\s+results\b/i, "").trim();
    if (tail !== "" && !/^(?:where|group\s+by|order\s+by|measure|limit)\b/i.test(tail)) {
      return "Запрос содержит неподдерживаемое выражение.";
    }
  }
  const where =
    query
      .match(/\bwhere\b([\s\S]*?)(?:\bgroup\s+by\b|\border\s+by\b|\bmeasure\b|\blimit\b|$)/i)?.[1]
      ?.trim() ?? (shorthand ? query : "");
  if (/\bwhere\b/i.test(query) && where === "") {
    return "Укажите условие после where.";
  }
  if (/\s+or\s+/i.test(where)) {
    return "Условия с OR пока не поддерживаются в виджете.";
  }
  const filters: ParsedWidget["filters"] = [];
  for (const term of where
    .split(/\s+and\s+/i)
    .map((item) => item.trim())
    .filter(Boolean)) {
    const match = term.match(/^([a-zA-Z0-9_.]+)\s*(?::|=)\s*(.+)$/);
    if (match === null || !supportedField(match[1]!)) {
      return `Условие «${term}» пока не поддерживается в виджете.`;
    }
    filters.push({
      field: match[1]!.toLowerCase(),
      value: unquote(match[2]!.trim()).toLowerCase()
    });
  }

  const groupMatch = query.match(/\bgroup\s+by\s+([a-zA-Z0-9_.]+)/i);
  if (/\bgroup\s+by\b/i.test(query) && groupMatch === null) {
    return "Укажите поле после group by.";
  }
  const groupBy = (groupMatch?.[1] ?? widget.groupBy ?? "status").trim().toLowerCase();
  if ((widget.kind === "bar" || widget.kind === "donut") && !groupedField(groupBy)) {
    return `Группировка «${groupBy}» пока не поддерживается в виджете.`;
  }
  const orderMatch = query.match(/\border\s+by\s+([a-zA-Z0-9_.]+)(?:\s+(asc|desc))?/i);
  if (/\border\s+by\b/i.test(query) && orderMatch === null) {
    return "Укажите поле после order by.";
  }
  if (
    orderMatch !== null &&
    (widget.kind !== "table" ||
      !["duration", "name", "status"].includes(orderMatch[1]!.toLowerCase()))
  ) {
    return `Сортировка «${orderMatch[1]}» пока не поддерживается в виджете.`;
  }
  const order =
    orderMatch === null
      ? undefined
      : {
          field: orderMatch[1]!.toLowerCase() as "duration" | "name" | "status",
          direction: (orderMatch[2]?.toLowerCase() === "asc" ? 1 : -1) as 1 | -1
        };
  const measure = query.match(/\bmeasure\s+([a-zA-Z0-9_]+)\s*\(/i)?.[1];
  if (/\bmeasure\b/i.test(query) && measure === undefined) {
    return "Укажите поддерживаемую метрику после measure.";
  }
  if (
    measure !== undefined &&
    !["count", "passrate", "averageduration", "avg"].includes(measure.toLowerCase())
  ) {
    return `Метрика «${measure}» пока не поддерживается в виджете.`;
  }
  // An explicit measure controls the calculation; labels and WHERE values are display data.
  const metricSource = (measure ?? widget.metric).toLowerCase();
  const metricKind: DashboardAggregateMetricKind =
    metricSource.includes("passrate") || metricSource.includes("доля успеш")
      ? "passRate"
      : metricSource.includes("average") ||
          metricSource.includes("avg") ||
          metricSource.includes("средняя")
        ? "averageDuration"
        : "count";
  const limitMatch = query.match(/\blimit\s+(\d+)/i);
  if (/\blimit\b/i.test(query) && limitMatch === null) {
    return "Укажите числовой предел после limit.";
  }
  const rawLimit = Number(limitMatch?.[1] ?? maxTableRows);
  return {
    filters,
    groupBy,
    metricKind,
    ...(order !== undefined ? { order } : {}),
    limit: Math.min(maxTableRows, Math.max(1, rawLimit))
  };
}

function matches(row: Row, { field, value }: ParsedWidget["filters"][number]): boolean {
  const { result } = row;
  if (field === "muted") return String(row.muted) === value;
  if (field === "status") return row.status.toLowerCase() === value;
  if (field === "tag" || field === "tags")
    return (result.labels.tag ?? []).some((tag) => tag.toLowerCase() === value);
  if (field === "text" || field === "name") return result.name.toLowerCase().includes(value);
  if (field === "owner") return owner(result).toLowerCase() === value;
  if (field === "severity") return severity(result).toLowerCase() === value;
  if (field === "layer") return layer(result).toLowerCase() === value;
  if (field === "suite") return suite(result).toLowerCase().includes(value);
  if (field.startsWith("custom.")) {
    const values = customValues(result, field.slice("custom.".length));
    return values.join(", ").toLowerCase() === value;
  }
  return false;
}

function groupResults(rows: Row[], groupBy: string): DashboardAggregateGroup[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    for (const key of groupKeys(row, groupBy)) {
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  let max = 1;
  for (const count of counts.values()) max = Math.max(max, count);
  return Array.from(counts, ([key, value]): DashboardAggregateGroup => ({
    key,
    label: (statusOrder as string[]).includes(key)
      ? statusLabels[key as DashboardAggregateStatus]
      : key,
    value,
    percent: (value / max) * 100,
    ...((statusOrder as string[]).includes(key) ? { status: key as DashboardAggregateStatus } : {})
  })).sort((left, right) => {
    const leftIndex = left.status ? statusOrder.indexOf(left.status) : -1;
    const rightIndex = right.status ? statusOrder.indexOf(right.status) : -1;
    if (leftIndex !== -1 || rightIndex !== -1) {
      return (leftIndex === -1 ? 99 : leftIndex) - (rightIndex === -1 ? 99 : rightIndex);
    }
    return right.value - left.value || left.label.localeCompare(right.label);
  });
}

function groupKeys(row: Row, groupBy: string): string[] {
  const { result } = row;
  if (groupBy === "status") return [row.status];
  if (groupBy === "tag" || groupBy === "tags")
    return result.labels.tag?.length ? result.labels.tag : ["Не задано"];
  if (groupBy === "owner") return [owner(result)];
  if (groupBy === "severity") return [severity(result)];
  if (groupBy === "layer") return [layer(result)];
  if (groupBy === "suite") return [suite(result)];
  if (groupBy.startsWith("custom.")) {
    const values = customValues(result, groupBy.slice("custom.".length));
    return values.length > 0 ? [values.join(", ")] : ["Не задано"];
  }
  return ["Все"];
}

function buildTableRows(
  rows: Row[],
  launchId: string,
  parsed: ParsedWidget
): DashboardAggregateTableRow[] {
  const ordered =
    parsed.order === undefined
      ? rows
      : rows.slice().sort((left, right) => {
          const { field, direction } = parsed.order!;
          if (field === "duration") {
            return (
              direction * ((left.result.durationMs ?? 0) - (right.result.durationMs ?? 0)) ||
              left.result.uuid.localeCompare(right.result.uuid)
            );
          }
          const leftValue = field === "name" ? left.result.name : left.status;
          const rightValue = field === "name" ? right.result.name : right.status;
          return (
            direction * leftValue.localeCompare(rightValue) ||
            left.result.uuid.localeCompare(right.result.uuid)
          );
        });
  return ordered.slice(0, parsed.limit).map(({ result, status }) => ({
    id: result.uuid,
    uuid: result.uuid,
    launchId,
    name: result.name,
    status,
    duration: formatRawDuration(result.durationMs),
    ...(result.durationMs !== undefined ? { durationMs: result.durationMs } : {})
  }));
}

function owner(result: NormalizedTestResult) {
  return result.labels.owner?.[0] ?? result.labels.member?.[0] ?? "Unassigned";
}

function severity(result: NormalizedTestResult) {
  const value = result.labels.severity?.[0];
  return value === "critical" || value === "normal" || value === "minor" ? value : "normal";
}

function layer(result: NormalizedTestResult) {
  const value = result.labels.layer?.[0] ?? result.labels.feature?.[0];
  return value === "UI" || value === "API" || value === "E2E" ? value : "E2E";
}

function suite(result: NormalizedTestResult) {
  return result.fullName ?? result.historyId ?? "Imported result";
}

function customValues(result: NormalizedTestResult, customField: string): string[] {
  return Object.entries(result.labels)
    .filter(([label]) => label.toLowerCase() === `custom_field:${customField}`)
    .flatMap(([, values]) => values);
}

function supportedField(field: string) {
  const normalized = field.toLowerCase();
  return supportedFields.has(normalized) || normalized.startsWith("custom.");
}

function groupedField(field: string) {
  return groupedFields.has(field) || field.startsWith("custom.");
}

function unquote(value: string) {
  return (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
    ? value.slice(1, -1)
    : value;
}

function formatRawDuration(durationMs: number | undefined) {
  if (durationMs === undefined) return "n/a";
  return durationMs < 1_000 ? `${durationMs}ms` : `${(durationMs / 1_000).toFixed(2)}s`;
}

function formatDurationSeconds(seconds: number) {
  if (seconds === 0) return "0s";
  if (seconds < 1) return `${Math.round(seconds * 1_000)}ms`;
  if (seconds < 60) return `${seconds.toFixed(2)}s`;
  return `${Math.round(seconds / 60)}m`;
}
