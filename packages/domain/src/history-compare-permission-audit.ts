import {
  assertNoApiSurfaceClaim,
  deepFreeze,
  duplicateStrings,
  normalizeIsoDateTime,
  normalizeNonNegativeInteger,
  normalizeRequiredText,
  sanitizeFieldPath,
  sanitizeOptionalText,
  stableHash,
  stableStringify,
  uniqueSorted
} from "./history-compare-permission-audit-utils.js";
import { historyComparePermissionReplayInvariantShape } from "./history-compare-permission-audit-invariant.js";

export type HistoryComparePermissionAuditDecision = "denied" | "partial" | "ready";

export type HistoryComparePermissionAuditReasonSeverity = "info" | "warn" | "deny";

export type HistoryComparePermissionAuditReason = {
  code: string;
  severity: HistoryComparePermissionAuditReasonSeverity;
  explanation: string;
  fields: string[];
};

export type HistoryComparePermissionAuditPage = {
  returned: number;
  total: number;
  omitted: number;
};

export type HistoryComparePermissionAuditRawHistory = {
  included: false;
  preserved: true;
  digest?: string;
  itemCount?: number;
};

export type HistoryComparePermissionAuditEvent = Readonly<{
  schemaVersion: 1;
  id: string;
  fingerprint: string;
  type: "history_compare.permission_evaluated";
  projectId: string;
  actorId: string;
  compareId: string;
  testCaseId: string;
  baseResultUuid: string;
  targetResultUuid: string;
  occurredAt: string;
  decision: HistoryComparePermissionAuditDecision;
  reasons: HistoryComparePermissionAuditReason[];
  unavailable: string[];
  rawHistory: HistoryComparePermissionAuditRawHistory;
  page?: HistoryComparePermissionAuditPage;
}>;

export type CreateHistoryComparePermissionAuditEventInput = {
  projectId: string;
  actorId: string;
  compareId?: string;
  testCaseId: string;
  baseResultUuid: string;
  targetResultUuid: string;
  occurredAt: string;
  decision: HistoryComparePermissionAuditDecision;
  reasons?: readonly HistoryComparePermissionAuditReason[];
  unavailable?: readonly string[];
  rawHistory?: unknown;
  page?: HistoryComparePermissionAuditPage;
};

export type HistoryComparePermissionAuditReplayDiagnosticCode =
  | "history_compare_permission.actor_scope_event_ignored"
  | "history_compare_permission.cross_project_event_ignored"
  | "history_compare_permission.duplicate_event_ignored";

export type HistoryComparePermissionAuditReplayDiagnostic = {
  code: HistoryComparePermissionAuditReplayDiagnosticCode;
  eventId: string;
  compareId: string;
  projectId: string;
  actorId: string;
  expectedProjectId?: string;
  expectedActorId?: string;
  message: string;
};

export type HistoryComparePermissionAuditRecord = {
  projectId: string;
  actorId: string;
  compareId: string;
  testCaseId: string;
  decision: HistoryComparePermissionAuditDecision;
  reasons: HistoryComparePermissionAuditReason[];
  unavailable: string[];
  rawHistory: HistoryComparePermissionAuditRawHistory;
  events: HistoryComparePermissionAuditEvent[];
  firstOccurredAt: string;
  lastOccurredAt: string;
};

export type HistoryComparePermissionAuditProjection = {
  projectId: string;
  actorId?: string;
  totalEvents: number;
  byDecision: Record<HistoryComparePermissionAuditDecision, number>;
  actorIds: string[];
  compareIds: string[];
  testCaseIds: string[];
  rawHistory: {
    included: false;
    preserved: true;
    digests: string[];
    itemCount: number;
  };
  diagnostics: HistoryComparePermissionAuditReplayDiagnostic[];
  records: HistoryComparePermissionAuditRecord[];
  events: HistoryComparePermissionAuditEvent[];
  firstOccurredAt?: string;
  lastOccurredAt?: string;
};

export type HistoryComparePermissionAuditReplayInvariantEvidence = {
  projectId: string;
  actorId?: string;
  deterministic: boolean;
  recomputable: boolean;
  projectScoped: boolean;
  actorScoped: {
    requested: boolean;
    passed: boolean;
    actorId?: string;
    leakedActorIds: string[];
  };
  appendOnly: {
    uniqueProjectedEventIds: boolean;
    duplicateEventIds: string[];
    projectedEventIds: string[];
  };
  rawCompareInputs: {
    included: false;
    preserved: boolean;
    digestCount: number;
    itemCount: number;
  };
  redaction: {
    passed: boolean;
    leakedMarkers: string[];
  };
  projectionDigest: string;
  recomputedDigest: string;
};

