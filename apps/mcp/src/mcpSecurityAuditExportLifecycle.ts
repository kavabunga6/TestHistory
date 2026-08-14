import { fetchApiValue } from "./mcpApiClient.js";
import { isUnsafeExportFieldKey, sanitizeExportText } from "./mcpExportSanitizers.js";
import { normalizePageMetadata, pageMetadata, paginateItems } from "./mcpPagination.js";
import type { ResourceReadOptions } from "./mcpReadOptions.js";
import {
  arrayField,
  cursorOffset,
  getRequiredString,
  integerField,
  isApiStatusPayload,
  isRecord,
  numericField,
  optionalPositiveInteger,
  optionalString,
  pickDefined,
  stringField,
  withQuery
} from "./mcpValueUtils.js";

export async function securityAuditExportLifecycleReplayInvariantRead(
  argumentsValue: Record<string, unknown>,
  mode: "replay" | "materialized" = "replay"
): Promise<unknown | string> {
  const projectId = getRequiredString(argumentsValue, "projectId");
  if (projectId.error !== undefined) {
    return "projectId is required for security audit export lifecycle replay invariant reads";
  }

  const actorId = getRequiredString(argumentsValue, "actorId");
  if (actorId.error !== undefined) {
    return "actorId is required for security audit export lifecycle replay invariant reads";
  }

  const options: ResourceReadOptions = {
    includeDetails: false,
    includeRaw: false,
    limit: optionalPositiveInteger(argumentsValue.limit, 100, 500),
    cursor: optionalString(argumentsValue.cursor),
    offset: cursorOffset(optionalString(argumentsValue.cursor))
  };
  const query = securityAuditExportLifecycleReplayInvariantQuery(options, actorId.value);
  const restPath =
    mode === "materialized"
      ? `/api/v1/projects/${encodeURIComponent(
          projectId.value
        )}/security/audit/export/lifecycle/replay/invariants/materialized`
      : `/api/v1/projects/${encodeURIComponent(
          projectId.value
        )}/security/audit/export/lifecycle/replay/invariants`;

  return summarizeSecurityAuditExportLifecycleReplayInvariantRead(
    await fetchApiValue(argumentsValue.apiUrl, withQuery(restPath, query), {
      headers: {
        "X-TestHistory-Scopes": "security:audit:read",
        "X-TestHistory-Project-Scope": projectId.value,
        "X-TestHistory-Actor-Id": actorId.value
      }
    }),
    options,
    { projectId: projectId.value, actorId: actorId.value, mode }
  );
}

function securityAuditExportLifecycleReplayInvariantQuery(
  options: ResourceReadOptions,
  actorId: string
): Record<string, string | undefined> {
  return {
    actorId,
    limit: String(options.limit),
    cursor: options.cursor
  };
}

function summarizeSecurityAuditExportLifecycleReplayInvariantRead(
  value: unknown,
  options: ResourceReadOptions,
  scope: { projectId: string; actorId: string; mode: "replay" | "materialized" }
): unknown {
  if (isApiStatusPayload(value)) {
    return sanitizeSecurityAuditExportLifecycleStatus(value, scope.mode);
  }

  if (!isRecord(value)) {
    return value;
  }

  const items = arrayField(value, "items");
  const localPage = isRecord(value.page) ? undefined : paginateItems(items, options);
  const returnedItems = localPage?.items ?? items;
  const page = isRecord(value.page)
    ? normalizePageMetadata(value.page, options, returnedItems.length)
    : (localPage?.metadata ?? pageMetadata(items.length, 0, items.length, options.limit));

  return {
    kind:
      scope.mode === "materialized"
        ? "security-audit-export-lifecycle-replay-invariants-materialized"
        : "security-audit-export-lifecycle-replay-invariants",
    project: sanitizeSecurityAuditExportLifecycleProject(value.project, scope.projectId),
    actor: sanitizeSecurityAuditExportLifecycleActor(value.actor, scope.actorId),
    access: sanitizeSecurityAuditExportLifecycleAccess(),
    replay: sanitizeSecurityAuditExportLifecycleReplay(value.replay),
    execution: sanitizeSecurityAuditExportLifecycleExecution(),
    page,
    summary: sanitizeSecurityAuditExportLifecycleSummary(value.summary),
    invariants: sanitizeSecurityAuditExportLifecycleInvariants(),
    items: returnedItems.map((item) => sanitizeSecurityAuditExportLifecycleItem(item)),
    policy: securityAuditExportLifecycleReplayInvariantPolicy(scope.mode)
  };
}

