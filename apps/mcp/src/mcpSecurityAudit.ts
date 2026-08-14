import { attachmentBlobFieldNames } from "./mcpPreviewConstants.js";
import { fetchApiValue } from "./mcpApiClient.js";
import { normalizePageMetadata, pageMetadata, paginateItems } from "./mcpPagination.js";
import type { ResourceReadOptions } from "./mcpReadOptions.js";
import { sanitizeStringArray } from "./mcpSanitizeText.js";
import { truncateCompareText } from "./mcpHistoryCompare.js";
import {
  arrayField,
  cursorOffset,
  getRequiredString,
  integerField,
  isApiStatusPayload,
  isRecord,
  isSensitiveKey,
  optionalPositiveInteger,
  optionalString,
  pickDefined,
  stringField,
  withQuery
} from "./mcpValueUtils.js";

function sanitizeAuditText(value: string): string {
  return truncateCompareText(value);
}

export async function securityAuditRead(
  argumentsValue: Record<string, unknown>
): Promise<unknown | string> {
  const projectId = getRequiredString(argumentsValue, "projectId");
  if (projectId.error !== undefined) {
    return "projectId is required for security audit reads";
  }

  const options: ResourceReadOptions = {
    includeDetails: false,
    includeRaw: false,
    limit: optionalPositiveInteger(argumentsValue.limit, 100, 500),
    cursor: optionalString(argumentsValue.cursor),
    offset: cursorOffset(optionalString(argumentsValue.cursor))
  };
  const query = securityAuditQuery(argumentsValue, projectId.value, options);
  return summarizeSecurityAuditRead(
    await fetchApiValue(argumentsValue.apiUrl, withQuery("/api/v1/security/audit", query), {
      headers: {
        "X-TestHistory-Scopes": "security:audit:read",
        "X-TestHistory-Project-Scope": projectId.value
      }
    }),
    options,
    { projectId: projectId.value, query }
  );
}

function securityAuditQuery(
  value: Record<string, unknown>,
  projectId: string,
  options: ResourceReadOptions
): Record<string, string | undefined> {
  return {
    projectId,
    type: optionalString(value.type),
    outcome: optionalString(value.outcome),
    severity: optionalString(value.severity),
    limit: String(options.limit),
    cursor: options.cursor
  };
}

function summarizeSecurityAuditRead(
  value: unknown,
  options: ResourceReadOptions,
  scope: { projectId: string; query: Record<string, string | undefined> }
): unknown {
  if (isApiStatusPayload(value)) {
    return value;
  }

  if (!isRecord(value) && !Array.isArray(value)) {
    return value;
  }

  const events = Array.isArray(value)
    ? value
    : arrayField(value, "items").length > 0
      ? arrayField(value, "items")
      : arrayField(value, "events");
  const localPage = Array.isArray(value) ? paginateItems(events, options) : undefined;
  const apiPage = isRecord(value) && isRecord(value.page) ? value.page : undefined;
  const returnedEvents = localPage?.items ?? events;
  const page =
    apiPage !== undefined
      ? normalizePageMetadata(apiPage, options, returnedEvents.length)
      : (localPage?.metadata ?? pageMetadata(events.length, 0, events.length, options.limit));

  return {
    kind: "security-audit-list",
    projectId: sanitizeAuditText(
      isRecord(value) && typeof value.projectId === "string" ? value.projectId : scope.projectId
    ),
    access: sanitizeSecurityAuditAccess(),
    query: {
      projectId: sanitizeAuditText(scope.query.projectId ?? scope.projectId),
      type: scope.query.type,
      outcome: scope.query.outcome,
      severity: scope.query.severity,
      limit: options.limit,
      cursor: options.cursor ?? null
    },
    page,
    summary: sanitizeSecurityAuditSummary(isRecord(value) ? value.summary : undefined),
    items: returnedEvents.map((event) => sanitizeSecurityAuditEvent(event)),
    policy: securityAuditReadPolicy()
  };
}

function sanitizeSecurityAuditAccess(): Record<string, unknown> {
  return {
    scope: "security:audit:read",
    projectScoped: true,
    mutation: false,
    redacted: true
  };
}

function sanitizeSecurityAuditSummary(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) {
    return {
      total: 0,
      allowed: 0,
      denied: 0,
      failed: 0,
      byType: {},
      byOutcome: {},
      bySeverity: {},
      actorIds: [],
      resourceIds: []
    };
  }

  return pickDefined(
    {
      total: integerField(value, "total") ?? 0,
      allowed: integerField(value, "allowed") ?? 0,
      denied: integerField(value, "denied") ?? 0,
      failed: integerField(value, "failed") ?? 0,
      byType: sanitizeCountMap(value.byType),
      byOutcome: sanitizeCountMap(value.byOutcome),
      bySeverity: sanitizeCountMap(value.bySeverity),
      actorIds: sanitizeStringArray(arrayField(value, "actorIds")),
      resourceIds: sanitizeStringArray(arrayField(value, "resourceIds")),
      firstOccurredAt: value.firstOccurredAt,
      lastOccurredAt: value.lastOccurredAt
    },
    [
      "total",
      "allowed",
      "denied",
      "failed",
      "byType",
      "byOutcome",
      "bySeverity",
      "actorIds",
      "resourceIds",
      "firstOccurredAt",
      "lastOccurredAt"
    ]
  );
}

