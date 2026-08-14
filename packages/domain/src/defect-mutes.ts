import { redactSensitiveText, type DefectClusterReadModel } from "./defects.js";
import {
  collectUnsafeFieldPaths,
  containsObjectKey,
  duplicateStrings,
  sortRecord,
  stableStringify,
  uniqueSorted
} from "./defect-mute-utils.js";
import { defectMuteReplayInvariantShape } from "./defect-mute-invariant.js";
export type {
  CreateDefectMuteInput,
  DefectMuteAuditEvent,
  DefectMuteAuditEventType,
  DefectMuteEffectiveProjectionSnapshot,
  DefectMuteEffectiveRecordSnapshot,
  DefectMuteOrigin,
  DefectMuteRawFailureOccurrence,
  DefectMuteRawFailureProjection,
  DefectMuteRecord,
  DefectMuteReplayDiagnostic,
  DefectMuteReplayDiagnosticCode,
  DefectMuteReplayInvariantEvidence,
  DefectMuteReplayInvariantEvidenceOptions,
  DefectMuteReplayProjection,
  DefectMuteScope,
  DefectMuteStatus,
  UnmuteDefectInput
} from "./defect-mute-types.js";

import type {
  CreateDefectMuteInput,
  DefectMuteAuditEvent,
  DefectMuteAuditEventType,
  DefectMuteEffectiveProjectionSnapshot,
  DefectMuteOrigin,
  DefectMuteRawFailureOccurrence,
  DefectMuteRawFailureProjection,
  DefectMuteRecord,
  DefectMuteReplayDiagnostic,
  DefectMuteReplayInvariantEvidence,
  DefectMuteReplayInvariantEvidenceOptions,
  DefectMuteReplayProjection,
  DefectMuteScope,
  UnmuteDefectInput
} from "./defect-mute-types.js";
export function createDefectMute(input: CreateDefectMuteInput): DefectMuteRecord {
  const scope = normalizeDefectMuteScope(input.scope);
  const affected = resolveDefectMuteAffected(scope, input.clusters ?? []);
  const rawFailureHistory = resolveDefectMuteRawFailureHistory(scope, input.clusters ?? []);
  const reason = redactSensitiveText(input.reason);
  const projectId = sanitizeOptionalText(input.projectId);
  const event: DefectMuteAuditEvent = {
    id: buildDefectMuteEventId(input.id, "defect.muted", input.occurredAt),
    type: "defect.muted",
    muteId: input.id,
    ...(projectId !== undefined ? { projectId } : {}),
    occurredAt: input.occurredAt,
    origin: sanitizeDefectMuteOrigin(input.origin),
    scope,
    reason,
    affectedSignatureHashes: affected.signatureHashes,
    affectedTestIds: affected.testIds,
    rawFailureHistory
  };

  return {
    id: input.id,
    status: "active",
    ...(projectId !== undefined ? { projectId } : {}),
    scope,
    reason,
    origin: event.origin,
    mutedAt: input.occurredAt,
    affectedSignatureHashes: event.affectedSignatureHashes,
    affectedTestIds: event.affectedTestIds,
    rawFailureHistory,
    auditEvents: [event]
  };
}

export function unmuteDefect(input: UnmuteDefectInput): DefectMuteRecord {
  const reason = redactSensitiveText(input.reason);
  const event: DefectMuteAuditEvent = {
    id: buildDefectMuteEventId(input.record.id, "defect.unmuted", input.occurredAt),
    type: "defect.unmuted",
    muteId: input.record.id,
    ...(input.record.projectId !== undefined ? { projectId: input.record.projectId } : {}),
    occurredAt: input.occurredAt,
    origin: sanitizeDefectMuteOrigin(input.origin),
    scope: input.record.scope,
    reason,
    affectedSignatureHashes: input.record.affectedSignatureHashes,
    affectedTestIds: input.record.affectedTestIds,
    rawFailureHistory: input.record.rawFailureHistory
  };

  return {
    ...input.record,
    status: "inactive",
    unmutedAt: input.occurredAt,
    unmutedBy: event.origin,
    unmuteReason: reason,
    auditEvents: [...input.record.auditEvents, event]
  };
}

