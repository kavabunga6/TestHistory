import {
  appendDefectMuteAuditEvent,
  buildDefectMuteReplayInvariantEvidence,
  replayDefectMuteAuditEvents,
  type DefectMuteAuditEvent,
  type DefectMuteReplayInvariantEvidence,
  type DefectMuteReplayProjection
} from "@testhistory/domain";
import { hashIdempotencyParts } from "./workerHash.js";
import { normalizeRequiredWorkerText, normalizeWorkerIsoTimestamp } from "./workerNormalize.js";
import { isNonEmptyString } from "./workerValueUtils.js";
import type {
  DefectMuteProjectionAdapter,
  DefectMuteProjectionJobPayload,
  DefectMuteProjectionPlan,
  DefectMuteProjectionSummary,
  DefectMuteReplayInvariantMaterializationAdapter,
  DefectMuteReplayInvariantMaterializationPlan,
  DefectMuteReplayInvariantMaterializationRecord,
  DefectMuteReplayInvariantMaterializationSummary
} from "./workerTypes.js";

export function buildDefectMuteProjectionPlan(
  payload: DefectMuteProjectionJobPayload,
  at: string
): DefectMuteProjectionPlan {
  const projection = replayDefectMuteAuditEvents(payload.events, { projectId: payload.projectId });
  const eventIds = orderDefectMuteEvents(payload.events)
    .map((event) => event.id)
    .filter(isNonEmptyString);
  const boundedEventIdHashes = eventIds
    .slice(0, 5)
    .map((eventId) => hashIdempotencyParts(["defect.mute.event", eventId]));
  const projectionDigest = buildDefectMuteProjectionDigest(payload.projectId, projection);

  return {
    transitions: [
      { state: "defect_mute_events_received", at },
      { state: "defect_mute_projection_replayed", at },
      { state: "defect_mute_projection_recorded", at }
    ],
    diagnostics: {
      eventIdHashes: boundedEventIdHashes,
      omittedEventIdCount: Math.max(0, eventIds.length - boundedEventIdHashes.length)
    },
    summary: buildDefectMuteProjectionSummary(projection, projectionDigest)
  };
}

export function createInMemoryDefectMuteProjectionAdapter(
  initialEvents: readonly DefectMuteAuditEvent[] = []
): DefectMuteProjectionAdapter {
  const eventsByProject = new Map<string, DefectMuteAuditEvent[]>();
  for (const event of initialEvents) {
    const projectId = event.projectId;
    if (projectId === undefined) {
      continue;
    }

    const currentEvents = eventsByProject.get(projectId) ?? [];
    eventsByProject.set(projectId, appendDefectMuteAuditEvent(currentEvents, event));
  }

  return {
    kind: "in-memory-defect-mute-projection-wip",
    applyEvents({ projectId, events, projectionDigest, at }) {
      let storedEvents = eventsByProject.get(projectId) ?? [];
      let appendedEventCount = 0;
      let unchangedEventCount = 0;

      for (const event of orderDefectMuteEvents(events)) {
        if (event.projectId !== projectId) {
          throw new Error("Defect mute event projectId must match the projection payload.");
        }

        const beforeCount = storedEvents.length;
        storedEvents = appendDefectMuteAuditEvent(storedEvents, event);
        if (storedEvents.length === beforeCount) {
          unchangedEventCount += 1;
        } else {
          appendedEventCount += 1;
        }
      }

      eventsByProject.set(projectId, storedEvents);
      const projection = replayDefectMuteAuditEvents(storedEvents, { projectId });

      return {
        adapterKind: "in-memory-defect-mute-projection-wip",
        boundary: "worker-local-mute-projection",
        consistency: "append-only-replay",
        appliedAt: at,
        idempotencyKeyHash: hashIdempotencyParts([
          "defect.mute.project.apply",
          projectId,
          projectionDigest,
          ...orderDefectMuteEvents(events).map((event) => event.id)
        ]),
        receivedEventCount: events.length,
        appendedEventCount,
        unchangedEventCount,
        totalStoredEventCount: storedEvents.length,
        ...buildDefectMuteProjectionSummary(
          projection,
          buildDefectMuteProjectionDigest(projectId, projection)
        )
      };
    },
    getProjection(projectId) {
      return cloneDefectMuteReplayProjection(
        replayDefectMuteAuditEvents(eventsByProject.get(projectId) ?? [], { projectId })
      );
    },
    snapshot() {
      return [...eventsByProject.keys()]
        .sort()
        .map((projectId) =>
          cloneDefectMuteReplayProjection(
            replayDefectMuteAuditEvents(eventsByProject.get(projectId) ?? [], { projectId })
          )
        );
    }
  };
}

