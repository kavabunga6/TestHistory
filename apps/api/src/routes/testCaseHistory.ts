import {
  getTestCaseIdentity,
  getTestCaseIdentityReadModel,
  type Launch,
  type TestCaseHistoryCompareDecision,
  type TestCaseHistoryCompareExecutorInput,
  type TestCaseHistoryComparePoint,
  type TestCaseIdentityReadModel
} from "@testhistory/domain";
import type { FastifyRequest } from "fastify";

export type HistoryParameter = {
  name: string;
  value?: string;
  excluded?: boolean;
  mode?: "default" | "masked" | "hidden";
};

export type HistoryPoint = {
  launchId: string;
  launchName: string;
  launchCreatedAt: string;
  resultUuid: string;
  testCaseId?: string;
  fullName?: string;
  status: Launch["results"][number]["status"];
  durationMs?: number;
  historyId?: string;
  identity: TestCaseIdentityReadModel;
  attemptIndex: number;
  attemptNumber: number;
  attemptKey: string;
  parameterVariantSignature: string;
  parameters: HistoryParameter[];
  retry: boolean;
  flaky: boolean;
  startedAt?: number;
  stoppedAt?: number;
  statusDetails?: Launch["results"][number]["raw"]["statusDetails"];
};

type HistoryCompareChange = {
  kind: TestCaseHistoryCompareDecision["kind"];
  subject: string;
  change: "added" | "removed" | "changed" | "unchanged";
  severity: TestCaseHistoryCompareDecision["severity"];
  before: string[];
  after: string[];
  context: Record<string, string | string[]>;
  explanation: string;
  redacted: true;
};

type HistoryCompareEnrichment = {
  status: "ready" | "partial";
  redacted: true;
  fields: Record<
    string,
    {
      status: "ready" | "partial" | "unavailable";
      base: boolean;
      target: boolean;
    }
  >;
  unavailable: string[];
};

type HistoryCompareEnrichmentField = HistoryCompareEnrichment["fields"][string];

export function buildHistoryPoints(launches: Launch[], testCaseId: string): HistoryPoint[] {
  const candidates = launches
    .flatMap((launch) =>
      launch.results
        .filter((result) => getTestCaseIdentity(result) === testCaseId)
        .map((result) => ({ launch, result }))
    )
    .sort((left, right) => compareHistoryCandidates(left, right));

  const attemptIndexes = new Map<Launch["results"][number], number>();
  const groups = new Map<string, Array<(typeof candidates)[number]>>();

  for (const candidate of candidates) {
    const signature = parameterVariantSignature(candidate.result.parameters);
    const identity = getTestCaseIdentityReadModel(candidate.result);
    const key = `${candidate.launch.id}::${identity.source}:${identity.value}::parameters:${signature}`;
    const group = groups.get(key) ?? [];
    group.push(candidate);
    groups.set(key, group);
  }

  for (const group of groups.values()) {
    group.sort((left, right) => compareHistoryCandidates(left, right));
    group.forEach((candidate, index) => attemptIndexes.set(candidate.result, index));
  }

  return candidates.map(({ launch, result }) => {
    const identity = getTestCaseIdentityReadModel(result);
    const signature = parameterVariantSignature(result.parameters);
    const attemptIndex = attemptIndexes.get(result) ?? 0;
    const raw = result.raw as Record<string, unknown>;
    const startedAt = typeof result.raw.start === "number" ? result.raw.start : undefined;
    const stoppedAt = typeof result.raw.stop === "number" ? result.raw.stop : undefined;
    const statusDetails = sanitizeStatusDetails(result.raw.statusDetails, result.parameters);

    return {
      launchId: launch.id,
      launchName: launch.name,
      launchCreatedAt: launch.createdAt,
      resultUuid: result.uuid,
      ...(result.testCaseId !== undefined ? { testCaseId: result.testCaseId } : {}),
      ...(result.fullName !== undefined ? { fullName: result.fullName } : {}),
      status: result.status,
      ...(result.durationMs !== undefined ? { durationMs: result.durationMs } : {}),
      ...(result.historyId !== undefined ? { historyId: result.historyId } : {}),
      identity,
      attemptIndex,
      attemptNumber: attemptIndex + 1,
      attemptKey: `${launch.id}::${identity.source}:${identity.value}::parameters:${signature}`,
      parameterVariantSignature: signature,
      parameters: sanitizeHistoryParameters(result.parameters),
      retry: raw.retry === true || raw.retried === true || attemptIndex > 0,
      flaky: result.raw.statusDetails?.flaky === true || raw.flaky === true,
      ...(startedAt !== undefined ? { startedAt } : {}),
      ...(stoppedAt !== undefined ? { stoppedAt } : {}),
      ...(statusDetails !== undefined ? { statusDetails } : {})
    };
  });
}