export function appendDefectMuteAuditEvent(
  events: readonly DefectMuteAuditEvent[],
  event: DefectMuteAuditEvent
): DefectMuteAuditEvent[] {
  const sanitized = sanitizePersistedDefectMuteAuditEvent(event);
  if (sanitized.projectId === undefined) {
    throw new Error("Defect mute event projectId is required for persistence replay.");
  }

  const existing = events.find((candidate) => candidate.id === sanitized.id);
  if (existing === undefined) {
    return [...events, sanitized];
  }

  if (
    stableStringify(sanitizePersistedDefectMuteAuditEvent(existing)) === stableStringify(sanitized)
  ) {
    return [...events];
  }

  throw new Error(`Defect mute event ${sanitized.id} is append-only and cannot be replaced.`);
}

export function replayDefectMuteAuditEvents(
  events: readonly DefectMuteAuditEvent[],
  options: { projectId: string; crossProject?: "ignore" | "reject" }
): DefectMuteReplayProjection {
  const projectId = normalizeRequiredText(options.projectId, "projectId");
  const { diagnostics, projectEvents } = normalizeDefectMuteReplayEvents(events, {
    projectId,
    crossProject: options.crossProject ?? "ignore"
  });
  const records = rebuildDefectMuteRecords(projectEvents);
  const activeRecords = getActiveDefectMutes(records);
  const inactiveRecords = records.filter((record) => record.status === "inactive");
  const first = projectEvents[0];
  const last = projectEvents[projectEvents.length - 1];
  const rawFailureHistory = projectRawFailureHistory(records);
  const affectedSignatureHashes = uniqueSorted(
    records.flatMap((record) => record.affectedSignatureHashes)
  );
  const affectedTestIds = uniqueSorted(records.flatMap((record) => record.affectedTestIds));
  const effectiveState = buildDefectMuteEffectiveProjectionSnapshot({
    projectId,
    records,
    activeRecords,
    inactiveRecords,
    affectedSignatureHashes,
    affectedTestIds
  });

  return {
    projectId,
    totalEvents: projectEvents.length,
    mutedEvents: projectEvents.filter((event) => event.type === "defect.muted").length,
    unmutedEvents: projectEvents.filter((event) => event.type === "defect.unmuted").length,
    active: activeRecords.length,
    inactive: inactiveRecords.length,
    ...(first !== undefined ? { firstOccurredAt: first.occurredAt } : {}),
    ...(last !== undefined ? { lastOccurredAt: last.occurredAt } : {}),
    affectedSignatureHashes,
    affectedTestIds,
    rawFailureHistory,
    effectiveState,
    diagnostics,
    records,
    activeRecords,
    inactiveRecords,
    events: projectEvents
  };
}

export function snapshotDefectMuteEffectiveState(
  projection: Pick<
    DefectMuteReplayProjection,
    | "projectId"
    | "records"
    | "activeRecords"
    | "inactiveRecords"
    | "affectedSignatureHashes"
    | "affectedTestIds"
  >
): DefectMuteEffectiveProjectionSnapshot {
  return buildDefectMuteEffectiveProjectionSnapshot(projection);
}

export function buildDefectMuteReplayInvariantEvidence(
  events: readonly DefectMuteAuditEvent[],
  options: DefectMuteReplayInvariantEvidenceOptions
): DefectMuteReplayInvariantEvidence {
  const projectId = normalizeRequiredText(options.projectId, "projectId");
  const replayOptions = {
    projectId,
    crossProject: options.crossProject ?? "ignore"
  } as const;
  const projection = replayDefectMuteAuditEvents(events, replayOptions);
  const replayedFromReverse = replayDefectMuteAuditEvents([...events].reverse(), replayOptions);
  const recomputed = replayDefectMuteAuditEvents(projection.events, replayOptions);
  const projectionDigest = stableStringify(
    defectMuteReplayInvariantShape(projection, { includeDiagnostics: false })
  );
  const recomputedDigest = stableStringify(
    defectMuteReplayInvariantShape(recomputed, { includeDiagnostics: false })
  );
  const projectedEventIds = projection.events.map((event) => event.id);
  const duplicateEventIds = duplicateStrings(projectedEventIds);
  const rawEffectiveSeparation = inspectRawEffectiveSeparation(projection);
  const serialized = stableStringify(projection);
  const leakedMarkers = uniqueSorted(
    (options.unsafeMarkers ?? []).filter(
      (marker) => marker.length > 0 && serialized.includes(marker)
    )
  );

  return {
    projectId,
    deterministic:
      stableStringify(defectMuteReplayInvariantShape(projection, { includeDiagnostics: true })) ===
      stableStringify(
        defectMuteReplayInvariantShape(replayedFromReverse, { includeDiagnostics: true })
      ),
    recomputable:
      projectionDigest === recomputedDigest &&
      stableStringify(snapshotDefectMuteEffectiveState(projection)) ===
        stableStringify(projection.effectiveState),
    projectScoped:
      projection.events.every((event) => event.projectId === projectId) &&
      projection.records.every((record) => record.projectId === projectId) &&
      projection.effectiveState.projectId === projectId &&
      projection.effectiveState.records.every((record) => record.projectId === projectId),
    appendOnly: {
      uniqueProjectedEventIds: duplicateEventIds.length === 0,
      duplicateEventIds,
      projectedEventIds
    },
    redaction: {
      passed: leakedMarkers.length === 0,
      leakedMarkers
    },
    rawEffectiveSeparation: {
      ...rawEffectiveSeparation,
      rawFailureOccurrenceCount: projection.rawFailureHistory.totalOccurrences,
      effectiveRecordCount: projection.effectiveState.records.length
    },
    projectionDigest,
    recomputedDigest
  };
}

