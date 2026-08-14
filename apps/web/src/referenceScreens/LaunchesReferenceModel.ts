import type {
  LaunchListItem,
  ResultAttachment,
  ResultParameter,
  ResultStatus,
  ScenarioStep,
  TestCaseHistoryPoint,
  TestResult
} from "../m1Workspace.js";
import { filterRecordsByQuery } from "../analyticsQuery.js";
import { collapseHistoryToFinalRunResults, getCurrentRunRetryCount } from "../resultHistory.js";
import {
  formatDurationSeconds,
  formatHistoryDate,
  formatHistoryLaunchName,
  formatLaunchId,
  formatOptionalCount,
  formatStatus,
  parseDurationSeconds,
  uniqueStrings
} from "./LaunchesReferenceFormatters.js";

export type LaunchTab = "overview" | "results" | "errors" | "charts" | "comparison";
export type ParsedLaunchMetadata = {
  branch: string;
  group: string;
  openedAt: string;
  closedAt: string;
  tags: string[];
};
export type ErrorGroup = {
  name: string;
  failed: number;
  broken: number;
  results: TestResult[];
};
export type TimelineRow = TestCaseHistoryPoint & {
  result: TestResult;
};
export type DefectOverviewItem = {
  id: string;
  resultId: string;
  subtitle: string;
  title: string;
};
export type ResultReportTab =
  "overview" | "history" | "retries" | "attachments" | "quarantine" | "defects" | "fields";
export type LaunchesReferenceLoadingScope = "launch-list" | "launch-detail" | "result";
export type LaunchesReferencePartialState =
  | boolean
  | {
      loadedCount?: number | undefined;
      message?: string | undefined;
      totalCount?: number | undefined;
    };

export const analyticsStatusOrder: ResultStatus[] = ["failed", "broken", "passed", "skipped"];
export const filterStatusOrder: ResultStatus[] = ["failed", "broken", "passed", "skipped", "muted"];
export const overviewListPageSizeOptions = [5, 10, 20, 50] as const;
export const defaultOverviewListPageSize = 5;
export const launchTabs: Array<{ id: LaunchTab; label: string }> = [
  { id: "overview", label: "Обзор" },
  { id: "results", label: "Результаты тестов" },
  { id: "errors", label: "Ошибки" },
  { id: "charts", label: "Графики" },
  { id: "comparison", label: "Сравнение" }
];

export const launchStateLabels: Record<string, string> = {
  closed: "Закрыт",
  open: "Открыт"
};
export const resultReportTabs: Array<{
  id: ResultReportTab;
  label: string;
  count?: (result: TestResult) => number;
}> = [
  { id: "overview", label: "Обзор" },
  {
    id: "history",
    label: "История результатов",
    count: (result) => getHistoryPoints(result).length
  },
  { id: "retries", label: "Перезапуски", count: getCurrentRunRetryCount },
  { id: "attachments", label: "Вложения", count: (result) => collectAttachments(result).length },
  {
    id: "defects",
    label: "Дефекты",
    count: (result) =>
      result.issues.length + (result.defect ? 1 : 0) + (result.defectHistory?.length ?? 0)
  },
  { id: "fields", label: "Поля и связи" },
  {
    id: "quarantine",
    label: "Карантин",
    count: (result) => (isResultQuarantined(result) ? 1 : 0)
  }
];

export function parseLaunchTab(value: string | undefined): LaunchTab {
  return launchTabs.some((tab) => tab.id === value) ? (value as LaunchTab) : "overview";
}

export function parseResultReportTab(value: string | undefined): ResultReportTab {
  return resultReportTabs.some((tab) => tab.id === value) ? (value as ResultReportTab) : "overview";
}

