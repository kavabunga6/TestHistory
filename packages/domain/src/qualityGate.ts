import type { AllureStatus, NormalizedTestResult } from "@testhistory/contracts";
import {
  defectMuteCoversTestId,
  getActiveDefectMutes,
  type DefectMuteRecord
} from "./defect-mutes.js";
import {
  buildTestCaseSummaries,
  getTestCaseIdentity,
  isFailureStatus,
  summarizeLaunch,
  type Launch,
  uniqueSortedStrings
} from "./launchAnalytics.js";

export type QualityGateRule = {
  metric: "failed" | "broken" | "unknown" | "passRate" | "total";
  op: "lte" | "gte";
  value: number;
  severity: "warn" | "fail";
};

export type QualityGateSeverity = "warn" | "fail";

export type QualityGateThresholdMetric =
  | "newFailures"
  | "failedBrokenTotal"
  | "criticalFailures"
  | "flakyTests"
  | "durationRegressions"
  | "unknown"
  | "passRate";

export type QualityGateThreshold = {
  op: "lte" | "gte";
  value: number;
  severity: QualityGateSeverity;
};

export type QualityGateThresholds = Partial<
  Record<QualityGateThresholdMetric, QualityGateThreshold>
> & {
  criticalLabels?: Record<string, string[]>;
};

export type QualityGateEvaluationOptions = {
  rules?: QualityGateRule[] | undefined;
  thresholds?: QualityGateThresholds | undefined;
  historyLaunches?: Launch[] | undefined;
  defectMutes?: readonly DefectMuteRecord[] | undefined;
  defectMuteRules?: readonly QualityGateDefectMuteRule[] | undefined;
};

export type QualityGateDecisionReason = {
  code: string;
  metric: QualityGateThresholdMetric | QualityGateRule["metric"];
  severity: QualityGateSeverity;
  passed: boolean;
  effectivePassed: boolean;
  actual: number;
  effectiveActual: number;
  op: "lte" | "gte";
  threshold: number;
  explanation: string;
  affectedTestCaseIds: string[];
  affectedResultUuids: string[];
  effects: QualityGateDecisionReasonEffect[];
};

export type QualityGateEvaluation = {
  status: "passed" | "warning" | "failed";
  rawStatus: "passed" | "warning" | "failed";
  score: number;
  metrics: {
    total: number;
    failed: number;
    broken: number;
    unknown: number;
    passed: number;
    skipped: number;
    passRate: number;
    newFailures: number;
    failedBrokenTotal: number;
    criticalFailures: number;
    flakyTests: number;
    durationRegressions: number;
  };
  statusCounters: Record<AllureStatus, number>;
  reasons: QualityGateDecisionReason[];
  effects: QualityGateDecisionReasonEffect[];
  violations: Array<{
    rule: QualityGateRule;
    actual: number;
    expected: number;
  }>;
};

export type QualityGateDefectMuteRule = {
  code: string;
  reasonCode: string;
  mode: "exclude_muted_affected_tests";
};

export type QualityGateDecisionReasonEffect = {
  type: "defect_mute";
  ruleCode: string;
  reasonCode: string;
  muteIds: string[];
  affectedTestCaseIds: string[];
  affectedSignatureHashes: string[];
  originalActual: number;
  effectiveActual: number;
  explanation: string;
};