export function summarizeComparePoint(
  point: HistoryPoint,
  domainPoint: TestCaseHistoryComparePoint
) {
  return {
    launchId: point.launchId,
    launchName: point.launchName,
    launchCreatedAt: point.launchCreatedAt,
    resultUuid: point.resultUuid,
    status: point.status,
    ...(domainPoint.branch !== undefined ? { branch: domainPoint.branch } : {}),
    ...(domainPoint.buildNumber !== undefined ? { buildNumber: domainPoint.buildNumber } : {}),
    ...(domainPoint.commitSha !== undefined ? { commitSha: domainPoint.commitSha } : {}),
    ...(point.durationMs !== undefined ? { durationMs: point.durationMs } : {}),
    ...(point.historyId !== undefined ? { historyId: point.historyId } : {}),
    identity: point.identity,
    attemptIndex: point.attemptIndex,
    attemptNumber: point.attemptNumber,
    parameterVariantSignature: point.parameterVariantSignature
  };
}

export function toHistoryCompareChange(
  decision: TestCaseHistoryCompareDecision,
  sensitiveValues: string[]
): HistoryCompareChange {
  return {
    kind: decision.kind,
    subject: sanitizeHistoryCompareText(decision.subject, sensitiveValues),
    change: decision.change,
    severity: decision.severity,
    before: decision.before.map((value) => sanitizeHistoryCompareText(value, sensitiveValues)),
    after: decision.after.map((value) => sanitizeHistoryCompareText(value, sensitiveValues)),
    context: sanitizeHistoryCompareContext(decision.context, sensitiveValues),
    explanation: sanitizeHistoryCompareText(decision.explanation, sensitiveValues),
    redacted: true
  };
}

function sanitizeHistoryCompareContext(
  context: Record<string, string | string[]>,
  sensitiveValues: string[]
): Record<string, string | string[]> {
  return Object.fromEntries(
    Object.entries(context).map(([key, value]) => [
      sanitizeHistoryCompareText(key, sensitiveValues),
      Array.isArray(value)
        ? value.map((item) => sanitizeHistoryCompareText(item, sensitiveValues))
        : sanitizeHistoryCompareText(value, sensitiveValues)
    ])
  );
}

export function sanitizeHistoryCompareText(value: string, sensitiveValues: string[]): string {
  return redactSensitiveText(value, sensitiveValues);
}

export function summarizeHistoryCompareChanges(changes: HistoryCompareChange[]) {
  return {
    total: changes.length,
    added: changes.filter((change) => change.change === "added").length,
    removed: changes.filter((change) => change.change === "removed").length,
    changed: changes.filter((change) => change.change === "changed").length,
    unchanged: changes.filter((change) => change.change === "unchanged").length,
    risk: changes.filter((change) => change.severity === "risk").length,
    signal: changes.filter((change) => change.severity === "signal").length
  };
}