export function rebuildDefectMuteRecords(
  events: readonly DefectMuteAuditEvent[]
): DefectMuteRecord[] {
  const records = new Map<string, DefectMuteRecord>();

  for (const event of orderDefectMuteAuditEvents(
    events.map((candidate) => sanitizePersistedDefectMuteAuditEvent(candidate))
  )) {
    if (event.type === "defect.muted") {
      records.set(event.muteId, {
        id: event.muteId,
        status: "active",
        ...(event.projectId !== undefined ? { projectId: event.projectId } : {}),
        scope: normalizeDefectMuteScope(event.scope),
        reason: event.reason ?? "",
        origin: event.origin,
        mutedAt: event.occurredAt,
        affectedSignatureHashes: uniqueSorted(event.affectedSignatureHashes),
        affectedTestIds: uniqueSorted(event.affectedTestIds),
        rawFailureHistory: orderRawFailureOccurrences(event.rawFailureHistory),
        auditEvents: [event]
      });
      continue;
    }

    const existing = records.get(event.muteId);
    if (existing === undefined) {
      continue;
    }

    records.set(event.muteId, {
      ...existing,
      status: "inactive",
      unmutedAt: event.occurredAt,
      unmutedBy: event.origin,
      ...(event.reason !== undefined ? { unmuteReason: event.reason } : {}),
      rawFailureHistory: existing.rawFailureHistory,
      auditEvents: [...existing.auditEvents, event]
    });
  }

  return [...records.values()].sort((left, right) => left.id.localeCompare(right.id));
}

export function getActiveDefectMutes(
  records: readonly DefectMuteRecord[] | undefined
): DefectMuteRecord[] {
  return [...(records ?? [])]
    .filter((record) => record.status === "active")
    .sort((left, right) => {
      const mutedAt = left.mutedAt.localeCompare(right.mutedAt);
      return mutedAt === 0 ? left.id.localeCompare(right.id) : mutedAt;
    });
}

export function defectMuteCoversTestId(record: DefectMuteRecord, testCaseId: string): boolean {
  return (
    (record.scope.testCaseIds ?? []).includes(testCaseId) ||
    record.affectedTestIds.includes(testCaseId)
  );
}

export function resolveDefectMuteAffected(
  scope: DefectMuteScope,
  clusters: readonly DefectClusterReadModel[]
): { signatureHashes: string[]; testIds: string[] } {
  const normalizedScope = normalizeDefectMuteScope(scope);
  const signatureHashes = new Set(normalizedScope.signatureHashes ?? []);
  const testIds = new Set(normalizedScope.testCaseIds ?? []);

  for (const cluster of clusters) {
    const signatureMatched = signatureHashes.has(cluster.signature.hash);
    const testMatched = cluster.affectedTestIds.some((testId) => testIds.has(testId));
    if (!signatureMatched && !testMatched) {
      continue;
    }

    signatureHashes.add(cluster.signature.hash);
    for (const testId of cluster.affectedTestIds) {
      testIds.add(testId);
    }
  }

  return {
    signatureHashes: uniqueSorted([...signatureHashes]),
    testIds: uniqueSorted([...testIds])
  };
}

