import { fetchApiValue } from "./mcpApiClient.js";
import {
  compareScalarText,
  historyCompareActorMetadata,
  sanitizeCompareAvailabilityStatus,
  sanitizeCompareUrl,
  truncateCompareText
} from "./mcpHistoryCompare.js";
import { normalizePageMetadata, pageMetadata, paginateItems } from "./mcpPagination.js";
import { maxMcpPreviewBodyBytes } from "./mcpPreviewConstants.js";
import { compactOptions, defaultResultLimit, type ResourceReadOptions } from "./mcpReadOptions.js";
import { sanitizePreviewText, truncateUtf8 } from "./mcpTextBounds.js";
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

export async function historyComparePermissionAuditRead(
  argumentsValue: Record<string, unknown>
): Promise<unknown | string> {
  const testCaseId = getRequiredString(argumentsValue, "testCaseId");
  if (testCaseId.error !== undefined) {
    return testCaseId.error;
  }

  const projectId = getRequiredString(argumentsValue, "projectId");
  if (projectId.error !== undefined) {
    return "projectId is required for history compare permission audit reads";
  }

  const baseResultUuid = optionalString(argumentsValue.baseResultUuid);
  const targetResultUuid = optionalString(argumentsValue.targetResultUuid);
  if (baseResultUuid !== undefined && targetResultUuid === undefined) {
    return "targetResultUuid is required when baseResultUuid is provided";
  }
  if (targetResultUuid !== undefined && baseResultUuid === undefined) {
    return "baseResultUuid is required when targetResultUuid is provided";
  }

  const options = compactOptions(argumentsValue);
  const actorId = optionalString(argumentsValue.actorId);
  return summarizeHistoryComparePermissionAuditRead(
    await fetchApiValue(
      argumentsValue.apiUrl,
      withQuery(
        `/api/v1/test-cases/${encodeURIComponent(testCaseId.value)}/history/compare/permission-audit`,
        {
          projectId: projectId.value,
          baseResultUuid,
          targetResultUuid,
          limit: String(options.limit),
          cursor: options.cursor
        }
      ),
      {
        headers: {
          "X-TestHistory-Scopes": "test-cases:read",
          "X-TestHistory-Project-Scope": projectId.value,
          ...(actorId !== undefined ? { "X-TestHistory-Actor-Id": actorId } : {})
        }
      }
    ),
    options,
    {
      testCaseId: testCaseId.value,
      projectId: projectId.value,
      actorId,
      comparePairScoped: baseResultUuid !== undefined && targetResultUuid !== undefined
    }
  );
}

function summarizeHistoryComparePermissionAuditRead(
  value: unknown,
  options: ResourceReadOptions,
  scope: {
    testCaseId: string;
    projectId: string;
    actorId: string | undefined;
    comparePairScoped: boolean;
  }
): unknown {
  if (isApiStatusPayload(value)) {
    return sanitizeHistoryComparePermissionAuditStatus(value, scope);
  }

  if (!isRecord(value)) {
    return value;
  }

  const items = readPermissionAuditItems(value);
  const apiPage = isRecord(value.page) ? value.page : undefined;
  const localPage = apiPage === undefined ? paginateItems(items, options) : undefined;
  const returnedItems = localPage?.items ?? items;
  const page =
    apiPage !== undefined
      ? normalizePageMetadata(apiPage, options, returnedItems.length)
      : (localPage?.metadata ?? pageMetadata(items.length, 0, items.length, options.limit));
  const actorId =
    isRecord(value.actor) && typeof value.actor.actorId === "string"
      ? value.actor.actorId
      : scope.actorId;

  return {
    kind: "test-case-history-compare-permission-audit",
    projectId: sanitizePermissionAuditText(
      typeof value.projectId === "string" ? value.projectId : scope.projectId
    ),
    testCaseId: sanitizePermissionAuditText(
      typeof value.testCaseId === "string" ? value.testCaseId : scope.testCaseId
    ),
    ...historyCompareActorMetadata(value.actor, actorId),
    access: sanitizePermissionAuditAccess(value.access, value.actor, actorId),
    availability: sanitizePermissionAuditAvailability(value.availability, value.actor, {
      actorId
    }),
    query: sanitizePermissionAuditQuery(value.query, scope, page, actorId),
    audit: sanitizePermissionAuditProjection(value.audit, scope.projectId),
    page,
    redaction: historyComparePermissionAuditRedaction(),
    diagnostics: arrayField(value, "diagnostics").map((diagnostic) =>
      sanitizePermissionAuditDiagnostic(diagnostic)
    ),
    items: returnedItems.map((item) => sanitizePermissionAuditRecord(item)),
    policy: historyComparePermissionAuditReadPolicy()
  };
}

