import { redactSensitiveText } from "./defects.js";

export type SecurityAuditEventType =
  | "auth.login.succeeded"
  | "auth.login.failed"
  | "auth.logout"
  | "auth.access.denied"
  | "auth.role.changed"
  | "auth.oidc-provider.created"
  | "auth.oidc-provider.updated"
  | "auth.oidc-provider.deleted"
  | "auth.scim-token.rotated"
  | "auth.scim-user.provisioned"
  | "auth.scim-user.updated"
  | "auth.scim-user.disabled"
  | "auth.token.created"
  | "auth.token.revoked"
  | "auth.session.revoked"
  | "auth.probe.accepted"
  | "auth.probe.denied"
  | "defect.mute.created"
  | "defect.mute.removed"
  | "defect.link.removed"
  | "defect.deleted"
  | "test-plan.created"
  | "test-plan.updated"
  | "test-plan.archived"
  | "automation-job.created"
  | "automation-job.updated"
  | "ci-integration.created"
  | "ci-webhook.accepted"
  | "ci-webhook.denied"
  | "notification-integration.created"
  | "notification-integration.updated"
  | "notification-integration.deleted"
  | "issue-tracker-integration.created"
  | "issue-tracker-integration.updated"
  | "issue-tracker-integration.deleted"
  | "integration-delivery.queued"
  | "integration-delivery.delivered"
  | "integration-delivery.failed";

export type SecurityAuditOutcome = "allowed" | "denied" | "failed";

export type SecurityAuditSeverity = "info" | "warn" | "critical";

export type SecurityAuditActor =
  | {
      type: "actor";
      actorId: string;
      displayName?: string;
    }
  | {
      type: "service";
      serviceId: string;
    }
  | {
      type: "system";
      systemId: string;
    }
  | {
      type: "anonymous";
      externalId?: string;
    };

export type SecurityAuditResource = {
  type: string;
  id?: string;
  name?: string;
};

export type SecurityAuditRequestContext = {
  requestId?: string;
  traceId?: string;
  ipAddress?: string;
  userAgent?: string;
  method?: string;
  route?: string;
};

export type SecurityAuditMetadataValue =
  | string
  | number
  | boolean
  | null
  | SecurityAuditMetadataValue[]
  | {
      readonly [key: string]: SecurityAuditMetadataValue | undefined;
    };

export type SecurityAuditEvent = Readonly<{
  schemaVersion: 1;
  id: string;
  fingerprint: string;
  projectId: string;
  type: SecurityAuditEventType;
  outcome: SecurityAuditOutcome;
  severity: SecurityAuditSeverity;
  occurredAt: string;
  actor: SecurityAuditActor;
  resource?: SecurityAuditResource;
  request?: SecurityAuditRequestContext;
  reason?: string;
  metadata?: SecurityAuditMetadataValue;
}>;

export type CreateSecurityAuditEventInput = {
  projectId: string;
  type: SecurityAuditEventType;
  outcome: SecurityAuditOutcome;
  severity?: SecurityAuditSeverity;
  occurredAt: string;
  actor: SecurityAuditActor;
  resource?: SecurityAuditResource;
  request?: SecurityAuditRequestContext;
  reason?: string;
  metadata?: SecurityAuditMetadataValue;
};

export type SecurityAuditProjection = {
  projectId: string;
  total: number;
  denied: number;
  failed: number;
  allowed: number;
  byType: Record<SecurityAuditEventType, number>;
  byOutcome: Record<SecurityAuditOutcome, number>;
  bySeverity: Record<SecurityAuditSeverity, number>;
  actorIds: string[];
  resourceIds: string[];
  firstOccurredAt?: string;
  lastOccurredAt?: string;
  events: SecurityAuditEvent[];
};

export function createSecurityAuditEvent(input: CreateSecurityAuditEventInput): SecurityAuditEvent {
  const body = normalizeSecurityAuditEventBody(input);
  const fingerprint = stableHash(stableStringify(body));

  return deepFreeze({
    schemaVersion: 1,
    id: `security-audit:${fingerprint}`,
    fingerprint,
    ...body
  });
}