export type HistoryComparePermissionAuditReplayInvariantEvidenceOptions = {
  projectId: string;
  actorId?: string;
  crossProject?: "ignore" | "reject";
  unsafeMarkers?: readonly string[];
};

export function createHistoryComparePermissionAuditEvent(
  input: CreateHistoryComparePermissionAuditEventInput
): HistoryComparePermissionAuditEvent {
  const body = normalizeHistoryComparePermissionAuditEventBody(input);
  const fingerprint = stableHash(stableStringify(body));

  return deepFreeze({
    schemaVersion: 1,
    id: `history-compare-permission:${fingerprint}`,
    fingerprint,
    ...body
  });
}

export function appendHistoryComparePermissionAuditEvent(
  events: readonly HistoryComparePermissionAuditEvent[],
  event: HistoryComparePermissionAuditEvent
): HistoryComparePermissionAuditEvent[] {
  const sanitized = sanitizePersistedHistoryComparePermissionAuditEvent(event);
  const existing = events.find((candidate) => candidate.id === sanitized.id);
  if (existing === undefined) {
    return [...events, sanitized];
  }

  if (
    stableStringify(sanitizePersistedHistoryComparePermissionAuditEvent(existing)) ===
    stableStringify(sanitized)
  ) {
    return [...events];
  }

  throw new Error(
    `History compare permission audit event ${sanitized.id} is append-only and cannot be replaced.`
  );
}

export function replayHistoryComparePermissionAuditEvents(
  events: readonly HistoryComparePermissionAuditEvent[],
  options: { projectId: string; actorId?: string; crossProject?: "ignore" | "reject" }
): HistoryComparePermissionAuditProjection {
  const projectId = normalizeRequiredText(options.projectId, "projectId");
  const actorId = sanitizeOptionalText(options.actorId);
  const { diagnostics, projectEvents } = normalizeHistoryComparePermissionReplayEvents(events, {
    projectId,
    actorId,
    crossProject: options.crossProject ?? "ignore"
  });
  const orderedEvents = orderHistoryComparePermissionAuditEvents(projectEvents);
  const records = buildHistoryComparePermissionRecords(orderedEvents);
  const rawHistoryDigests = uniqueSorted(
    orderedEvents
      .map((event) => event.rawHistory.digest)
      .filter((digest): digest is string => digest !== undefined)
  );
  const rawHistoryItemCount = orderedEvents.reduce(
    (total, event) => total + (event.rawHistory.itemCount ?? 0),
    0
  );
  const first = orderedEvents[0];
  const last = orderedEvents[orderedEvents.length - 1];

  return deepFreeze({
    projectId,
    ...(actorId !== undefined ? { actorId } : {}),
    totalEvents: orderedEvents.length,
    byDecision: {
      denied: orderedEvents.filter((event) => event.decision === "denied").length,
      partial: orderedEvents.filter((event) => event.decision === "partial").length,
      ready: orderedEvents.filter((event) => event.decision === "ready").length
    },
    actorIds: uniqueSorted(orderedEvents.map((event) => event.actorId)),
    compareIds: uniqueSorted(orderedEvents.map((event) => event.compareId)),
    testCaseIds: uniqueSorted(orderedEvents.map((event) => event.testCaseId)),
    rawHistory: {
      included: false,
      preserved: true,
      digests: rawHistoryDigests,
      itemCount: rawHistoryItemCount
    },
    diagnostics,
    records,
    events: orderedEvents,
    ...(first !== undefined ? { firstOccurredAt: first.occurredAt } : {}),
    ...(last !== undefined ? { lastOccurredAt: last.occurredAt } : {})
  });
}