function sanitizeHistoryComparePermissionAuditStatus(
  value: Record<string, unknown>,
  scope: { testCaseId: string; projectId: string; actorId: string | undefined }
): unknown {
  return pickDefined(
    {
      status: value.status,
      code: numericField(value, "code"),
      message: typeof value.message === "string" ? truncateCompareText(value.message) : undefined,
      url: typeof value.url === "string" ? sanitizeCompareUrl(value.url) : undefined,
      permissionDenied: sanitizePermissionAuditDenied(value.permissionDenied, scope),
      policy: historyComparePermissionAuditReadPolicy()
    },
    ["status", "code", "message", "url", "permissionDenied", "policy"]
  );
}

function sanitizePermissionAuditDenied(
  value: unknown,
  scope: { testCaseId: string; projectId: string; actorId: string | undefined }
): unknown {
  if (!isRecord(value)) {
    return value;
  }

  const actorId =
    isRecord(value.actor) && typeof value.actor.actorId === "string"
      ? value.actor.actorId
      : scope.actorId;
  return pickDefined(
    {
      kind:
        value.kind === "test-case-history-compare-permission-audit"
          ? "test-case-history-compare-permission-audit"
          : undefined,
      error: typeof value.error === "string" ? sanitizePermissionAuditCode(value.error) : undefined,
      message: typeof value.message === "string" ? truncateCompareText(value.message) : undefined,
      requiredScopes: arrayField(value, "requiredScopes").map((item) =>
        sanitizePermissionAuditCode(compareScalarText(item))
      ),
      projectId: sanitizePermissionAuditText(
        typeof value.projectId === "string" ? value.projectId : scope.projectId
      ),
      ...historyCompareActorMetadata(value.actor, actorId),
      access: sanitizePermissionAuditAccess(value.access, value.actor, actorId),
      availability: sanitizePermissionAuditAvailability(value.availability, value.actor, {
        actorId,
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
      "actorId",
      "actor",
      "access",
      "availability",
      "token",
      "redacted"
    ]
  );
}

function readPermissionAuditItems(value: Record<string, unknown>): unknown[] {
  const items = arrayField(value, "items");
  if (items.length > 0) {
    return items;
  }
  return arrayField(value, "records");
}

function sanitizePermissionAuditAccess(
  value: unknown,
  actor: unknown,
  actorId: string | undefined
): Record<string, unknown> {
  const actorScoped =
    isRecord(value) && typeof value.actorScoped === "boolean"
      ? value.actorScoped
      : actorId !== undefined || isRecord(actor);
  return {
    scope: "test-cases:read",
    projectScoped: true,
    actorScoped,
    mutation: false,
    redacted: true
  };
}

function sanitizePermissionAuditAvailability(
  value: unknown,
  actor: unknown,
  scope: { actorId: string | undefined; status?: string; partial?: boolean }
): Record<string, unknown> {
  const actorScoped =
    isRecord(value) && typeof value.actorScoped === "boolean"
      ? value.actorScoped
      : scope.actorId !== undefined || isRecord(actor);
  return pickDefined(
    {
      status:
        isRecord(value) && typeof value.status === "string"
          ? sanitizeCompareAvailabilityStatus(value.status)
          : (scope.status ?? "ready"),
      reason:
        isRecord(value) && typeof value.reason === "string"
          ? truncateCompareText(value.reason)
          : undefined,
      projectScoped: true,
      actorScoped,
      redacted: true,
      partial:
        isRecord(value) && typeof value.partial === "boolean"
          ? value.partial
          : (scope.partial ?? false),
      unavailable: isRecord(value)
        ? arrayField(value, "unavailable").map((item) =>
            truncateCompareText(compareScalarText(item))
          )
        : []
    },
    ["status", "reason", "projectScoped", "actorScoped", "redacted", "partial", "unavailable"]
  );
}

function sanitizePermissionAuditQuery(
  value: unknown,
  scope: { projectId: string; comparePairScoped: boolean },
  page: Record<string, unknown>,
  actorId: string | undefined
): Record<string, unknown> {
  const pagination = isRecord(value) && isRecord(value.pagination) ? value.pagination : {};
  return {
    projectId: sanitizePermissionAuditText(
      isRecord(value) && typeof value.projectId === "string" ? value.projectId : scope.projectId
    ),
    actorId: sanitizePermissionAuditText(
      isRecord(value) && typeof value.actorId === "string"
        ? value.actorId
        : (actorId ?? "anonymous")
    ),
    testCaseScoped: true,
    projectScoped: true,
    actorScoped: true,
    comparePairScoped:
      isRecord(value) && typeof value.comparePairScoped === "boolean"
        ? value.comparePairScoped
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

function sanitizePermissionAuditProjection(
  value: unknown,
  projectId: string
): Record<string, unknown> {
  const source = isRecord(value) ? value : {};
  return pickDefined(
    {
      adapterKind:
        typeof source.adapterKind === "string"
          ? sanitizePermissionAuditCode(source.adapterKind)
          : "unknown-permission-audit-projection",
      boundary: "read-only-permission-audit-projection",
      projectId: sanitizePermissionAuditText(
        typeof source.projectId === "string" ? source.projectId : projectId
      ),
      actorScoped: typeof source.actorScoped === "boolean" ? source.actorScoped : true,
      projectionDigest:
        typeof source.projectionDigest === "string"
          ? sanitizePermissionAuditText(source.projectionDigest)
          : "unavailable",
      mutationBoundary: "read-only-no-rest-mutation",
      replayedEventCount: integerField(source, "replayedEventCount") ?? 0,
      recordCount: integerField(source, "recordCount") ?? 0,
      byDecision: sanitizePermissionAuditDecisionCounters(source.byDecision),
      actorCount: integerField(source, "actorCount"),
      compareCount: integerField(source, "compareCount"),
      testCaseCount: integerField(source, "testCaseCount"),
      rawHistory: sanitizePermissionAuditRawHistory(source.rawHistory),
      firstOccurredAt:
        typeof source.firstOccurredAt === "string"
          ? sanitizePermissionAuditText(source.firstOccurredAt)
          : undefined,
      lastOccurredAt:
        typeof source.lastOccurredAt === "string"
          ? sanitizePermissionAuditText(source.lastOccurredAt)
          : undefined
    },
    [
      "adapterKind",
      "boundary",
      "projectId",
      "actorScoped",
      "projectionDigest",
      "mutationBoundary",
      "replayedEventCount",
      "recordCount",
      "byDecision",
      "actorCount",
      "compareCount",
      "testCaseCount",
      "rawHistory",
      "firstOccurredAt",
      "lastOccurredAt"
    ]
  );
}

function sanitizePermissionAuditDecisionCounters(value: unknown): Record<string, number> {
  const source = isRecord(value) ? value : {};
  return {
    denied: integerField(source, "denied") ?? 0,
    partial: integerField(source, "partial") ?? 0,
    ready: integerField(source, "ready") ?? 0
  };
}

function sanitizePermissionAuditRawHistory(value: unknown): Record<string, unknown> {
  const source = isRecord(value) ? value : {};
  return pickDefined(
    {
      included: false,
      preserved: true,
      digest:
        typeof source.digest === "string" ? sanitizePermissionAuditText(source.digest) : undefined,
      digests: arrayField(source, "digests").map((item) =>
        sanitizePermissionAuditText(compareScalarText(item))
      ),
      itemCount: integerField(source, "itemCount") ?? 0
    },
    ["included", "preserved", "digest", "digests", "itemCount"]
  );
}

function sanitizePermissionAuditRecord(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) {
    return {
      compareId: "unknown",
      testCaseId: "unknown",
      actor: { type: "actor", actorId: "anonymous", scoped: true },
      decision: "partial",
      reasons: [],
      unavailable: [],
      rawHistory: sanitizePermissionAuditRawHistory(undefined),
      eventCount: 0,
      redacted: true
    };
  }

  return pickDefined(
    {
      compareId: sanitizePermissionAuditText(stringField(value, "compareId")),
      testCaseId: sanitizePermissionAuditText(stringField(value, "testCaseId")),
      actor: sanitizePermissionAuditActor(value.actor),
      decision: sanitizePermissionAuditDecision(stringField(value, "decision")),
      reasons: arrayField(value, "reasons").map((reason) => sanitizePermissionAuditReason(reason)),
      unavailable: arrayField(value, "unavailable").map((item) =>
        truncateCompareText(compareScalarText(item))
      ),
      rawHistory: sanitizePermissionAuditRawHistory(value.rawHistory),
      eventCount: integerField(value, "eventCount") ?? 0,
      sourcePage: sanitizePermissionAuditSourcePage(value.sourcePage),
      firstOccurredAt:
        typeof value.firstOccurredAt === "string"
          ? sanitizePermissionAuditText(value.firstOccurredAt)
          : undefined,
      lastOccurredAt:
        typeof value.lastOccurredAt === "string"
          ? sanitizePermissionAuditText(value.lastOccurredAt)
          : undefined,
      redacted: true
    },
    [
      "compareId",
      "testCaseId",
      "actor",
      "decision",
      "reasons",
      "unavailable",
      "rawHistory",
      "eventCount",
      "sourcePage",
      "firstOccurredAt",
      "lastOccurredAt",
      "redacted"
    ]
  );
}

export function sanitizePermissionAuditActor(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) {
    return { type: "actor", actorId: "anonymous", scoped: true };
  }
  return pickDefined(
    {
      type: "actor",
      actorId: sanitizePermissionAuditText(stringField(value, "actorId") || "anonymous"),
      scoped: true,
      displayName:
        typeof value.displayName === "string"
          ? sanitizePermissionAuditText(value.displayName)
          : undefined
    },
    ["type", "actorId", "scoped", "displayName"]
  );
}

function sanitizePermissionAuditDecision(value: string): string {
  return ["ready", "partial", "denied"].includes(value) ? value : "partial";
}

function sanitizePermissionAuditReason(value: unknown): Record<string, unknown> {
  const source = isRecord(value) ? value : {};
  return {
    code: typeof source.code === "string" ? sanitizePermissionAuditCode(source.code) : "unknown",
    severity: sanitizePermissionAuditSeverity(stringField(source, "severity")),
    explanation:
      typeof source.explanation === "string" ? truncateCompareText(source.explanation) : "",
    fields: arrayField(source, "fields").map((item) => truncateCompareText(compareScalarText(item)))
  };
}

function sanitizePermissionAuditSeverity(value: string): string {
  return ["info", "warn", "error"].includes(value) ? value : "info";
}

function sanitizePermissionAuditSourcePage(value: unknown): unknown {
  if (!isRecord(value)) {
    return undefined;
  }
  return pickDefined(
    {
      limit: integerField(value, "limit"),
      cursor: value.cursor === null ? null : optionalString(value.cursor),
      offset: integerField(value, "offset"),
      returned: integerField(value, "returned"),
      total: integerField(value, "total"),
      nextCursor: value.nextCursor === null ? null : optionalString(value.nextCursor),
      hasMore: typeof value.hasMore === "boolean" ? value.hasMore : undefined
    },
    ["limit", "cursor", "offset", "returned", "total", "nextCursor", "hasMore"]
  );
}

function sanitizePermissionAuditDiagnostic(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) {
    return {};
  }
  return pickDefined(
    {
      code: typeof value.code === "string" ? sanitizePermissionAuditCode(value.code) : undefined,
      compareId:
        typeof value.compareId === "string"
          ? sanitizePermissionAuditText(value.compareId)
          : undefined,
      projectScoped: true,
      actorScoped: true,
      redacted: true
    },
    ["code", "compareId", "projectScoped", "actorScoped", "redacted"]
  );
}

function historyComparePermissionAuditRedaction(): Record<string, boolean> {
  return {
    rawHistoryIncluded: false,
    rawCompareInputsIncluded: false,
    hiddenOrMaskedValuesIncluded: false,
    tokensIncluded: false,
    pathsIncluded: false,
    storageLocationsIncluded: false,
    artifactUrlsIncluded: false
  };
}

function historyComparePermissionAuditReadPolicy(): Record<string, unknown> {
  return {
    restParity: {
      method: "GET",
      path: "/api/v1/test-cases/{testCaseId}/history/compare/permission-audit"
    },
    projectIdRequired: true,
    actorScopeForwarded: true,
    comparePairOptional: true,
    mutationAllowed: false,
    equalOrNarrowerThanRest: true,
    rawHistoryIncluded: false,
    rawCompareInputsIncluded: false,
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
      "hiddenValues",
      "path",
      "storageKey",
      "signedUrl",
      "downloadUrl"
    ],
    redactionRules: [
      "Raw history is represented only by digests and item counts.",
      "Hidden and masked compare input values are never returned by MCP.",
      "Denied responses preserve permission shape while masking tokens, paths, storage refs, signed URLs, raw history, and compare inputs."
    ]
  };
}

export function sanitizePermissionAuditText(value: string): string {
  return truncateCompareText(value);
}

export function sanitizePermissionAuditCode(value: string): string {
  return truncateUtf8(sanitizePreviewText(value).value, maxMcpPreviewBodyBytes).value;
}
