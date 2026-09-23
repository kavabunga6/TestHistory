import type { NormalizedTestResult } from "@testhistory/contracts";
import { evaluateThql, parseThql, type ThqlExpression } from "./thql.js";

// Free-text names often contain "or", brackets, or punctuation. Treat a query as THQL
// only when it starts with a field comparison (possibly wrapped in NOT/parentheses).
const thqlStart =
  /^(?:(?:not\s+|\(\s*)*)([a-z_][a-z0-9_.]*)(?:\[\s*(?:"[^"]*"|'[^']*'|[a-z0-9_.-]+)\s*\])?\s*(?:!=|~=|>=|<=|=|>|<|\bin\b)/i;
const thqlFields = new Set([
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
  "link",
  "muted",
  "name",
  "owner",
  "parameter",
  "status",
  "suite",
  "tag",
  "tags",
  "testcaseid",
  "testkey",
  "uuid"
]);

const statusLabels: Record<NormalizedTestResult["status"], string> = {
  passed: "Успешный",
  failed: "Провален",
  broken: "Сломан",
  skipped: "Пропущен",
  unknown: "Сломан"
};

export function compileLaunchResultSearch(
  query: string | undefined
): (result: NormalizedTestResult, muted: boolean) => boolean {
  const normalized = query?.trim() ?? "";
  if (normalized === "") {
    return () => true;
  }

  const candidate = thqlStart.exec(normalized);
  if (candidate !== null && thqlFields.has(candidate[1]!.toLocaleLowerCase())) {
    try {
      const expression = normalizeFields(parseThql(normalized)!);
      return (result, muted) => evaluateThql(resultSearchRecord(result, muted), expression);
    } catch {
      // The search box validates while typing; incomplete THQL behaves like the existing UI filter.
      return () => false;
    }
  }

  const needle = normalized.toLocaleLowerCase();
  return (result) =>
    plainSearchValues(result).some((value) => value.toLocaleLowerCase().includes(needle));
}

function plainSearchValues(result: NormalizedTestResult): string[] {
  return [
    result.uuid,
    result.name,
    result.status,
    statusLabels[result.status],
    result.fullName ?? result.historyId ?? "Imported result",
    result.historyId ?? "",
    result.testCaseId ?? "",
    formatDuration(result.durationMs),
    ...Object.values(result.labels).flat(),
    ...(result.raw.links ?? []).flatMap((link) => [link.name ?? "", link.url])
  ];
}

function resultSearchRecord(result: NormalizedTestResult, muted: boolean): Record<string, unknown> {
  const labels = result.labels;
  const owner = labels.owner?.[0] ?? labels.member?.[0] ?? "Unassigned";
  const links = (result.raw.links ?? []).map((link) => link.name ?? link.url);
  const keyedLabels = lowercaseKeys(labels);
  const customFields = Object.fromEntries(
    Object.entries(labels)
      .filter(([key]) => key.startsWith("custom_field:"))
      .map(([key, values]) => [
        key.slice("custom_field:".length).toLocaleLowerCase(),
        values.join(", ")
      ])
  );
  const parameters = Object.fromEntries(
    result.parameters
      .filter(
        (parameter) =>
          parameter.mode !== "masked" &&
          parameter.mode !== "hidden" &&
          parameter.value !== undefined
      )
      .map((parameter) => [parameter.name.toLocaleLowerCase(), parameter.value])
  );

  return {
    allureid: result.testCaseId ?? result.historyId ?? result.uuid,
    cf: customFields,
    customfield: customFields,
    defect: labels.issue ?? [],
    duration: formatDuration(result.durationMs),
    durationms: result.durationMs,
    fullname: result.fullName,
    historyid: result.historyId,
    id: result.uuid,
    issue: labels.issue ?? [],
    label: keyedLabels,
    labels: keyedLabels,
    link: links,
    muted,
    name: result.name,
    owner,
    parameter: parameters,
    status: result.status,
    suite: result.fullName ?? result.historyId ?? "Imported result",
    tag: labels.tag ?? [],
    tags: labels.tag ?? [],
    testcaseid: result.testCaseId,
    testkey: [...(labels.tms ?? []), ...(labels.testKey ?? [])],
    uuid: result.uuid
  };
}

function normalizeFields(expression: ThqlExpression): ThqlExpression {
  if (expression.type === "and" || expression.type === "or") {
    return {
      ...expression,
      left: normalizeFields(expression.left),
      right: normalizeFields(expression.right)
    };
  }
  if (expression.type === "not") {
    return { ...expression, expression: normalizeFields(expression.expression) };
  }
  if (expression.type !== "comparison") return expression;
  return {
    ...expression,
    field: {
      name: expression.field.name.toLocaleLowerCase(),
      ...(expression.field.key !== undefined
        ? { key: expression.field.key.toLocaleLowerCase() }
        : {})
    }
  };
}

function lowercaseKeys(source: Record<string, string[]>): Record<string, string[]> {
  return Object.fromEntries(
    Object.entries(source).map(([key, values]) => [key.toLocaleLowerCase(), values])
  );
}

function formatDuration(durationMs: number | undefined): string {
  if (durationMs === undefined) return "n/a";
  return durationMs < 1_000 ? `${durationMs}ms` : `${(durationMs / 1_000).toFixed(2)}s`;
}