export function resolveDefectMuteRawFailureHistory(
  scope: DefectMuteScope,
  clusters: readonly DefectClusterReadModel[]
): DefectMuteRawFailureOccurrence[] {
  const normalizedScope = normalizeDefectMuteScope(scope);
  const signatureHashes = new Set(normalizedScope.signatureHashes ?? []);
  const testIds = new Set(normalizedScope.testCaseIds ?? []);
  const occurrences = clusters
    .filter(
      (cluster) =>
        signatureHashes.has(cluster.signature.hash) ||
        cluster.affectedTestIds.some((testId) => testIds.has(testId))
    )
    .flatMap((cluster) =>
      cluster.occurrences.map((occurrence) => ({
        signatureHash: cluster.signature.hash,
        launchId: redactSensitiveText(occurrence.launchId),
        launchName: redactSensitiveText(occurrence.launchName),
        launchCreatedAt: occurrence.launchCreatedAt,
        resultUuid: redactSensitiveText(occurrence.resultUuid),
        testId: redactSensitiveText(occurrence.testId),
        status: occurrence.status
      }))
    );

  return orderRawFailureOccurrences(occurrences);
}

export function normalizeDefectMuteScope(scope: DefectMuteScope): DefectMuteScope {
  const normalized: DefectMuteScope = {};
  const signatureHashes = uniqueSorted((scope.signatureHashes ?? []).map(redactSensitiveText));
  const testCaseIds = uniqueSorted((scope.testCaseIds ?? []).map(redactSensitiveText));

  if (signatureHashes.length > 0) {
    normalized.signatureHashes = signatureHashes;
  }
  if (testCaseIds.length > 0) {
    normalized.testCaseIds = testCaseIds;
  }

  return normalized;
}

function projectRawFailureHistory(
  records: readonly DefectMuteRecord[]
): DefectMuteRawFailureProjection {
  const occurrences = orderRawFailureOccurrences(
    records.flatMap((record) => record.rawFailureHistory)
  );
  const statusCounters: Record<"failed" | "broken", number> = { failed: 0, broken: 0 };
  const byTestId: Record<string, number> = {};
  const bySignatureHash: Record<string, number> = {};

  for (const occurrence of occurrences) {
    statusCounters[occurrence.status] += 1;
    byTestId[occurrence.testId] = (byTestId[occurrence.testId] ?? 0) + 1;
    bySignatureHash[occurrence.signatureHash] =
      (bySignatureHash[occurrence.signatureHash] ?? 0) + 1;
  }

  return {
    totalOccurrences: occurrences.length,
    statusCounters,
    byTestId: sortRecord(byTestId),
    bySignatureHash: sortRecord(bySignatureHash),
    occurrences
  };
}

function normalizeDefectMuteReplayEvents(
  events: readonly DefectMuteAuditEvent[],
  options: { projectId: string; crossProject: "ignore" | "reject" }
): { projectEvents: DefectMuteAuditEvent[]; diagnostics: DefectMuteReplayDiagnostic[] } {
  const diagnostics: DefectMuteReplayDiagnostic[] = [];
  const projectEventsById = new Map<string, DefectMuteAuditEvent>();

  for (const event of events) {
    const sanitized = sanitizePersistedDefectMuteAuditEvent(event);
    const unsafeFieldPaths = collectUnsafeEventFieldPaths(event);
    if (unsafeFieldPaths.length > 0) {
      diagnostics.push({
        code: "defect_mute.unsafe_payload_field_redacted",
        eventId: sanitized.id,
        muteId: sanitized.muteId,
        ...(sanitized.projectId !== undefined ? { projectId: sanitized.projectId } : {}),
        fieldPaths: unsafeFieldPaths,
        message: "Defect mute replay ignored unsafe raw payload fields while building projection."
      });
    }

    if (sanitized.projectId === undefined) {
      diagnostics.push({
        code: "defect_mute.missing_project_id_ignored",
        eventId: sanitized.id,
        muteId: sanitized.muteId,
        expectedProjectId: options.projectId,
        message: "Defect mute replay ignored an event without projectId."
      });
      continue;
    }

    if (sanitized.projectId !== options.projectId) {
      const message = `Defect mute replay event ${sanitized.id} belongs to project ${sanitized.projectId}, not ${options.projectId}.`;
      if (options.crossProject === "reject") {
        throw new Error(message);
      }

      diagnostics.push({
        code: "defect_mute.cross_project_event_ignored",
        eventId: sanitized.id,
        muteId: sanitized.muteId,
        projectId: sanitized.projectId,
        expectedProjectId: options.projectId,
        message
      });
      continue;
    }

    const existing = projectEventsById.get(sanitized.id);
    if (existing === undefined) {
      projectEventsById.set(sanitized.id, sanitized);
      continue;
    }

    if (stableStringify(existing) !== stableStringify(sanitized)) {
      throw new Error(`Defect mute event ${sanitized.id} is append-only and cannot be replaced.`);
    }

    diagnostics.push({
      code: "defect_mute.duplicate_event_ignored",
      eventId: sanitized.id,
      muteId: sanitized.muteId,
      projectId: sanitized.projectId,
      expectedProjectId: options.projectId,
      message: "Defect mute replay ignored a duplicate append-only event."
    });
  }

  return {
    diagnostics,
    projectEvents: orderDefectMuteAuditEvents([...projectEventsById.values()])
  };
}

