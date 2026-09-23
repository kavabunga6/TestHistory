import type {
  AllureStatus,
  AnalyticsResultListReadModel,
  AnalyticsResultStatus,
  AnalyticsResultSummaryReadModel,
  NormalizedTestResult
} from "@testhistory/contracts";
import type { Launch } from "../store.js";
import { paginate } from "./launchHelpers.js";

export type AnalyticsResultsQuery = {
  projectId: string;
  launchId?: string;
  q?: string;
  status?: AnalyticsResultStatus;
  limit?: number;
  cursor?: string;
};

type Candidate = {
  launch: Launch;
  result: NormalizedTestResult;
  identity: string | undefined;
};

const statuses: AnalyticsResultStatus[] = [
  "failed",
  "broken",
  "passed",
  "skipped",
  "unknown",
  "muted"
];
const slowThresholdMs = 2_000;
const topLimit = 6;
const historyLimit = 5;

export function buildAnalyticsResults(
  launches: Launch[],
  activeMutedTestIds: ReadonlySet<string>,
  query: AnalyticsResultsQuery,
  limit: number,
  offset: number
): AnalyticsResultListReadModel {
  const allCandidates = launches.flatMap((launch) =>
    launch.results.map((result) => ({
      launch,
      result,
      identity: stableIdentity(result)
    }))
  );
  const history = buildProjectHistory(allCandidates);
  const search = query.q?.trim().toLocaleLowerCase() ?? "";
  const scoped = allCandidates.filter(
    (candidate) => query.launchId === undefined || candidate.launch.id === query.launchId
  );
  const matched = scoped
    .filter((candidate) => matchesSearch(candidate.result, search))
    .map((candidate) =>
      toSummary(candidate, history.get(candidate.identity ?? ""), activeMutedTestIds)
    )
    .filter(
      (item) => query.status === undefined || (item.muted ? "muted" : item.status) === query.status
    );
  const counters = Object.fromEntries(statuses.map((status) => [status, 0])) as Record<
    AnalyticsResultStatus,
    number
  >;
  let durationSum = 0;
  let durationCount = 0;
  let flakyCount = 0;
  let flakyDataComplete = true;
  let slowCount = 0;
  for (const item of matched) {
    const status = item.muted ? "muted" : item.status;
    counters[status] = (counters[status] ?? 0) + 1;
    if (item.durationMs !== undefined && Number.isFinite(item.durationMs) && item.durationMs >= 0) {
      durationSum += item.durationMs;
      durationCount += 1;
      if (item.durationMs >= slowThresholdMs) slowCount += 1;
    }
    if (item.flaky) flakyCount += 1;
    if (!item.flakyKnown) flakyDataComplete = false;
  }

  const byDuration = (
    left: AnalyticsResultSummaryReadModel,
    right: AnalyticsResultSummaryReadModel
  ) =>
    (right.durationMs ?? -1) - (left.durationMs ?? -1) ||
    left.launchId.localeCompare(right.launchId) ||
    left.uuid.localeCompare(right.uuid);
  const prioritySignals = matched
    .filter((item) => !item.muted && (item.status === "failed" || item.status === "broken"))
    .sort(byDuration)
    .slice(0, topLimit);
  const slowSignals = matched
    .filter((item) => item.durationMs !== undefined && item.durationMs >= slowThresholdMs)
    .sort(byDuration)
    .slice(0, topLimit);
  const ordered = matched.sort((left, right) => {
    const risk = riskScore(right) - riskScore(left);
    return risk || byDuration(left, right);
  });
  const page = paginate(ordered, limit, offset);

  return {
    kind: "analytics-result-list",
    projectId: query.projectId,
    ...(query.launchId !== undefined ? { launchId: query.launchId } : {}),
    page: page.metadata,
    metrics: {
      total: scoped.length,
      matched: matched.length,
      statusCounters: counters,
      averageDurationMs: durationCount === 0 ? null : Math.round(durationSum / durationCount),
      flakyCount,
      flakyDataComplete,
      slowCount,
      openRisks: (counters.failed ?? 0) + (counters.broken ?? 0)
    },
    prioritySignals,
    slowSignals,
    items: page.items
  };
}

