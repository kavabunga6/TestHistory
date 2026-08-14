import {
  collectUnsafeDecisionRequestFields,
  collectUnsafeFields,
  isUnsafeRawFieldKey,
  normalizeIsoDateTime,
  normalizeSecurityAuditExportDecisionRequest,
  normalizeSecurityAuditExportRequest,
  normalizeText,
  sanitizeCriteriaValue,
  sanitizeSecurityAuditExportDecisionReason
} from "./audit-export-policy.js";
import type {
  CreateSecurityAuditExportLifecycleEventInput,
  SecurityAuditExportDecision,
  SecurityAuditExportDecisionRequest,
  SecurityAuditExportLifecycleEvent,
  SecurityAuditExportLifecycleEventType,
  SecurityAuditExportLifecycleMetadataValue,
  SecurityAuditExportLifecycleProjection,
  SecurityAuditExportLifecycleReplayOptions,
  SecurityAuditExportLifecycleRequestRecord,
  SecurityAuditExportLifecycleState,
  SecurityAuditExportRequest
} from "./audit-export-types.js";
import {
  deepFreeze,
  sanitizeOptionalText,
  stableHash,
  stableStringify,
  uniqueSorted
} from "./audit-export-utils.js";
export {
  defaultSecurityAuditExportPolicy,
  evaluateSecurityAuditExportPolicy
} from "./audit-export-policy.js";
export type {
  CreateSecurityAuditExportLifecycleEventInput,
  SecurityAuditExportCriteriaValue,
  SecurityAuditExportDecision,
  SecurityAuditExportDecisionReason,
  SecurityAuditExportDecisionRequest,
  SecurityAuditExportDecisionStatus,
  SecurityAuditExportDestination,
  SecurityAuditExportFormat,
  SecurityAuditExportLifecycleEvent,
  SecurityAuditExportLifecycleEventType,
  SecurityAuditExportLifecycleMetadataValue,
  SecurityAuditExportLifecycleProjection,
  SecurityAuditExportLifecycleReplayOptions,
  SecurityAuditExportLifecycleRequestRecord,
  SecurityAuditExportLifecycleState,
  SecurityAuditExportPolicy,
  SecurityAuditExportRequest
} from "./audit-export-types.js";

export function createSecurityAuditExportLifecycleEvent(
  input: CreateSecurityAuditExportLifecycleEventInput
): SecurityAuditExportLifecycleEvent {
  const body = normalizeSecurityAuditExportLifecycleEventBody(input);
  const fingerprint = stableHash(stableStringify(body));

  return deepFreeze({
    schemaVersion: 1,
    id: `audit-export-lifecycle:${fingerprint}`,
    fingerprint,
    ...body
  });
}

export function appendSecurityAuditExportLifecycleEvent(
  events: readonly SecurityAuditExportLifecycleEvent[],
  event: SecurityAuditExportLifecycleEvent
): SecurityAuditExportLifecycleEvent[] {
  const existing = events.find((candidate) => candidate.id === event.id);
  if (existing === undefined) {
    return [...events, event];
  }

  if (existing.fingerprint === event.fingerprint) {
    return [...events];
  }

  throw new Error(
    `Security audit export lifecycle event ${event.id} is append-only and cannot be replaced.`
  );
}

export function replaySecurityAuditExportLifecycleEvents(
  events: readonly SecurityAuditExportLifecycleEvent[],
  options: SecurityAuditExportLifecycleReplayOptions
): SecurityAuditExportLifecycleProjection {
  const projectId = normalizeText(options.projectId);
  const actorId = options.actorId === undefined ? undefined : normalizeText(options.actorId);
  const orderedEvents = orderSecurityAuditExportLifecycleEvents(
    uniqueSecurityAuditExportLifecycleEvents(
      events
        .filter((event) => event.projectId === projectId)
        .filter((event) => actorId === undefined || event.actorId === actorId)
        .map((event) => sanitizePersistedSecurityAuditExportLifecycleEvent(event))
    )
  );
  const records = new Map<string, SecurityAuditExportLifecycleRequestRecord>();

  for (const event of orderedEvents) {
    const existing = records.get(event.requestId);
    assertAllowedSecurityAuditExportLifecycleTransition(existing?.status, event);
    records.set(event.requestId, applySecurityAuditExportLifecycleEvent(existing, event));
  }

  const requests = [...records.values()].sort((left, right) =>
    left.requestId.localeCompare(right.requestId)
  );
  const projection: SecurityAuditExportLifecycleProjection = {
    projectId,
    ...(actorId !== undefined ? { actorId } : {}),
    totalRequests: requests.length,
    byStatus: zeroSecurityAuditExportLifecycleStateCounters(),
    requestIds: requests.map((request) => request.requestId),
    requests,
    events: orderedEvents
  };

  for (const request of requests) {
    projection.byStatus[request.status] += 1;
  }

  const first = orderedEvents[0];
  const last = orderedEvents[orderedEvents.length - 1];
  if (first !== undefined) {
    projection.firstOccurredAt = first.occurredAt;
  }
  if (last !== undefined) {
    projection.lastOccurredAt = last.occurredAt;
  }

  return deepFreeze(projection);
}