export function getHistoryPoints(result: TestResult): TestCaseHistoryPoint[] {
  if (result.historyPoints !== undefined && result.historyPoints.length > 0) {
    return collapseHistoryToFinalRunResults(result.historyPoints);
  }

  const comparedPoints =
    result.historyCompare !== undefined
      ? [result.historyCompare.to, result.historyCompare.from].map((point, index) => ({
          launchId: point.launchId,
          launchName: point.launchName,
          resultUuid: index === 0 ? result.id : `${result.id}-${point.launchId}`,
          startedAt: point.startedAt,
          status: point.status,
          duration: point.duration,
          retry: point.retry > 0,
          flaky: point.flaky,
          attempt: point.retry + 1
        }))
      : [];
  const remainingStatuses = result.history.slice(comparedPoints.length);
  const baseStatuses =
    comparedPoints.length === 0 ? [result.status, ...result.history.slice(1)] : remainingStatuses;
  const syntheticPoints = baseStatuses.map((status, index) => ({
    launchId: "",
    launchName:
      comparedPoints.length === 0 && index === 0
        ? "Текущий запуск"
        : formatHistoryLaunchName(comparedPoints.length + index),
    resultUuid: `${result.id}-history-${comparedPoints.length + index}`,
    startedAt: "",
    status,
    duration: result.duration,
    retry: false,
    flaky: false,
    attempt: comparedPoints.length + index + 1
  }));

  return collapseHistoryToFinalRunResults([...comparedPoints, ...syntheticPoints]);
}

export function resolveHistoryResultId(
  results: TestResult[],
  currentResult: TestResult,
  point: TestCaseHistoryPoint
): string {
  const directMatch = results.find((result) => result.id === point.resultUuid);
  if (directMatch !== undefined) {
    return directMatch.id;
  }

  const launchMatch = results.find(
    (result) =>
      result.historyCompare?.to.launchId === point.launchId ||
      result.historyCompare?.from.launchId === point.launchId ||
      result.historyPoints?.some((candidate) => candidate.resultUuid === point.resultUuid)
  );

  return launchMatch?.id ?? currentResult.id;
}

export function getDefectValues(result: TestResult): string[] {
  return uniqueStrings([
    result.defect,
    ...result.issues,
    ...(result.defectHistory ?? []).map((defect) => `${defect.id} (история)`)
  ]);
}

export function getActiveDefectValues(result: TestResult): string[] {
  return uniqueStrings([result.defect, ...result.issues]);
}

export function getQuarantineSummary(result: TestResult): string {
  if (result.defectMute !== undefined) {
    return result.defectMute.expiresAt === undefined
      ? "Активен без срока"
      : `Активен до ${formatHistoryDate(result.defectMute.expiresAt)}`;
  }

  return result.muted || result.status === "muted" ? "Результат в карантине" : "";
}

export function getQuarantineTitle(result: TestResult): string {
  const reason = result.defectMute?.reason.trim();
  if (reason !== undefined && reason.length > 0) {
    return reason;
  }

  return result.muted || result.status === "muted" ? "Карантин результата" : "";
}

export function getQuarantineMeta(result: TestResult): string {
  const values = [getQuarantineSummary(result)];
  if (result.defectMute?.actor !== undefined) {
    values.push(`Создатель: ${result.defectMute.actor}`);
  }
  if (result.defectMute?.taskId !== undefined) {
    values.push(`Задача: ${result.defectMute.taskId}`);
  }
  if (result.defectMute?.defectId !== undefined) {
    values.push(`Дефект: ${result.defectMute.defectId}`);
  } else if (result.defectMute?.id !== undefined) {
    values.push(`Дефект: ${result.defectMute.id}`);
  }

  return values.join(" · ");
}

export function getDefectCreator(result: TestResult, _defectId: string): string {
  return result.owner || "Не назначен";
}

export function findLaunchIdForResult(
  results: TestResult[],
  resultId: string | undefined
): string | undefined {
  if (resultId === undefined || resultId === "") {
    return undefined;
  }

  const result = results.find((item) => item.id === resultId);
  return (
    result?.historyCompare?.to.launchId ??
    result?.historyCompare?.from.launchId ??
    result?.historyPoints?.[0]?.launchId
  );
}

export function getLaunchResults(results: TestResult[], launch: LaunchListItem): TestResult[] {
  const matched = results.filter(
    (result) =>
      result.historyCompare?.to.launchId === launch.id ||
      result.historyCompare?.from.launchId === launch.id ||
      result.historyPoints?.some((point) => point.launchId === launch.id)
  );

  return matched.length > 0 ? matched : results;
}

