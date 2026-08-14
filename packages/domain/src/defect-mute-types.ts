import type { DefectClusterReadModel } from "./defects.js";

export type DefectMuteOrigin =
  | {
      type: "actor";
      actorId: string;
    }
  | {
      type: "system";
      systemId: string;
    };

export type DefectMuteScope = {
  signatureHashes?: readonly string[];
  testCaseIds?: readonly string[];
};

export type DefectMuteStatus = "active" | "inactive";

export type DefectMuteAuditEventType = "defect.muted" | "defect.unmuted";

export type DefectMuteRawFailureOccurrence = {
  signatureHash: string;
  launchId: string;
  launchName: string;
  launchCreatedAt: string;
  resultUuid: string;
  testId: string;
  status: "failed" | "broken";
};

export type DefectMuteAuditEvent = {
  id: string;
  type: DefectMuteAuditEventType;
  muteId: string;
  projectId?: string;
  occurredAt: string;
  origin: DefectMuteOrigin;
  scope: DefectMuteScope;
  reason?: string;
  affectedSignatureHashes: string[];
  affectedTestIds: string[];
  rawFailureHistory: DefectMuteRawFailureOccurrence[];
};

export type DefectMuteRecord = {
  id: string;
  status: DefectMuteStatus;
  projectId?: string;
  scope: DefectMuteScope;
  reason: string;
  origin: DefectMuteOrigin;
  mutedAt: string;
  affectedSignatureHashes: string[];
  affectedTestIds: string[];
  rawFailureHistory: DefectMuteRawFailureOccurrence[];
  unmutedAt?: string;
  unmutedBy?: DefectMuteOrigin;
  unmuteReason?: string;
  auditEvents: DefectMuteAuditEvent[];
};

export type CreateDefectMuteInput = {
  id: string;
  projectId?: string;
  scope: DefectMuteScope;
  reason: string;
  origin: DefectMuteOrigin;
  occurredAt: string;
  clusters?: readonly DefectClusterReadModel[];
};

export type UnmuteDefectInput = {
  record: DefectMuteRecord;
  reason: string;
  origin: DefectMuteOrigin;
  occurredAt: string;
};

export type DefectMuteRawFailureProjection = {
  totalOccurrences: number;
  statusCounters: Record<"failed" | "broken", number>;
  byTestId: Record<string, number>;
  bySignatureHash: Record<string, number>;
  occurrences: DefectMuteRawFailureOccurrence[];
};

export type DefectMuteReplayDiagnosticCode =
  | "defect_mute.cross_project_event_ignored"
  | "defect_mute.duplicate_event_ignored"
  | "defect_mute.missing_project_id_ignored"
  | "defect_mute.unsafe_payload_field_redacted";

export type DefectMuteReplayDiagnostic = {
  code: DefectMuteReplayDiagnosticCode;
  eventId?: string;
  muteId?: string;
  projectId?: string;
  expectedProjectId?: string;
  fieldPaths?: string[];
  message: string;
};

export type DefectMuteEffectiveRecordSnapshot = {
  id: string;
  status: DefectMuteStatus;
  projectId: string;
  scope: DefectMuteScope;
  mutedAt: string;
  unmutedAt?: string;
  affectedSignatureHashes: string[];
  affectedTestIds: string[];
};

export type DefectMuteEffectiveProjectionSnapshot = {
  projectId: string;
  activeMuteIds: string[];
  inactiveMuteIds: string[];
  affectedSignatureHashes: string[];
  affectedTestIds: string[];
  records: DefectMuteEffectiveRecordSnapshot[];
};

export type DefectMuteReplayProjection = {
  projectId: string;
  totalEvents: number;
  mutedEvents: number;
  unmutedEvents: number;
  active: number;
  inactive: number;
  firstOccurredAt?: string;
  lastOccurredAt?: string;
  affectedSignatureHashes: string[];
  affectedTestIds: string[];
  rawFailureHistory: DefectMuteRawFailureProjection;
  effectiveState: DefectMuteEffectiveProjectionSnapshot;
  diagnostics: DefectMuteReplayDiagnostic[];
  records: DefectMuteRecord[];
  activeRecords: DefectMuteRecord[];
  inactiveRecords: DefectMuteRecord[];
  events: DefectMuteAuditEvent[];
};

export type DefectMuteReplayInvariantEvidence = {
  projectId: string;
  deterministic: boolean;
  recomputable: boolean;
  projectScoped: boolean;
  appendOnly: {
    uniqueProjectedEventIds: boolean;
    duplicateEventIds: string[];
    projectedEventIds: string[];
  };
  redaction: {
    passed: boolean;
    leakedMarkers: string[];
  };
  rawEffectiveSeparation: {
    effectiveStateExcludesRawFailureHistory: boolean;
    rawFailureHistoryPreserved: boolean;
    rawFailureHistoryNotMutatedByUnmute: boolean;
    rawFailureOccurrenceCount: number;
    effectiveRecordCount: number;
  };
  projectionDigest: string;
  recomputedDigest: string;
};

export type DefectMuteReplayInvariantEvidenceOptions = {
  projectId: string;
  crossProject?: "ignore" | "reject";
  unsafeMarkers?: readonly string[];
};
