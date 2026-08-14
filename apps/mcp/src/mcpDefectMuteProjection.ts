import { fetchApiValue } from "./mcpApiClient.js";
import {
  compactMuteAffectedQualityGateReason,
  sanitizeDefectMuteEffect,
  sanitizeDefectMuteOrigin,
  sanitizeDefectMuteScope
} from "./mcpDefectMuteStatus.js";
import { normalizePageMetadata, pageMetadata, paginateItems } from "./mcpPagination.js";
import type { ResourceReadOptions } from "./mcpReadOptions.js";
import { sanitizeStringArray } from "./mcpSanitizeText.js";
import {
  defectMuteProjectionHeaders,
  sanitizeDefectMuteProjectionAccess,
  sanitizeNumericRecord,
  sanitizeProjectionDenied,
  sanitizeProjectionText
} from "./mcpDefectMuteProjectionShared.js";
import {
  arrayField,
  cursorOffset,
  getRequiredString,
  integerField,
  integerStringField,
  isApiStatusPayload,
  isRecord,
  numericField,
  optionalPositiveInteger,
  optionalString,
  pickDefined,
  stringField,
  withQuery
} from "./mcpValueUtils.js";

export async function defectMuteProjectionRead(
  argumentsValue: Record<string, unknown>
): Promise<unknown | string> {
  const projectId = getRequiredString(argumentsValue, "projectId");
  if (projectId.error !== undefined) {
    return "projectId is required for defect mute projection reads";
  }

  const status = optionalString(argumentsValue.status);
  if (status !== undefined && status !== "active" && status !== "inactive") {
    return "status must be active or inactive";
  }

  const options: ResourceReadOptions = {
    includeDetails: false,
    includeRaw: false,
    limit: optionalPositiveInteger(argumentsValue.limit, 100, 500),
    cursor: optionalString(argumentsValue.cursor),
    offset: cursorOffset(optionalString(argumentsValue.cursor))
  };
  const actorId = optionalString(argumentsValue.actorId);
  const launchId = optionalString(argumentsValue.launchId);
  const query = defectMuteProjectionQuery(argumentsValue, options, actorId, launchId, status);
  return summarizeDefectMuteProjectionRead(
    await fetchApiValue(
      argumentsValue.apiUrl,
      withQuery(
        `/api/v1/projects/${encodeURIComponent(projectId.value)}/defect-mutes/projection`,
        query
      ),
      { headers: defectMuteProjectionHeaders(projectId.value, actorId) }
    ),
    options,
    { projectId: projectId.value, actorId, launchId, query }
  );
}

export function defectMuteProjectionQuery(
  _value: Record<string, unknown>,
  options: ResourceReadOptions,
  actorId: string | undefined,
  launchId: string | undefined,
  status: string | undefined
): Record<string, string | undefined> {
  return {
    actorId,
    launchId,
    status,
    limit: String(options.limit),
    cursor: options.cursor
  };
}