export function summarizeCompareEnrichment(
  before: ReturnType<typeof toHistoryCompareSnapshot>,
  after: ReturnType<typeof toHistoryCompareSnapshot>
): HistoryCompareEnrichment {
  const fieldSources: Array<{
    name: string;
    base: string | undefined;
    target: string | undefined;
  }> = [
    { name: "launch.branch", base: before.launch.branch, target: after.launch.branch },
    {
      name: "launch.buildNumber",
      base: before.launch.buildNumber,
      target: after.launch.buildNumber
    },
    { name: "launch.commitSha", base: before.launch.commitSha, target: after.launch.commitSha },
    { name: "executor.name", base: before.executor?.name, target: after.executor?.name },
    { name: "executor.type", base: before.executor?.type, target: after.executor?.type },
    {
      name: "executor.buildName",
      base: before.executor?.buildName,
      target: after.executor?.buildName
    },
    {
      name: "executor.buildUrl",
      base: before.executor?.buildUrl,
      target: after.executor?.buildUrl
    },
    {
      name: "executor.reportUrl",
      base: before.executor?.reportUrl,
      target: after.executor?.reportUrl
    }
  ];

  const fields: Record<string, HistoryCompareEnrichmentField> = {};
  for (const field of fieldSources) {
    const base = isAvailableEnrichmentValue(field.base);
    const target = isAvailableEnrichmentValue(field.target);
    fields[field.name] = {
      status: base && target ? "ready" : base || target ? "partial" : "unavailable",
      base,
      target
    };
  }
  const unavailable = Object.entries(fields)
    .filter(([, field]) => field.status !== "ready")
    .map(([name]) => name);

  return {
    status: unavailable.length === 0 ? "ready" : "partial",
    redacted: true,
    fields,
    unavailable
  };
}

function isAvailableEnrichmentValue(value: string | undefined): boolean {
  return value !== undefined && value.trim().length > 0;
}

export function findHistoryCandidate(
  launches: Launch[],
  testCaseId: string,
  resultUuid: string
): { launch: Launch; result: Launch["results"][number] } | undefined {
  for (const launch of launches) {
    const result = launch.results.find(
      (candidate) => candidate.uuid === resultUuid && getTestCaseIdentity(candidate) === testCaseId
    );
    if (result !== undefined) {
      return { launch, result };
    }
  }

  return undefined;
}

export function toHistoryCompareSnapshot(launch: Launch, result: Launch["results"][number]) {
  const launchWithExecutor = launch as Launch & {
    executor?: TestCaseHistoryCompareExecutorInput;
  };

  return {
    launch: {
      id: launch.id,
      projectId: launch.projectId,
      name: launch.name,
      createdAt: launch.createdAt,
      ...(launch.branch !== undefined ? { branch: launch.branch } : {}),
      ...(launch.buildNumber !== undefined ? { buildNumber: launch.buildNumber } : {}),
      ...(launch.commitSha !== undefined ? { commitSha: launch.commitSha } : {})
    },
    result,
    ...(launchWithExecutor.executor !== undefined ? { executor: launchWithExecutor.executor } : {})
  };
}

function compareHistoryCandidates(
  left: { launch: Launch; result: Launch["results"][number] },
  right: { launch: Launch; result: Launch["results"][number] }
): number {
  const launchOrder = left.launch.createdAt.localeCompare(right.launch.createdAt);
  if (launchOrder !== 0) {
    return launchOrder;
  }

  const leftStarted = left.result.raw.start;
  const rightStarted = right.result.raw.start;
  if (typeof leftStarted === "number" && typeof rightStarted === "number") {
    return leftStarted - rightStarted;
  }
  if (typeof leftStarted === "number") {
    return -1;
  }
  if (typeof rightStarted === "number") {
    return 1;
  }

  return left.result.uuid.localeCompare(right.result.uuid);
}

function sanitizeHistoryParameters(parameters: HistoryParameter[]): HistoryParameter[] {
  return parameters.map((parameter) => {
    if (parameter.mode === "hidden") {
      const copy = { ...parameter };
      delete copy.value;
      return copy;
    }

    if (parameter.mode === "masked" && parameter.value !== undefined) {
      return { ...parameter, value: "***" };
    }

    return { ...parameter };
  });
}