function sanitizeSecurityAuditExportLifecycleStatus(
  value: Record<string, unknown>,
  mode: "replay" | "materialized" = "replay"
): unknown {
  return pickDefined(
    {
      status: value.status,
      code: numericField(value, "code"),
      message:
        typeof value.message === "string"
          ? sanitizeSecurityAuditExportLifecycleText(value.message)
          : undefined,
      permissionDenied: sanitizeSecurityAuditExportLifecycleDenied(value.permissionDenied),
      policy: securityAuditExportLifecycleReplayInvariantPolicy(mode)
    },
    ["status", "code", "message", "permissionDenied", "policy"]
  );
}

function sanitizeSecurityAuditExportLifecycleProject(
  value: unknown,
  fallbackProjectId: string
): Record<string, unknown> {
  return {
    id: sanitizeSecurityAuditExportLifecycleText(
      isRecord(value) && typeof value.id === "string" ? value.id : fallbackProjectId
    ),
    scoped: true
  };
}

function sanitizeSecurityAuditExportLifecycleActor(
  value: unknown,
  fallbackActorId: string
): Record<string, unknown> {
  return {
    id: sanitizeSecurityAuditExportLifecycleText(
      isRecord(value) && typeof value.id === "string" ? value.id : fallbackActorId
    ),
    scoped: true
  };
}

function sanitizeSecurityAuditExportLifecycleAccess(): Record<string, unknown> {
  return {
    scope: "security:audit:read",
    projectScoped: true,
    actorScoped: true,
    mutation: false,
    redacted: true
  };
}

function sanitizeSecurityAuditExportLifecycleReplay(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) {
    return {
      status: "empty",
      eventCount: 0,
      requestCount: 0,
      duplicateCount: 0,
      ignoredCount: 0,
      projectionDigest: "",
      appendOnly: true,
      deterministic: true,
      recomputable: true,
      rawEventsExposed: false,
      rawRequestsExposed: false,
      providerNeutral: true
    };
  }

  return {
    status: value.status === "replayed" ? "replayed" : "empty",
    eventCount: integerField(value, "eventCount") ?? 0,
    requestCount: integerField(value, "requestCount") ?? 0,
    duplicateCount: integerField(value, "duplicateCount") ?? 0,
    ignoredCount: integerField(value, "ignoredCount") ?? 0,
    projectionDigest: sanitizeSecurityAuditExportLifecycleText(
      stringField(value, "projectionDigest")
    ),
    appendOnly: true,
    deterministic: true,
    recomputable: true,
    rawEventsExposed: false,
    rawRequestsExposed: false,
    providerNeutral: true
  };
}

function sanitizeSecurityAuditExportLifecycleExecution(): Record<string, unknown> {
  return {
    exportStarted: false,
    providerIntegration: false,
    providerEndpointContacted: false,
    credentialsResolved: false,
    signedUrlsIssued: false,
    destinationResolved: false
  };
}

function sanitizeSecurityAuditExportLifecycleSummary(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) {
    return {
      totalRequests: 0,
      requested: 0,
      evaluated: 0,
      approved: 0,
      denied: 0,
      cancelled: 0,
      expired: 0
    };
  }

  return {
    totalRequests: integerField(value, "totalRequests") ?? 0,
    requested: integerField(value, "requested") ?? 0,
    evaluated: integerField(value, "evaluated") ?? 0,
    approved: integerField(value, "approved") ?? 0,
    denied: integerField(value, "denied") ?? 0,
    cancelled: integerField(value, "cancelled") ?? 0,
    expired: integerField(value, "expired") ?? 0
  };
}

function sanitizeSecurityAuditExportLifecycleInvariants(): Record<string, unknown> {
  return {
    appendOnly: true,
    deterministic: true,
    projectScoped: true,
    actorScoped: true,
    redacted: true,
    mutationFree: true,
    providerNeutral: true,
    rawEventsExposed: false,
    rawRequestsExposed: false,
    providerEndpointsContacted: false,
    signedUrlsIssued: false,
    secretsExposed: false
  };
}

function sanitizeSecurityAuditExportLifecycleItem(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) {
    return {};
  }

  return pickDefined(
    {
      requestId: sanitizeSecurityAuditExportLifecycleText(stringField(value, "requestId")),
      status: sanitizeSecurityAuditExportLifecycleState(value.status),
      eventCount: integerField(value, "eventCount") ?? 0,
      lastEventAt: typeof value.lastEventAt === "string" ? value.lastEventAt : undefined,
      actorIds: sanitizeSecurityAuditExportLifecycleStringList(arrayField(value, "actorIds")),
      decisionStatus:
        value.decisionStatus === "allowed" || value.decisionStatus === "denied"
          ? value.decisionStatus
          : undefined,
      reasonCodes: sanitizeSecurityAuditExportLifecycleStringList(arrayField(value, "reasonCodes")),
      timeline: sanitizeSecurityAuditExportLifecycleTimeline(value.timeline)
    },
    [
      "requestId",
      "status",
      "eventCount",
      "lastEventAt",
      "actorIds",
      "decisionStatus",
      "reasonCodes",
      "timeline"
    ]
  );
}

