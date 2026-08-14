import type { ArchiveUploadPageMetadata } from "./apiArchiveTypes.js";

export type DefectMuteProjectionApiState =
  | {
      state: "loading";
    }
  | {
      data: DefectMuteProjectionRead;
      state: "ready" | "empty" | "partial";
    }
  | {
      message: string;
      state: "error" | "denied";
    };

export type DefectMuteReplayInvariantApiState =
  | {
      state: "loading";
    }
  | {
      data: DefectMuteReplayInvariantRead;
      state: "ready" | "empty" | "partial";
    }
  | {
      message: string;
      state: "error" | "denied";
    };

export type DefectMuteProjectionRead = {
  kind: "defect-mute-projection";
  projectId: string;
  actor?: {
    type: "actor";
    actorId: string;
    scoped: true;
  };
  access: {
    scope: "defects:read";
    projectScoped: boolean;
    actorScoped: boolean;
    mutation: false;
    redacted: boolean;
  };
  projection: {
    adapterKind: "in-memory-defect-mute-projection-wip" | string;
    boundary: "worker-local-mute-projection" | string;
    consistency: "append-only-replay" | string;
    replayStatus: "replayed" | string;
    projectionDigest: string;
    mutationBoundary: "worker-projection-only-no-rest-mutation" | string;
    eventCount: number;
    mutedEventCount: number;
    unmutedEventCount: number;
    activeMuteCount: number;
    inactiveMuteCount: number;
    rawFailureOccurrenceCount: number;
    firstOccurredAt?: string;
    lastOccurredAt?: string;
  };
  page: {
    limit: number;
    cursor: string | null;
    offset: number;
    returned: number;
    total: number;
    nextCursor: string | null;
    hasMore: boolean;
  };
  rawFailureHistory: DefectMuteRawFailureSummary;
  qualityGate?: DefectMuteProjectedQualityGate;
  items: DefectMuteProjectionRecord[];
};

export type DefectMuteRawFailureSummary = {
  totalOccurrences: number;
  statusCounters: {
    failed: number;
    broken: number;
  };
  byTestId?: Record<string, number>;
  bySignatureHash?: Record<string, number>;
};

export type DefectMuteProjectionRecord = {
  id: string;
  status: "active" | "inactive";
  projectId?: string;
  origin: DefectMuteProjectionOrigin;
  mutedAt: string;
  unmutedAt?: string;
  unmutedBy?: DefectMuteProjectionOrigin;
  scope: {
    signatureHashes?: string[];
    testIds?: string[];
  };
  affectedSignatureHashes: string[];
  affectedTestIds: string[];
  rawFailureHistory: DefectMuteRawFailureSummary;
  audit: {
    eventCount: number;
    mutedEventCount: number;
    unmutedEventCount: number;
  };
};

export type DefectMuteProjectionOrigin =
  | {
      type: "actor";
      actorId: string;
    }
  | {
      type: "system";
      systemId?: string;
    };

export type DefectMuteProjectedQualityGate = {
  launchId: string;
  raw: {
    status: "passed" | "warning" | "failed";
    metrics: Record<string, number>;
    statusCounters: Record<string, number>;
  };
  effective: {
    status: "passed" | "warning" | "failed";
    effects: DefectMuteQualityGateEffect[];
    reasons: DefectMuteProjectedQualityGateReason[];
  };
  distinction: string;
};

export type DefectMuteQualityGateEffect = {
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

export type DefectMuteProjectedQualityGateReason = {
  code: string;
  metric: string;
  severity: "warn" | "fail";
  passed: boolean;
  effectivePassed: boolean;
  actual: number;
  effectiveActual: number;
  op: "lte" | "gte";
  threshold: number;
  affectedTestCaseIds: string[];
  affectedResultUuids: string[];
  effects: DefectMuteQualityGateEffect[];
};

export type DefectMuteReplayInvariantRead = {
  kind: "defect-mute-replay-invariant";
  projectId: string;
  actor?: {
    type: "actor";
    actorId: string;
    scoped: true;
  };
  access: DefectMuteProjectionRead["access"];
  query: {
    projectId: string;
    actorId?: string;
    limit: number;
    cursor: string | null;
  };
  invariant: {
    boundary: "read-only-defect-mute-replay-invariant" | string;
    source: "worker-local-mute-projection" | string;
    consistency: "append-only-replay" | string;
    mutationBoundary: "rest-read-only-no-replay-mutation" | string;
    deterministic: boolean;
    recomputable: boolean;
    projectScoped: boolean;
    projectionDigest: string;
    recomputedDigest: string;
  };
  rawEffectiveSeparation: {
    effectiveStateExcludesRawFailureHistory: boolean;
    rawFailureHistoryPreserved: boolean;
    rawFailureHistoryNotMutatedByUnmute: boolean;
    rawFailureOccurrenceCount: number;
    effectiveRecordCount: number;
    documentation: string;
  };
  appendOnly: {
    uniqueProjectedEventIds: boolean;
    duplicateEventIds: string[];
    totalProjectedEventIds: number;
  };
  redaction: {
    passed: boolean;
    leakedMarkers: string[];
    policy: string;
  };
  page: ArchiveUploadPageMetadata;
  items: DefectMuteReplayInvariantEventItem[];
};

export type DefectMuteReplayInvariantEventItem = {
  ordinal: number;
  eventId: string;
};