function buildProjectHistory(candidates: Candidate[]): Map<string, AllureStatus[]> {
  const history = new Map<string, AllureStatus[]>();
  const ordered = candidates
    .filter((candidate) => candidate.identity !== undefined)
    .sort(
      (left, right) =>
        left.launch.createdAt.localeCompare(right.launch.createdAt) ||
        (left.result.raw.start ?? 0) - (right.result.raw.start ?? 0) ||
        left.result.uuid.localeCompare(right.result.uuid)
    );
  for (const candidate of ordered) {
    const key = candidate.identity!;
    const values = history.get(key) ?? [];
    values.push(candidate.result.status);
    history.set(key, values);
  }
  return history;
}

function toSummary(
  { launch, result, identity }: Candidate,
  observedHistory: AllureStatus[] | undefined,
  activeMutedTestIds: ReadonlySet<string>
): AnalyticsResultSummaryReadModel {
  const history = observedHistory?.slice(-historyLimit) ?? [result.status];
  const markedFlaky = result.raw.statusDetails?.flaky === true;
  const muted = activeMutedTestIds.has(
    result.testCaseId ?? result.fullName ?? result.historyId ?? result.name
  );
  const owner = firstLabel(result, "owner", "member");
  const severity = firstLabel(result, "severity");
  const layer = firstLabel(result, "layer", "feature");
  return {
    uuid: result.uuid,
    launchId: launch.id,
    projectId: launch.projectId,
    name: result.name,
    ...(result.fullName !== undefined ? { fullName: result.fullName } : {}),
    ...(result.historyId !== undefined ? { historyId: result.historyId } : {}),
    ...(result.testCaseId !== undefined ? { testCaseId: result.testCaseId } : {}),
    status: result.status,
    ...(result.durationMs !== undefined ? { durationMs: result.durationMs } : {}),
    ...(owner !== undefined ? { owner } : {}),
    ...(severity !== undefined ? { severity } : {}),
    ...(layer !== undefined ? { layer } : {}),
    tags: result.labels.tag ?? [],
    issues: result.labels.issue ?? [],
    testKeys: [...(result.labels.tms ?? []), ...(result.labels.testKey ?? [])],
    muted,
    flaky: markedFlaky || (identity !== undefined && new Set(observedHistory ?? []).size > 1),
    flakyKnown: markedFlaky || identity !== undefined,
    history
  };
}

function stableIdentity(result: NormalizedTestResult): string | undefined {
  if (result.historyId !== undefined) return `historyId:${result.historyId}`;
  if (result.testCaseId !== undefined) return `testCaseId:${result.testCaseId}`;
  if (result.fullName !== undefined) return `fullName:${result.fullName}`;
  return undefined;
}

function firstLabel(result: NormalizedTestResult, ...names: string[]): string | undefined {
  for (const name of names) {
    const value = result.labels[name]?.[0];
    if (value !== undefined) return value;
  }
  return undefined;
}

function matchesSearch(result: NormalizedTestResult, search: string): boolean {
  if (search === "") return true;
  return [
    result.uuid,
    result.testCaseId,
    result.historyId,
    result.name,
    result.fullName,
    ...[
      "owner",
      "member",
      "tag",
      "issue",
      "tms",
      "testKey",
      "severity",
      "layer",
      "feature"
    ].flatMap((name) => result.labels[name] ?? [])
  ].some((value) => value?.toLocaleLowerCase().includes(search));
}

function riskScore(item: AnalyticsResultSummaryReadModel): number {
  if (item.muted) return 2;
  switch (item.status) {
    case "failed":
      return 5;
    case "broken":
      return 4;
    case "unknown":
      return 3;
    case "skipped":
      return 1;
    case "passed":
      return 0;
  }
}