export function appendSecurityAuditEvent(
  events: readonly SecurityAuditEvent[],
  event: SecurityAuditEvent
): SecurityAuditEvent[] {
  const existing = events.find((candidate) => candidate.id === event.id);
  if (existing === undefined) {
    return [...events, event];
  }

  if (existing.fingerprint === event.fingerprint) {
    return [...events];
  }

  throw new Error(`Security audit event ${event.id} is append-only and cannot be replaced.`);
}

export function replaySecurityAuditEvents(
  events: readonly SecurityAuditEvent[],
  options: { projectId: string }
): SecurityAuditProjection {
  const projectId = normalizeRequiredText(options.projectId, "projectId");
  const projectEvents = orderSecurityAuditEvents(
    events
      .filter((event) => event.projectId === projectId)
      .map((event) => sanitizePersistedSecurityAuditEvent(event))
  );

  const projection: SecurityAuditProjection = {
    projectId,
    total: projectEvents.length,
    denied: 0,
    failed: 0,
    allowed: 0,
    byType: zeroTypeCounters(),
    byOutcome: zeroOutcomeCounters(),
    bySeverity: zeroSeverityCounters(),
    actorIds: [],
    resourceIds: [],
    events: projectEvents
  };
  const actorIds = new Set<string>();
  const resourceIds = new Set<string>();

  for (const event of projectEvents) {
    projection.byType[event.type] += 1;
    projection.byOutcome[event.outcome] += 1;
    projection.bySeverity[event.severity] += 1;
    if (event.outcome === "allowed") {
      projection.allowed += 1;
    } else if (event.outcome === "denied") {
      projection.denied += 1;
    } else {
      projection.failed += 1;
    }

    const actorId = getSecurityAuditActorId(event.actor);
    if (actorId !== undefined) {
      actorIds.add(actorId);
    }
    if (event.resource?.id !== undefined) {
      resourceIds.add(`${event.resource.type}:${event.resource.id}`);
    }
  }

  const first = projectEvents[0];
  const last = projectEvents[projectEvents.length - 1];
  if (first !== undefined) {
    projection.firstOccurredAt = first.occurredAt;
  }
  if (last !== undefined) {
    projection.lastOccurredAt = last.occurredAt;
  }

  projection.actorIds = [...actorIds].sort();
  projection.resourceIds = [...resourceIds].sort();
  return projection;
}

function normalizeSecurityAuditEventBody(
  input: CreateSecurityAuditEventInput
): Omit<SecurityAuditEvent, "schemaVersion" | "id" | "fingerprint"> {
  const projectId = normalizeRequiredText(input.projectId, "projectId");
  const occurredAt = normalizeRequiredText(input.occurredAt, "occurredAt");
  const actor = sanitizeSecurityAuditActor(input.actor);
  const resource = sanitizeSecurityAuditResource(input.resource);
  const request = sanitizeSecurityAuditRequest(input.request);
  const reason = sanitizeOptionalText(input.reason);
  const metadata = sanitizeMetadataValue(input.metadata, "metadata");

  return {
    projectId,
    type: input.type,
    outcome: input.outcome,
    severity: input.severity ?? severityForOutcome(input.outcome),
    occurredAt,
    actor,
    ...(resource !== undefined ? { resource } : {}),
    ...(request !== undefined ? { request } : {}),
    ...(reason !== undefined ? { reason } : {}),
    ...(metadata !== undefined ? { metadata } : {})
  };
}

