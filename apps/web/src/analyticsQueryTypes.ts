import type { ResultStatus } from "./m1Workspace.js";

export type DashboardEntity = "test_results" | "test_cases" | "launches" | "defects";
export type DashboardMetric =
  "count" | "count_by_status" | "failure_rate" | "duration_p95" | "top_failed";
export type DashboardChartType = "number" | "pie" | "stacked_bar" | "line" | "table" | "heatmap";
export type DashboardPeriod = "last_launch" | "last_7_days" | "last_30_days" | "all";

export type DashboardWidgetDefinition = {
  id: string;
  title: string;
  entity: DashboardEntity;
  query: string;
  metric: DashboardMetric;
  groupBy: string[];
  period: DashboardPeriod;
  chart: DashboardChartType;
};

export type QueryValidationResult =
  | {
      ast: QueryExpression | undefined;
      normalized: string;
      ok: true;
    }
  | {
      error: string;
      ok: false;
    };

export type AnalyticsRunResult = {
  filteredCount: number;
  groups: Array<{
    key: string;
    count: number;
    counters: Record<ResultStatus, number>;
    failureRate: number;
    durationP95Ms: number;
  }>;
  metric: DashboardMetric;
  rows: Array<Record<string, string | number>>;
  series: Array<{ label: string; value: number; status?: ResultStatus }>;
  total: number;
};

export type Token =
  | { type: "identifier"; value: string }
  | { type: "string"; value: string }
  | { type: "number"; value: number }
  | { type: "operator"; value: "=" | "!=" | "~=" | ">" | ">=" | "<" | "<=" }
  | { type: "keyword"; value: "and" | "or" | "in" | "not" | "true" | "false" }
  | { type: "symbol"; value: "(" | ")" | "[" | "]" | "," };

export type OperatorValue = Extract<Token, { type: "operator" }>["value"] | "in";
export type SymbolValue = Extract<Token, { type: "symbol" }>["value"];
export type KeywordValue = Extract<Token, { type: "keyword" }>["value"];

export type FieldReference = {
  key?: string;
  name: string;
};

export type QueryExpression =
  | {
      field: FieldReference;
      operator: OperatorValue;
      value: QueryList | QueryValue;
      type: "comparison";
    }
  | QueryList
  | { left: QueryExpression; right: QueryExpression; type: "and" | "or" }
  | { expression: QueryExpression; type: "not" };

export type QueryList = { items: QueryValue[]; type: "list" };
export type QueryValue = boolean | number | string;
