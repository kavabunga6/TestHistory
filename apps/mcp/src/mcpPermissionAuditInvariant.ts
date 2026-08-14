import { fetchApiValue } from "./mcpApiClient.js";
import {
  compareScalarText,
  sanitizeCompareAvailabilityStatus,
  sanitizeCompareUrl
} from "./mcpHistoryCompare.js";
import { normalizePageMetadata, pageMetadata, paginateItems } from "./mcpPagination.js";
import { compactOptions, defaultResultLimit, type ResourceReadOptions } from "./mcpReadOptions.js";
import {
  sanitizePermissionAuditActor,
  sanitizePermissionAuditCode,
  sanitizePermissionAuditText
} from "./mcpPermissionAudit.js";
import {
  arrayField,
  getRequiredString,
  integerField,
  isApiStatusPayload,
  isRecord,
  numericField,
  optionalString,
  pickDefined,
  stringField,
  withQuery
} from "./mcpValueUtils.js";

export async function historyComparePermissionAuditInvariantRead(
  argumentsValue: Record<string, unknown>,
  mode: "replay" | "persisted" = "replay"
): Promise<unknown | string> {
  const testCaseId = getRequiredString(argumentsValue, "testCaseId");
  if (testCaseId.error !== undefined) {
    return testCaseId.error;
  }

  const projectId = getRequiredString(argumentsValue, "projectId");
  if (projectId.error !== undefined) {
    return "projectId is required for history compare permission audit invariant reads";
  }

  const actorId = getRequiredString(argumentsValue, "actorId");
  if (actorId.error !== undefined) {
    return "actorId is required for history compare permission audit invariant reads";
  }

  const baseResultUuid = optionalString(argumentsValue.baseResultUuid);
  const targetResultUuid = optionalString(argumentsValue.targetResultUuid);
  if (baseResultUuid !== undefined && targetResultUuid === undefined) {
    return "targetResultUuid is required when baseResultUuid is provided";
  }
  if (targetResultUuid !== undefined && baseResultUuid === undefined) {
    return "baseResultUuid is required when targetResultUuid is provided";
  }
  if (
    baseResultUuid !== undefined &&
    targetResultUuid !== undefined &&
    baseResultUuid === targetResultUuid
  ) {
    return "baseResultUuid and targetResultUuid must differ";
  }

  const options = compactOptions(argumentsValue);
  const restPath =
    mode === "persisted"
      ? `/api/v1/test-cases/${encodeURIComponent(
          testCaseId.value
        )}/history/compare/permission-audit/replay/invariants/persisted`
      : `/api/v1/test-cases/${encodeURIComponent(
          testCaseId.value
        )}/history/compare/permission-audit/replay/invariants`;
  return summarizeHistoryComparePermissionAuditInvariantRead(
    await fetchApiValue(
      argumentsValue.apiUrl,
      withQuery(restPath, {
        projectId: projectId.value,
        baseResultUuid,
        targetResultUuid,
        limit: String(options.limit),
        cursor: options.cursor
      }),
      {
        headers: {
          "X-TestHistory-Scopes": "test-cases:read",
          "X-TestHistory-Project-Scope": projectId.value,
          "X-TestHistory-Actor-Id": actorId.value
        }
      }
    ),
    options,
    {
      testCaseId: testCaseId.value,
      projectId: projectId.value,
      actorId: actorId.value,
      comparePairScoped: baseResultUuid !== undefined && targetResultUuid !== undefined,
      mode
    }
  );
}

