import type { AllureStatus, NormalizedTestResult } from "@testhistory/contracts";
import {
  normalizeFailureSignature,
  redactSensitiveText,
  type DefectClusterReadModel
} from "./defects.js";

export type TestCaseHistoryCompareLaunchInput = {
  id: string;
  projectId: string;
  name: string;
  createdAt: string;
  branch?: string;
  buildNumber?: string;
  commitSha?: string;
};

export type TestCaseHistoryCompareExecutorInput = {
  name?: string;
  type?: string;
  buildName?: string;
  buildUrl?: string;
  reportUrl?: string;
};

export type TestCaseHistoryCompareSnapshotInput = {
  launch: TestCaseHistoryCompareLaunchInput;
  result: NormalizedTestResult;
  executor?: TestCaseHistoryCompareExecutorInput;
};

export type TestCaseHistoryCompareDecisionInput = {
  projectId?: string;
  testCaseId?: string;
  before: TestCaseHistoryCompareSnapshotInput;
  after: TestCaseHistoryCompareSnapshotInput;
  defectClusters?: readonly DefectClusterReadModel[];
};

export type TestCaseHistoryCompareDecisionKind =
  "label" | "executor" | "branch" | "build" | "defect";

export type TestCaseHistoryCompareChange = "added" | "removed" | "changed" | "unchanged";

export type TestCaseHistoryCompareSeverity = "info" | "signal" | "risk";

export type TestCaseHistoryCompareDecision = {
  kind: TestCaseHistoryCompareDecisionKind;
  subject: string;
  change: TestCaseHistoryCompareChange;
  severity: TestCaseHistoryCompareSeverity;
  before: string[];
  after: string[];
  context: Record<string, string | string[]>;
  explanation: string;
};

export type TestCaseHistoryComparePoint = {
  launchId: string;
  launchName: string;
  launchCreatedAt: string;
  resultUuid: string;
  status: AllureStatus;
  branch?: string;
  buildNumber?: string;
  commitSha?: string;
};

export type TestCaseHistoryCompareDecisionModel = {
  id: string;
  projectId: string;
  testCaseId: string;
  from: TestCaseHistoryComparePoint;
  to: TestCaseHistoryComparePoint;
  decisions: TestCaseHistoryCompareDecision[];
  summary: {
    total: number;
    added: number;
    removed: number;
    changed: number;
    unchanged: number;
    risk: number;
    signal: number;
  };
  redaction: {
    rawResultsIncluded: false;
    rawStatusDetailsIncluded: false;
    hiddenOrMaskedValuesIncluded: false;
  };
};

type CompareScalarField = {
  kind: Extract<TestCaseHistoryCompareDecisionKind, "executor" | "branch" | "build">;
  subject: string;
  before: string | undefined;
  after: string | undefined;
};

type NormalizedLabelValueSet = {
  display: string[];
  compare: string[];
};

const EXECUTOR_FIELDS = ["name", "type", "buildName", "buildUrl", "reportUrl"] as const;

const SENSITIVE_KEY_PATTERN =
  /\b(authorization|cookie|credential|hidden|masked|password|passwd|secret|storage[-_]?key|token|api[-_]?key|access[-_]?key|signature|session)\b/i;

export function buildTestCaseHistoryCompareDecision(
  input: TestCaseHistoryCompareDecisionInput
): TestCaseHistoryCompareDecisionModel {
  const projectId = resolveProjectId(input);
  const testCaseId = sanitizeRequiredText(
    input.testCaseId ??
      getResultIdentity(input.after.result) ??
      getResultIdentity(input.before.result),
    "test case id"
  );
  const decisions = [
    ...buildLabelDecisions(input.before.result.labels, input.after.result.labels),
    ...buildExecutorDecisions(input.before.executor, input.after.executor),
    ...buildBranchBuildDecisions(input.before.launch, input.after.launch),
    buildDefectDecision(input)
  ].sort(compareDecisions);
  const summary = summarizeDecisions(decisions);

  return {
    id: `history-compare:${stableHash(
      [
        projectId,
        testCaseId,
        input.before.launch.id,
        input.before.result.uuid,
        input.after.launch.id,
        input.after.result.uuid
      ].join("\u001f")
    )}`,
    projectId,
    testCaseId,
    from: toPoint(input.before),
    to: toPoint(input.after),
    decisions,
    summary,
    redaction: {
      rawResultsIncluded: false,
      rawStatusDetailsIncluded: false,
      hiddenOrMaskedValuesIncluded: false
    }
  };
}

function resolveProjectId(input: TestCaseHistoryCompareDecisionInput): string {
  const projectId = sanitizeRequiredText(
    input.projectId ?? input.after.launch.projectId ?? input.before.launch.projectId,
    "project id"
  );
  const beforeProjectId = sanitizeRequiredText(input.before.launch.projectId, "before project id");
  const afterProjectId = sanitizeRequiredText(input.after.launch.projectId, "after project id");
  if (beforeProjectId !== projectId || afterProjectId !== projectId) {
    throw new Error("History compare snapshots must belong to one project.");
  }

  return projectId;
}

