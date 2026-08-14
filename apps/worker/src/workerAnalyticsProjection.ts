import type {
  AllureParameter,
  AllureStatus,
  AnalyticsMaterializeJobPayload
} from "@testhistory/contracts";
import { buildDefectClusters, type DefectClusterReadModel, type Launch } from "@testhistory/domain";
import { hashIdempotencyParts } from "./workerHash.js";
import { isNonEmptyString } from "./workerValueUtils.js";
import type {
  AnalyticsMaterializePipelinePlan,
  AnalyticsProjectionFact,
  AnalyticsProjectionParameter,
  AnalyticsProjectionResult,
  SearchIndexProjectionDocument
} from "./workerTypes.js";

export function buildAnalyticsMaterializePipelinePlan(
  payload: AnalyticsMaterializeJobPayload,
  at: string,
  results: readonly AnalyticsProjectionResult[] = []
): AnalyticsMaterializePipelinePlan {
  const orderedResults = orderProjectionResults(results);
  const defectClusters = buildAnalyticsDefectClusterProjections(payload, at, orderedResults);
  const clusterByResultUuid = indexDefectClustersByResultUuid(defectClusters);
  const facts = buildAnalyticsProjectionFacts(payload, orderedResults, clusterByResultUuid);
  const searchIndexDocuments = buildSearchIndexProjectionDocuments(
    payload,
    orderedResults,
    clusterByResultUuid
  );
  const statusCounts = countProjectionStatuses(orderedResults);
  const projectionDigest = hashIdempotencyParts([
    "analytics-search-projection",
    ...facts.map((fact) => fact.id),
    ...searchIndexDocuments.map((document) => document.id),
    ...defectClusters.map((cluster) => cluster.id)
  ]);

  return {
    transitions: [
      { state: "materialize_requested", at },
      { state: "analytics_facts_planned", at },
      { state: "search_index_docs_planned", at },
      { state: "defect_clusters_planned", at },
      { state: "materialize_plan_recorded", at }
    ],
    facts,
    searchIndexDocuments,
    defectClusters,
    summary: {
      projectId: payload.projectId,
      launchId: payload.launchId ?? "all",
      scope: payload.launchId === undefined ? "project" : "launch",
      windowFrom: payload.window?.from ?? null,
      windowTo: payload.window?.to ?? null,
      resultCount: orderedResults.length,
      analyticsFactCount: facts.length,
      searchDocumentCount: searchIndexDocuments.length,
      defectClusterCount: defectClusters.length,
      activeDefectClusterCount: defectClusters.filter((cluster) => cluster.state !== "resolved-ish")
        .length,
      resolvedishDefectClusterCount: defectClusters.filter(
        (cluster) => cluster.state === "resolved-ish"
      ).length,
      passedCount: statusCounts.passed,
      failedCount: statusCounts.failed,
      brokenCount: statusCounts.broken,
      skippedCount: statusCounts.skipped,
      unknownCount: statusCounts.unknown,
      projectionDigest,
      plannedOperations: ["analytics.materialize", "search.index", "defect.cluster"]
    }
  };
}

export function buildAnalyticsProjectionFacts(
  payload: AnalyticsMaterializeJobPayload,
  results: readonly AnalyticsProjectionResult[],
  clusterByResultUuid: ReadonlyMap<string, DefectClusterReadModel> = new Map()
): AnalyticsProjectionFact[] {
  return orderProjectionResults(results).map((result) => {
    const launchId = result.launchId ?? payload.launchId ?? "all";
    const status = normalizeProjectionStatus(result.status);
    const durationMs = getProjectionDurationMs(result);
    const labelKeys = getProjectionLabelKeys(result);
    const visibleParameters = getVisibleProjectionParameters(result);
    const parameterSignatureHash = hashProjectionParameterSignature(visibleParameters);
    const caseKeyHash = hashProjectionCaseKey(result);
    const attachmentCount = getProjectionAttachmentCount(result);
    const flaky = result.statusDetails?.flaky === true;
    const muted = result.statusDetails?.muted === true;
    const cluster = clusterByResultUuid.get(result.uuid);

    const fact: AnalyticsProjectionFact = {
      id: `fact:${hashIdempotencyParts([
        payload.projectId,
        launchId,
        result.uuid,
        caseKeyHash,
        status,
        parameterSignatureHash
      ])}`,
      projectId: payload.projectId,
      launchId,
      resultUuid: result.uuid,
      caseKeyHash,
      status,
      durationMs,
      failed: status === "failed" || status === "broken",
      flaky,
      muted,
      attachmentCount,
      visibleParameterCount: visibleParameters.length,
      labelKeys,
      parameterSignatureHash
    };

    if (cluster !== undefined) {
      fact.defectClusterId = cluster.id;
      fact.defectState = cluster.state;
      fact.failureSignatureHash = cluster.signature.hash;
    }

    return fact;
  });
}

