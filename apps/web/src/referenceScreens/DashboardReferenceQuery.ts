import type { SavedDashboardWidget } from "./DashboardReferenceModel.js";
import { isLikelyThqlQuery } from "../thqlQueryDetection.js";

const supportedFilterFields = new Set([
  "allureid",
  "cf",
  "customfield",
  "defect",
  "duration",
  "durationms",
  "fullname",
  "historyid",
  "id",
  "issue",
  "label",
  "labels",
  "layer",
  "link",
  "muted",
  "status",
  "tag",
  "tags",
  "text",
  "name",
  "owner",
  "parameter",
  "severity",
  "suite",
  "testcaseid",
  "testkey",
  "uuid"
]);
const supportedGroupFields = new Set([
  "status",
  "tag",
  "tags",
  "owner",
  "severity",
  "layer",
  "suite"
]);

export function widgetUnavailableReason(
  widget: Pick<SavedDashboardWidget, "entity" | "kind" | "metric" | "groupBy" | "thql">
): string | undefined {
  if (widget.entity !== "Результаты тестов") {
    return "Данные этой сущности пока не подключены к виджетам.";
  }
  if (widget.kind === "line") {
    return "Для временного графика нужна история результатов. Список выбранного запуска не содержит этих дат.";
  }
  if (/\b(?:retry|retries)\b|ретра/i.test(`${widget.metric} ${widget.thql}`)) {
    return "Число повторных попыток нельзя надежно получить из списка результатов запуска.";
  }

  const query = widget.thql.trim();
  const fromResults = /^from\s+results\b/i.test(query);
  const shorthand = /^[a-z.]+\s*:/i.test(query);
  if (!fromResults && !shorthand && !isLikelyThqlQuery(query)) {
    return 'Используйте THQL по результатам, например status in ["failed", "broken"].';
  }
  if (fromResults) {
    const tail = query.replace(/^from\s+results\b/i, "").trim();
    if (tail !== "" && !/^(?:where|group\s+by|order\s+by|measure|limit)\b/i.test(tail)) {
      return "Запрос содержит неподдерживаемое выражение.";
    }
  }

  const where = fromResults
    ? query
        .match(/\bwhere\b([\s\S]*?)(?:\bgroup\s+by\b|\border\s+by\b|\bmeasure\b|\blimit\b|$)/i)?.[1]
        ?.trim()
    : query;
  if (fromResults && /\bwhere\b/i.test(query) && !where) {
    return "Укажите условие после where.";
  }
  if (where && /\s+or\s+/i.test(where) && !isLikelyThqlQuery(where)) {
    return "Условия с OR в сокращённой записи не поддерживаются. Используйте THQL.";
  }
  const filters = (where ?? "")
    .split(/\s+and\s+/i)
    .map((term) => term.trim())
    .filter(Boolean);
  if (where && isLikelyThqlQuery(where)) {
    const leadingField = where.match(/^\s*(?:(?:not\s+|\(\s*)*)([a-z_][a-z0-9_.]*)/i)?.[1];
    if (leadingField && !isSupportedField(leadingField)) {
      return `Условие «${leadingField}» пока не поддерживается в виджете.`;
    }
  } else if (where) {
    for (const filter of filters) {
      const match = filter.match(/^([a-zA-Z0-9_.]+)\s*(?::|=)\s*(.+)$/);
      if (!match || !isSupportedField(match[1]!)) {
        return `Условие «${filter}» пока не поддерживается в виджете.`;
      }
    }
  }

  const groupMatch = fromResults ? query.match(/\bgroup\s+by\s+([a-zA-Z0-9_.]+)/i) : null;
  if (fromResults && /\bgroup\s+by\b/i.test(query) && groupMatch === null) {
    return "Укажите поле после group by.";
  }
  const group = groupMatch?.[1] ?? widget.groupBy;
  if ((widget.kind === "bar" || widget.kind === "donut") && group && !isSupportedGroup(group)) {
    return `Группировка «${group}» пока не поддерживается в виджете.`;
  }

  const orderMatch = fromResults ? query.match(/\border\s+by\s+([a-zA-Z0-9_.]+)/i) : null;
  if (fromResults && /\border\s+by\b/i.test(query) && orderMatch === null) {
    return "Укажите поле после order by.";
  }
  const order = orderMatch?.[1];
  if (
    order &&
    (widget.kind !== "table" || !["duration", "name", "status"].includes(order.toLowerCase()))
  ) {
    return `Сортировка «${order}» пока не поддерживается в виджете.`;
  }

  const measure = fromResults ? query.match(/\bmeasure\s+([a-zA-Z0-9_]+)\s*\(/i)?.[1] : undefined;
  if (fromResults && /\bmeasure\b/i.test(query) && measure === undefined) {
    return "Укажите поддерживаемую метрику после measure.";
  }
  if (measure && !["count", "passrate", "averageduration", "avg"].includes(measure.toLowerCase())) {
    return `Метрика «${measure}» пока не поддерживается в виджете.`;
  }

  if (fromResults && /\blimit\b/i.test(query) && !/\blimit\s+\d+/i.test(query)) {
    return "Укажите числовой предел после limit.";
  }

  return undefined;
}

function isSupportedField(field: string) {
  const normalized = field.toLowerCase();
  return supportedFilterFields.has(normalized) || normalized.startsWith("custom.");
}

function isSupportedGroup(field: string) {
  const normalized = field.toLowerCase();
  return supportedGroupFields.has(normalized) || normalized.startsWith("custom.");
}