export function buildHistoryComparePermissionAuditReplayInvariantEvidence(
  events: readonly HistoryComparePermissionAuditEvent[],
  options: HistoryComparePermissionAuditReplayInvariantEvidenceOptions
): HistoryComparePermissionAuditReplayInvariantEvidence {
  const projectId = normalizeRequiredText(options.projectId, "projectId");
  const actorId = sanitizeOptionalText(options.actorId);
  const replayOptions = {
    projectId,
    ...(actorId !== undefined ? { actorId } : {}),
    crossProject: options.crossProject ?? "ignore"
  } as const;
  const projection = replayHistoryComparePermissionAuditEvents(events, replayOptions);
  const replayedFromReverse = replayHistoryComparePermissionAuditEvents(
    [...events].reverse(),
    replayOptions
  );
  const recomputed = replayHistoryComparePermissionAuditEvents(projection.events, replayOptions);
  const projectionDigest = stableHash(
    stableStringify(
      historyComparePermissionReplayInvariantShape(projection, { includeDiagnostics: false })
    )
  );
  const recomputedDigest = stableHash(
    stableStringify(
      historyComparePermissionReplayInvariantShape(recomputed, { includeDiagnostics: false })
    )
  );
  const projectedEventIds = projection.events.map((event) => event.id);
  const duplicateEventIds = duplicateStrings(projectedEventIds);
  const leakedActorIds =
    actorId === undefined
      ? []
      : uniqueSorted(
          [
            ...projection.actorIds,
            ...projection.events.map((event) => event.actorId),
            ...projection.records.map((record) => record.actorId)
          ].filter((candidate) => candidate !== actorId)
        );
  const serialized = stableStringify(projection);
  const leakedMarkers = uniqueSorted(
    (options.unsafeMarkers ?? []).filter(
      (marker) => marker.length > 0 && serialized.includes(marker)
    )
  );

  return deepFreeze({
    projectId,
    ...(actorId !== undefined ? { actorId } : {}),
    deterministic:
      stableStringify(
        historyComparePermissionReplayInvariantShape(projection, { includeDiagnostics: true })
      ) ===
      stableStringify(
        historyComparePermissionReplayInvariantShape(replayedFromReverse, {
          includeDiagnostics: true
        })
      ),
    recomputable: projectionDigest === recomputedDigest,
    projectScoped:
      projection.projectId === projectId &&
      projection.events.every((event) => event.projectId === projectId) &&
      projection.records.every((record) => record.projectId === projectId),
    actorScoped: {
      requested: actorId !== undefined,
      passed: actorId === undefined || leakedActorIds.length === 0,
      ...(actorId !== undefined ? { actorId } : {}),
      leakedActorIds
    },
    appendOnly: {
      uniqueProjectedEventIds: duplicateEventIds.length === 0,
      duplicateEventIds,
      projectedEventIds
    },
    rawCompareInputs: {
      included: false,
      preserved:
        projection.rawHistory.included === false &&
        projection.rawHistory.preserved === true &&
        projection.events.every((event) => event.rawHistory.included === false) &&
        projection.events.every((event) => event.rawHistory.preserved === true) &&
        projection.records.every((record) => record.rawHistory.included === false) &&
        projection.records.every((record) => record.rawHistory.preserved === true),
      digestCount: projection.rawHistory.digests.length,
      itemCount: projection.rawHistory.itemCount
    },
    redaction: {
      passed: leakedMarkers.length === 0,
      leakedMarkers
    },
    projectionDigest,
    recomputedDigest
  });
}

function normalizeHistoryComparePermissionAuditEventBody(
  input: CreateHistoryComparePermissionAuditEventInput
): Omit<HistoryComparePermissionAuditEvent, "schemaVersion" | "id" | "fingerprint"> {
  const projectId = normalizeRequiredText(input.projectId, "projectId");
  const actorId = normalizeRequiredText(input.actorId, "actorId");
  const testCaseId = normalizeRequiredText(input.testCaseId, "testCaseId");
  const baseResultUuid = normalizeRequiredText(input.baseResultUuid, "baseResultUuid");
  const targetResultUuid = normalizeRequiredText(input.targetResultUuid, "targetResultUuid");
  if (baseResultUuid === targetResultUuid) {
    throw new Error("History compare permission audit base and target results must differ.");
  }

  const compareId = normalizeRequiredText(
    input.compareId ??
      `history-compare:${projectId}:${testCaseId}:${baseResultUuid}:${targetResultUuid}`,
    "compareId"
  );
  const decision = normalizeDecision(input.decision);
  const reasons = orderReasons((input.reasons ?? []).map(sanitizeReason));
  const unavailable = uniqueSorted((input.unavailable ?? []).map(sanitizeFieldPath));

  assertDecisionIsConsistent(decision, reasons, unavailable);

  return {
    type: "history_compare.permission_evaluated",
    projectId,
    actorId,
    compareId,
    testCaseId,
    baseResultUuid,
    targetResultUuid,
    occurredAt: normalizeIsoDateTime(input.occurredAt, "occurredAt"),
    decision,
    reasons,
    unavailable,
    rawHistory: summarizeRawHistory(input.rawHistory),
    ...(input.page !== undefined ? { page: sanitizePage(input.page) } : {})
  };
}