function normalizeSecurityAuditExportLifecycleEventBody(
  input: CreateSecurityAuditExportLifecycleEventInput
): Omit<SecurityAuditExportLifecycleEvent, "schemaVersion" | "id" | "fingerprint"> {
  const projectId = normalizeText(input.projectId);
  const requestId = normalizeText(input.requestId);
  const status = lifecycleStateForEventType(input.type);
  const request = normalizeLifecycleRequest(input.request);
  const decision = normalizeLifecycleDecision(input.decision);
  const actorId = sanitizeOptionalText(input.actorId);
  const reason = sanitizeOptionalText(input.reason);
  const metadata = sanitizeLifecycleMetadataValue(input.metadata, "metadata");

  assertProjectScopeMatches(projectId, request?.projectId, "request.projectId");
  assertProjectScopeMatches(projectId, decision?.request.projectId, "decision.request.projectId");
  assertLifecyclePayloadMatchesEvent(status, request, decision);

  return {
    projectId,
    requestId,
    type: input.type,
    status,
    occurredAt: normalizeIsoDateTime(input.occurredAt, "occurredAt"),
    ...(actorId !== undefined ? { actorId } : {}),
    ...(request !== undefined ? { request } : {}),
    ...(decision !== undefined ? { decision } : {}),
    ...(reason !== undefined ? { reason } : {}),
    ...(metadata !== undefined ? { metadata } : {})
  };
}

function normalizeLifecycleRequest(
  request: SecurityAuditExportRequest | undefined
): SecurityAuditExportDecisionRequest | undefined {
  if (request === undefined) {
    return undefined;
  }

  const unsafeFields = collectUnsafeFields(request, {});
  if (unsafeFields.length > 0) {
    throw new Error(
      `Security audit export lifecycle request contains unsafe fields: ${unsafeFields.join(", ")}.`
    );
  }

  return normalizeSecurityAuditExportRequest(request);
}

function normalizeLifecycleDecision(
  decision: SecurityAuditExportDecision | undefined
): SecurityAuditExportDecision | undefined {
  if (decision === undefined) {
    return undefined;
  }

  if (decision.status !== (decision.allowed ? "allowed" : "denied")) {
    throw new Error("Security audit export lifecycle decision status does not match allowed flag.");
  }

  const unsafeFields = collectUnsafeDecisionRequestFields(decision.request);
  if (unsafeFields.length > 0) {
    throw new Error(
      `Security audit export lifecycle decision contains unsafe fields: ${unsafeFields.join(", ")}.`
    );
  }

  const request = normalizeSecurityAuditExportDecisionRequest(decision.request);
  const maxRangeDays = decision.limits.maxRangeDays;
  if (!Number.isFinite(maxRangeDays) || maxRangeDays <= 0) {
    throw new Error("Security audit export lifecycle decision maxRangeDays must be positive.");
  }

  return deepFreeze({
    schemaVersion: 1,
    status: decision.allowed ? "allowed" : "denied",
    allowed: decision.allowed,
    request,
    limits: {
      maxRangeDays
    },
    reasons: decision.reasons.map(sanitizeSecurityAuditExportDecisionReason)
  });
}

