import type { AllureStatus } from "./core.js";

export type DashboardAggregateStatus = AllureStatus | "muted";
export type DashboardAggregateWidgetKind = "metric" | "bar" | "donut" | "table" | "line";
export type DashboardAggregateMetricKind = "count" | "passRate" | "averageDuration" | "retryCount";

export type LaunchDashboardAggregateRequest = {
  widgets: Array<{
    id: string;
    kind: DashboardAggregateWidgetKind;
    metric: string;
    groupBy: string;
    thql: string;
    entity?: string;
  }>;
};

export type DashboardAggregateGroup = {
  key: string;
  label: string;
  value: number;
  percent: number;
  status?: DashboardAggregateStatus;
};

export type DashboardAggregateTableRow = {
  id: string;
  uuid: string;
  launchId: string;
  name: string;
  status: DashboardAggregateStatus;
  duration: string;
  durationMs?: number;
};

export type DashboardAggregateReadyWidget = {
  id: string;
  status: "ready";
  filteredCount: number;
  passedCount: number;
  passRate: number;
  averageDurationMs: number | null;
  averageDuration: string;
  retryCount: null;
  metricKind: DashboardAggregateMetricKind;
  value: string;
  groupCount: number;
  groupsTruncated: boolean;
  groups: DashboardAggregateGroup[];
  tableRows: DashboardAggregateTableRow[];
};

export type DashboardAggregateUnsupportedWidget = {
  id: string;
  status: "unsupported";
  reason: string;
};

export type LaunchDashboardAggregateReadModel = {
  kind: "launch-dashboard-aggregate";
  launchId: string;
  projectId: string;
  totalResults: number;
  widgets: Array<DashboardAggregateReadyWidget | DashboardAggregateUnsupportedWidget>;
};