export function evaluateQualityGate(
  launch: Launch,
  rulesOrOptions?: QualityGateRule[] | QualityGateEvaluationOptions
): QualityGateEvaluation {
  const counters = summarizeLaunch(launch).counters;
  const total = launch.results.length;
  const passed = counters.passed;
  const passRate = total === 0 ? 100 : Math.round((passed / total) * 10000) / 100;
  const options = normalizeQualityGateOptions(rulesOrOptions);
  const rules = options.rules;
  const thresholdContext = buildQualityGateThresholdContext(launch, options);
  const metrics = {
    total,
    failed: counters.failed,
    broken: counters.broken,
    unknown: counters.unknown,
    passed,
    skipped: counters.skipped,
    passRate,
    newFailures: thresholdContext.newFailures.length,
    failedBrokenTotal: counters.failed + counters.broken,
    criticalFailures: thresholdContext.criticalFailures.length,
    flakyTests: thresholdContext.flakyTestCaseIds.length,
    durationRegressions: thresholdContext.durationRegressionTestCaseIds.length
  };

  const violations = rules
    .map((rule) => {
      const actual = metrics[rule.metric];
      const passedRule = rule.op === "lte" ? actual <= rule.value : actual >= rule.value;
      return passedRule ? undefined : { rule, actual, expected: rule.value };
    })
    .filter(
      (value): value is { rule: QualityGateRule; actual: number; expected: number } =>
        value !== undefined
    );

  const thresholdReasons = buildThresholdReasons(metrics, thresholdContext, options.thresholds);
  const violationReasons = violations.map((violation) =>
    toLegacyQualityGateReason(violation, launch)
  );
  const rawReasons = [...thresholdReasons, ...violationReasons];
  const reasons = applyQualityGateDefectMuteEffects(rawReasons, options);
  const rawDecisionReasons = reasons.filter((reason) => !reason.passed);
  const effectiveDecisionReasons = reasons.filter((reason) => !reason.effectivePassed);
  const rawHasFailure = rawDecisionReasons.some((reason) => reason.severity === "fail");
  const rawHasWarning = rawDecisionReasons.some((reason) => reason.severity === "warn");
  const hasFailure = effectiveDecisionReasons.some((reason) => reason.severity === "fail");
  const hasWarning = effectiveDecisionReasons.some((reason) => reason.severity === "warn");
  const rawStatus = rawHasFailure ? "failed" : rawHasWarning ? "warning" : "passed";
  const status = hasFailure ? "failed" : hasWarning ? "warning" : "passed";
  const score = Math.max(0, Math.round(passRate - effectiveDecisionReasons.length * 5));
  const effects = reasons.flatMap((reason) => reason.effects);

  return {
    status,
    rawStatus,
    score,
    metrics,
    statusCounters: counters,
    reasons,
    effects,
    violations
  };
}

export function defaultQualityGateRules(): QualityGateRule[] {
  return [
    { metric: "failed", op: "lte", value: 0, severity: "fail" },
    { metric: "broken", op: "lte", value: 0, severity: "fail" },
    { metric: "unknown", op: "lte", value: 0, severity: "warn" },
    { metric: "passRate", op: "gte", value: 95, severity: "warn" }
  ];
}

export function defaultQualityGateThresholds(): Required<
  Omit<QualityGateThresholds, "criticalLabels">
> &
  Pick<QualityGateThresholds, "criticalLabels"> {
  return {
    newFailures: { op: "lte", value: 0, severity: "fail" },
    failedBrokenTotal: { op: "lte", value: 0, severity: "fail" },
    criticalFailures: { op: "lte", value: 0, severity: "fail" },
    flakyTests: { op: "lte", value: 0, severity: "warn" },
    durationRegressions: { op: "lte", value: 0, severity: "warn" },
    unknown: { op: "lte", value: 0, severity: "warn" },
    passRate: { op: "gte", value: 95, severity: "warn" },
    criticalLabels: { severity: ["blocker", "critical"] }
  };
}

type QualityGateMetricSnapshot = QualityGateEvaluation["metrics"];

type QualityGateThresholdContext = {
  newFailures: string[];
  failedBrokenResults: NormalizedTestResult[];
  criticalFailures: NormalizedTestResult[];
  unknownResults: NormalizedTestResult[];
  flakyTestCaseIds: string[];
  durationRegressionTestCaseIds: string[];
};

type NormalizedQualityGateEvaluationOptions = {
  rules: QualityGateRule[];
  thresholds: QualityGateThresholds;
  historyLaunches: Launch[];
  defectMutes: readonly DefectMuteRecord[];
  defectMuteRules: readonly QualityGateDefectMuteRule[];
};

function normalizeQualityGateOptions(
  rulesOrOptions: QualityGateRule[] | QualityGateEvaluationOptions | undefined
): NormalizedQualityGateEvaluationOptions {
  if (Array.isArray(rulesOrOptions)) {
    return {
      rules: rulesOrOptions,
      thresholds: {},
      historyLaunches: [],
      defectMutes: [],
      defectMuteRules: []
    };
  }

  return {
    rules: rulesOrOptions?.rules ?? defaultQualityGateRules(),
    thresholds: mergeQualityGateThresholds(rulesOrOptions?.thresholds),
    historyLaunches: rulesOrOptions?.historyLaunches ?? [],
    defectMutes: rulesOrOptions?.defectMutes ?? [],
    defectMuteRules: rulesOrOptions?.defectMuteRules ?? []
  };
}

function mergeQualityGateThresholds(
  thresholds: QualityGateThresholds | undefined
): QualityGateThresholds {
  const defaults = defaultQualityGateThresholds();
  const criticalLabels = thresholds?.criticalLabels ?? defaults.criticalLabels ?? {};
  return {
    ...defaults,
    ...thresholds,
    criticalLabels
  };
}