function sanitizePersistedSecurityAuditExportLifecycleEvent(
  event: SecurityAuditExportLifecycleEvent
): SecurityAuditExportLifecycleEvent {
  const body = normalizeSecurityAuditExportLifecycleEventBody({
    projectId: event.projectId,
    requestId: event.requestId,
    type: event.type,
    occurredAt: event.occurredAt,
    ...(event.actorId !== undefined ? { actorId: event.actorId } : {}),
    ...(event.request !== undefined
      ? { request: securityAuditExportRequestFromDecisionRequest(event.request) }
      : {}),
    ...(event.decision !== undefined ? { decision: event.decision } : {}),
    ...(event.reason !== undefined ? { reason: event.reason } : {}),
    ...(event.metadata !== undefined ? { metadata: event.metadata } : {})
  });

  return deepFreeze({
    schemaVersion: 1,
    id: normalizeText(event.id),
    fingerprint: normalizeText(event.fingerprint),
    ...body
  });
}

function securityAuditExportRequestFromDecisionRequest(
  request: SecurityAuditExportDecisionRequest
): SecurityAuditExportRequest {
  return {
    projectId: request.projectId,
    actorId: request.actorId,
    requestedAt: request.requestedAt,
    range: {
      from: request.range.from,
      to: request.range.to
    },
    destination: request.destination,
    format: request.format,
    ...(request.criteria !== undefined ? { criteria: request.criteria } : {})
  };
}

function lifecycleStateForEventType(
  type: SecurityAuditExportLifecycleEventType
): SecurityAuditExportLifecycleState {
  switch (type) {
    case "audit_export.requested":
      return "requested";
    case "audit_export.evaluated":
      return "evaluated";
    case "audit_export.approved":
      return "approved";
    case "audit_export.denied":
      return "denied";
    case "audit_export.cancelled":
      return "cancelled";
    case "audit_export.expired":
      return "expired";
  }
}

function assertLifecyclePayloadMatchesEvent(
  status: SecurityAuditExportLifecycleState,
  request: SecurityAuditExportDecisionRequest | undefined,
  decision: SecurityAuditExportDecision | undefined
): void {
  if (status === "requested" && request === undefined) {
    throw new Error("Security audit export requested lifecycle events require a request snapshot.");
  }

  if (
    (status === "evaluated" || status === "approved" || status === "denied") &&
    decision === undefined
  ) {
    throw new Error(
      `Security audit export ${status} lifecycle events require a decision snapshot.`
    );
  }

  if (status === "approved" && decision?.allowed !== true) {
    throw new Error("Security audit export approved lifecycle events require an allowed decision.");
  }

  if (status === "denied" && decision?.allowed !== false) {
    throw new Error("Security audit export denied lifecycle events require a denied decision.");
  }

  if ((status === "cancelled" || status === "expired") && decision !== undefined) {
    throw new Error(`Security audit export ${status} lifecycle events must not claim execution.`);
  }
}

function assertProjectScopeMatches(
  projectId: string,
  scopedProjectId: string | undefined,
  label: string
): void {
  if (scopedProjectId !== undefined && scopedProjectId !== projectId) {
    throw new Error(`Security audit export lifecycle ${label} must match event projectId.`);
  }
}

function sanitizeLifecycleMetadataValue(
  value: SecurityAuditExportLifecycleMetadataValue | undefined,
  key: string
): SecurityAuditExportLifecycleMetadataValue | undefined {
  if (value === undefined) {
    return undefined;
  }

  const unsafeFields = collectUnsafeLifecycleMetadataFields(value, key);
  if (unsafeFields.length > 0) {
    throw new Error(
      `Security audit export lifecycle metadata contains unsafe fields: ${unsafeFields.join(", ")}.`
    );
  }

  return sanitizeCriteriaValue(value, key);
}

function collectUnsafeLifecycleMetadataFields(
  value: SecurityAuditExportLifecycleMetadataValue | undefined,
  path: string
): string[] {
  if (value === undefined || value === null || typeof value !== "object") {
    return [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item, index) =>
      collectUnsafeLifecycleMetadataFields(item, `${path}[${index}]`)
    );
  }

  return Object.entries(value).flatMap(([key, nested]) => {
    const fieldPath = `${path}.${key}`;
    return [
      ...(isUnsafeRawFieldKey(key) || isProviderExecutionClaimKey(key) ? [fieldPath] : []),
      ...collectUnsafeLifecycleMetadataFields(nested, fieldPath)
    ];
  });
}

