import type { ResultStatus, TestResult } from "./m1Workspace.js";
import { parseQuery } from "./analyticsQueryParser.js";
import type {
  AnalyticsRunResult,
  DashboardWidgetDefinition,
  FieldReference,
  OperatorValue,
  QueryExpression,
  QueryValidationResult,
  QueryValue
} from "./analyticsQueryTypes.js";
export type * from "./analyticsQueryTypes.js";

const statusOrder: ResultStatus[] = ["failed", "broken", "passed", "skipped", "muted"];

export function validateDashboardQuery(query: string): QueryValidationResult {
  try {
    const ast = parseQuery(query);
    return {
      ast,
      normalized: query.trim(),
      ok: true
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Не удалось разобрать запрос",
      ok: false
    };
  }
}

export function filterResultsByQuery(results: TestResult[], query: string): TestResult[] {
  const ast = parseQuery(query);
  if (ast === undefined) {
    return results;
  }

  return results.filter((result) => evaluateExpression(ast, result));
}

export function filterRecordsByQuery<T>(
  records: T[],
  query: string,
  toRecord: (record: T) => Record<string, QueryValue | QueryValue[] | undefined>
): T[] {
  const ast = parseQuery(query);
  if (ast === undefined) {
    return records;
  }

  return records.filter((record) => evaluateRecordExpression(ast, toRecord(record)));
}

export function runDashboardWidget(
  widget: DashboardWidgetDefinition,
  results: TestResult[]
): AnalyticsRunResult {
  const filtered = filterResultsByQuery(results, widget.query);
  const analyticsResults = filtered.filter((result) => result.status !== "muted");
  const source = widget.metric === "top_failed" ? filtered : analyticsResults;
  const groups = groupResults(source, widget.groupBy);
  const summaryGroups = [...groups.entries()].map(([key, groupResults]) => ({
    key,
    count: groupResults.length,
    counters: countStatuses(groupResults),
    failureRate: calculateFailureRate(groupResults),
    durationP95Ms: percentile(
      groupResults.map((result) => parseDurationMs(result.duration)),
      0.95
    )
  }));

  return {
    filteredCount: filtered.length,
    groups: summaryGroups,
    metric: widget.metric,
    rows: buildRows(widget, source, summaryGroups),
    series: buildSeries(widget, source, summaryGroups),
    total: source.length
  };
}

export function createDemoDashboardWidgets(): DashboardWidgetDefinition[] {
  return [
    {
      id: "status-smoke",
      title: "Статусы smoke без mute",
      entity: "test_results",
      query: 'tag = "smoke" and muted = false',
      metric: "count_by_status",
      groupBy: ["status"],
      period: "last_30_days",
      chart: "pie"
    },
    {
      id: "failures-by-component",
      title: "Падения по компонентам",
      entity: "test_results",
      query: 'status in ["failed", "broken"] and muted = false',
      metric: "failure_rate",
      groupBy: ['cf["Component"]'],
      period: "last_30_days",
      chart: "stacked_bar"
    },
    {
      id: "duration-p95",
      title: "P95 длительности по браузеру",
      entity: "test_results",
      query: "muted = false",
      metric: "duration_p95",
      groupBy: ['parameter["browser"]'],
      period: "last_30_days",
      chart: "line"
    },
    {
      id: "top-failed",
      title: "Самые проблемные тесты",
      entity: "test_results",
      query: 'status in ["failed", "broken"]',
      metric: "top_failed",
      groupBy: ["name"],
      period: "last_30_days",
      chart: "table"
    }
  ];
}

function evaluateExpression(expression: QueryExpression, result: TestResult): boolean {
  if (expression.type === "and") {
    return (
      evaluateExpression(expression.left, result) && evaluateExpression(expression.right, result)
    );
  }
  if (expression.type === "or") {
    return (
      evaluateExpression(expression.left, result) || evaluateExpression(expression.right, result)
    );
  }
  if (expression.type === "not") {
    return !evaluateExpression(expression.expression, result);
  }
  if (expression.type === "list") {
    return false;
  }
  if (expression.type !== "comparison") {
    return false;
  }

  const fieldValues = getFieldValues(result, expression.field);
  const expected =
    typeof expression.value === "object" && expression.value !== null && "items" in expression.value
      ? expression.value.items
      : expression.value;

  return fieldValues.some((actual) => compareValue(actual, expression.operator, expected));
}