function toPoint(snapshot: TestCaseHistoryCompareSnapshotInput): TestCaseHistoryComparePoint {
  return {
    launchId: sanitizeRequiredText(snapshot.launch.id, "launch id"),
    launchName: sanitizeRequiredText(snapshot.launch.name, "launch name"),
    launchCreatedAt: sanitizeRequiredText(snapshot.launch.createdAt, "launch created at"),
    resultUuid: sanitizeRequiredText(snapshot.result.uuid, "result uuid"),
    status: snapshot.result.status,
    ...(snapshot.launch.branch !== undefined
      ? { branch: sanitizeOptionalText(snapshot.launch.branch) }
      : {}),
    ...(snapshot.launch.buildNumber !== undefined
      ? { buildNumber: sanitizeOptionalText(snapshot.launch.buildNumber) }
      : {}),
    ...(snapshot.launch.commitSha !== undefined
      ? { commitSha: sanitizeOptionalText(snapshot.launch.commitSha) }
      : {})
  };
}

function buildLabelDecisions(
  beforeLabels: Record<string, string[]>,
  afterLabels: Record<string, string[]>
): TestCaseHistoryCompareDecision[] {
  const before = normalizeLabels(beforeLabels);
  const after = normalizeLabels(afterLabels);
  const keys = uniqueSortedStrings([...before.keys(), ...after.keys()]);
  const decisions: TestCaseHistoryCompareDecision[] = [];

  for (const key of keys) {
    const beforeValues = before.get(key) ?? { display: [], compare: [] };
    const afterValues = after.get(key) ?? { display: [], compare: [] };
    const change = compareValues(beforeValues.compare, afterValues.compare);
    if (change === "unchanged") {
      continue;
    }

    decisions.push({
      kind: "label",
      subject: key,
      change,
      severity: "signal",
      before: beforeValues.display,
      after: afterValues.display,
      context: {
        beforeCount: String(beforeValues.compare.length),
        afterCount: String(afterValues.compare.length)
      },
      explanation: `Label ${key} was ${change} between compared history points.`
    });
  }

  return decisions;
}

function buildExecutorDecisions(
  beforeExecutor: TestCaseHistoryCompareExecutorInput | undefined,
  afterExecutor: TestCaseHistoryCompareExecutorInput | undefined
): TestCaseHistoryCompareDecision[] {
  return EXECUTOR_FIELDS.flatMap((field) =>
    buildScalarDecision({
      kind: "executor",
      subject: `executor.${field}`,
      before: beforeExecutor?.[field],
      after: afterExecutor?.[field]
    })
  );
}

function buildBranchBuildDecisions(
  beforeLaunch: TestCaseHistoryCompareLaunchInput,
  afterLaunch: TestCaseHistoryCompareLaunchInput
): TestCaseHistoryCompareDecision[] {
  return [
    ...buildScalarDecision({
      kind: "branch",
      subject: "branch",
      before: beforeLaunch.branch,
      after: afterLaunch.branch
    }),
    ...buildScalarDecision({
      kind: "build",
      subject: "buildNumber",
      before: beforeLaunch.buildNumber,
      after: afterLaunch.buildNumber
    }),
    ...buildScalarDecision({
      kind: "build",
      subject: "commitSha",
      before: beforeLaunch.commitSha,
      after: afterLaunch.commitSha
    })
  ];
}

function buildScalarDecision(field: CompareScalarField): TestCaseHistoryCompareDecision[] {
  const before = normalizeOptionalScalar(field.before);
  const after = normalizeOptionalScalar(field.after);
  const change = compareValues(before, after);
  if (change === "unchanged") {
    return [];
  }

  return [
    {
      kind: field.kind,
      subject: field.subject,
      change,
      severity: "signal",
      before,
      after,
      context: {},
      explanation: `${field.subject} was ${change} between compared history points.`
    }
  ];
}

function buildDefectDecision(
  input: TestCaseHistoryCompareDecisionInput
): TestCaseHistoryCompareDecision {
  const beforeSignature = normalizeFailureSignature(input.before.result);
  const afterSignature = normalizeFailureSignature(input.after.result);
  const before = beforeSignature === undefined ? [] : [beforeSignature.hash];
  const after = afterSignature === undefined ? [] : [afterSignature.hash];
  const change = compareValues(before, after);
  const beforeClusterIds = findClusterIds(input.defectClusters ?? [], beforeSignature?.hash);
  const afterClusterIds = findClusterIds(input.defectClusters ?? [], afterSignature?.hash);

  return {
    kind: "defect",
    subject: "failure-signature",
    change,
    severity:
      afterSignature !== undefined ? "risk" : beforeSignature !== undefined ? "signal" : "info",
    before,
    after,
    context: {
      beforeSources: beforeSignature?.sources.map(sanitizeFailureSource) ?? [],
      afterSources: afterSignature?.sources.map(sanitizeFailureSource) ?? [],
      beforeClusterIds,
      afterClusterIds,
      beforeReason:
        beforeSignature === undefined ? "" : sanitizeOptionalText(beforeSignature.normalizedReason),
      afterReason:
        afterSignature === undefined ? "" : sanitizeOptionalText(afterSignature.normalizedReason)
    },
    explanation: buildDefectExplanation(change, beforeSignature?.hash, afterSignature?.hash)
  };
}