function buildQualityGateThresholdContext(
  launch: Launch,
  options: Pick<NormalizedQualityGateEvaluationOptions, "historyLaunches" | "thresholds">
): QualityGateThresholdContext {
  const currentCaseOrder = new Map<string, number>();
  launch.results.forEach((result, index) => {
    const id = getTestCaseIdentity(result);
    if (!currentCaseOrder.has(id)) {
      currentCaseOrder.set(id, index);
    }
  });
  const summaries = buildTestCaseSummaries([...options.historyLaunches, launch]).filter((summary) =>
    currentCaseOrder.has(summary.id)
  );
  const criticalLabels = options.thresholds.criticalLabels ?? {};

  return {
    newFailures: summaries
      .filter((summary) => summary.failure.classification === "new")
      .sort(
        (left, right) =>
          (currentCaseOrder.get(left.id) ?? Number.MAX_SAFE_INTEGER) -
          (currentCaseOrder.get(right.id) ?? Number.MAX_SAFE_INTEGER)
      )
      .map((summary) => summary.id),
    failedBrokenResults: launch.results.filter((result) => isFailureStatus(result.status)),
    criticalFailures: launch.results.filter(
      (result) => isFailureStatus(result.status) && hasAnyLabel(result.labels, criticalLabels)
    ),
    unknownResults: launch.results.filter((result) => result.status === "unknown"),
    flakyTestCaseIds: summaries
      .filter((summary) => summary.flaky.isFlaky)
      .map((summary) => summary.id),
    durationRegressionTestCaseIds: summaries
      .filter((summary) => summary.durationRegression?.isRegressed)
      .map((summary) => summary.id)
  };
}

function buildThresholdReasons(
  metrics: QualityGateMetricSnapshot,
  context: QualityGateThresholdContext,
  thresholds: QualityGateThresholds
): QualityGateDecisionReason[] {
  return QUALITY_GATE_THRESHOLD_METRICS.flatMap((metric) => {
    const threshold = thresholds[metric];
    if (threshold === undefined) {
      return [];
    }

    const actual = metrics[metric];
    const passed = compareQualityGateMetric(actual, threshold.op, threshold.value);
    const affected = getAffectedForThreshold(metric, context);

    return [
      {
        code: `quality_gate.${metric}`,
        metric,
        severity: threshold.severity,
        passed,
        effectivePassed: passed,
        actual,
        effectiveActual: actual,
        op: threshold.op,
        threshold: threshold.value,
        explanation: buildThresholdExplanation(metric, actual, threshold, passed),
        affectedTestCaseIds: affected.testCaseIds,
        affectedResultUuids: affected.resultUuids,
        effects: []
      }
    ];
  });
}

function toLegacyQualityGateReason(
  violation: {
    rule: QualityGateRule;
    actual: number;
    expected: number;
  },
  launch: Launch
): QualityGateDecisionReason {
  const affectedResults = launch.results.filter(
    (result) => result.status === violation.rule.metric
  );
  return {
    code: `quality_gate.rule.${violation.rule.metric}.${violation.rule.op}`,
    metric: violation.rule.metric,
    severity: violation.rule.severity,
    passed: false,
    effectivePassed: false,
    actual: violation.actual,
    effectiveActual: violation.actual,
    op: violation.rule.op,
    threshold: violation.expected,
    explanation: `Legacy rule ${violation.rule.metric} ${violation.rule.op} ${violation.expected} failed with actual ${violation.actual}.`,
    affectedTestCaseIds: affectedResults.map(getTestCaseIdentity),
    affectedResultUuids: affectedResults.map((result) => result.uuid),
    effects: []
  };
}

function applyQualityGateDefectMuteEffects(
  reasons: QualityGateDecisionReason[],
  options: Pick<NormalizedQualityGateEvaluationOptions, "defectMutes" | "defectMuteRules">
): QualityGateDecisionReason[] {
  const activeMutes = getActiveDefectMutes(options.defectMutes);
  if (activeMutes.length === 0 || options.defectMuteRules.length === 0) {
    return reasons;
  }

  return reasons.map((reason) => {
    const matchingRules = options.defectMuteRules.filter((rule) => rule.reasonCode === reason.code);
    if (matchingRules.length === 0 || reason.affectedTestCaseIds.length === 0) {
      return reason;
    }

    let effectiveActual = reason.actual;
    const effects: QualityGateDecisionReasonEffect[] = [];

    for (const rule of matchingRules) {
      if (rule.mode !== "exclude_muted_affected_tests") {
        continue;
      }

      const muted = collectMutedAffectedTests(reason.affectedTestCaseIds, activeMutes);
      if (muted.testCaseIds.length === 0) {
        continue;
      }

      const nextEffectiveActual = Math.max(0, effectiveActual - muted.testCaseIds.length);
      effects.push({
        type: "defect_mute",
        ruleCode: rule.code,
        reasonCode: reason.code,
        muteIds: muted.muteIds,
        affectedTestCaseIds: muted.testCaseIds,
        affectedSignatureHashes: muted.signatureHashes,
        originalActual: reason.actual,
        effectiveActual: nextEffectiveActual,
        explanation: `Explicit defect mute rule ${rule.code} reduced ${reason.code} from ${effectiveActual} to ${nextEffectiveActual}.`
      });
      effectiveActual = nextEffectiveActual;
    }

    if (effects.length === 0) {
      return reason;
    }

    return {
      ...reason,
      effectiveActual,
      effectivePassed: compareQualityGateMetric(effectiveActual, reason.op, reason.threshold),
      effects
    };
  });
}

