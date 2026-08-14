import type { ApiState, DefectMuteProjectionRead, DefectMuteReplayInvariantRead } from "./api.js";
import { onlineApiState } from "./surfaceReadiness.archiveFixtures.js";
export const readyDefectMuteProjection: DefectMuteProjectionRead = {
  kind: "defect-mute-projection",
  projectId: "project-1",
  actor: { type: "actor", actorId: "qa-api-agent", scoped: true },
  access: {
    scope: "defects:read",
    projectScoped: true,
    actorScoped: true,
    mutation: false,
    redacted: true
  },
  projection: {
    adapterKind: "in-memory-defect-mute-projection-wip",
    boundary: "worker-local-mute-projection",
    consistency: "append-only-replay",
    replayStatus: "replayed",
    projectionDigest: "digest-1",
    mutationBoundary: "worker-projection-only-no-rest-mutation",
    eventCount: 1,
    mutedEventCount: 1,
    unmutedEventCount: 0,
    activeMuteCount: 1,
    inactiveMuteCount: 0,
    rawFailureOccurrenceCount: 1
  },
  page: {
    limit: 3,
    cursor: null,
    offset: 0,
    returned: 1,
    total: 1,
    nextCursor: null,
    hasMore: false
  },
  rawFailureHistory: {
    totalOccurrences: 1,
    statusCounters: { failed: 1, broken: 0 },
    byTestId: { "case-projection-muted": 1 },
    bySignatureHash: { "sig-projection-muted": 1 }
  },
  qualityGate: {
    launchId: "launch-1",
    raw: {
      status: "failed",
      metrics: { failed: 1, failedBrokenTotal: 1, newFailures: 1 },
      statusCounters: { passed: 0, failed: 1, broken: 0, skipped: 0 }
    },
    effective: {
      status: "passed",
      effects: [
        {
          type: "defect_mute",
          ruleCode: "worker-mute-failed-broken-total",
          reasonCode: "quality_gate.failedBrokenTotal",
          muteIds: ["worker-mute-sig-projection-muted"],
          affectedTestCaseIds: ["case-projection-muted"],
          affectedSignatureHashes: ["sig-projection-muted"],
          originalActual: 1,
          effectiveActual: 0,
          explanation: "Projected mute excludes the affected test from the effective gate."
        }
      ],
      reasons: [
        {
          code: "quality_gate.failedBrokenTotal",
          metric: "failedBrokenTotal",
          severity: "fail",
          passed: false,
          effectivePassed: true,
          actual: 1,
          effectiveActual: 0,
          op: "lte",
          threshold: 0,
          affectedTestCaseIds: ["case-projection-muted"],
          affectedResultUuids: ["projection-muted-result"],
          effects: []
        }
      ]
    },
    distinction:
      "Raw failure counters remain unchanged; effective gate fields show explicit defect mute projection effects."
  },
  items: [
    {
      id: "worker-mute-sig-projection-muted",
      projectId: "project-1",
      status: "active",
      origin: { type: "actor", actorId: "qa-api-agent" },
      mutedAt: "2026-05-30T06:00:00.000Z",
      scope: { signatureHashes: ["sig-projection-muted"] },
      affectedSignatureHashes: ["sig-projection-muted"],
      affectedTestIds: ["case-projection-muted"],
      rawFailureHistory: {
        totalOccurrences: 1,
        statusCounters: { failed: 1, broken: 0 }
      },
      audit: { eventCount: 1, mutedEventCount: 1, unmutedEventCount: 0 }
    }
  ]
};

export const readyDefectMuteReplayInvariant: DefectMuteReplayInvariantRead = {
  kind: "defect-mute-replay-invariant",
  projectId: "project-1",
  actor: { type: "actor", actorId: "qa-api-agent", scoped: true },
  access: {
    scope: "defects:read",
    projectScoped: true,
    actorScoped: true,
    mutation: false,
    redacted: true
  },
  query: {
    projectId: "project-1",
    actorId: "qa-api-agent",
    limit: 3,
    cursor: null
  },
  invariant: {
    boundary: "read-only-defect-mute-replay-invariant",
    source: "worker-local-mute-projection",
    consistency: "append-only-replay",
    mutationBoundary: "rest-read-only-no-replay-mutation",
    deterministic: true,
    recomputable: true,
    projectScoped: true,
    projectionDigest: "projection-digest-1",
    recomputedDigest: "projection-digest-1"
  },
  rawEffectiveSeparation: {
    effectiveStateExcludesRawFailureHistory: true,
    rawFailureHistoryPreserved: true,
    rawFailureHistoryNotMutatedByUnmute: true,
    rawFailureOccurrenceCount: 2,
    effectiveRecordCount: 1,
    documentation:
      "Raw failure history is preserved only as bounded counters while effective replay state is serialized separately."
  },
  appendOnly: {
    uniqueProjectedEventIds: true,
    duplicateEventIds: [],
    totalProjectedEventIds: 2
  },
  redaction: {
    passed: true,
    leakedMarkers: [],
    policy: "No raw result payloads, local paths, storage refs, tokens, or signed URLs are exposed."
  },
  page: {
    limit: 3,
    cursor: null,
    offset: 0,
    returned: 2,
    total: 2,
    nextCursor: null,
    hasMore: false
  },
  items: [
    { ordinal: 0, eventId: "defect-mute-event:project-1:mute-a" },
    { ordinal: 1, eventId: "defect-mute-event:project-1:mute-b" }
  ]
};

export const projectionApiState: ApiState = {
  ...onlineApiState,
  defectMuteProjection: { data: readyDefectMuteProjection, state: "ready" },
  defectMuteReplayInvariants: { data: readyDefectMuteReplayInvariant, state: "ready" }
};

export const emptyProjectionApiState: ApiState = {
  ...onlineApiState,
  defectMuteProjection: {
    data: {
      ...readyDefectMuteProjection,
      actor: { type: "actor", actorId: "other-actor", scoped: true },
      projection: {
        ...readyDefectMuteProjection.projection,
        eventCount: 0,
        mutedEventCount: 0,
        activeMuteCount: 0,
        rawFailureOccurrenceCount: 0
      },
      page: { ...readyDefectMuteProjection.page, returned: 0, total: 0 },
      rawFailureHistory: {
        totalOccurrences: 0,
        statusCounters: { failed: 0, broken: 0 },
        byTestId: {},
        bySignatureHash: {}
      },
      qualityGate: {
        ...readyDefectMuteProjection.qualityGate!,
        effective: {
          status: "failed",
          effects: [],
          reasons: []
        }
      },
      items: []
    },
    state: "empty"
  }
};

export const partialProjectionApiState: ApiState = {
  ...onlineApiState,
  defectMuteProjection: {
    data: {
      ...readyDefectMuteProjection,
      page: {
        ...readyDefectMuteProjection.page,
        returned: 1,
        total: 4,
        hasMore: true,
        nextCursor: "redacted-cursor"
      }
    },
    state: "partial"
  }
};
