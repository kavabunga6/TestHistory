import type { AllureStatus } from "./core.js";

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

export type QualityGateDecisionReasonReadModel = {
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
  effects: QualityGateDecisionReasonEffectReadModel[];
};

export type DefectMuteOriginReadModel =
  | {
      type: "actor";
      actorId: string;
    }
  | {
      type: "system";
      systemId: string;
    };

export type DefectMuteScopeReadModel = {
  signatureHashes?: string[];
  testCaseIds?: string[];
};

export type DefectMuteAuditEventReadModel = {
  id: string;
  type: "defect.muted" | "defect.unmuted";
  muteId: string;
  occurredAt: string;
  origin: DefectMuteOriginReadModel;
  scope: DefectMuteScopeReadModel;
  reason?: string;
  affectedSignatureHashes: string[];
  affectedTestIds: string[];
};

export type DefectMuteRecordReadModel = {
  id: string;
  status: "active" | "inactive";
  scope: DefectMuteScopeReadModel;
  reason: string;
  origin: DefectMuteOriginReadModel;
  mutedAt: string;
  affectedSignatureHashes: string[];
  affectedTestIds: string[];
  unmutedAt?: string;
  unmutedBy?: DefectMuteOriginReadModel;
  unmuteReason?: string;
  auditEvents: DefectMuteAuditEventReadModel[];
};

export type QualityGateDefectMuteRuleReadModel = {
  code: string;
  reasonCode: string;
  mode: "exclude_muted_affected_tests";
};

export type QualityGateDecisionReasonEffectReadModel = {
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

export type QualityGateEvaluationReadModel = {
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
  reasons: QualityGateDecisionReasonReadModel[];
  effects: QualityGateDecisionReasonEffectReadModel[];
  violations: Array<{
    rule: QualityGateRule;
    actual: number;
    expected: number;
  }>;
};

export type QualityGateEvaluationRequest = {
  rules?: QualityGateRule[];
  thresholds?: QualityGateThresholds;
  defectMutes?: DefectMuteRecordReadModel[];
  defectMuteRules?: QualityGateDefectMuteRuleReadModel[];
};