export function buildSearchIndexProjectionDocuments(
  payload: AnalyticsMaterializeJobPayload,
  results: readonly AnalyticsProjectionResult[],
  clusterByResultUuid: ReadonlyMap<string, DefectClusterReadModel> = new Map()
): SearchIndexProjectionDocument[] {
  return orderProjectionResults(results).map((result) => {
    const launchId = result.launchId ?? payload.launchId ?? "all";
    const durationMs = getProjectionDurationMs(result);
    const visibleParameters = getVisibleProjectionParameters(result);
    const visibleParameterNames = [...new Set(visibleParameters.map((parameter) => parameter.name))]
      .filter((name): name is string => isNonEmptyString(name))
      .sort();
    const status = normalizeProjectionStatus(result.status);
    const caseKeyHash = hashProjectionCaseKey(result);
    const cluster = clusterByResultUuid.get(result.uuid);

    const document: SearchIndexProjectionDocument = {
      id: `search:${hashIdempotencyParts([payload.projectId, launchId, result.uuid, caseKeyHash])}`,
      indexName: "testhistory-results",
      projectId: payload.projectId,
      launchId,
      resultUuid: result.uuid,
      caseKeyHash,
      title: normalizeSearchTitle(result.name ?? result.fullName ?? result.uuid),
      status,
      durationBucket: getDurationBucket(durationMs),
      flaky: result.statusDetails?.flaky === true,
      muted: result.statusDetails?.muted === true,
      labelKeys: getProjectionLabelKeys(result),
      visibleParameterNames,
      attachmentCount: getProjectionAttachmentCount(result)
    };

    if (cluster !== undefined) {
      document.defectClusterId = cluster.id;
      document.defectState = cluster.state;
      document.failureSignatureHash = cluster.signature.hash;
    }

    return document;
  });
}

export function buildAnalyticsDefectClusterProjections(
  payload: AnalyticsMaterializeJobPayload,
  at: string,
  results: readonly AnalyticsProjectionResult[]
): DefectClusterReadModel[] {
  return buildDefectClusters(toProjectionLaunches(payload, at, results));
}

function indexDefectClustersByResultUuid(
  clusters: readonly DefectClusterReadModel[]
): ReadonlyMap<string, DefectClusterReadModel> {
  const index = new Map<string, DefectClusterReadModel>();
  for (const cluster of clusters) {
    for (const occurrence of cluster.occurrences) {
      index.set(occurrence.resultUuid, cluster);
    }
  }

  return index;
}

function toProjectionLaunches(
  payload: AnalyticsMaterializeJobPayload,
  at: string,
  results: readonly AnalyticsProjectionResult[]
): Launch[] {
  const grouped = new Map<string, Launch>();
  for (const result of orderProjectionResults(results)) {
    const launchId = result.launchId ?? payload.launchId ?? "all";
    const launch =
      grouped.get(launchId) ??
      ({
        id: launchId,
        projectId: payload.projectId,
        name: result.launchName ?? launchId,
        status: "closed",
        createdAt: result.launchCreatedAt ?? at,
        results: []
      } satisfies Launch);

    launch.results.push(toNormalizedProjectionResult(result));
    grouped.set(launchId, launch);
  }

  return [...grouped.values()].sort((left, right) => {
    const createdAt = left.createdAt.localeCompare(right.createdAt);
    return createdAt === 0 ? left.id.localeCompare(right.id) : createdAt;
  });
}

function toNormalizedProjectionResult(
  result: AnalyticsProjectionResult
): Launch["results"][number] {
  const status = normalizeProjectionStatus(result.status);
  const durationMs = getProjectionDurationMs(result);
  const rawStatusDetails = {
    ...(result.statusDetails?.flaky !== undefined ? { flaky: result.statusDetails.flaky } : {}),
    ...(result.statusDetails?.muted !== undefined ? { muted: result.statusDetails.muted } : {}),
    ...(result.statusDetails?.message !== undefined
      ? { message: result.statusDetails.message }
      : {}),
    ...(result.statusDetails?.trace !== undefined ? { trace: result.statusDetails.trace } : {})
  };

  return {
    uuid: result.uuid,
    ...(result.historyId !== undefined ? { historyId: result.historyId } : {}),
    ...(result.testCaseId !== undefined ? { testCaseId: result.testCaseId } : {}),
    ...(result.fullName !== undefined ? { fullName: result.fullName } : {}),
    name: result.name ?? result.fullName ?? result.uuid,
    status,
    ...(durationMs !== null ? { durationMs } : {}),
    labels: toMutableProjectionLabels(result.labels),
    parameters: toAllureProjectionParameters(result.parameters),
    attachments: [],
    steps: [],
    raw: {
      uuid: result.uuid,
      ...(result.historyId !== undefined ? { historyId: result.historyId } : {}),
      ...(result.testCaseId !== undefined ? { testCaseId: result.testCaseId } : {}),
      ...(result.fullName !== undefined ? { fullName: result.fullName } : {}),
      name: result.name ?? result.fullName ?? result.uuid,
      status,
      ...(Object.keys(rawStatusDetails).length > 0 ? { statusDetails: rawStatusDetails } : {})
    }
  };
}