function sanitizePersistedSecurityAuditEvent(event: SecurityAuditEvent): SecurityAuditEvent {
  const body = normalizeSecurityAuditEventBody({
    projectId: event.projectId,
    type: event.type,
    outcome: event.outcome,
    severity: event.severity,
    occurredAt: event.occurredAt,
    actor: event.actor,
    ...(event.resource !== undefined ? { resource: event.resource } : {}),
    ...(event.request !== undefined ? { request: event.request } : {}),
    ...(event.reason !== undefined ? { reason: event.reason } : {}),
    ...(event.metadata !== undefined ? { metadata: event.metadata } : {})
  });

  return deepFreeze({
    schemaVersion: 1,
    id: sanitizeRequiredText(event.id, "id"),
    fingerprint: sanitizeRequiredText(event.fingerprint, "fingerprint"),
    ...body
  });
}

function sanitizeSecurityAuditActor(actor: SecurityAuditActor): SecurityAuditActor {
  if (actor.type === "actor") {
    const displayName = sanitizeOptionalText(actor.displayName);
    return {
      type: "actor",
      actorId: sanitizeRequiredText(actor.actorId, "actorId"),
      ...(displayName !== undefined ? { displayName } : {})
    };
  }

  if (actor.type === "service") {
    return { type: "service", serviceId: sanitizeRequiredText(actor.serviceId, "serviceId") };
  }

  if (actor.type === "system") {
    return { type: "system", systemId: sanitizeRequiredText(actor.systemId, "systemId") };
  }

  const externalId = sanitizeOptionalText(actor.externalId);
  return {
    type: "anonymous",
    ...(externalId !== undefined ? { externalId } : {})
  };
}

function sanitizeSecurityAuditResource(
  resource: SecurityAuditResource | undefined
): SecurityAuditResource | undefined {
  if (resource === undefined) {
    return undefined;
  }

  const type = sanitizeRequiredText(resource.type, "resource.type");
  const id = sanitizeOptionalText(resource.id);
  const name = sanitizeOptionalText(resource.name);
  return {
    type,
    ...(id !== undefined ? { id } : {}),
    ...(name !== undefined ? { name } : {})
  };
}

function sanitizeSecurityAuditRequest(
  request: SecurityAuditRequestContext | undefined
): SecurityAuditRequestContext | undefined {
  if (request === undefined) {
    return undefined;
  }

  const normalized: SecurityAuditRequestContext = {};
  assignSanitizedOptional(normalized, "requestId", request.requestId);
  assignSanitizedOptional(normalized, "traceId", request.traceId);
  assignSanitizedOptional(normalized, "ipAddress", request.ipAddress);
  assignSanitizedOptional(normalized, "userAgent", request.userAgent);
  assignSanitizedOptional(normalized, "method", request.method);
  assignSanitizedOptional(normalized, "route", request.route);
  return Object.keys(normalized).length === 0 ? undefined : normalized;
}

function assignSanitizedOptional<K extends keyof SecurityAuditRequestContext>(
  target: SecurityAuditRequestContext,
  key: K,
  value: string | undefined
): void {
  const sanitized = sanitizeOptionalText(value);
  if (sanitized !== undefined) {
    target[key] = sanitized;
  }
}

function sanitizeMetadataValue(
  value: SecurityAuditMetadataValue | undefined,
  key: string
): SecurityAuditMetadataValue | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value === null || typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    return isSensitiveMetadataKey(key) ? "[redacted]" : redactSensitiveText(value);
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => sanitizeMetadataValue(item, key))
      .filter((item): item is SecurityAuditMetadataValue => item !== undefined);
  }

  const entries = Object.entries(value)
    .map(
      ([entryKey, entryValue]) => [entryKey, sanitizeMetadataValue(entryValue, entryKey)] as const
    )
    .filter(([, entryValue]) => entryValue !== undefined)
    .sort(([left], [right]) => left.localeCompare(right));
  const normalized: Record<string, SecurityAuditMetadataValue> = {};
  for (const [entryKey, entryValue] of entries) {
    normalized[entryKey] = entryValue!;
  }
  return normalized;
}

function isSensitiveMetadataKey(key: string): boolean {
  return /authorization|cookie|credential|hidden|masked|password|passwd|secret|storage[-_]?key|token|api[-_]?key|access[-_]?key|signature|session|payload|body|content/i.test(
    key
  );
}