function sanitizeStatusDetails(
  statusDetails: Launch["results"][number]["raw"]["statusDetails"] | undefined,
  parameters: HistoryParameter[]
): Launch["results"][number]["raw"]["statusDetails"] | undefined {
  if (statusDetails === undefined) {
    return undefined;
  }

  return sanitizeUnknown(statusDetails, sensitiveParameterValues(parameters)) as NonNullable<
    Launch["results"][number]["raw"]["statusDetails"]
  >;
}

function sanitizeUnknown(value: unknown, sensitiveValues: string[]): unknown {
  if (typeof value === "string") {
    return redactSensitiveText(value, sensitiveValues);
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeUnknown(item, sensitiveValues));
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [key, sanitizeUnknown(nested, sensitiveValues)])
    );
  }

  return value;
}

export function sensitiveParameterValues(parameters: HistoryParameter[]): string[] {
  return parameters
    .filter((parameter) => parameter.mode === "masked" || parameter.mode === "hidden")
    .map((parameter) => parameter.value)
    .filter((value): value is string => value !== undefined && value.length >= 3);
}

function redactSensitiveText(value: string, sensitiveValues: string[]): string {
  let redacted = value;
  for (const sensitiveValue of sensitiveValues) {
    redacted = redacted.split(sensitiveValue).join("***");
  }

  return redacted
    .replace(/\b(bearer|basic)\s+[a-z0-9._~+/=-]+/gi, "$1 ***")
    .replace(
      /\b(authorization|cookie|credential|hidden|masked|password|passwd|secret|storage[-_]?key|signed[-_]?url|token|api[_-]?key|access[_-]?key|signature|session)\b\s*[:=]\s*[^\s,;]+/gi,
      "$1=***"
    )
    .replace(/\bs3:\/\/[^\s)'"<>]+/gi, "[redacted-storage-url]")
    .replace(/\bgs:\/\/[^\s)'"<>]+/gi, "[redacted-storage-url]")
    .replace(/\bazure:\/\/[^\s)'"<>]+/gi, "[redacted-storage-url]")
    .replace(/[a-z][a-z0-9+.-]*:\/\/[^\s)'"<>]+/gi, (match) => redactUrl(match))
    .replace(/(^|[\s"'(])[A-Za-z]:[\\/][^\s,;'"<>|]+/g, "$1[redacted-path]")
    .replace(/(^|[\s(])\/(?:home|users|var|tmp)\/[^\s,;'"<>]+/gi, "$1[redacted-path]")
    .replace(/\\\\[^\s)'"<>]+/g, "[redacted-path]")
    .replace(
      /\b(?!(?:token|password|secret|storage[-_]?key|signed[-_]?url|api[_-]?key)\b\s*=)[^\s,;]*(?:token|password|secret|hidden|storage[-_]?key|signed[-_]?url|api[_-]?key)[^\s,;]*\b/gi,
      "***"
    );
}

function redactUrl(value: string): string {
  try {
    const url = new URL(value);
    url.username = "";
    url.password = "";
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return "[redacted-url]";
  }
}

export function parseBoolean(value: boolean | string | undefined): boolean {
  return value === true || value === "true" || value === "1";
}

function parseHeaderList(value: string | string[] | undefined): string[] {
  const raw = Array.isArray(value) ? value.join(",") : (value ?? "");
  return raw
    .split(/[,\s]+/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

export function actorIdHeader(request: FastifyRequest): string | undefined {
  const [actorId] = parseHeaderList(request.headers["x-testhistory-actor-id"]);
  return actorId;
}

function parameterVariantSignature(parameters: HistoryParameter[]): string {
  return JSON.stringify(
    sanitizeHistoryParameters(parameters)
      .filter((parameter) => parameter.excluded !== true)
      .map((parameter) => ({
        name: parameter.name,
        ...(parameter.value !== undefined ? { value: parameter.value } : {}),
        ...(parameter.mode !== undefined ? { mode: parameter.mode } : {})
      }))
      .sort((left, right) => left.name.localeCompare(right.name))
  );
}