function buildDefectMuteEffectiveProjectionSnapshot(input: {
  projectId: string;
  records: readonly DefectMuteRecord[];
  activeRecords: readonly DefectMuteRecord[];
  inactiveRecords: readonly DefectMuteRecord[];
  affectedSignatureHashes: readonly string[];
  affectedTestIds: readonly string[];
}): DefectMuteEffectiveProjectionSnapshot {
  return {
    projectId: input.projectId,
    activeMuteIds: uniqueSorted(input.activeRecords.map((record) => record.id)),
    inactiveMuteIds: uniqueSorted(input.inactiveRecords.map((record) => record.id)),
    affectedSignatureHashes: [...input.affectedSignatureHashes],
    affectedTestIds: [...input.affectedTestIds],
    records: input.records
      .map((record) => ({
        id: record.id,
        status: record.status,
        projectId: record.projectId ?? input.projectId,
        scope: normalizeDefectMuteScope(record.scope),
        mutedAt: record.mutedAt,
        ...(record.unmutedAt !== undefined ? { unmutedAt: record.unmutedAt } : {}),
        affectedSignatureHashes: [...record.affectedSignatureHashes],
        affectedTestIds: [...record.affectedTestIds]
      }))
      .sort((left, right) => left.id.localeCompare(right.id))
  };
}

function sanitizePersistedDefectMuteAuditEvent(event: DefectMuteAuditEvent): DefectMuteAuditEvent {
  const projectId = sanitizeOptionalText(event.projectId);
  const reason = sanitizeOptionalText(event.reason);
  return {
    id: sanitizeRequiredText(event.id, "id"),
    type: sanitizeDefectMuteAuditEventType(event.type),
    muteId: sanitizeRequiredText(event.muteId, "muteId"),
    ...(projectId !== undefined ? { projectId } : {}),
    occurredAt: sanitizeRequiredText(event.occurredAt, "occurredAt"),
    origin: sanitizeDefectMuteOrigin(event.origin),
    scope: normalizeDefectMuteScope(event.scope),
    ...(reason !== undefined ? { reason } : {}),
    affectedSignatureHashes: uniqueSorted(event.affectedSignatureHashes.map(redactSensitiveText)),
    affectedTestIds: uniqueSorted(event.affectedTestIds.map(redactSensitiveText)),
    rawFailureHistory: orderRawFailureOccurrences(event.rawFailureHistory ?? [])
  };
}

function orderRawFailureOccurrences(
  occurrences: readonly DefectMuteRawFailureOccurrence[]
): DefectMuteRawFailureOccurrence[] {
  return [...occurrences]
    .map((occurrence) => ({
      signatureHash: redactSensitiveText(occurrence.signatureHash),
      launchId: redactSensitiveText(occurrence.launchId),
      launchName: redactSensitiveText(occurrence.launchName),
      launchCreatedAt: occurrence.launchCreatedAt,
      resultUuid: redactSensitiveText(occurrence.resultUuid),
      testId: redactSensitiveText(occurrence.testId),
      status: sanitizeRawFailureStatus(occurrence.status)
    }))
    .sort((left, right) => {
      const launchCreatedAt = left.launchCreatedAt.localeCompare(right.launchCreatedAt);
      if (launchCreatedAt !== 0) {
        return launchCreatedAt;
      }

      const testId = left.testId.localeCompare(right.testId);
      if (testId !== 0) {
        return testId;
      }

      return left.resultUuid.localeCompare(right.resultUuid);
    });
}

