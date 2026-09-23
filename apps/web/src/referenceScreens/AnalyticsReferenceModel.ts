import type { ResultStatus, TestResult } from "../m1Workspace.js";
import type { AnalyticsResultSummary, AnalyticsResultsRead } from "./AnalyticsReferenceData.js";

export type AnalyticsStatus = ResultStatus | "unknown";

export type AnalyticsSignal = {
  id: string;
  launchId?: string;
  resultId?: string;
  name: string;
  suite: string;
  owner: string;
  status: AnalyticsStatus;
  duration: string;
};

type StatusMetric = {
  status: AnalyticsStatus;
  count: number;
  percent: string;
};

const statusOrder: AnalyticsStatus[] = ["failed", "broken", "passed", "skipped", "muted"];
const signalLimit = 50;

export function buildAnalyticsModel(results: TestResult[], query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  const filtered = normalizedQuery
    ? results.filter((result) => matchesResult(result, normalizedQuery))
    : results;
  const counts = countStatuses(filtered);
  const filteredTotal = filtered.length;
  const passRate =
    filteredTotal > 0 ? `${Math.round((counts.passed / filteredTotal) * 100)}%` : "0%";
  const durations = filtered
    .map((result) => parseDurationSeconds(result.duration))
    .filter((item) => item > 0);
  const averageDuration =
    durations.length > 0
      ? formatDurationSeconds(durations.reduce((sum, item) => sum + item, 0) / durations.length)
      : "Нет данных";
  const prioritySignals = filtered
    .filter((result) => result.status === "failed" || result.status === "broken")
    .sort(
      (left, right) => parseDurationSeconds(right.duration) - parseDurationSeconds(left.duration)
    )
    .slice(0, 6);
  const slowSignals = filtered
    .filter((result) => parseDurationSeconds(result.duration) >= 2)
    .sort(
      (left, right) => parseDurationSeconds(right.duration) - parseDurationSeconds(left.duration)
    )
    .slice(0, 6);
  const flakyCount = filtered.filter((result) => new Set(result.history).size > 1).length;
  const slowCount = filtered.filter((result) => parseDurationSeconds(result.duration) >= 2).length;
  const visibleSignals = filtered
    .slice()
    .sort((left, right) => {
      const riskDelta = statusRiskScore(right.status) - statusRiskScore(left.status);
      return riskDelta !== 0
        ? riskDelta
        : parseDurationSeconds(right.duration) - parseDurationSeconds(left.duration);
    })
    .slice(0, signalLimit);
  const statusMetrics = buildStatusMetrics(counts, filteredTotal);

  return {
    averageDuration,
    counts,
    filteredTotal,
    flakyCount,
    openRisks: counts.failed + counts.broken,
    passRate,
    prioritySignals,
    slowSignals,
    slowCount,
    statusMetrics,
    total: results.length,
    visibleSignals
  };
}

export function buildServerAnalyticsModel(read: AnalyticsResultsRead) {
  const counts = countStatusesFromServer(read.metrics.statusCounters);
  const filteredTotal = read.metrics.matched;
  const statusMetrics = buildStatusMetrics(counts, filteredTotal);
  return {
    averageDuration: formatDurationMilliseconds(read.metrics.averageDurationMs),
    counts,
    filteredTotal,
    flakyCount: read.metrics.flakyCount,
    openRisks: read.metrics.openRisks,
    passRate: filteredTotal > 0 ? `${Math.round((counts.passed / filteredTotal) * 100)}%` : "0%",
    prioritySignals: read.prioritySignals.map(mapServerSignal),
    slowSignals: read.slowSignals.map(mapServerSignal),
    slowCount: read.metrics.slowCount,
    statusMetrics,
    total: read.metrics.total,
    visibleSignals: read.items.map(mapServerSignal)
  };
}

function mapServerSignal(summary: AnalyticsResultSummary): AnalyticsSignal {
  return {
    id: `${summary.launchId}:${summary.uuid}`,
    launchId: summary.launchId,
    resultId: summary.uuid,
    name: summary.name,
    suite: summary.fullName ?? summary.historyId ?? "",
    owner: summary.owner ?? "Не назначен",
    status: summary.muted ? "muted" : summary.status,
    duration: formatDurationMilliseconds(summary.durationMs ?? null)
  };
}