function toMutableProjectionLabels(
  labels: Record<string, readonly string[]> | undefined
): Record<string, string[]> {
  return Object.fromEntries(
    Object.entries(labels ?? {}).map(([name, values]) => [name, [...values]])
  );
}

function toAllureProjectionParameters(
  parameters: readonly AnalyticsProjectionParameter[] | undefined
): AllureParameter[] {
  return [...(parameters ?? [])].map((parameter) => {
    const copy: AllureParameter = {
      name: parameter.name ?? ""
    };
    if (parameter.value !== undefined) {
      copy.value = parameter.value;
    }
    if (parameter.mode !== undefined) {
      copy.mode = parameter.mode;
    }
    if (parameter.excluded !== undefined) {
      copy.excluded = parameter.excluded;
    }
    return copy;
  });
}

function orderProjectionResults(
  results: readonly AnalyticsProjectionResult[]
): AnalyticsProjectionResult[] {
  return [...results].sort((left, right) => {
    const leftKey = [
      left.launchId ?? "",
      left.testCaseId ?? "",
      left.historyId ?? "",
      left.fullName ?? "",
      left.name ?? "",
      left.uuid
    ].join("\u001f");
    const rightKey = [
      right.launchId ?? "",
      right.testCaseId ?? "",
      right.historyId ?? "",
      right.fullName ?? "",
      right.name ?? "",
      right.uuid
    ].join("\u001f");
    return leftKey.localeCompare(rightKey);
  });
}

function normalizeProjectionStatus(status: AllureStatus | undefined): AllureStatus {
  return status ?? "unknown";
}

function getProjectionDurationMs(result: AnalyticsProjectionResult): number | null {
  if (typeof result.durationMs === "number" && Number.isFinite(result.durationMs)) {
    return Math.max(0, Math.round(result.durationMs));
  }

  if (
    typeof result.start === "number" &&
    Number.isFinite(result.start) &&
    typeof result.stop === "number" &&
    Number.isFinite(result.stop)
  ) {
    return Math.max(0, Math.round(result.stop - result.start));
  }

  return null;
}

function getDurationBucket(
  durationMs: number | null
): SearchIndexProjectionDocument["durationBucket"] {
  if (durationMs === null) {
    return "none";
  }

  if (durationMs <= 1_000) {
    return "0-1s";
  }

  if (durationMs <= 10_000) {
    return "1-10s";
  }

  return "10s+";
}

function getProjectionLabelKeys(result: AnalyticsProjectionResult): string[] {
  return Object.keys(result.labels ?? {})
    .filter(isNonEmptyString)
    .sort();
}

function getVisibleProjectionParameters(
  result: AnalyticsProjectionResult
): AnalyticsProjectionParameter[] {
  return [...(result.parameters ?? [])].filter((parameter) => {
    if (!isNonEmptyString(parameter.name)) {
      return false;
    }

    return parameter.mode !== "hidden" && parameter.mode !== "masked";
  });
}

function hashProjectionParameterSignature(
  parameters: readonly AnalyticsProjectionParameter[]
): string {
  const parts = parameters
    .map((parameter) => `${parameter.name ?? ""}=${parameter.value ?? ""}`)
    .sort();

  return hashIdempotencyParts(parts.length === 0 ? ["no-visible-parameters"] : parts);
}

function hashProjectionCaseKey(result: AnalyticsProjectionResult): string {
  return hashIdempotencyParts([
    result.testCaseId ?? result.fullName ?? result.historyId ?? result.name ?? result.uuid
  ]);
}

function getProjectionAttachmentCount(result: AnalyticsProjectionResult): number {
  if (typeof result.attachmentCount === "number" && Number.isFinite(result.attachmentCount)) {
    return Math.max(0, Math.round(result.attachmentCount));
  }

  return result.attachments?.length ?? 0;
}

function normalizeSearchTitle(value: string): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > 160 ? `${normalized.slice(0, 157)}...` : normalized;
}

function countProjectionStatuses(
  results: readonly AnalyticsProjectionResult[]
): Record<AllureStatus, number> {
  const counts: Record<AllureStatus, number> = {
    failed: 0,
    broken: 0,
    passed: 0,
    skipped: 0,
    unknown: 0
  };

  for (const result of results) {
    counts[normalizeProjectionStatus(result.status)] += 1;
  }

  return counts;
}