function evaluateRecordExpression(
  expression: QueryExpression,
  record: Record<string, QueryValue | QueryValue[] | undefined>
): boolean {
  if (expression.type === "and") {
    return (
      evaluateRecordExpression(expression.left, record) &&
      evaluateRecordExpression(expression.right, record)
    );
  }
  if (expression.type === "or") {
    return (
      evaluateRecordExpression(expression.left, record) ||
      evaluateRecordExpression(expression.right, record)
    );
  }
  if (expression.type === "not") {
    return !evaluateRecordExpression(expression.expression, record);
  }
  if (expression.type !== "comparison") {
    return false;
  }

  const actualValues = getRecordFieldValues(record, expression.field);
  const expected =
    typeof expression.value === "object" && expression.value !== null && "items" in expression.value
      ? expression.value.items
      : expression.value;
  return actualValues.some((actual) => compareValue(actual, expression.operator, expected));
}

function compareValue(
  actual: QueryValue,
  operator: OperatorValue,
  expected: QueryValue | QueryValue[]
): boolean {
  if (Array.isArray(expected)) {
    return expected.some((item) => compareValue(actual, "=", item));
  }

  if (operator === "=") {
    return String(actual).toLowerCase() === String(expected).toLowerCase();
  }
  if (operator === "!=") {
    return String(actual).toLowerCase() !== String(expected).toLowerCase();
  }
  if (operator === "~=") {
    return String(actual).toLowerCase().includes(String(expected).toLowerCase());
  }

  const actualNumber = Number(actual);
  const expectedNumber = Number(expected);
  if (!Number.isFinite(actualNumber) || !Number.isFinite(expectedNumber)) {
    return false;
  }

  if (operator === ">") {
    return actualNumber > expectedNumber;
  }
  if (operator === ">=") {
    return actualNumber >= expectedNumber;
  }
  if (operator === "<") {
    return actualNumber < expectedNumber;
  }
  if (operator === "<=") {
    return actualNumber <= expectedNumber;
  }

  return false;
}

function getFieldValues(result: TestResult, field: FieldReference): QueryValue[] {
  const name = field.name.toLowerCase();
  if (name === "tag" || name === "tags") {
    return result.tags;
  }
  if (name === "cf" || name === "customfield" || name === "custom_field") {
    return getCustomFieldValues(result, field.key);
  }
  if (name === "parameter" || name === "param" || name === "ev") {
    return getParameterValues(result, field.key);
  }
  if (name === "status") {
    return [result.status];
  }
  if (name === "muted") {
    return [result.status === "muted" || result.muted];
  }
  if (name === "durationms") {
    return [parseDurationMs(result.duration)];
  }
  if (name === "issue" || name === "defect") {
    return [result.defect, ...result.issues].filter(
      (value): value is string => value !== undefined
    );
  }
  if (name === "link") {
    return result.links;
  }
  if (name === "testkey") {
    return result.testKeys;
  }
  if (name === "member") {
    return result.members;
  }

  const directValues: Record<string, QueryValue | QueryValue[]> = {
    allureid: result.allureId,
    casetype: result.caseType,
    layer: result.layer,
    name: result.name,
    owner: result.owner,
    severity: result.severity,
    suite: result.suite,
    workflow: result.workflow
  };
  const value = directValues[name];
  if (Array.isArray(value)) {
    return value;
  }
  return value === undefined ? [] : [value];
}

function getRecordFieldValues(
  record: Record<string, QueryValue | QueryValue[] | undefined>,
  field: FieldReference
): QueryValue[] {
  const directValue = record[field.name.toLowerCase()] ?? record[field.name];
  if (Array.isArray(directValue)) {
    return directValue;
  }
  return directValue === undefined ? [] : [directValue];
}

function getCustomFieldValues(result: TestResult, key: string | undefined): string[] {
  if (key === undefined) {
    return result.customFields.map((field) => field.value);
  }
  return result.customFields
    .filter((field) => field.label.toLowerCase() === key.toLowerCase())
    .map((field) => field.value);
}

function getParameterValues(result: TestResult, key: string | undefined): string[] {
  const parameters = result.parameters ?? [];
  if (key === undefined) {
    return parameters.map((parameter) => parameter.value);
  }
  return parameters
    .filter((parameter) => parameter.name.toLowerCase() === key.toLowerCase())
    .map((parameter) => parameter.value);
}

function groupResults(results: TestResult[], groupBy: string[]): Map<string, TestResult[]> {
  const groups = new Map<string, TestResult[]>();
  for (const result of results) {
    const key = getGroupKey(result, groupBy);
    groups.set(key, [...(groups.get(key) ?? []), result]);
  }
  return groups;
}