function sanitizeSecurityAuditExportLifecycleState(value: unknown): string {
  return typeof value === "string" &&
    ["requested", "evaluated", "approved", "denied", "cancelled", "expired"].includes(value)
    ? value
    : "requested";
}

function sanitizeSecurityAuditExportLifecycleTimeline(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) {
    return {};
  }

  return pickDefined(
    {
      requestedAt: typeof value.requestedAt === "string" ? value.requestedAt : undefined,
      evaluatedAt: typeof value.evaluatedAt === "string" ? value.evaluatedAt : undefined,
      decidedAt: typeof value.decidedAt === "string" ? value.decidedAt : undefined,
      cancelledAt: typeof value.cancelledAt === "string" ? value.cancelledAt : undefined,
      expiredAt: typeof value.expiredAt === "string" ? value.expiredAt : undefined
    },
    ["requestedAt", "evaluatedAt", "decidedAt", "cancelledAt", "expiredAt"]
  );
}

function sanitizeSecurityAuditExportLifecycleDenied(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeSecurityAuditExportLifecycleDenied(item));
  }
  if (typeof value === "string") {
    return sanitizeSecurityAuditExportLifecycleText(value);
  }
  if (!isRecord(value)) {
    return value;
  }

  const safe: Record<string, unknown> = {};
  for (const [key, fieldValue] of Object.entries(value)) {
    if (isUnsafeSecurityAuditExportLifecycleFieldKey(key)) {
      continue;
    }
    safe[key] = sanitizeSecurityAuditExportLifecycleDenied(fieldValue);
  }
  return safe;
}

function sanitizeSecurityAuditExportLifecycleStringList(value: unknown[]): string[] {
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => sanitizeSecurityAuditExportLifecycleText(item));
}

function sanitizeSecurityAuditExportLifecycleText(value: string): string {
  return sanitizeExportText(value);
}

function isUnsafeSecurityAuditExportLifecycleFieldKey(key: string): boolean {
  const normalized = key.toLowerCase();
  return (
    isUnsafeExportFieldKey(key) ||
    normalized.includes("lifecycleevent") ||
    normalized === "events" ||
    normalized === "request" ||
    normalized.includes("requestpayload") ||
    normalized.includes("provider") ||
    normalized.includes("endpoint") ||
    normalized.includes("signedurl") ||
    normalized.includes("credential") ||
    normalized.includes("execution")
  );
}

function securityAuditExportLifecycleReplayInvariantPolicy(
  mode: "replay" | "materialized" = "replay"
): Record<string, unknown> {
  const materialized = mode === "materialized";
  return {
    restParity: {
      method: "GET",
      path: materialized
        ? "/api/v1/projects/{projectId}/security/audit/export/lifecycle/replay/invariants/materialized"
        : "/api/v1/projects/{projectId}/security/audit/export/lifecycle/replay/invariants"
    },
    projectIdRequired: true,
    actorIdRequired: true,
    headersForwarded: [
      "X-TestHistory-Scopes",
      "X-TestHistory-Project-Scope",
      "X-TestHistory-Actor-Id"
    ],
    equalOrNarrowerThanRest: true,
    providerNeutral: true,
    mutationAllowed: false,
    mcpReplayExecution: false,
    rawLifecycleEventsIncluded: false,
    rawRequestPayloadsIncluded: false,
    providerEndpointsIncluded: false,
    signedUrlsIncluded: false,
    credentialReferencesIncluded: false,
    redactionRules: [
      materialized
        ? "MCP reads the REST materialized lifecycle replay invariant model and never starts exports, resolves destinations, contacts providers, or executes replay work."
        : "MCP reads the REST lifecycle replay invariant model and never starts exports or executes replay work.",
      "Project and actor scope are required and forwarded to REST; MCP does not broaden either scope.",
      "Only invariant booleans, lifecycle counters, digest, page metadata, request ids, statuses, reason codes, actor ids, and timestamps are returned.",
      "Raw lifecycle events, request payloads, provider endpoints, signed URLs, local paths, tokens, cookies, credentials, and destination references are omitted or redacted.",
      materialized
        ? "No materialized invariant refresh, export start, retry, credential resolution, destination resolution, provider call, artifact creation, worker execution, or mutation tool is advertised."
        : "No lifecycle replay refresh, export start, retry, credential resolution, provider call, artifact creation, or mutation tool is advertised."
    ]
  };
}
