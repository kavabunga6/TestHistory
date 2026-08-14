import type {
  AllureStatus,
  AllureStatusDetails,
  AllureStep,
  NormalizedTestResult
} from "@testhistory/contracts";
import type { Launch } from "./index.js";

export type FailureSignatureSource =
  | "statusDetails.message"
  | "statusDetails.trace"
  | "step.statusDetails.message"
  | "step.statusDetails.trace"
  | "status";

export type FailureSignature = {
  hash: string;
  normalizedReason: string;
  sources: FailureSignatureSource[];
};

export type DefectClusterLifecycleState = "new" | "recurring" | "resolved-ish";

export type DefectClusterOccurrence = {
  launchId: string;
  launchName: string;
  launchCreatedAt: string;
  resultUuid: string;
  testId: string;
  status: Extract<AllureStatus, "failed" | "broken">;
};

export type DefectClusterReadModel = {
  id: string;
  state: DefectClusterLifecycleState;
  signature: FailureSignature;
  affectedTestIds: string[];
  currentAffectedTestIds: string[];
  occurrenceCount: number;
  firstSeenAt: string;
  lastSeenAt: string;
  firstSeenLaunchId: string;
  lastSeenLaunchId: string;
  occurrences: DefectClusterOccurrence[];
};

const FAILURE_STATUSES = new Set<AllureStatus>(["failed", "broken"]);
const REDACTED_TOKEN = "[redacted]";

export function normalizeFailureSignature(
  result: NormalizedTestResult
): FailureSignature | undefined {
  if (!isFailureStatus(result.status)) {
    return undefined;
  }

  const parts = collectFailureSignatureParts(result);
  const normalizedParts = uniqueStable(
    parts.map((part) => normalizeFailureText(part.value)).filter(isNonEmptyString)
  );
  const normalizedReason =
    normalizedParts.length === 0
      ? `${result.status}: no failure message`
      : normalizedParts.join("\n");
  const sources = uniqueStable(
    parts.length === 0 ? (["status"] as FailureSignatureSource[]) : parts.map((part) => part.source)
  );

  return {
    hash: stableHash(`failure-signature\u001f${normalizedReason}`),
    normalizedReason,
    sources
  };
}

export function buildDefectClusters(launches: Launch[]): DefectClusterReadModel[] {
  const orderedLaunches = orderLaunches(launches);
  const latestLaunch = orderedLaunches[orderedLaunches.length - 1];
  const groups = new Map<
    string,
    {
      signature: FailureSignature;
      occurrences: DefectClusterOccurrence[];
    }
  >();

  for (const launch of orderedLaunches) {
    const orderedResults = orderResults(launch.results);
    for (const result of orderedResults) {
      const signature = normalizeFailureSignature(result);
      if (signature === undefined || !isFailureStatus(result.status)) {
        continue;
      }

      const group = groups.get(signature.hash) ?? {
        signature,
        occurrences: []
      };
      group.occurrences.push({
        launchId: launch.id,
        launchName: launch.name,
        launchCreatedAt: launch.createdAt,
        resultUuid: result.uuid,
        testId: getResultIdentity(result),
        status: result.status
      });
      groups.set(signature.hash, group);
    }
  }

  return [...groups.values()]
    .map((group) => toDefectCluster(group.signature, group.occurrences, latestLaunch))
    .sort(compareDefectClusters);
}