function getGroupKey(result: TestResult, groupBy: string[]): string {
  if (groupBy.length === 0) {
    return "Все";
  }

  return groupBy
    .map((field) => getFieldValues(result, parseGroupField(field))[0]?.toString() || "Не задано")
    .join(" / ");
}

function parseGroupField(field: string): FieldReference {
  const ast = parseQuery(`${field} = "__group__"`);
  if (ast?.type !== "comparison") {
    return { name: field };
  }
  return ast.field;
}

function countStatuses(results: TestResult[]): Record<ResultStatus, number> {
  return results.reduce<Record<ResultStatus, number>>(
    (counters, result) => {
      counters[result.status] += 1;
      return counters;
    },
    { broken: 0, failed: 0, muted: 0, passed: 0, skipped: 0 }
  );
}

function calculateFailureRate(results: TestResult[]): number {
  const total = results.filter((result) => result.status !== "muted").length;
  if (total === 0) {
    return 0;
  }
  const failed = results.filter(
    (result) => result.status === "failed" || result.status === "broken"
  ).length;
  return Math.round((failed / total) * 10000) / 100;
}

function buildRows(
  widget: DashboardWidgetDefinition,
  results: TestResult[],
  groups: AnalyticsRunResult["groups"]
): Array<Record<string, string | number>> {
  if (widget.metric === "top_failed") {
    return groups
      .sort((left, right) => right.count - left.count)
      .slice(0, 10)
      .map((group) => ({
        Группа: group.key,
        Падений: group.count,
        "Failure rate": `${group.failureRate}%`,
        P95: formatMs(group.durationP95Ms)
      }));
  }

  return groups.map((group) => ({
    Группа: group.key,
    Всего: group.count,
    Провален: group.counters.failed,
    Сломан: group.counters.broken,
    Успешный: group.counters.passed,
    Пропущен: group.counters.skipped,
    "Failure rate": `${group.failureRate}%`,
    P95: formatMs(group.durationP95Ms)
  }));
}

function buildSeries(
  widget: DashboardWidgetDefinition,
  results: TestResult[],
  groups: AnalyticsRunResult["groups"]
): AnalyticsRunResult["series"] {
  if (widget.metric === "count_by_status") {
    const counters = countStatuses(results);
    return statusOrder
      .filter((status) => counters[status] > 0)
      .map((status) => ({
        label: formatStatus(status),
        status,
        value: counters[status]
      }));
  }
  if (widget.metric === "failure_rate") {
    return groups.map((group) => ({ label: group.key, value: group.failureRate }));
  }
  if (widget.metric === "duration_p95") {
    return groups.map((group) => ({ label: group.key, value: group.durationP95Ms }));
  }
  if (widget.metric === "top_failed") {
    return groups
      .sort((left, right) => right.count - left.count)
      .slice(0, 10)
      .map((group) => ({ label: group.key, value: group.count }));
  }
  return [{ label: "Всего", value: results.length }];
}

function percentile(values: number[], percentileValue: number): number {
  const finiteValues = values.filter(Number.isFinite).sort((left, right) => left - right);
  if (finiteValues.length === 0) {
    return 0;
  }
  const index = Math.min(
    finiteValues.length - 1,
    Math.ceil(finiteValues.length * percentileValue) - 1
  );
  return finiteValues[index] ?? 0;
}

function parseDurationMs(duration: string): number {
  const minutes =
    Number(duration.match(/(\d+(?:[.,]\d+)?)\s*m/)?.[1]?.replace(",", ".") ?? 0) * 60_000;
  const seconds =
    Number(duration.match(/(\d+(?:[.,]\d+)?)\s*s/)?.[1]?.replace(",", ".") ?? 0) * 1_000;
  const milliseconds = Number(
    duration.match(/(\d+(?:[.,]\d+)?)\s*ms/)?.[1]?.replace(",", ".") ?? 0
  );
  return minutes + seconds + milliseconds;
}

function formatMs(value: number): string {
  if (value >= 60_000) {
    return `${Math.round(value / 600) / 100}m`;
  }
  if (value >= 1_000) {
    return `${Math.round(value / 10) / 100}s`;
  }
  return `${Math.round(value)}ms`;
}

function formatStatus(status: ResultStatus): string {
  const labels: Record<ResultStatus, string> = {
    broken: "Сломан",
    failed: "Провален",
    muted: "Карантин",
    passed: "Успешный",
    skipped: "Пропущен"
  };
  return labels[status];
}