function sanitizePersistedHistoryComparePermissionAuditEvent(
  event: HistoryComparePermissionAuditEvent
): HistoryComparePermissionAuditEvent {
  const body = normalizeHistoryComparePermissionAuditEventBody({
    projectId: event.projectId,
    actorId: event.actorId,
    compareId: event.compareId,
    testCaseId: event.testCaseId,
    baseResultUuid: event.baseResultUuid,
    targetResultUuid: event.targetResultUuid,
    occurredAt: event.occurredAt,
    decision: event.decision,
    reasons: event.reasons,
    unavailable: event.unavailable,
    ...(event.rawHistory.digest !== undefined
      ? {
          rawHistory: {
            digest: event.rawHistory.digest,
            itemCount: event.rawHistory.itemCount
          }
        }
      : {}),
    ...(event.page !== undefined ? { page: event.page } : {})
  });

  return deepFreeze({
    schemaVersion: 1,
    id: normalizeRequiredText(event.id, "id"),
    fingerprint: normalizeRequiredText(event.fingerprint, "fingerprint"),
    ...body
  });
}

function normalizeHistoryComparePermissionReplayEvents(
  events: readonly HistoryComparePermissionAuditEvent[],
  options: {
    projectId: string;
    actorId: string | undefined;
    crossProject: "ignore" | "reject";
  }
): {
  projectEvents: HistoryComparePermissionAuditEvent[];
  diagnostics: HistoryComparePermissionAuditReplayDiagnostic[];
} {
  const diagnostics: HistoryComparePermissionAuditReplayDiagnostic[] = [];
  const eventsById = new Map<string, HistoryComparePermissionAuditEvent>();

  for (const event of events) {
    const sanitized = sanitizePersistedHistoryComparePermissionAuditEvent(event);
    if (sanitized.projectId !== options.projectId) {
      const message = `History compare permission audit event ${sanitized.id} belongs to project ${sanitized.projectId}, not ${options.projectId}.`;
      if (options.crossProject === "reject") {
        throw new Error(message);
      }

      diagnostics.push({
        code: "history_compare_permission.cross_project_event_ignored",
        eventId: sanitized.id,
        compareId: sanitized.compareId,
        projectId: sanitized.projectId,
        actorId: sanitized.actorId,
        expectedProjectId: options.projectId,
        message
      });
      continue;
    }

    if (options.actorId !== undefined && sanitized.actorId !== options.actorId) {
      diagnostics.push({
        code: "history_compare_permission.actor_scope_event_ignored",
        eventId: sanitized.id,
        compareId: sanitized.compareId,
        projectId: sanitized.projectId,
        actorId: sanitized.actorId,
        expectedActorId: options.actorId,
        message: `History compare permission audit event ${sanitized.id} belongs to actor ${sanitized.actorId}, not ${options.actorId}.`
      });
      continue;
    }

    const existing = eventsById.get(sanitized.id);
    if (existing === undefined) {
      eventsById.set(sanitized.id, sanitized);
      continue;
    }

    if (stableStringify(existing) !== stableStringify(sanitized)) {
      throw new Error(
        `History compare permission audit event ${sanitized.id} is append-only and cannot be replaced.`
      );
    }

    diagnostics.push({
      code: "history_compare_permission.duplicate_event_ignored",
      eventId: sanitized.id,
      compareId: sanitized.compareId,
      projectId: sanitized.projectId,
      actorId: sanitized.actorId,
      message: "History compare permission audit replay ignored a duplicate append-only event."
    });
  }

  return {
    diagnostics,
    projectEvents: orderHistoryComparePermissionAuditEvents([...eventsById.values()])
  };
}

function buildHistoryComparePermissionRecords(
  events: readonly HistoryComparePermissionAuditEvent[]
): HistoryComparePermissionAuditRecord[] {
  const records = new Map<string, HistoryComparePermissionAuditRecord>();

  for (const event of events) {
    const key = `${event.actorId}\u001f${event.compareId}`;
    const existing = records.get(key);
    if (existing === undefined) {
      records.set(key, {
        projectId: event.projectId,
        actorId: event.actorId,
        compareId: event.compareId,
        testCaseId: event.testCaseId,
        decision: event.decision,
        reasons: event.reasons,
        unavailable: event.unavailable,
        rawHistory: event.rawHistory,
        events: [event],
        firstOccurredAt: event.occurredAt,
        lastOccurredAt: event.occurredAt
      });
      continue;
    }

    records.set(key, {
      ...existing,
      decision: event.decision,
      reasons: event.reasons,
      unavailable: event.unavailable,
      rawHistory: event.rawHistory,
      events: [...existing.events, event],
      lastOccurredAt: event.occurredAt
    });
  }

  return [...records.values()].sort((left, right) => {
    const actorOrder = left.actorId.localeCompare(right.actorId);
    return actorOrder === 0 ? left.compareId.localeCompare(right.compareId) : actorOrder;
  });
}

