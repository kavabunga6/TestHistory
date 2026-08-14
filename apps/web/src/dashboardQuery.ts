import type { ResultStatus, TestResult } from "./m1Workspace.js";

export type DashboardQueryResult = Pick<
  TestResult,
  "customFields" | "id" | "muted" | "name" | "status" | "tags"
>;

export type DashboardQueryGroupBy = "status" | "tags" | { customField: string };

export type DashboardQueryEvaluation = {
  matchedResults: DashboardQueryResult[];
  groups: Array<{
    key: string;
    total: number;
    statusCounters: Partial<Record<ResultStatus, number>>;
    resultIds: string[];
  }>;
  totals: {
    total: number;
    statusCounters: Partial<Record<ResultStatus, number>>;
  };
};

export type ThqlAst =
  { terms: ThqlAst[]; type: "and" | "or" } | { field: string; type: "term"; value: string };

export function parseThql(query: string): ThqlAst {
  const orParts = splitByOperator(query, "OR");
  if (orParts.length > 1) {
    return { terms: orParts.map(parseThql), type: "or" };
  }

  const andParts = splitByOperator(query, "AND");
  if (andParts.length > 1) {
    return { terms: andParts.map(parseThql), type: "and" };
  }

  const match = query.trim().match(/^([^:]+):(.+)$/);
  if (match === null) {
    throw new Error("THQL term must use field:value syntax");
  }

  return {
    field: match[1]!.trim(),
    type: "term",
    value: unquote(match[2]!.trim())
  };
}

export function evaluateDashboardQuery({
  excludeMuted = false,
  groupBy,
  query,
  results
}: {
  excludeMuted?: boolean;
  groupBy?: DashboardQueryGroupBy;
  query: string;
  results: DashboardQueryResult[];
}): DashboardQueryEvaluation {
  const ast = parseThql(query);
  const matchedResults = results.filter(
    (result) => (!excludeMuted || !result.muted) && evaluateAst(ast, result)
  );

  return {
    groups: buildGroups(matchedResults, groupBy),
    matchedResults,
    totals: {
      statusCounters: countStatuses(matchedResults),
      total: matchedResults.length
    }
  };
}

function splitByOperator(query: string, operator: "AND" | "OR"): string[] {
  const parts = query
    .split(new RegExp(`\\s+${operator}\\s+`, "i"))
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.length > 1 ? parts : [query.trim()];
}

function evaluateAst(ast: ThqlAst, result: DashboardQueryResult): boolean {
  if (ast.type === "and") {
    return ast.terms.every((term) => evaluateAst(term, result));
  }
  if (ast.type === "or") {
    return ast.terms.some((term) => evaluateAst(term, result));
  }
  if (ast.type !== "term") {
    return false;
  }

  const field = ast.field.toLowerCase();
  const value = ast.value.toLowerCase();
  if (field === "status") {
    return result.status.toLowerCase() === value;
  }
  if (field === "tag") {
    return result.tags.some((tag) => tag.toLowerCase() === value);
  }
  if (field === "text") {
    return result.name.toLowerCase().includes(value);
  }
  if (field.startsWith("custom.")) {
    const customField = field.slice("custom.".length);
    return result.customFields.some(
      (item) => item.label.toLowerCase() === customField && item.value.toLowerCase() === value
    );
  }

  return false;
}

function buildGroups(results: DashboardQueryResult[], groupBy?: DashboardQueryGroupBy) {
  const groups = new Map<string, DashboardQueryResult[]>();
  for (const result of results) {
    for (const key of getGroupKeys(result, groupBy)) {
      groups.set(key, [...(groups.get(key) ?? []), result]);
    }
  }

  return [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, groupResults]) => ({
      key,
      resultIds: groupResults.map((result) => result.id),
      statusCounters: countStatuses(groupResults),
      total: groupResults.length
    }));
}

function getGroupKeys(result: DashboardQueryResult, groupBy?: DashboardQueryGroupBy): string[] {
  if (groupBy === "status") {
    return [result.status];
  }
  if (groupBy === "tags") {
    return [...result.tags].sort((left, right) => left.localeCompare(right));
  }
  if (typeof groupBy === "object") {
    const values = result.customFields
      .filter((field) => field.label.toLowerCase() === groupBy.customField.toLowerCase())
      .map((field) => field.value)
      .sort((left, right) => left.localeCompare(right));
    return values.length > 0 ? values : ["Не задано"];
  }

  return ["Все"];
}

function countStatuses(results: DashboardQueryResult[]): Partial<Record<ResultStatus, number>> {
  return results.reduce<Partial<Record<ResultStatus, number>>>((counters, result) => {
    counters[result.status] = (counters[result.status] ?? 0) + 1;
    return counters;
  }, {});
}

function unquote(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}