export function buildDefectMuteReplayInvariantMaterializationPlan(input: {
  projectId: string;
  projection: DefectMuteReplayProjection;
  at: string;
  unsafeMarkers?: readonly string[];
}): DefectMuteReplayInvariantMaterializationPlan {
  const projectId = normalizeRequiredWorkerText(input.projectId, "projectId");
  const materializedAt = normalizeWorkerIsoTimestamp(input.at);
  const evidence = buildDefectMuteReplayInvariantEvidence(input.projection.events, {
    projectId,
    unsafeMarkers: input.unsafeMarkers ?? []
  });
  const record = buildDefectMuteReplayInvariantMaterializationRecord({
    projectId,
    materializedAt,
    evidence
  });
  const summary = buildDefectMuteReplayInvariantMaterializationSummary(projectId, record);

  return {
    boundary: "worker-local-defect-mute-replay-invariant-materialization",
    consistency: "retry-safe-idempotent-projected-mute-state",
    scope: "project",
    readOnly: true,
    rawFailurePayloadsIncluded: false,
    transitions: [
      { state: "defect_mute_projected_state_received", at: materializedAt },
      { state: "defect_mute_replay_invariant_summarized", at: materializedAt },
      { state: "defect_mute_replay_invariant_materialized", at: materializedAt }
    ],
    record,
    summary
  };
}

export function createInMemoryDefectMuteReplayInvariantMaterializationAdapter(): DefectMuteReplayInvariantMaterializationAdapter {
  const recordsByProject = new Map<string, DefectMuteReplayInvariantMaterializationRecord>();

  return {
    kind: "in-memory-defect-mute-replay-invariant-worker-wip",
    applyProjection({ projectId, projection, materializationDigest, at, unsafeMarkers }) {
      const plan = buildDefectMuteReplayInvariantMaterializationPlan({
        projectId,
        projection,
        at,
        ...(unsafeMarkers !== undefined ? { unsafeMarkers } : {})
      });
      const current = recordsByProject.get(plan.record.projectId);
      let upsertedRecordCount = 0;
      let updatedRecordCount = 0;
      let unchangedRecordCount = 0;

      if (current === undefined) {
        upsertedRecordCount = 1;
        recordsByProject.set(
          plan.record.projectId,
          cloneDefectMuteReplayInvariantRecord(plan.record)
        );
      } else if (areDefectMuteReplayInvariantRecordsEqual(current, plan.record)) {
        unchangedRecordCount = 1;
      } else {
        updatedRecordCount = 1;
        recordsByProject.set(
          plan.record.projectId,
          cloneDefectMuteReplayInvariantRecord(plan.record)
        );
      }

      return {
        ...plan.summary,
        adapterKind: "in-memory-defect-mute-replay-invariant-worker-wip",
        boundary: "worker-local-defect-mute-replay-invariant-materialization",
        consistency: "retry-safe-idempotent-projected-mute-state",
        appliedAt: normalizeWorkerIsoTimestamp(at),
        idempotencyKeyHash: hashIdempotencyParts([
          "defect_mute.replay_invariant.materialize",
          plan.record.projectId,
          materializationDigest,
          plan.record.evidenceDigest
        ]),
        upsertedRecordCount,
        updatedRecordCount,
        unchangedRecordCount,
        totalRecordCount: recordsByProject.size
      };
    },
    getRecord(projectId) {
      const normalizedProjectId = normalizeRequiredWorkerText(projectId, "projectId");
      const record = recordsByProject.get(normalizedProjectId);
      return record === undefined ? undefined : cloneDefectMuteReplayInvariantRecord(record);
    },
    snapshot() {
      return [...recordsByProject.values()]
        .map(cloneDefectMuteReplayInvariantRecord)
        .sort((left, right) => left.projectId.localeCompare(right.projectId));
    }
  };
}