function countStatusesFromServer(statusCounters: Record<string, number>) {
  const counts = Object.fromEntries(
    [...statusOrder, "unknown"].map((status) => [status, statusCounters[status] ?? 0])
  ) as Record<AnalyticsStatus, number>;
  return counts;
}

function buildStatusMetrics(
  counts: Record<AnalyticsStatus, number>,
  total: number
): StatusMetric[] {
  const visibleStatuses = counts.unknown > 0 ? [...statusOrder, "unknown" as const] : statusOrder;
  return visibleStatuses.map((status) => ({
    count: counts[status],
    percent: total > 0 ? `${Math.round((counts[status] / total) * 100)}%` : "0%",
    status
  }));
}

function matchesResult(result: TestResult, query: string): boolean {
  return [
    result.id,
    result.allureId,
    result.name,
    result.suite,
    result.owner,
    result.status,
    result.severity,
    result.layer,
    result.defect ?? "",
    ...result.tags,
    ...result.issues,
    ...result.testKeys
  ]
    .join(" ")
    .toLowerCase()
    .includes(query);
}

function countStatuses(results: TestResult[]): Record<AnalyticsStatus, number> {
  const counts = [...statusOrder, "unknown" as const].reduce(
    (accumulator, status) => {
      accumulator[status] = 0;
      return accumulator;
    },
    {} as Record<AnalyticsStatus, number>
  );

  for (const result of results) {
    counts[result.status] += 1;
  }

  return counts;
}

function statusRiskScore(status: ResultStatus): number {
  switch (status) {
    case "failed":
      return 5;
    case "broken":
      return 4;
    case "muted":
      return 2;
    case "skipped":
      return 1;
    case "passed":
      return 0;
  }
}

export function formatStatus(status: AnalyticsStatus): string {
  switch (status) {
    case "passed":
      return "Пройден";
    case "failed":
      return "Провален";
    case "broken":
      return "Сломан";
    case "skipped":
      return "Пропущен";
    case "muted":
      return "Карантин";
    case "unknown":
      return "Неизвестен";
  }
}

function parseDurationSeconds(duration: string): number {
  const millisecondsMatch = duration.match(/(\d+(?:[.,]\d+)?)\s*ms/);
  const durationWithoutMilliseconds = duration.replace(/(\d+(?:[.,]\d+)?)\s*ms/g, "");
  const minutesMatch = durationWithoutMilliseconds.match(/(\d+(?:[.,]\d+)?)\s*m(?!s)/);
  const secondsMatch = durationWithoutMilliseconds.match(/(\d+(?:[.,]\d+)?)\s*s/);

  const minutes = parseDurationPart(minutesMatch?.[1]) * 60;
  const seconds = parseDurationPart(secondsMatch?.[1]);
  const milliseconds = parseDurationPart(millisecondsMatch?.[1]) / 1000;

  return minutes + seconds + milliseconds;
}

function parseDurationPart(value: string | undefined): number {
  return value === undefined ? 0 : Number.parseFloat(value.replace(",", ".")) || 0;
}

function formatDurationSeconds(duration: number): string {
  if (duration < 1) {
    return `${Math.round(duration * 1000)}ms`;
  }
  if (duration < 60) {
    return `${duration.toFixed(2).replace(/\.?0+$/, "")}s`;
  }
  const minutes = Math.floor(duration / 60);
  const seconds = Math.round(duration % 60);
  return `${minutes}m ${seconds}s`;
}

export function formatCount(value: number): string {
  return new Intl.NumberFormat("ru-RU").format(value);
}

export function formatRate(value: number): string {
  return `${Math.round(value * 1_000) / 10}%`;
}

export function formatDurationMilliseconds(value: number | null): string {
  if (value === null) return "Нет данных";
  return formatDurationSeconds(value / 1_000);
}

export function formatTrendDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit" }).format(date);
}

export function formatLaunchSeriesCount(value: number): string {
  const mod10 = value % 10;
  const mod100 = value % 100;
  const noun =
    mod10 === 1 && mod100 !== 11
      ? "запуск"
      : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)
        ? "запуска"
        : "запусков";
  return `Последние ${value} ${noun}`;
}