export function redactSensitiveText(value: string): string {
  return value
    .replace(/\b(bearer|basic)\s+[a-z0-9._~+/=-]+/gi, "$1 [redacted]")
    .replace(
      /\b(authorization|cookie|credential|hidden|masked|password|passwd|secret|storage[-_]?key|token|api[-_]?key|access[-_]?key|signature|session)[=:]\s*([^\s,;&]+)/gi,
      "$1=[redacted]"
    )
    .replace(/\bs3:\/\/[^\s)'"<>]+/gi, "[storage-url]")
    .replace(/\bgs:\/\/[^\s)'"<>]+/gi, "[storage-url]")
    .replace(/\bazure:\/\/[^\s)'"<>]+/gi, "[storage-url]")
    .replace(/[a-z][a-z0-9+.-]*:\/\/[^\s)'"<>]+/gi, (match) => sanitizeUrl(match))
    .replace(/\b[^\s]*secret[^\s]*\b/gi, REDACTED_TOKEN)
    .replace(/\b[a-z]:\\[^\n\r\t"')<>|]+/gi, "[path]")
    .replace(/(^|[\s(])\/(?:[^/\s]+\/){2,}[^\s)'"<>]+/g, "$1[path]")
    .replace(/\\\\[^\s)'"<>]+/g, "[path]");
}

function collectFailureSignatureParts(result: NormalizedTestResult): Array<{
  source: FailureSignatureSource;
  value: string;
}> {
  return [
    ...collectStatusDetailsParts(result.raw.statusDetails, "statusDetails"),
    ...collectStepSignatureParts(result.steps)
  ];
}

function collectStepSignatureParts(
  steps: AllureStep[],
  parts: Array<{ source: FailureSignatureSource; value: string }> = []
): Array<{ source: FailureSignatureSource; value: string }> {
  for (const step of steps) {
    parts.push(...collectStatusDetailsParts(step.statusDetails, "step.statusDetails"));
    collectStepSignatureParts(step.steps ?? [], parts);
  }

  return parts;
}

function collectStatusDetailsParts(
  details: AllureStatusDetails | undefined,
  prefix: "statusDetails" | "step.statusDetails"
): Array<{ source: FailureSignatureSource; value: string }> {
  if (details === undefined) {
    return [];
  }

  const parts: Array<{ source: FailureSignatureSource; value: string }> = [];
  if (isNonEmptyString(details.message)) {
    parts.push({ source: `${prefix}.message`, value: details.message });
  }
  if (isNonEmptyString(details.trace)) {
    parts.push({ source: `${prefix}.trace`, value: details.trace });
  }

  return parts;
}

function normalizeFailureText(value: string): string {
  return redactSensitiveText(value)
    .normalize("NFKC")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .split("\n")
    .map((line) => normalizeFailureLine(line))
    .filter(isNonEmptyString)
    .slice(0, 12)
    .join("\n");
}

function normalizeFailureLine(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/g, "<id>")
    .replace(/\b[0-9a-f]{16,}\b/g, "<id>")
    .replace(/\b\d{4}-\d{2}-\d{2}(?:[t ][0-9:.+-]+z?)?\b/g, "<time>")
    .replace(/\b\d{10,}\b/g, "<num>")
    .replace(/:\d+:\d+\)?/g, ":<line>:<col>")
    .replace(/:\d+\)?/g, ":<line>")
    .replace(
      /\b(authorization|cookie|credential|hidden|masked|password|passwd|secret|storage[-_]?key|token|api[-_]?key|access[-_]?key|signature|session)=\[redacted\]/g,
      ""
    )
    .replace(/\b\d+\b/g, "<num>")
    .replace(/\s+/g, " ")
    .trim();
}

function sanitizeUrl(value: string): string {
  try {
    const url = new URL(value);
    url.username = "";
    url.password = "";
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return REDACTED_TOKEN;
  }
}

function toDefectCluster(
  signature: FailureSignature,
  occurrences: DefectClusterOccurrence[],
  latestLaunch: Launch | undefined
): DefectClusterReadModel {
  const orderedOccurrences = orderOccurrences(occurrences);
  const first = orderedOccurrences[0]!;
  const last = orderedOccurrences[orderedOccurrences.length - 1]!;
  const currentOccurrences =
    latestLaunch === undefined
      ? orderedOccurrences
      : orderedOccurrences.filter((occurrence) => occurrence.launchId === latestLaunch.id);
  const currentAffectedTestIds = uniqueSorted(
    currentOccurrences.map((occurrence) => occurrence.testId)
  );
  const state =
    latestLaunch !== undefined && currentOccurrences.length === 0
      ? "resolved-ish"
      : first.launchId === latestLaunch?.id
        ? "new"
        : "recurring";

  return {
    id: `defect:${signature.hash}`,
    state,
    signature,
    affectedTestIds: uniqueSorted(orderedOccurrences.map((occurrence) => occurrence.testId)),
    currentAffectedTestIds,
    occurrenceCount: orderedOccurrences.length,
    firstSeenAt: first.launchCreatedAt,
    lastSeenAt: last.launchCreatedAt,
    firstSeenLaunchId: first.launchId,
    lastSeenLaunchId: last.launchId,
    occurrences: orderedOccurrences
  };
}

function compareDefectClusters(
  left: DefectClusterReadModel,
  right: DefectClusterReadModel
): number {
  const lastSeen = left.lastSeenAt.localeCompare(right.lastSeenAt);
  if (lastSeen !== 0) {
    return lastSeen;
  }

  const reason = left.signature.normalizedReason.localeCompare(right.signature.normalizedReason);
  return reason === 0 ? left.id.localeCompare(right.id) : reason;
}

function orderLaunches(launches: Launch[]): Launch[] {
  return [...launches].sort((left, right) => {
    const createdAt = left.createdAt.localeCompare(right.createdAt);
    return createdAt === 0 ? left.id.localeCompare(right.id) : createdAt;
  });
}

function orderResults(results: NormalizedTestResult[]): NormalizedTestResult[] {
  return [...results].sort((left, right) => {
    const identity = getResultIdentity(left).localeCompare(getResultIdentity(right));
    return identity === 0 ? left.uuid.localeCompare(right.uuid) : identity;
  });
}

function orderOccurrences(occurrences: DefectClusterOccurrence[]): DefectClusterOccurrence[] {
  return [...occurrences].sort((left, right) => {
    const launchCreatedAt = left.launchCreatedAt.localeCompare(right.launchCreatedAt);
    if (launchCreatedAt !== 0) {
      return launchCreatedAt;
    }

    const testId = left.testId.localeCompare(right.testId);
    return testId === 0 ? left.resultUuid.localeCompare(right.resultUuid) : testId;
  });
}

function getResultIdentity(result: NormalizedTestResult): string {
  return result.testCaseId ?? result.fullName ?? result.historyId ?? result.name;
}

function uniqueStable<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort();
}

function isFailureStatus(
  status: AllureStatus
): status is Extract<AllureStatus, "failed" | "broken"> {
  return FAILURE_STATUSES.has(status);
}

function isNonEmptyString(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function stableHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0).toString(16).padStart(8, "0");
}