function sanitizeCountMap(value: unknown): Record<string, number> {
  if (!isRecord(value)) {
    return {};
  }

  const counts: Record<string, number> = {};
  for (const [key, count] of Object.entries(value)) {
    if (typeof count === "number" && Number.isInteger(count) && count >= 0) {
      counts[sanitizeAuditText(key)] = count;
    }
  }
  return counts;
}

function sanitizeSecurityAuditEvent(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) {
    return {};
  }

  return pickDefined(
    {
      schemaVersion: integerField(value, "schemaVersion") ?? 1,
      id: sanitizeAuditText(stringField(value, "id")),
      fingerprint: sanitizeAuditText(stringField(value, "fingerprint")),
      projectId: sanitizeAuditText(stringField(value, "projectId")),
      type: optionalString(value.type),
      outcome: optionalString(value.outcome),
      severity: optionalString(value.severity),
      occurredAt: value.occurredAt,
      actor: sanitizeSecurityAuditActor(value.actor),
      resource: sanitizeSecurityAuditResource(value.resource),
      request: sanitizeSecurityAuditRequest(value.request),
      reason: typeof value.reason === "string" ? truncateCompareText(value.reason) : undefined,
      metadata: sanitizeSecurityAuditMetadata(value.metadata)
    },
    [
      "schemaVersion",
      "id",
      "fingerprint",
      "projectId",
      "type",
      "outcome",
      "severity",
      "occurredAt",
      "actor",
      "resource",
      "request",
      "reason",
      "metadata"
    ]
  );
}

function sanitizeSecurityAuditActor(value: unknown): unknown {
  if (!isRecord(value)) {
    return undefined;
  }

  return pickDefined(
    {
      type: optionalString(value.type),
      actorId: typeof value.actorId === "string" ? sanitizeAuditText(value.actorId) : undefined,
      serviceId:
        typeof value.serviceId === "string" ? sanitizeAuditText(value.serviceId) : undefined,
      systemId: typeof value.systemId === "string" ? sanitizeAuditText(value.systemId) : undefined,
      externalId:
        typeof value.externalId === "string" ? sanitizeAuditText(value.externalId) : undefined,
      displayName:
        typeof value.displayName === "string" ? sanitizeAuditText(value.displayName) : undefined
    },
    ["type", "actorId", "serviceId", "systemId", "externalId", "displayName"]
  );
}

function sanitizeSecurityAuditResource(value: unknown): unknown {
  if (!isRecord(value)) {
    return undefined;
  }

  return pickDefined(
    {
      type: optionalString(value.type),
      id: typeof value.id === "string" ? sanitizeAuditText(value.id) : undefined,
      name: typeof value.name === "string" ? sanitizeAuditText(value.name) : undefined
    },
    ["type", "id", "name"]
  );
}

function sanitizeSecurityAuditRequest(value: unknown): unknown {
  if (!isRecord(value)) {
    return undefined;
  }

  return pickDefined(
    {
      requestId:
        typeof value.requestId === "string" ? sanitizeAuditText(value.requestId) : undefined,
      traceId: typeof value.traceId === "string" ? sanitizeAuditText(value.traceId) : undefined,
      method: optionalString(value.method),
      route: typeof value.route === "string" ? sanitizeAuditText(value.route) : undefined
    },
    ["requestId", "traceId", "method", "route"]
  );
}

function sanitizeSecurityAuditMetadata(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeSecurityAuditMetadata(item));
  }
  if (!isRecord(value)) {
    return typeof value === "string" ? sanitizeAuditText(value) : value;
  }

  const metadata: Record<string, unknown> = {};
  for (const [key, fieldValue] of Object.entries(value)) {
    if (attachmentBlobFieldNames.has(key)) {
      continue;
    }
    if (isSensitiveKey(key)) {
      metadata[key] = "[redacted]";
      continue;
    }
    metadata[key] = sanitizeSecurityAuditMetadata(fieldValue);
  }
  return metadata;
}

function securityAuditReadPolicy(): Record<string, unknown> {
  return {
    restParity: {
      method: "GET",
      path: "/api/v1/security/audit"
    },
    projectIdRequired: true,
    headersForwarded: ["X-TestHistory-Scopes", "X-TestHistory-Project-Scope"],
    equalOrNarrowerThanRest: true,
    mutationAllowed: false,
    rawPayloadsIncluded: false,
    redactionRules: [
      "MCP requires projectId and forwards REST audit scope/project headers for the requested project only.",
      "Request IP address and user agent are omitted from MCP audit events.",
      "Raw payload-like, storage, path, URL, signed URL, token, cookie, password, and authorization fields are omitted or redacted.",
      "Free text that looks credential-bearing is replaced with [redacted] and long text is bounded."
    ]
  };
}