function buildDefectExplanation(
  change: TestCaseHistoryCompareChange,
  beforeHash: string | undefined,
  afterHash: string | undefined
): string {
  if (change === "added") {
    return `A new failure signature ${afterHash ?? "[none]"} appeared in the later history point.`;
  }
  if (change === "removed") {
    return `Failure signature ${beforeHash ?? "[none]"} disappeared in the later history point.`;
  }
  if (change === "changed") {
    return `Failure signature changed from ${beforeHash ?? "[none]"} to ${afterHash ?? "[none]"}.`;
  }
  return "Failure signature did not change between compared history points.";
}

function findClusterIds(
  clusters: readonly DefectClusterReadModel[],
  signatureHash: string | undefined
): string[] {
  if (signatureHash === undefined) {
    return [];
  }

  return uniqueSortedStrings(
    clusters
      .filter((cluster) => cluster.signature.hash === signatureHash)
      .map((cluster) => sanitizeOptionalText(cluster.id))
  );
}

function normalizeLabels(labels: Record<string, string[]>): Map<string, NormalizedLabelValueSet> {
  const normalized = new Map<string, NormalizedLabelValueSet>();
  for (const [key, values] of Object.entries(labels)) {
    const safeKey = sanitizeMetadataKey(key);
    const existing = normalized.get(safeKey) ?? { display: [], compare: [] };
    const next =
      safeKey === "[redacted-key]"
        ? {
            display: ["[redacted]"],
            compare: uniqueSortedStrings(
              values.map((value) => stableHash(`sensitive-label\u001f${key}\u001f${value}`))
            )
          }
        : {
            display: uniqueSortedStrings(values.map(sanitizeOptionalText).filter(isNonEmptyString)),
            compare: uniqueSortedStrings(values.map(sanitizeOptionalText).filter(isNonEmptyString))
          };

    normalized.set(safeKey, {
      display: uniqueSortedStrings([...existing.display, ...next.display]),
      compare: uniqueSortedStrings([...existing.compare, ...next.compare])
    });
  }

  return normalized;
}

function sanitizeFailureSource(source: string): string {
  if (source.includes(".message")) {
    return "failure-message";
  }
  if (source.includes(".trace")) {
    return "failure-trace";
  }

  return sanitizeMetadataKey(source);
}

function compareValues(
  beforeValues: readonly string[],
  afterValues: readonly string[]
): TestCaseHistoryCompareChange {
  if (beforeValues.length === 0 && afterValues.length > 0) {
    return "added";
  }
  if (beforeValues.length > 0 && afterValues.length === 0) {
    return "removed";
  }
  return arraysEqual(beforeValues, afterValues) ? "unchanged" : "changed";
}

function summarizeDecisions(decisions: readonly TestCaseHistoryCompareDecision[]) {
  return {
    total: decisions.length,
    added: decisions.filter((decision) => decision.change === "added").length,
    removed: decisions.filter((decision) => decision.change === "removed").length,
    changed: decisions.filter((decision) => decision.change === "changed").length,
    unchanged: decisions.filter((decision) => decision.change === "unchanged").length,
    risk: decisions.filter((decision) => decision.severity === "risk").length,
    signal: decisions.filter((decision) => decision.severity === "signal").length
  };
}

function compareDecisions(
  left: TestCaseHistoryCompareDecision,
  right: TestCaseHistoryCompareDecision
): number {
  const kind = left.kind.localeCompare(right.kind);
  return kind === 0 ? left.subject.localeCompare(right.subject) : kind;
}

function normalizeOptionalScalar(value: string | undefined): string[] {
  if (value === undefined) {
    return [];
  }

  const sanitized = sanitizeOptionalText(value);
  return sanitized.length === 0 ? [] : [sanitized];
}

function sanitizeMetadataKey(value: string): string {
  const sanitized = redactSensitiveText(value).trim();
  if (sanitized.length === 0 || SENSITIVE_KEY_PATTERN.test(sanitized)) {
    return "[redacted-key]";
  }

  return sanitized;
}

function sanitizeRequiredText(value: string | undefined, label: string): string {
  const sanitized = sanitizeOptionalText(value);
  if (sanitized.length === 0) {
    throw new Error(`History compare ${label} must not be empty.`);
  }

  return sanitized;
}

function sanitizeOptionalText(value: string | undefined): string {
  return redactSensitiveText(value ?? "").trim();
}

function getResultIdentity(result: NormalizedTestResult): string | undefined {
  return result.testCaseId ?? result.fullName ?? result.historyId ?? result.name;
}

function arraysEqual(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function uniqueSortedStrings(values: Iterable<string>): string[] {
  return [...new Set(values)].sort();
}

function isNonEmptyString(value: string): boolean {
  return value.length > 0;
}

function stableHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0).toString(16).padStart(8, "0");
}