function isProviderExecutionClaimKey(key: string): boolean {
  return /adapter|artifact|destination|download|executed|execution|external[-_]?id|job|provider|run|upload/i.test(
    key
  );
}

function uniqueSecurityAuditExportLifecycleEvents(
  events: readonly SecurityAuditExportLifecycleEvent[]
): SecurityAuditExportLifecycleEvent[] {
  const byId = new Map<string, SecurityAuditExportLifecycleEvent>();
  for (const event of events) {
    const existing = byId.get(event.id);
    if (existing === undefined) {
      byId.set(event.id, event);
    } else if (existing.fingerprint !== event.fingerprint) {
      throw new Error(
        `Security audit export lifecycle event ${event.id} is append-only and cannot be replaced.`
      );
    }
  }
  return [...byId.values()];
}

function orderSecurityAuditExportLifecycleEvents(
  events: SecurityAuditExportLifecycleEvent[]
): SecurityAuditExportLifecycleEvent[] {
  return [...events].sort((left, right) => {
    const occurredAt = left.occurredAt.localeCompare(right.occurredAt);
    return occurredAt === 0 ? left.id.localeCompare(right.id) : occurredAt;
  });
}

function assertAllowedSecurityAuditExportLifecycleTransition(
  current: SecurityAuditExportLifecycleState | undefined,
  event: SecurityAuditExportLifecycleEvent
): void {
  const allowed =
    current === undefined
      ? event.status === "requested"
      : current === "requested"
        ? event.status === "evaluated" || event.status === "cancelled" || event.status === "expired"
        : current === "evaluated"
          ? event.status === "approved" ||
            event.status === "denied" ||
            event.status === "cancelled" ||
            event.status === "expired"
          : false;

  if (!allowed) {
    throw new Error(
      `Illegal security audit export lifecycle transition for request ${event.requestId}: ${current ?? "none"} -> ${event.status}.`
    );
  }
}

function applySecurityAuditExportLifecycleEvent(
  existing: SecurityAuditExportLifecycleRequestRecord | undefined,
  event: SecurityAuditExportLifecycleEvent
): SecurityAuditExportLifecycleRequestRecord {
  const actorIds = uniqueSorted([
    ...(existing?.actorIds ?? []),
    ...(event.actorId !== undefined ? [event.actorId] : [])
  ]);
  const record: SecurityAuditExportLifecycleRequestRecord = {
    projectId: event.projectId,
    requestId: event.requestId,
    status: event.status,
    actorIds,
    events: [...(existing?.events ?? []), event],
    reasons: event.decision?.reasons ?? existing?.reasons ?? [],
    ...(existing?.requestedAt !== undefined ? { requestedAt: existing.requestedAt } : {}),
    ...(existing?.evaluatedAt !== undefined ? { evaluatedAt: existing.evaluatedAt } : {}),
    ...(existing?.decidedAt !== undefined ? { decidedAt: existing.decidedAt } : {}),
    ...(existing?.cancelledAt !== undefined ? { cancelledAt: existing.cancelledAt } : {}),
    ...(existing?.expiredAt !== undefined ? { expiredAt: existing.expiredAt } : {}),
    ...(existing?.request !== undefined ? { request: existing.request } : {}),
    ...(event.request !== undefined ? { request: event.request } : {}),
    ...(existing?.decision !== undefined ? { decision: existing.decision } : {}),
    ...(event.decision !== undefined ? { decision: event.decision } : {})
  };

  if (event.status === "requested") {
    record.requestedAt = event.occurredAt;
  } else if (event.status === "evaluated") {
    record.evaluatedAt = event.occurredAt;
  } else if (event.status === "approved" || event.status === "denied") {
    record.decidedAt = event.occurredAt;
  } else if (event.status === "cancelled") {
    record.cancelledAt = event.occurredAt;
  } else {
    record.expiredAt = event.occurredAt;
  }

  return record;
}

function zeroSecurityAuditExportLifecycleStateCounters(): Record<
  SecurityAuditExportLifecycleState,
  number
> {
  return {
    requested: 0,
    evaluated: 0,
    approved: 0,
    denied: 0,
    cancelled: 0,
    expired: 0
  };
}