function collectMutedAffectedTests(
  affectedTestCaseIds: readonly string[],
  activeMutes: readonly DefectMuteRecord[]
): { testCaseIds: string[]; signatureHashes: string[]; muteIds: string[] } {
  const testCaseIds = new Set<string>();
  const signatureHashes = new Set<string>();
  const muteIds = new Set<string>();

  for (const testCaseId of affectedTestCaseIds) {
    const matchingMutes = activeMutes.filter((mute) => defectMuteCoversTestId(mute, testCaseId));
    if (matchingMutes.length === 0) {
      continue;
    }

    testCaseIds.add(testCaseId);
    for (const mute of matchingMutes) {
      muteIds.add(mute.id);
      for (const signatureHash of mute.affectedSignatureHashes) {
        signatureHashes.add(signatureHash);
      }
    }
  }

  return {
    testCaseIds: uniqueSortedStrings([...testCaseIds]),
    signatureHashes: uniqueSortedStrings([...signatureHashes]),
    muteIds: uniqueSortedStrings([...muteIds])
  };
}

const QUALITY_GATE_THRESHOLD_METRICS: QualityGateThresholdMetric[] = [
  "newFailures",
  "failedBrokenTotal",
  "criticalFailures",
  "flakyTests",
  "durationRegressions",
  "unknown",
  "passRate"
];

function compareQualityGateMetric(actual: number, op: "lte" | "gte", threshold: number): boolean {
  return op === "lte" ? actual <= threshold : actual >= threshold;
}

function getAffectedForThreshold(
  metric: QualityGateThresholdMetric,
  context: QualityGateThresholdContext
): { testCaseIds: string[]; resultUuids: string[] } {
  if (metric === "newFailures") {
    return { testCaseIds: context.newFailures, resultUuids: [] };
  }

  if (metric === "criticalFailures") {
    return {
      testCaseIds: context.criticalFailures.map(getTestCaseIdentity),
      resultUuids: context.criticalFailures.map((result) => result.uuid)
    };
  }

  if (metric === "failedBrokenTotal") {
    return {
      testCaseIds: context.failedBrokenResults.map(getTestCaseIdentity),
      resultUuids: context.failedBrokenResults.map((result) => result.uuid)
    };
  }

  if (metric === "unknown") {
    return {
      testCaseIds: context.unknownResults.map(getTestCaseIdentity),
      resultUuids: context.unknownResults.map((result) => result.uuid)
    };
  }

  if (metric === "flakyTests") {
    return { testCaseIds: context.flakyTestCaseIds, resultUuids: [] };
  }

  if (metric === "durationRegressions") {
    return { testCaseIds: context.durationRegressionTestCaseIds, resultUuids: [] };
  }

  return { testCaseIds: [], resultUuids: [] };
}

function buildThresholdExplanation(
  metric: QualityGateThresholdMetric,
  actual: number,
  threshold: QualityGateThreshold,
  passed: boolean
): string {
  const outcome = passed ? "passed" : threshold.severity === "fail" ? "failed" : "warned";
  return `${QUALITY_GATE_METRIC_LABELS[metric]} ${outcome}: actual ${actual} ${threshold.op} threshold ${threshold.value}.`;
}

const QUALITY_GATE_METRIC_LABELS: Record<QualityGateThresholdMetric, string> = {
  newFailures: "New failures",
  failedBrokenTotal: "Failed and broken total",
  criticalFailures: "Critical labelled failures",
  flakyTests: "Flaky test budget",
  durationRegressions: "Duration regression budget",
  unknown: "Unknown result budget",
  passRate: "Pass rate"
};

function hasAnyLabel(
  labels: Record<string, string[]>,
  expected: Record<string, string[]>
): boolean {
  return Object.entries(expected).some(([name, values]) => {
    const actualValues = labels[name] ?? [];
    return values.some((value) => actualValues.includes(value));
  });
}
