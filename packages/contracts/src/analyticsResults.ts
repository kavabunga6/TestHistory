import type { AllureStatus, PageMetadataReadModel } from "./core.js";

export type AnalyticsResultStatus = AllureStatus | "muted";

export type AnalyticsResultSummaryReadModel = {
  uuid: string;
  launchId: string;
  projectId: string;
  name: string;
  fullName?: string;
  historyId?: string;
  testCaseId?: string;
  status: AllureStatus;
  durationMs?: number;
  owner?: string;
  severity?: string;
  layer?: string;
  tags: string[];
  issues: string[];
  testKeys: string[];
  muted: boolean;
  flaky: boolean;
  flakyKnown: boolean;
  history: AllureStatus[];
};

export type AnalyticsResultListReadModel = {
  kind: "analytics-result-list";
  projectId: string;
  launchId?: string;
  page: PageMetadataReadModel;
  metrics: {
    total: number;
    matched: number;
    statusCounters: Record<AnalyticsResultStatus, number>;
    averageDurationMs: number | null;
    flakyCount: number;
    flakyDataComplete: boolean;
    slowCount: number;
    openRisks: number;
  };
  prioritySignals: AnalyticsResultSummaryReadModel[];
  slowSignals: AnalyticsResultSummaryReadModel[];
  items: AnalyticsResultSummaryReadModel[];
};