export function summarizeDefectMuteProjectionRead(
  value: unknown,
  options: ResourceReadOptions,
  scope: {
    projectId: string;
    actorId: string | undefined;
    launchId: string | undefined;
    query: Record<string, string | undefined>;
  }
): unknown {
  if (isApiStatusPayload(value)) {
    return sanitizeDefectMuteProjectionStatus(value);
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
  const qualityGate =
    isRecord(value.qualityGate) && scope.launchId !== undefined
      ? sanitizeProjectionQualityGate(value.qualityGate)
      : undefined;

  return {
    kind: "defect-mute-projection",
    compact: true,
    scope: defectMuteProjectionScope(scope),
    access: sanitizeDefectMuteProjectionAccess(value.access, scope.actorId),
    query: defectMuteProjectionQueryMetadata(scope.query, scope.projectId, options),
    projection: sanitizeDefectMuteProjectionMetadata(value.projection),
    page,
    rawFailureHistory: sanitizeProjectionRawFailureHistory(value.rawFailureHistory),
    ...(qualityGate !== undefined ? { qualityGate } : {}),
    items: returnedItems.map((item) => sanitizeDefectMuteProjectionRecord(item)),
    policy: defectMuteProjectionReadPolicy()
  };
}

export function sanitizeDefectMuteProjectionStatus(value: Record<string, unknown>): unknown {
  if (!isRecord(value)) {
    return value;
  }

  return pickDefined(
    {
      status: value.status,
      code: numericField(value, "code"),
      message:
        typeof value.message === "string" ? sanitizeProjectionText(value.message) : undefined,
      permissionDenied: sanitizeProjectionDenied(value.permissionDenied),
      policy: defectMuteProjectionReadPolicy()
    },
    ["status", "code", "message", "permissionDenied", "policy"]
  );
}

export function defectMuteProjectionScope(scope: {
  projectId: string;
  actorId: string | undefined;
  launchId: string | undefined;
}): Record<string, unknown> {
  return pickDefined(
    {
      projectId: sanitizeProjectionText(scope.projectId),
      actorId: scope.actorId !== undefined ? sanitizeProjectionText(scope.actorId) : undefined,
      launchId: scope.launchId !== undefined ? sanitizeProjectionText(scope.launchId) : undefined
    },
    ["projectId", "actorId", "launchId"]
  );
}

export function defectMuteProjectionQueryMetadata(
  query: Record<string, string | undefined>,
  projectId: string,
  options: ResourceReadOptions
): Record<string, unknown> {
  return pickDefined(
    {
      projectId: sanitizeProjectionText(projectId),
      actorId: query.actorId !== undefined ? sanitizeProjectionText(query.actorId) : undefined,
      launchId: query.launchId !== undefined ? sanitizeProjectionText(query.launchId) : undefined,
      status: query.status,
      limit: integerStringField(query.limit) ?? options.limit,
      cursor: query.cursor ?? null
    },
    ["projectId", "actorId", "launchId", "status", "limit", "cursor"]
  );
}

export function sanitizeDefectMuteProjectionMetadata(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) {
    return {
      source: "rest-defect-mute-projection-read",
      mutationBoundary: "worker-projection-only-no-rest-mutation",
      mcpReplayExecution: false,
      eventCount: 0,
      activeMuteCount: 0,
      inactiveMuteCount: 0,
      rawFailureOccurrenceCount: 0
    };
  }

  return pickDefined(
    {
      source: "rest-defect-mute-projection-read",
      adapterKind: sanitizeProjectionText(stringField(value, "adapterKind")),
      boundary: sanitizeProjectionText(stringField(value, "boundary")),
      consistency: sanitizeProjectionText(stringField(value, "consistency")),
      restReplayStatus: sanitizeProjectionText(stringField(value, "replayStatus")),
      projectionDigest: sanitizeProjectionText(stringField(value, "projectionDigest")),
      mutationBoundary: "worker-projection-only-no-rest-mutation",
      mcpReplayExecution: false,
      eventCount: integerField(value, "eventCount") ?? 0,
      mutedEventCount: integerField(value, "mutedEventCount") ?? 0,
      unmutedEventCount: integerField(value, "unmutedEventCount") ?? 0,
      activeMuteCount: integerField(value, "activeMuteCount") ?? 0,
      inactiveMuteCount: integerField(value, "inactiveMuteCount") ?? 0,
      rawFailureOccurrenceCount: integerField(value, "rawFailureOccurrenceCount") ?? 0,
      firstOccurredAt: optionalString(value.firstOccurredAt),
      lastOccurredAt: optionalString(value.lastOccurredAt)
    },
    [
      "source",
      "adapterKind",
      "boundary",
      "consistency",
      "restReplayStatus",
      "projectionDigest",
      "mutationBoundary",
      "mcpReplayExecution",
      "eventCount",
      "mutedEventCount",
      "unmutedEventCount",
      "activeMuteCount",
      "inactiveMuteCount",
      "rawFailureOccurrenceCount",
      "firstOccurredAt",
      "lastOccurredAt"
    ]
  );
}

export function sanitizeProjectionRawFailureHistory(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) {
    return { totalOccurrences: 0 };
  }

  return pickDefined(
    {
      totalOccurrences: integerField(value, "totalOccurrences") ?? 0,
      statusCounters: sanitizeNumericRecord(value.statusCounters),
      byTestId: sanitizeProjectionCounterRecord(value.byTestId),
      bySignatureHash: sanitizeProjectionCounterRecord(value.bySignatureHash)
    },
    ["totalOccurrences", "statusCounters", "byTestId", "bySignatureHash"]
  );
}

export function sanitizeProjectionCounterRecord(
  value: unknown
): Record<string, number> | undefined {
  const sanitized = sanitizeNumericRecord(value, sanitizeProjectionText);
  return Object.keys(sanitized).length > 0 ? sanitized : undefined;
}