export function findMostUsefulLaunchResult(results: TestResult[]): TestResult | undefined {
  return (
    results.find((result) => result.status === "failed") ??
    results.find((result) => result.status === "broken") ??
    results.find((result) => collectAttachments(result).length > 0) ??
    results[0]
  );
}

export function filterResults(
  results: TestResult[],
  query: string,
  statusFilter?: ResultStatus | undefined
): TestResult[] {
  const statusMatchedResults =
    statusFilter === undefined
      ? results
      : results.filter((result) => matchesStatusFilter(result, statusFilter));
  const normalizedQuery = query.trim().toLowerCase();
  if (normalizedQuery.length === 0) {
    return statusMatchedResults;
  }

  if (isLikelyThqlQuery(query)) {
    try {
      return filterRecordsByQuery(statusMatchedResults, query, toLaunchResultSearchRecord);
    } catch {
      return [];
    }
  }

  return statusMatchedResults.filter((result) =>
    [
      result.name,
      result.suite,
      result.status,
      formatStatus(result.status),
      result.duration,
      result.allureId,
      ...result.tags,
      ...result.issues,
      ...result.testKeys
    ]
      .join(" ")
      .toLowerCase()
      .includes(normalizedQuery)
  );
}

export function filterLaunchItems(launchItems: LaunchListItem[], query: string): LaunchListItem[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (normalizedQuery.length === 0) {
    return launchItems;
  }

  if (isLikelyThqlQuery(query)) {
    try {
      return filterRecordsByQuery(launchItems, query, toLaunchSearchRecord);
    } catch {
      return [];
    }
  }

  return launchItems.filter((launch) =>
    [
      launch.id,
      launch.name,
      launch.state,
      launchStateLabels[launch.state],
      ...launch.metadata,
      findBranch(launch.metadata),
      inferLaunchGroup([launch])
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(normalizedQuery)
  );
}

function toLaunchResultSearchRecord(result: TestResult) {
  return {
    allureid: result.allureId,
    defect: [result.defect, ...result.issues].filter(
      (value): value is string => value !== undefined
    ),
    duration: result.duration,
    id: result.id,
    issue: result.issues,
    link: result.links,
    muted: result.status === "muted" || result.muted,
    name: result.name,
    owner: result.owner,
    status: result.status,
    suite: result.suite,
    tag: result.tags,
    tags: result.tags,
    testkey: result.testKeys
  };
}

function toLaunchSearchRecord(launch: LaunchListItem) {
  const metadata = parseLaunchMetadata(launch);
  return {
    branch: metadata.branch,
    broken: launch.counters.broken,
    defects: launch.defects,
    failed: launch.counters.failed,
    group: inferLaunchGroup([launch]),
    id: launch.id,
    members: launch.members,
    metadata: launch.metadata,
    name: launch.name,
    passed: launch.counters.passed,
    skipped: launch.counters.skipped,
    state: launch.state,
    tag: metadata.tags,
    tags: metadata.tags,
    total: getLaunchTotal(launch)
  };
}

function isLikelyThqlQuery(query: string): boolean {
  return /(?:=|!=|~=|>=|<=|>|<|\bin\b|\band\b|\bor\b|\bnot\b|\[|\])/i.test(query);
}

export function hasLoadingScope(
  loadingScope: LaunchesReferenceLoadingScope | LaunchesReferenceLoadingScope[] | undefined,
  scope: LaunchesReferenceLoadingScope
): boolean {
  if (loadingScope === undefined) {
    return false;
  }

  return Array.isArray(loadingScope) ? loadingScope.includes(scope) : loadingScope === scope;
}

export function getPartialStateMessage(
  partial: LaunchesReferencePartialState | undefined,
  fallbackMessage: string
): string | undefined {
  if (partial === undefined || partial === false) {
    return undefined;
  }

  if (partial === true) {
    return fallbackMessage;
  }

  const countText =
    partial.loadedCount !== undefined || partial.totalCount !== undefined
      ? `Загружено ${formatOptionalCount(partial.loadedCount)} из ${formatOptionalCount(
          partial.totalCount
        )}.`
      : undefined;

  return [partial.message, countText, fallbackMessage].filter(Boolean).join(" ");
}

export function collectAttachments(result: TestResult): ResultAttachment[] {
  return [...(result.attachments ?? []), ...collectStepAttachments(result.steps)];
}

function collectStepAttachments(steps: ScenarioStep[]): ResultAttachment[] {
  return steps.flatMap((step) => [
    ...(step.attachments ?? []),
    ...collectStepAttachments(step.steps ?? [])
  ]);
}

export function collectLaunchParameters(
  launch: LaunchListItem,
  results: TestResult[]
): ResultParameter[] {
  const firstResult = results[0];
  const resultParameters = firstResult?.parameters ?? [];
  const branch = findBranch(launch.metadata);
  const metadata = uniqueStrings(launch.metadata.filter((value) => value !== branch));

  return [
    ...(branch === undefined ? [] : [{ name: "BRANCH", value: branch }]),
    { name: "STATE", value: launchStateLabels[launch.state] ?? launch.state },
    ...(metadata.length === 0 ? [] : [{ name: "METADATA", value: metadata.join(", ") }]),
    ...resultParameters.slice(0, 6).map((parameter) => ({
      name: parameter.name,
      value: parameter.masked ? "[redacted]" : parameter.value
    }))
  ];
}

export function parseLaunchMetadata(item: LaunchListItem): ParsedLaunchMetadata {
  const branch = findBranch(item.metadata) ?? "develop";
  const tags = uniqueStrings([inferLaunchGroup([item]), ...item.metadata]);

  return {
    branch,
    closedAt: inferClosedAt(item),
    group: inferLaunchGroup([item]),
    openedAt: inferOpenedAt(item),
    tags: tags.length > 0 ? tags : ["без тегов"]
  };
}

export function collectDefectItems(results: TestResult[]): DefectOverviewItem[] {
  const items = new Map<string, DefectOverviewItem>();

  for (const result of results) {
    const defectIds = uniqueStrings([result.defect, ...result.issues]);
    for (const defectId of defectIds) {
      if (items.has(defectId)) {
        continue;
      }

      items.set(defectId, {
        id: defectId,
        resultId: result.id,
        subtitle: `${result.name} · ${result.owner}`,
        title: result.trace?.message ?? result.description ?? result.name
      });
    }
  }

  return [...items.values()];
}

export function collectErrorGroups(results: TestResult[]): ErrorGroup[] {
  const groups = new Map<string, ErrorGroup>();
  for (const result of results) {
    if (result.status !== "failed" && result.status !== "broken") {
      continue;
    }

    const name = result.trace?.message.split(":")[0] || result.defect || "Без категории";
    const group = groups.get(name) ?? { name, failed: 0, broken: 0, results: [] };
    if (result.status === "failed") {
      group.failed += 1;
    } else {
      group.broken += 1;
    }
    group.results.push(result);
    groups.set(name, group);
  }

  return Array.from(groups.values()).sort(
    (left, right) => right.failed + right.broken - (left.failed + left.broken)
  );
}

export function buildDurationBuckets(results: TestResult[]) {
  const buckets = [
    { label: "<100ms", maxSeconds: 0.1, count: 0 },
    { label: "100ms-1s", maxSeconds: 1, count: 0 },
    { label: "1s-10s", maxSeconds: 10, count: 0 },
    { label: "10s-1m", maxSeconds: 60, count: 0 },
    { label: "1m-5m", maxSeconds: 300, count: 0 },
    { label: "5m-30m", maxSeconds: 1800, count: 0 },
    { label: "30m-1h", maxSeconds: 3600, count: 0 },
    { label: ">1h", maxSeconds: Number.POSITIVE_INFINITY, count: 0 }
  ];

  for (const result of results) {
    const seconds = parseDurationSeconds(result.duration);
    const index = buckets.findIndex((bucket) => seconds <= bucket.maxSeconds);
    const bucket = buckets[index];
    if (bucket !== undefined) {
      bucket.count += 1;
    }
  }

  return buckets.map(({ count, label }) => ({ count, label }));
}

export function formatAverageDuration(results: TestResult[]): string {
  const durations = results
    .filter((result) => result.status !== "muted")
    .map((result) => parseDurationSeconds(result.duration))
    .filter((duration) => Number.isFinite(duration) && duration > 0);

  if (durations.length === 0) {
    return "нет данных";
  }

  const average = durations.reduce((total, duration) => total + duration, 0) / durations.length;
  return formatDurationSeconds(average);
}

export function collectTimelineRows(results: TestResult[]): TimelineRow[] {
  return results
    .flatMap((result) =>
      (result.historyPoints ?? []).map((point) => ({
        ...point,
        result
      }))
    )
    .sort((left, right) => left.startedAt.localeCompare(right.startedAt));
}

export function buildDonutSegments(
  counters: Record<ResultStatus, number>,
  total: number,
  radius: number,
  gapDegrees: number
) {
  if (total <= 0) {
    return [];
  }

  const visibleStatuses = analyticsStatusOrder
    .filter((status) => counters[status] > 0)
    .map((status) => ({ status, value: counters[status] }));
  const totalGap = visibleStatuses.length > 1 ? gapDegrees * visibleStatuses.length : 0;
  const availableDegrees = Math.max(0, 360 - totalGap);
  const minVisibleDegrees = 9;
  const rawDegrees = visibleStatuses.map((item) => (item.value / total) * availableDegrees);
  const boostedDegrees = rawDegrees.map((degrees) => Math.max(minVisibleDegrees, degrees));
  const degreesSum = boostedDegrees.reduce((sum, degrees) => sum + degrees, 0);
  const scale = Math.min(1, availableDegrees / degreesSum);

  let cursor = 0;
  return visibleStatuses.map((item, index) => {
    const length = boostedDegrees[index]! * scale;
    const startAngle = cursor;
    const endAngle = cursor + length;
    const segment = {
      endAngle,
      path: describeDonutArc(60, 60, radius, startAngle, endAngle),
      startAngle,
      status: item.status,
      value: item.value
    };
    cursor += length + (visibleStatuses.length > 1 ? gapDegrees : 0);
    return segment;
  });
}

function describeDonutArc(
  centerX: number,
  centerY: number,
  radius: number,
  startAngle: number,
  endAngle: number
) {
  const start = polarToCartesian(centerX, centerY, radius, startAngle);
  const end = polarToCartesian(centerX, centerY, radius, Math.min(endAngle, 359.99));
  const largeArcFlag = endAngle - startAngle > 180 ? 1 : 0;

  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${end.x} ${end.y}`;
}

function polarToCartesian(centerX: number, centerY: number, radius: number, angle: number) {
  const angleInRadians = ((angle - 90) * Math.PI) / 180;

  return {
    x: centerX + radius * Math.cos(angleInRadians),
    y: centerY + radius * Math.sin(angleInRadians)
  };
}

export function getLaunchTotal(item: { counters: Record<ResultStatus, number> }) {
  return analyticsStatusOrder.reduce((total, status) => total + item.counters[status], 0);
}

export function isResultQuarantined(result: TestResult): boolean {
  return result.muted || result.defectMute !== undefined || result.status === "muted";
}

export function matchesStatusFilter(result: TestResult, status: ResultStatus): boolean {
  return status === "muted" ? isResultQuarantined(result) : result.status === status;
}

export function inferOpenedAt(item: LaunchListItem) {
  const idNumber = Number(formatLaunchId(item.id));
  const minute = Number.isFinite(idNumber) ? Math.max(0, 55 - (idNumber % 20)) : 34;
  return `30 мая в 05:${String(minute).padStart(2, "0")}`;
}

export function inferClosedAt(item: LaunchListItem) {
  const idNumber = Number(formatLaunchId(item.id));
  const minute = Number.isFinite(idNumber) ? Math.max(0, 10 - (idNumber % 8)) : 10;
  return `30 мая в 10:${String(minute).padStart(2, "0")}`;
}

export function inferLaunchGroup(launchItems: LaunchListItem[]) {
  return launchItems.some((item) => /nightly/i.test([item.name, ...item.metadata].join(" ")))
    ? "Nightly"
    : "develop";
}

export function findBranch(metadata: string[]): string | undefined {
  return metadata
    .find((value) =>
      /^(main|master|develop|release[/-]|feature[/-]|bugfix[/-]|hotfix[/-]|branch:)/i.test(value)
    )
    ?.replace(/^branch:\s*/i, "");
}