function assertDecisionIsConsistent(
  decision: HistoryComparePermissionAuditDecision,
  reasons: readonly HistoryComparePermissionAuditReason[],
  unavailable: readonly string[]
): void {
  const denyReasons = reasons.filter((reason) => reason.severity === "deny");
  if (decision === "denied" && denyReasons.length === 0) {
    throw new Error("History compare permission denied audit events require a deny reason.");
  }
  if (decision === "partial" && unavailable.length === 0) {
    throw new Error("History compare permission partial audit events require unavailable fields.");
  }
  if (decision === "ready" && (denyReasons.length > 0 || unavailable.length > 0)) {
    throw new Error("History compare permission ready audit events cannot hide fields or deny.");
  }
  if (decision !== "denied" && denyReasons.length > 0) {
    throw new Error("History compare permission deny reasons require a denied decision.");
  }
}

function sanitizeReason(
  reason: HistoryComparePermissionAuditReason
): HistoryComparePermissionAuditReason {
  assertNoApiSurfaceClaim(reason.code, "reason.code");
  assertNoApiSurfaceClaim(reason.explanation, "reason.explanation");
  return {
    code: normalizeRequiredText(reason.code, "reason.code"),
    severity: normalizeReasonSeverity(reason.severity),
    explanation: normalizeRequiredText(reason.explanation, "reason.explanation"),
    fields: uniqueSorted(reason.fields.map(sanitizeFieldPath))
  };
}

function summarizeRawHistory(rawHistory: unknown): HistoryComparePermissionAuditRawHistory {
  if (rawHistory === undefined) {
    return {
      included: false,
      preserved: true
    };
  }

  if (isRawHistorySummary(rawHistory) && rawHistory.digest !== undefined) {
    return {
      included: false,
      preserved: true,
      digest: normalizeRequiredText(rawHistory.digest, "rawHistory.digest"),
      itemCount: rawHistory.itemCount ?? 0
    };
  }

  const value = stableStringify(rawHistory);
  return {
    included: false,
    preserved: true,
    digest: stableHash(value),
    itemCount: Array.isArray(rawHistory)
      ? rawHistory.length
      : isRawHistorySummary(rawHistory)
        ? (rawHistory.itemCount ?? 0)
        : 1
  };
}

function isRawHistorySummary(value: unknown): value is { digest?: string; itemCount?: number } {
  return value !== null && typeof value === "object" && ("digest" in value || "itemCount" in value);
}

function sanitizePage(page: HistoryComparePermissionAuditPage): HistoryComparePermissionAuditPage {
  return {
    returned: normalizeNonNegativeInteger(page.returned, "page.returned"),
    total: normalizeNonNegativeInteger(page.total, "page.total"),
    omitted: normalizeNonNegativeInteger(page.omitted, "page.omitted")
  };
}

function orderHistoryComparePermissionAuditEvents(
  events: readonly HistoryComparePermissionAuditEvent[]
): HistoryComparePermissionAuditEvent[] {
  return [...events].sort((left, right) => {
    const occurredAt = left.occurredAt.localeCompare(right.occurredAt);
    if (occurredAt !== 0) {
      return occurredAt;
    }

    const actorOrder = left.actorId.localeCompare(right.actorId);
    if (actorOrder !== 0) {
      return actorOrder;
    }

    const compareOrder = left.compareId.localeCompare(right.compareId);
    return compareOrder === 0 ? left.id.localeCompare(right.id) : compareOrder;
  });
}

function orderReasons(
  reasons: readonly HistoryComparePermissionAuditReason[]
): HistoryComparePermissionAuditReason[] {
  return [...reasons].sort((left, right) => {
    const severity = reasonSeverityOrder(left.severity) - reasonSeverityOrder(right.severity);
    return severity === 0 ? left.code.localeCompare(right.code) : severity;
  });
}

function reasonSeverityOrder(severity: HistoryComparePermissionAuditReasonSeverity): number {
  if (severity === "deny") {
    return 0;
  }
  if (severity === "warn") {
    return 1;
  }
  return 2;
}

function normalizeDecision(value: HistoryComparePermissionAuditDecision) {
  if (value === "denied" || value === "partial" || value === "ready") {
    return value;
  }

  throw new Error(`History compare permission decision ${String(value)} is not supported.`);
}

function normalizeReasonSeverity(
  value: HistoryComparePermissionAuditReasonSeverity
): HistoryComparePermissionAuditReasonSeverity {
  if (value === "info" || value === "warn" || value === "deny") {
    return value;
  }

  throw new Error(`History compare permission reason severity ${String(value)} is not supported.`);
}