function orderDefectMuteAuditEvents(
  events: readonly DefectMuteAuditEvent[]
): DefectMuteAuditEvent[] {
  return [...events].sort((left, right) => {
    const occurredAt = left.occurredAt.localeCompare(right.occurredAt);
    if (occurredAt !== 0) {
      return occurredAt;
    }

    const muteId = left.muteId.localeCompare(right.muteId);
    return muteId === 0 ? left.id.localeCompare(right.id) : muteId;
  });
}

function sanitizeDefectMuteAuditEventType(
  value: DefectMuteAuditEventType
): DefectMuteAuditEventType {
  if (value === "defect.muted" || value === "defect.unmuted") {
    return value;
  }

  throw new Error(`Defect mute event type ${String(value)} is not supported.`);
}

function sanitizeRawFailureStatus(value: "failed" | "broken"): "failed" | "broken" {
  if (value === "failed" || value === "broken") {
    return value;
  }

  throw new Error(`Defect mute raw failure status ${String(value)} is not supported.`);
}

function sanitizeDefectMuteOrigin(origin: DefectMuteOrigin): DefectMuteOrigin {
  return origin.type === "actor"
    ? { type: "actor", actorId: redactSensitiveText(origin.actorId) }
    : { type: "system", systemId: redactSensitiveText(origin.systemId) };
}

function normalizeRequiredText(value: string, label: string): string {
  const sanitized = redactSensitiveText(value).trim();
  if (sanitized.length === 0) {
    throw new Error(`Defect mute ${label} must not be empty.`);
  }
  return sanitized;
}

function sanitizeRequiredText(value: string, label: string): string {
  return normalizeRequiredText(value, label);
}

function sanitizeOptionalText(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  const sanitized = redactSensitiveText(value).trim();
  return sanitized.length === 0 ? undefined : sanitized;
}

function buildDefectMuteEventId(
  muteId: string,
  type: DefectMuteAuditEventType,
  occurredAt: string
): string {
  return `defect-mute-event:${muteId}:${type}:${occurredAt}`;
}

function collectUnsafeEventFieldPaths(event: DefectMuteAuditEvent): string[] {
  return collectUnsafeFieldPaths(event, "event", new WeakSet<object>());
}

function inspectRawEffectiveSeparation(projection: DefectMuteReplayProjection): {
  effectiveStateExcludesRawFailureHistory: boolean;
  rawFailureHistoryPreserved: boolean;
  rawFailureHistoryNotMutatedByUnmute: boolean;
} {
  const firstMutedRawHistoryByMuteId = new Map<string, string>();
  const unmuteRawHistoryByMuteId = new Map<string, string[]>();

  for (const event of projection.events) {
    const serializedRawHistory = stableStringify(
      orderRawFailureOccurrences(event.rawFailureHistory)
    );
    if (event.type === "defect.muted" && !firstMutedRawHistoryByMuteId.has(event.muteId)) {
      firstMutedRawHistoryByMuteId.set(event.muteId, serializedRawHistory);
    }
    if (event.type === "defect.unmuted") {
      const existing = unmuteRawHistoryByMuteId.get(event.muteId) ?? [];
      unmuteRawHistoryByMuteId.set(event.muteId, [...existing, serializedRawHistory]);
    }
  }

  const rawFailureHistoryPreserved = projection.records.every(
    (record) =>
      stableStringify(orderRawFailureOccurrences(record.rawFailureHistory)) ===
      firstMutedRawHistoryByMuteId.get(record.id)
  );
  const rawFailureHistoryNotMutatedByUnmute = projection.records.every((record) => {
    const recordRawHistory = stableStringify(orderRawFailureOccurrences(record.rawFailureHistory));
    return (unmuteRawHistoryByMuteId.get(record.id) ?? []).every(
      (unmuteRawHistory) =>
        unmuteRawHistory === recordRawHistory ||
        unmuteRawHistory === "[]" ||
        unmuteRawHistory !==
          stableStringify(
            projection.records
              .filter((candidate) => candidate.id !== record.id)
              .flatMap((candidate) => candidate.rawFailureHistory)
          )
    );
  });

  return {
    effectiveStateExcludesRawFailureHistory: !containsObjectKey(
      projection.effectiveState,
      "rawFailureHistory"
    ),
    rawFailureHistoryPreserved,
    rawFailureHistoryNotMutatedByUnmute
  };
}