function buildDefectMuteProjectionSummary(
  projection: DefectMuteReplayProjection,
  projectionDigest: string
): DefectMuteProjectionSummary {
  return {
    projectId: projection.projectId,
    eventCount: projection.totalEvents,
    mutedEventCount: projection.mutedEvents,
    unmutedEventCount: projection.unmutedEvents,
    activeMuteCount: projection.active,
    inactiveMuteCount: projection.inactive,
    rawFailureOccurrenceCount: projection.rawFailureHistory.totalOccurrences,
    projectionDigest,
    mutationBoundary: "worker-projection-only-no-rest-mutation"
  };
}

function buildDefectMuteProjectionDigest(
  projectId: string,
  projection: DefectMuteReplayProjection
): string {
  return hashIdempotencyParts([
    "defect.mute.project.projection",
    projectId,
    ...projection.events.map((event) => event.id),
    ...projection.records.map((record) =>
      [
        record.id,
        record.status,
        record.mutedAt,
        record.unmutedAt ?? "",
        ...record.affectedSignatureHashes,
        ...record.affectedTestIds
      ].join("\u001e")
    )
  ]);
}

function buildDefectMuteReplayInvariantMaterializationRecord(input: {
  projectId: string;
  materializedAt: string;
  evidence: DefectMuteReplayInvariantEvidence;
}): DefectMuteReplayInvariantMaterializationRecord {
  const projectionDigest = hashIdempotencyParts([
    "defect_mute.replay_invariant.projected_state_digest",
    input.projectId,
    input.evidence.projectionDigest
  ]);
  const recomputedDigest = hashIdempotencyParts([
    "defect_mute.replay_invariant.recomputed_state_digest",
    input.projectId,
    input.evidence.recomputedDigest
  ]);
  const duplicateEventIdHashes = input.evidence.appendOnly.duplicateEventIds.map((eventId) =>
    hashIdempotencyParts(["defect_mute.replay_invariant.duplicate_event", eventId])
  );
  const leakedMarkerHashes = input.evidence.redaction.leakedMarkers.map((marker) =>
    hashIdempotencyParts(["defect_mute.replay_invariant.leaked_marker", marker])
  );
  const evidenceDigest = hashIdempotencyParts([
    "defect_mute.replay_invariant.evidence",
    input.projectId,
    String(input.evidence.deterministic),
    String(input.evidence.recomputable),
    String(input.evidence.projectScoped),
    String(input.evidence.appendOnly.uniqueProjectedEventIds),
    String(input.evidence.redaction.passed),
    String(input.evidence.rawEffectiveSeparation.effectiveStateExcludesRawFailureHistory),
    String(input.evidence.rawEffectiveSeparation.rawFailureHistoryPreserved),
    String(input.evidence.rawEffectiveSeparation.rawFailureHistoryNotMutatedByUnmute),
    String(input.evidence.rawEffectiveSeparation.rawFailureOccurrenceCount),
    String(input.evidence.rawEffectiveSeparation.effectiveRecordCount),
    projectionDigest,
    recomputedDigest,
    ...duplicateEventIdHashes,
    ...leakedMarkerHashes
  ]);

  return {
    invariantRef: `defect-mute-replay-invariant:${hashIdempotencyParts([
      input.projectId,
      evidenceDigest
    ])}`,
    projectId: input.projectId,
    source: "projected-defect-mute-state",
    materializedAt: input.materializedAt,
    deterministic: input.evidence.deterministic,
    recomputable: input.evidence.recomputable,
    projectScoped: input.evidence.projectScoped,
    appendOnly: {
      uniqueProjectedEventIds: input.evidence.appendOnly.uniqueProjectedEventIds,
      projectedEventCount: input.evidence.appendOnly.projectedEventIds.length,
      duplicateEventCount: input.evidence.appendOnly.duplicateEventIds.length,
      duplicateEventIdHashes
    },
    redaction: {
      passed: input.evidence.redaction.passed,
      leakedMarkerHashes
    },
    rawEffectiveSeparation: {
      effectiveStateExcludesRawFailureHistory:
        input.evidence.rawEffectiveSeparation.effectiveStateExcludesRawFailureHistory,
      rawFailureHistoryPreserved: input.evidence.rawEffectiveSeparation.rawFailureHistoryPreserved,
      rawFailureHistoryNotMutatedByUnmute:
        input.evidence.rawEffectiveSeparation.rawFailureHistoryNotMutatedByUnmute,
      rawFailureOccurrenceCount: input.evidence.rawEffectiveSeparation.rawFailureOccurrenceCount,
      effectiveRecordCount: input.evidence.rawEffectiveSeparation.effectiveRecordCount,
      rawFailurePayloadIncluded: false
    },
    projectionDigest,
    recomputedDigest,
    evidenceDigest
  };
}