function summarizeHistoryComparePermissionAuditInvariantRead(
  value: unknown,
  options: ResourceReadOptions,
  scope: {
    testCaseId: string;
    projectId: string;
    actorId: string;
    comparePairScoped: boolean;
    mode: "replay" | "persisted";
  }
): unknown {
  if (isApiStatusPayload(value)) {
    return sanitizeHistoryComparePermissionAuditInvariantStatus(value, scope);
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
  const actor = sanitizePermissionAuditInvariantActor(value.actor, scope.actorId);

  return {
    kind:
      scope.mode === "persisted"
        ? "test-case-history-compare-permission-audit-replay-invariants-persisted"
        : "test-case-history-compare-permission-audit-replay-invariants",
    projectId: sanitizePermissionAuditText(
      typeof value.projectId === "string" ? value.projectId : scope.projectId
    ),
    testCaseId: sanitizePermissionAuditText(
      typeof value.testCaseId === "string" ? value.testCaseId : scope.testCaseId
    ),
    actor,
    access: sanitizePermissionAuditInvariantAccess(value.access),
    availability: sanitizePermissionAuditInvariantAvailability(value.availability),
    query: sanitizePermissionAuditInvariantQuery(value.query, scope, page),
    invariant: sanitizePermissionAuditInvariantEvidence(value.invariant, scope.actorId),
    appendOnly: sanitizePermissionAuditInvariantAppendOnly(value.appendOnly),
    rawCompareInputs: sanitizePermissionAuditInvariantRawCompareInputs(value.rawCompareInputs),
    redaction: sanitizePermissionAuditInvariantRedaction(value.redaction),
    page,
    items: returnedItems.map((item) => sanitizePermissionAuditInvariantItem(item)),
    policy: historyComparePermissionAuditInvariantReadPolicy(scope.mode)
  };
}

function sanitizeHistoryComparePermissionAuditInvariantStatus(
  value: Record<string, unknown>,
  scope: { testCaseId: string; projectId: string; actorId: string; mode: "replay" | "persisted" }
): unknown {
  return pickDefined(
    {
      status: value.status,
      code: numericField(value, "code"),
      message:
        typeof value.message === "string" ? sanitizePermissionAuditText(value.message) : undefined,
      url: typeof value.url === "string" ? sanitizeCompareUrl(value.url) : undefined,
      permissionDenied: sanitizePermissionAuditInvariantDenied(value.permissionDenied, scope),
      policy: historyComparePermissionAuditInvariantReadPolicy(scope.mode)
    },
    ["status", "code", "message", "url", "permissionDenied", "policy"]
  );
}

function sanitizePermissionAuditInvariantDenied(
  value: unknown,
  scope: { testCaseId: string; projectId: string; actorId: string; mode: "replay" | "persisted" }
): unknown {
  if (!isRecord(value)) {
    return value;
  }

  return pickDefined(
    {
      kind:
        value.kind === "test-case-history-compare-permission-audit-replay-invariants" ||
        value.kind === "test-case-history-compare-permission-audit-replay-invariants-persisted"
          ? scope.mode === "persisted"
            ? "test-case-history-compare-permission-audit-replay-invariants-persisted"
            : "test-case-history-compare-permission-audit-replay-invariants"
          : undefined,
      error: typeof value.error === "string" ? sanitizePermissionAuditCode(value.error) : undefined,
      message:
        typeof value.message === "string" ? sanitizePermissionAuditText(value.message) : undefined,
      requiredScopes: arrayField(value, "requiredScopes").map((item) =>
        sanitizePermissionAuditCode(compareScalarText(item))
      ),
      projectId: sanitizePermissionAuditText(
        typeof value.projectId === "string" ? value.projectId : scope.projectId
      ),
      testCaseId: sanitizePermissionAuditText(
        typeof value.testCaseId === "string" ? value.testCaseId : scope.testCaseId
      ),
      actor: sanitizePermissionAuditInvariantActor(value.actor, scope.actorId),
      access: sanitizePermissionAuditInvariantAccess(value.access),
      availability: sanitizePermissionAuditInvariantAvailability(value.availability, {
        status: "denied",
        partial: false
      }),
      token: value.token !== undefined ? "[redacted]" : undefined,
      redacted: true
    },
    [
      "kind",
      "error",
      "message",
      "requiredScopes",
      "projectId",
      "testCaseId",
      "actor",
      "access",
      "availability",
      "token",
      "redacted"
    ]
  );
}

function sanitizePermissionAuditInvariantActor(
  value: unknown,
  fallbackActorId: string
): Record<string, unknown> {
  const actor = sanitizePermissionAuditActor(value);
  return {
    type: "actor",
    actorId: sanitizePermissionAuditText(
      typeof actor.actorId === "string" ? actor.actorId : fallbackActorId
    ),
    scoped: true
  };
}

function sanitizePermissionAuditInvariantAccess(value: unknown): Record<string, unknown> {
  return {
    scope: "test-cases:read",
    projectScoped: true,
    actorScoped: true,
    mutation: false,
    redacted: true,
    ...(isRecord(value) && typeof value.reason === "string"
      ? { reason: sanitizePermissionAuditText(value.reason) }
      : {})
  };
}

function sanitizePermissionAuditInvariantAvailability(
  value: unknown,
  fallback?: { status?: string; partial?: boolean }
): Record<string, unknown> {
  return pickDefined(
    {
      status:
        isRecord(value) && typeof value.status === "string"
          ? sanitizeCompareAvailabilityStatus(value.status)
          : (fallback?.status ?? "ready"),
      reason:
        isRecord(value) && typeof value.reason === "string"
          ? sanitizePermissionAuditText(value.reason)
          : undefined,
      projectScoped: true,
      actorScoped: true,
      redacted: true,
      partial:
        isRecord(value) && typeof value.partial === "boolean"
          ? value.partial
          : (fallback?.partial ?? false),
      unavailable: isRecord(value)
        ? arrayField(value, "unavailable").map((item) =>
            sanitizePermissionAuditText(compareScalarText(item))
          )
        : []
    },
    ["status", "reason", "projectScoped", "actorScoped", "redacted", "partial", "unavailable"]
  );
}

function sanitizePermissionAuditInvariantQuery(
  value: unknown,
  scope: { projectId: string; testCaseId: string; actorId: string; comparePairScoped: boolean },
  page: Record<string, unknown>
): Record<string, unknown> {
  const source = isRecord(value) ? value : {};
  const pagination = isRecord(source.pagination) ? source.pagination : {};
  return {
    projectId: sanitizePermissionAuditText(stringField(source, "projectId") || scope.projectId),
    actorId: sanitizePermissionAuditText(stringField(source, "actorId") || scope.actorId),
    testCaseId: sanitizePermissionAuditText(stringField(source, "testCaseId") || scope.testCaseId),
    testCaseScoped: true,
    projectScoped: true,
    actorScoped: true,
    comparePairScoped:
      typeof source.comparePairScoped === "boolean"
        ? source.comparePairScoped
        : scope.comparePairScoped,
    pagination: {
      limit: integerField(pagination, "limit") ?? integerField(page, "limit") ?? defaultResultLimit,
      cursor:
        pagination.cursor === null
          ? null
          : (optionalString(pagination.cursor) ?? optionalString(page.cursor) ?? null),
      offset: integerField(pagination, "offset") ?? integerField(page, "offset") ?? 0
    },
    redacted: true
  };
}

function sanitizePermissionAuditInvariantEvidence(
  value: unknown,
  actorId: string
): Record<string, unknown> {
  const source = isRecord(value) ? value : {};
  return {
    boundary: "read-only-history-compare-permission-audit-replay-invariant",
    source: "in-memory-history-compare-permission-audit-wip",
    consistency: "append-only-replay",
    mutationBoundary: "rest-read-only-no-replay-mutation",
    deterministic: typeof source.deterministic === "boolean" ? source.deterministic : true,
    recomputable: typeof source.recomputable === "boolean" ? source.recomputable : true,
    projectScoped: typeof source.projectScoped === "boolean" ? source.projectScoped : true,
    actorScoped: sanitizePermissionAuditInvariantActorScope(source.actorScoped, actorId),
    projectionDigest: sanitizePermissionAuditText(stringField(source, "projectionDigest")),
    recomputedDigest: sanitizePermissionAuditText(stringField(source, "recomputedDigest"))
  };
}

function sanitizePermissionAuditInvariantActorScope(
  value: unknown,
  actorId: string
): Record<string, unknown> {
  const source = isRecord(value) ? value : {};
  return {
    requested: true,
    passed: typeof source.passed === "boolean" ? source.passed : true,
    actorId: sanitizePermissionAuditText(stringField(source, "actorId") || actorId),
    leakedActorIds: arrayField(source, "leakedActorIds").map((item) =>
      sanitizePermissionAuditText(compareScalarText(item))
    )
  };
}

function sanitizePermissionAuditInvariantAppendOnly(value: unknown): Record<string, unknown> {
  const source = isRecord(value) ? value : {};
  return {
    uniqueProjectedEventIds:
      typeof source.uniqueProjectedEventIds === "boolean" ? source.uniqueProjectedEventIds : true,
    duplicateEventIds: arrayField(source, "duplicateEventIds").map((item) =>
      sanitizePermissionAuditText(compareScalarText(item))
    ),
    totalProjectedEventIds: integerField(source, "totalProjectedEventIds") ?? 0
  };
}

function sanitizePermissionAuditInvariantRawCompareInputs(value: unknown): Record<string, unknown> {
  const source = isRecord(value) ? value : {};
  return {
    included: false,
    preserved: typeof source.preserved === "boolean" ? source.preserved : true,
    digestCount: integerField(source, "digestCount") ?? 0,
    itemCount: integerField(source, "itemCount") ?? 0
  };
}

function sanitizePermissionAuditInvariantRedaction(value: unknown): Record<string, unknown> {
  const source = isRecord(value) ? value : {};
  return {
    passed: typeof source.passed === "boolean" ? source.passed : true,
    leakedMarkerCount: integerField(source, "leakedMarkerCount") ?? 0,
    leakedMarkers: arrayField(source, "leakedMarkers").map((item) =>
      sanitizePermissionAuditText(compareScalarText(item))
    ),
    rawHistoryIncluded: false,
    rawCompareInputsIncluded: false,
    hiddenOrMaskedValuesIncluded: false,
    tokensIncluded: false,
    pathsIncluded: false,
    storageLocationsIncluded: false,
    artifactUrlsIncluded: false,
    policy:
      "MCP returns invariant metadata and paged event identifiers only; raw compare inputs, raw history bodies, local paths, storage refs, tokens, and signed URLs are omitted."
  };
}

function sanitizePermissionAuditInvariantItem(value: unknown): Record<string, unknown> {
  const source = isRecord(value) ? value : {};
  return {
    ordinal: integerField(source, "ordinal") ?? 0,
    eventId: sanitizePermissionAuditText(stringField(source, "eventId")),
    redacted: true
  };
}

function historyComparePermissionAuditInvariantReadPolicy(
  mode: "replay" | "persisted" = "replay"
): Record<string, unknown> {
  const persisted = mode === "persisted";
  return {
    restParity: {
      method: "GET",
      path: persisted
        ? "/api/v1/test-cases/{testCaseId}/history/compare/permission-audit/replay/invariants/persisted"
        : "/api/v1/test-cases/{testCaseId}/history/compare/permission-audit/replay/invariants"
    },
    projectIdRequired: true,
    actorIdRequired: true,
    testCaseScoped: true,
    comparePairOptional: true,
    mutationAllowed: false,
    equalOrNarrowerThanRest: true,
    rawHistoryIncluded: false,
    rawCompareInputsIncluded: false,
    mcpReplayExecution: false,
    mcpWorkerExecution: false,
    providerRuntimeMetadataIncluded: false,
    providerRuntimeToolsAdvertised: false,
    ...(persisted ? { persistedInvariantReadModel: true } : {}),
    deniedStateMasked: true,
    headersForwarded: [
      "X-TestHistory-Scopes",
      "X-TestHistory-Project-Scope",
      "X-TestHistory-Actor-Id"
    ],
    omittedFields: [
      "events",
      "raw",
      "rawHistory.items",
      "baseResult",
      "targetResult",
      "compareInputs",
      "rawCompareInputs",
      "path",
      "storageKey",
      "storageRef",
      "signedUrl",
      "downloadUrl",
      "token"
    ],
    redactionRules: [
      persisted
        ? "MCP reads REST persisted invariant evidence only and never recomputes, refreshes, or persists replay state."
        : "MCP reads REST invariant evidence only and never recomputes or refreshes replay state.",
      "Project, actor, and test case scopes are required and forwarded to REST without broadening access.",
      "Only invariant booleans, digest metadata, append-only counters, redaction counters, page metadata, and opaque event ids are returned.",
      "Raw compare inputs, raw history bodies, local paths, storage references, signed URLs, tokens, cookies, credentials, and mutation handles are omitted or redacted.",
      persisted
        ? "No persisted invariant refresh, replay execution, worker execution, permission mutation, storage mutation, or audit deletion tool is advertised."
        : "No replay refresh, permission mutation, or audit deletion tool is advertised."
    ]
  };
}