export function sanitizeProjectionQualityGate(value: unknown): Record<string, unknown> | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const raw = sanitizeProjectionQualityGateRaw(value.raw);
  const effective = sanitizeProjectionQualityGateEffective(value.effective);
  return pickDefined(
    {
      launchId: sanitizeProjectionText(stringField(value, "launchId")),
      raw,
      effective,
      distinction:
        typeof value.distinction === "string"
          ? sanitizeProjectionText(value.distinction)
          : undefined
    },
    ["launchId", "raw", "effective", "distinction"]
  );
}

export function sanitizeProjectionQualityGateRaw(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) {
    return {};
  }

  return pickDefined(
    {
      status: optionalString(value.status),
      metrics: sanitizeProjectionNumberMap(value.metrics),
      statusCounters: sanitizeNumericRecord(value.statusCounters)
    },
    ["status", "metrics", "statusCounters"]
  );
}

export function sanitizeProjectionQualityGateEffective(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) {
    return {};
  }

  return pickDefined(
    {
      status: optionalString(value.status),
      effects: arrayField(value, "effects")
        .map((effect) => sanitizeDefectMuteEffect(effect))
        .filter((effect) => Object.keys(effect).length > 0),
      reasons: arrayField(value, "reasons")
        .map((reason) => compactMuteAffectedQualityGateReason(reason))
        .filter((reason) => Object.keys(reason).length > 0)
    },
    ["status", "effects", "reasons"]
  );
}

export function sanitizeProjectionNumberMap(value: unknown): Record<string, number> | undefined {
  const sanitized = sanitizeNumericRecord(value, sanitizeProjectionText);
  return Object.keys(sanitized).length > 0 ? sanitized : undefined;
}

export function sanitizeDefectMuteProjectionRecord(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) {
    return {};
  }

  return pickDefined(
    {
      id: sanitizeProjectionText(stringField(value, "id")),
      projectId: sanitizeProjectionText(stringField(value, "projectId")),
      status: optionalString(value.status),
      origin: sanitizeDefectMuteOrigin(value.origin),
      mutedAt: optionalString(value.mutedAt),
      unmutedAt: optionalString(value.unmutedAt),
      unmutedBy: sanitizeDefectMuteOrigin(value.unmutedBy),
      scope: sanitizeDefectMuteScope(value.scope),
      affectedSignatureHashes: sanitizeStringArray(arrayField(value, "affectedSignatureHashes")),
      affectedTestIds: sanitizeStringArray(arrayField(value, "affectedTestIds")),
      rawFailureHistory: sanitizeProjectionRawFailureHistory(value.rawFailureHistory),
      audit: sanitizeDefectMuteProjectionAudit(value.audit)
    },
    [
      "id",
      "projectId",
      "status",
      "origin",
      "mutedAt",
      "unmutedAt",
      "unmutedBy",
      "scope",
      "affectedSignatureHashes",
      "affectedTestIds",
      "rawFailureHistory",
      "audit"
    ]
  );
}

export function sanitizeDefectMuteProjectionAudit(
  value: unknown
): Record<string, number> | undefined {
  const audit = sanitizeNumericRecord(value);
  return Object.keys(audit).length > 0 ? audit : undefined;
}

export function defectMuteProjectionReadPolicy(): Record<string, unknown> {
  return {
    restParity: {
      method: "GET",
      path: "/api/v1/projects/{projectId}/defect-mutes/projection"
    },
    headersForwarded: [
      "X-TestHistory-Scopes",
      "X-TestHistory-Project-Scope",
      "X-TestHistory-Actor-Id"
    ],
    equalOrNarrowerThanRest: true,
    mutationAllowed: false,
    mcpReplayExecution: false,
    replayDerivedReadModel: true,
    rawFailurePayloadsIncluded: false,
    rawEffectiveSeparation: true,
    redactionRules: [
      "MCP reads the REST defect mute projection read model and never executes replay work.",
      "Project and optional actor scope are forwarded to REST; MCP does not broaden scope.",
      "Raw failure counters remain separate from effective quality-gate fields.",
      "Raw payload, trace, path, storage key, URL, token, cookie, password, and authorization fields are omitted or redacted.",
      "No defect mute create, delete, unmute, replay, or projection mutation tool is advertised."
    ]
  };
}