function severityForOutcome(outcome: SecurityAuditOutcome): SecurityAuditSeverity {
  if (outcome === "allowed") {
    return "info";
  }
  return outcome === "denied" ? "warn" : "critical";
}

function orderSecurityAuditEvents(events: SecurityAuditEvent[]): SecurityAuditEvent[] {
  return [...events].sort((left, right) => {
    const occurredAt = left.occurredAt.localeCompare(right.occurredAt);
    return occurredAt === 0 ? left.id.localeCompare(right.id) : occurredAt;
  });
}

function getSecurityAuditActorId(actor: SecurityAuditActor): string | undefined {
  if (actor.type === "actor") {
    return `actor:${actor.actorId}`;
  }
  if (actor.type === "service") {
    return `service:${actor.serviceId}`;
  }
  if (actor.type === "system") {
    return `system:${actor.systemId}`;
  }
  return actor.externalId === undefined ? undefined : `anonymous:${actor.externalId}`;
}

function zeroTypeCounters(): Record<SecurityAuditEventType, number> {
  return {
    "auth.login.succeeded": 0,
    "auth.login.failed": 0,
    "auth.logout": 0,
    "auth.access.denied": 0,
    "auth.role.changed": 0,
    "auth.oidc-provider.created": 0,
    "auth.oidc-provider.updated": 0,
    "auth.oidc-provider.deleted": 0,
    "auth.scim-token.rotated": 0,
    "auth.scim-user.provisioned": 0,
    "auth.scim-user.updated": 0,
    "auth.scim-user.disabled": 0,
    "auth.token.created": 0,
    "auth.token.revoked": 0,
    "auth.session.revoked": 0,
    "auth.probe.accepted": 0,
    "auth.probe.denied": 0,
    "defect.mute.created": 0,
    "defect.mute.removed": 0,
    "defect.link.removed": 0,
    "defect.deleted": 0,
    "test-plan.created": 0,
    "test-plan.updated": 0,
    "test-plan.archived": 0,
    "automation-job.created": 0,
    "automation-job.updated": 0,
    "ci-integration.created": 0,
    "ci-webhook.accepted": 0,
    "ci-webhook.denied": 0,
    "notification-integration.created": 0,
    "notification-integration.updated": 0,
    "notification-integration.deleted": 0,
    "issue-tracker-integration.created": 0,
    "issue-tracker-integration.updated": 0,
    "issue-tracker-integration.deleted": 0,
    "integration-delivery.queued": 0,
    "integration-delivery.delivered": 0,
    "integration-delivery.failed": 0
  };
}

function zeroOutcomeCounters(): Record<SecurityAuditOutcome, number> {
  return {
    allowed: 0,
    denied: 0,
    failed: 0
  };
}

function zeroSeverityCounters(): Record<SecurityAuditSeverity, number> {
  return {
    info: 0,
    warn: 0,
    critical: 0
  };
}

function normalizeRequiredText(value: string, label: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new Error(`Security audit ${label} must not be empty.`);
  }
  return trimmed;
}

function sanitizeRequiredText(value: string, label: string): string {
  return normalizeRequiredText(redactSensitiveText(value), label);
}

function sanitizeOptionalText(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  const sanitized = redactSensitiveText(value).trim();
  return sanitized.length === 0 ? undefined : sanitized;
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }

  for (const nested of Object.values(value)) {
    deepFreeze(nested);
  }

  return Object.freeze(value);
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }

  const entries = Object.entries(value)
    .filter(([, entryValue]) => entryValue !== undefined)
    .sort(([left], [right]) => left.localeCompare(right));

  return `{${entries
    .map(([key, entryValue]) => `${JSON.stringify(key)}:${stableStringify(entryValue)}`)
    .join(",")}}`;
}

function stableHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0).toString(16).padStart(8, "0");
}