function buildDefectMuteReplayInvariantMaterializationSummary(
  projectId: string,
  record: DefectMuteReplayInvariantMaterializationRecord
): DefectMuteReplayInvariantMaterializationSummary {
  return {
    projectId,
    materializedRecordCount: 1,
    deterministic: record.deterministic,
    recomputable: record.recomputable,
    projectScoped: record.projectScoped,
    appendOnlyUniqueProjectedEventIds: record.appendOnly.uniqueProjectedEventIds,
    redactionPassed: record.redaction.passed,
    effectiveStateExcludesRawFailureHistory:
      record.rawEffectiveSeparation.effectiveStateExcludesRawFailureHistory,
    rawFailureHistoryPreserved: record.rawEffectiveSeparation.rawFailureHistoryPreserved,
    rawFailureHistoryNotMutatedByUnmute:
      record.rawEffectiveSeparation.rawFailureHistoryNotMutatedByUnmute,
    rawFailureOccurrenceCount: record.rawEffectiveSeparation.rawFailureOccurrenceCount,
    effectiveRecordCount: record.rawEffectiveSeparation.effectiveRecordCount,
    materializationDigest: hashIdempotencyParts([
      "defect_mute.replay_invariant.materialization",
      projectId,
      record.evidenceDigest,
      record.invariantRef
    ]),
    projectedMuteStateCompatible: true,
    mutationBoundary: "worker-materialization-only-no-rest-or-mcp-or-ui-claims",
    plannedOperations: [
      "defect_mute.replay_invariant.summarize",
      "defect_mute.replay_invariant.materialize"
    ]
  };
}

function orderDefectMuteEvents(events: readonly DefectMuteAuditEvent[]): DefectMuteAuditEvent[] {
  return [...events].sort((left, right) => {
    const occurredAt = left.occurredAt.localeCompare(right.occurredAt);
    if (occurredAt !== 0) {
      return occurredAt;
    }

    const muteId = left.muteId.localeCompare(right.muteId);
    return muteId === 0 ? left.id.localeCompare(right.id) : muteId;
  });
}

function cloneDefectMuteReplayProjection(
  projection: DefectMuteReplayProjection
): DefectMuteReplayProjection {
  return JSON.parse(JSON.stringify(projection)) as DefectMuteReplayProjection;
}

function cloneDefectMuteReplayInvariantRecord(
  record: DefectMuteReplayInvariantMaterializationRecord
): DefectMuteReplayInvariantMaterializationRecord {
  return JSON.parse(JSON.stringify(record)) as DefectMuteReplayInvariantMaterializationRecord;
}

function areDefectMuteReplayInvariantRecordsEqual(
  left: DefectMuteReplayInvariantMaterializationRecord,
  right: DefectMuteReplayInvariantMaterializationRecord
): boolean {
  const normalize = (record: DefectMuteReplayInvariantMaterializationRecord) => ({
    ...record,
    materializedAt: "retry-insensitive"
  });
  return JSON.stringify(normalize(left)) === JSON.stringify(normalize(right));
}
