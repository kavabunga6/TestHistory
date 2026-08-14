import { fetchApiValue } from "./mcpApiClient.js";
import { normalizePageMetadata, pageMetadata, paginateItems } from "./mcpPagination.js";
import { attachmentBlobFieldNames, maxMcpPreviewBodyBytes } from "./mcpPreviewConstants.js";
import { compactOptions, type ResourceReadOptions } from "./mcpReadOptions.js";
import { isSensitiveText, sanitizeAuditText } from "./mcpSanitizeText.js";
import { sanitizePreviewText, truncateUtf8 } from "./mcpTextBounds.js";
import {
  arrayField,
  getRequiredString,
  isApiStatusPayload,
  isRecord,
  isSensitiveKey,
  numericField,
  omitKeys,
  optionalString,
  pickDefined,
  toMcpSafeValue,
  withQuery
} from "./mcpValueUtils.js";

export async function historyCompareRead(
  argumentsValue: Record<string, unknown>
): Promise<unknown | string> {
  const testCaseId = getRequiredString(argumentsValue, "testCaseId");
  if (testCaseId.error !== undefined) {
    return testCaseId.error;
  }

  const projectId = getRequiredString(argumentsValue, "projectId");
  if (projectId.error !== undefined) {
    return "projectId is required for test case history compare reads";
  }

  const baseResultUuid = getRequiredString(argumentsValue, "baseResultUuid");
  if (baseResultUuid.error !== undefined) {
    return "baseResultUuid is required for test case history compare reads";
  }

  const targetResultUuid = getRequiredString(argumentsValue, "targetResultUuid");
  if (targetResultUuid.error !== undefined) {
    return "targetResultUuid is required for test case history compare reads";
  }

  const options = compactOptions(argumentsValue);
  const actorId = optionalString(argumentsValue.actorId);
  return summarizeHistoryCompareRead(
    await fetchApiValue(
      argumentsValue.apiUrl,
      withQuery(`/api/v1/test-cases/${encodeURIComponent(testCaseId.value)}/history/compare`, {
        projectId: projectId.value,
        baseResultUuid: baseResultUuid.value,
        targetResultUuid: targetResultUuid.value,
        includeUnchanged:
          typeof argumentsValue.includeUnchanged === "boolean"
            ? String(argumentsValue.includeUnchanged)
            : undefined,
        limit: String(options.limit),
        cursor: options.cursor
      }),
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
      actorId
    }
  );
}

function summarizeHistoryCompareRead(
  value: unknown,
  options: ResourceReadOptions,
  scope: { testCaseId: string; projectId: string; actorId: string | undefined }
): unknown {
  if (isApiStatusPayload(value)) {
    return sanitizeHistoryCompareStatus(value, scope);
  }

  if (!isRecord(value)) {
    return value;
  }

  const changes = readCompareChanges(value);
  const apiPage = isRecord(value.page) ? value.page : undefined;
  const localPage = apiPage === undefined ? paginateItems(changes, options) : undefined;
  const returnedChanges = localPage?.items ?? changes;
  const page =
    apiPage !== undefined
      ? normalizePageMetadata(apiPage, options, returnedChanges.length)
      : (localPage?.metadata ?? pageMetadata(changes.length, 0, changes.length, options.limit));
  const totalChanges =
    numericField(value, "totalChanges") ?? numericField(value, "total") ?? changes.length;
  const returnedCount =
    numericField(value, "returnedChanges") ??
    numericField(value, "returned") ??
    returnedChanges.length;
  const omittedChanges =
    numericField(value, "omittedChanges") ??
    Math.max(totalChanges - (page.offset + returnedCount), 0);

  return {
    kind: "test-case-history-compare",
    id:
      typeof value.id === "string"
        ? sanitizeAuditText(value.id)
        : `history-compare:${scope.projectId}:${scope.testCaseId}`,
    testCaseId: sanitizeAuditText(
      typeof value.testCaseId === "string" ? value.testCaseId : scope.testCaseId
    ),
    projectId: sanitizeAuditText(
      typeof value.projectId === "string" ? value.projectId : scope.projectId
    ),
    ...historyCompareActorMetadata(value.actor, scope.actorId),
    access: sanitizeHistoryCompareAccess(value.access, value.actor, scope.actorId),
    ...(value.availability !== undefined
      ? { availability: sanitizeHistoryCompareAvailability(value.availability, value.actor, scope) }
      : {}),
    ...(value.identity !== undefined
      ? { identity: sanitizeHistoryCompareValue(value.identity) }
      : {}),
    ...pickDefined(
      {
        base: sanitizeHistoryComparePoint(value.base ?? value.from ?? value.previous),
        target: sanitizeHistoryComparePoint(value.target ?? value.to ?? value.current)
      },
      ["base", "target"]
    ),
    totalChanges,
    returnedChanges: returnedCount,
    omittedChanges,
    page,
    summary: sanitizeHistoryCompareSummary(value.summary, totalChanges),
    redaction: sanitizeHistoryCompareRedaction(value.redaction),
    ...(value.enrichment !== undefined
      ? { enrichment: sanitizeHistoryCompareEnrichment(value.enrichment) }
      : {}),
    changes: returnedChanges.map((change) => sanitizeHistoryCompareChange(change)),
    policy: historyCompareReadPolicy()
  };
}

export function sanitizeHistoryCompareStatus(
  value: Record<string, unknown>,
  scope: { testCaseId: string; projectId: string; actorId: string | undefined }
): unknown {
  return pickDefined(
    {
      status: value.status,
      code: numericField(value, "code"),
      message: typeof value.message === "string" ? truncateCompareText(value.message) : undefined,
      url: typeof value.url === "string" ? sanitizeCompareUrl(value.url) : undefined,
      permissionDenied: sanitizeHistoryCompareDenied(value.permissionDenied, scope),
      policy: historyCompareReadPolicy()
    },
    ["status", "code", "message", "url", "permissionDenied", "policy"]
  );
}

export function sanitizeHistoryCompareDenied(
  value: unknown,
  scope: { testCaseId: string; projectId: string; actorId: string | undefined }
): unknown {
  if (!isRecord(value)) {
    return value;
  }

  return pickDefined(
    {
      kind: value.kind === "test-case-history-compare" ? "test-case-history-compare" : undefined,
      error: typeof value.error === "string" ? truncateCompareText(value.error) : undefined,
      message: typeof value.message === "string" ? truncateCompareText(value.message) : undefined,
      requiredScopes: arrayField(value, "requiredScopes").map((item) =>
        truncateCompareText(compareScalarText(item))
      ),
      projectId: sanitizeAuditText(
        typeof value.projectId === "string" ? value.projectId : scope.projectId
      ),
      ...historyCompareActorMetadata(value.actor, scope.actorId),
      access: sanitizeHistoryCompareAccess(value.access, value.actor, scope.actorId),
      availability: sanitizeHistoryCompareAvailability(value.availability, value.actor, scope, {
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

function readCompareChanges(value: Record<string, unknown>): unknown[] {
  const changes = arrayField(value, "changes");
  if (changes.length > 0) {
    return changes;
  }
  return arrayField(value, "items");
}

export function sanitizeHistoryComparePoint(value: unknown): unknown {
  if (!isRecord(value)) {
    return undefined;
  }

  return sanitizeHistoryCompareValue(omitKeys(value, ["raw", "attachments", "steps"]));
}

export function sanitizeHistoryCompareChange(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) {
    return {};
  }

  if (typeof value.kind === "string") {
    return pickDefined(
      {
        kind: value.kind,
        subject: typeof value.subject === "string" ? truncateCompareText(value.subject) : undefined,
        change: typeof value.change === "string" ? value.change : undefined,
        severity: typeof value.severity === "string" ? value.severity : undefined,
        before: arrayField(value, "before").map((item) =>
          truncateCompareText(compareScalarText(item))
        ),
        after: arrayField(value, "after").map((item) =>
          truncateCompareText(compareScalarText(item))
        ),
        context: sanitizeHistoryCompareContext(value.context),
        explanation:
          typeof value.explanation === "string"
            ? truncateCompareText(value.explanation)
            : undefined,
        redacted: true
      },
      [
        "kind",
        "subject",
        "change",
        "severity",
        "before",
        "after",
        "context",
        "explanation",
        "redacted"
      ]
    );
  }

  return sanitizeHistoryCompareValue(omitKeys(value, ["raw", "attachments", "steps"])) as Record<
    string,
    unknown
  >;
}

export function sanitizeHistoryCompareValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeHistoryCompareValue(item));
  }
  if (!isRecord(value)) {
    return typeof value === "string" ? sanitizeCompareText(value) : value;
  }

  const safe: Record<string, unknown> = {};
  const mode = typeof value.mode === "string" ? value.mode : undefined;
  const parameterName = typeof value.name === "string" ? value.name : undefined;
  for (const [key, fieldValue] of Object.entries(value)) {
    if (isUnsafeCompareField(key)) {
      continue;
    }
    if (key === "statusDetails") {
      const details = sanitizeHistoryCompareStatusDetails(fieldValue);
      if (details !== undefined) {
        safe[key] = details;
      }
      continue;
    }
    if (key === "parameters" && Array.isArray(fieldValue)) {
      safe[key] = fieldValue.map((item) => toMcpSafeValue(item));
      continue;
    }
    if (isSensitiveKey(key)) {
      safe[key] = "[redacted]";
      continue;
    }
    if (key === "value" && mode === "hidden") {
      continue;
    }
    if (key === "value" && mode === "masked") {
      safe[key] = "***";
      continue;
    }
    if (key === "value" && parameterName !== undefined && isSensitiveKey(parameterName)) {
      safe[key] = "[redacted]";
      safe.redacted = true;
      continue;
    }
    safe[key] = sanitizeHistoryCompareValue(fieldValue);
  }
  if (mode === "hidden" || mode === "masked") {
    safe.redacted = true;
  }
  return safe;
}

function isUnsafeCompareField(key: string): boolean {
  const normalized = key.toLowerCase();
  return (
    normalized === "raw" ||
    normalized === "attachments" ||
    normalized === "steps" ||
    normalized === "statusdetails" ||
    attachmentBlobFieldNames.has(key) ||
    normalized.includes("storage") ||
    normalized === "downloadurl" ||
    normalized === "artifacturl" ||
    normalized.includes("signedurl") ||
    normalized.includes("signed_url") ||
    normalized.includes("signature") ||
    normalized.endsWith("path")
  );
}

export function sanitizeHistoryCompareAccess(
  value: unknown,
  actor: unknown,
  actorId: string | undefined
): Record<string, unknown> {
  const actorScoped =
    isRecord(value) && typeof value.actorScoped === "boolean"
      ? value.actorScoped
      : actorId !== undefined || isRecord(actor);

  if (!isRecord(value)) {
    return {
      scope: "test-cases:read",
      projectScoped: true,
      actorScoped,
      mutation: false,
      redacted: true
    };
  }

  return {
    scope: value.scope === "test-cases:read" ? "test-cases:read" : "test-cases:read",
    projectScoped: true,
    actorScoped,
    mutation: false,
    redacted: true
  };
}

export function sanitizeHistoryCompareSummary(
  value: unknown,
  totalChanges: number
): Record<string, unknown> {
  if (!isRecord(value)) {
    return {
      total: totalChanges,
      added: 0,
      removed: 0,
      changed: 0,
      unchanged: 0,
      risk: 0,
      signal: 0
    };
  }

  return {
    total: numericField(value, "total") ?? totalChanges,
    added: numericField(value, "added") ?? 0,
    removed: numericField(value, "removed") ?? 0,
    changed: numericField(value, "changed") ?? 0,
    unchanged: numericField(value, "unchanged") ?? 0,
    risk: numericField(value, "risk") ?? 0,
    signal: numericField(value, "signal") ?? 0
  };
}

export function sanitizeHistoryCompareRedaction(_value: unknown): Record<string, unknown> {
  return {
    rawResultsIncluded: false,
    rawStatusDetailsIncluded: false,
    hiddenOrMaskedValuesIncluded: false,
    tokensIncluded: false,
    pathsIncluded: false,
    storageLocationsIncluded: false,
    artifactUrlsIncluded: false
  };
}

export function historyCompareActorMetadata(
  actor: unknown,
  actorId: string | undefined
): Record<string, unknown> {
  const restActorId =
    isRecord(actor) && typeof actor.actorId === "string" ? actor.actorId : actorId;
  if (restActorId === undefined) {
    return {};
  }

  return {
    actorId: sanitizeAuditText(restActorId),
    actor: pickDefined(
      {
        type: "actor",
        actorId: sanitizeAuditText(restActorId),
        scoped: true,
        displayName:
          isRecord(actor) && typeof actor.displayName === "string"
            ? sanitizeAuditText(actor.displayName)
            : undefined
      },
      ["type", "actorId", "scoped", "displayName"]
    )
  };
}

export function sanitizeHistoryCompareAvailability(
  value: unknown,
  actor: unknown,
  scope: { projectId: string; actorId: string | undefined },
  fallback?: { status: string; partial: boolean }
): Record<string, unknown> {
  const actorScoped =
    isRecord(value) && typeof value.actorScoped === "boolean"
      ? value.actorScoped
      : scope.actorId !== undefined || isRecord(actor);
  const status =
    isRecord(value) && typeof value.status === "string"
      ? sanitizeCompareAvailabilityStatus(value.status)
      : (fallback?.status ?? "ready");
  const partial =
    isRecord(value) && typeof value.partial === "boolean"
      ? value.partial
      : (fallback?.partial ?? false);

  return pickDefined(
    {
      status,
      reason:
        isRecord(value) && typeof value.reason === "string"
          ? truncateCompareText(value.reason)
          : undefined,
      projectScoped: true,
      actorScoped,
      redacted: true,
      partial,
      unavailable: isRecord(value)
        ? arrayField(value, "unavailable").map((item) =>
            truncateCompareText(compareScalarText(item))
          )
        : []
    },
    ["status", "reason", "projectScoped", "actorScoped", "redacted", "partial", "unavailable"]
  );
}

export function sanitizeCompareAvailabilityStatus(value: string): string {
  return ["ready", "partial", "empty", "denied"].includes(value) ? value : "partial";
}

export function sanitizeHistoryCompareEnrichment(value: unknown): Record<string, unknown> {
  const fields = isRecord(value) && isRecord(value.fields) ? value.fields : {};
  const sanitizedFields: Record<string, unknown> = {};
  for (const [key, fieldValue] of Object.entries(fields)) {
    if (!isRecord(fieldValue)) {
      continue;
    }
    sanitizedFields[truncateCompareText(key)] = {
      status:
        typeof fieldValue.status === "string"
          ? sanitizeCompareEnrichmentStatus(fieldValue.status)
          : "partial",
      base: fieldValue.base === true,
      target: fieldValue.target === true
    };
  }

  return {
    status: isRecord(value) && value.status === "ready" ? "ready" : "partial",
    redacted: true,
    fields: sanitizedFields,
    unavailable: isRecord(value)
      ? arrayField(value, "unavailable").map((item) => truncateCompareText(compareScalarText(item)))
      : []
  };
}

function sanitizeCompareEnrichmentStatus(value: string): string {
  return ["ready", "partial", "unavailable"].includes(value) ? value : "partial";
}

export function sanitizeHistoryCompareContext(value: unknown): Record<string, string | string[]> {
  if (!isRecord(value)) {
    return {};
  }

  const safe: Record<string, string | string[]> = {};
  for (const [key, fieldValue] of Object.entries(value)) {
    if (isUnsafeCompareField(key)) {
      continue;
    }
    const safeKey = truncateCompareText(key);
    if (Array.isArray(fieldValue)) {
      safe[safeKey] = fieldValue.map((item) => truncateCompareText(compareScalarText(item)));
      continue;
    }
    if (typeof fieldValue === "string") {
      safe[safeKey] = truncateCompareText(fieldValue);
      continue;
    }
    if (typeof fieldValue === "number" || typeof fieldValue === "boolean") {
      safe[safeKey] = String(fieldValue);
    }
  }
  return safe;
}

export function compareScalarText(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(toMcpSafeValue(value)) ?? "";
}

export function sanitizeHistoryCompareStatusDetails(value: unknown): unknown {
  if (!isRecord(value)) {
    return undefined;
  }

  return pickDefined(
    {
      known: value.known,
      muted: value.muted,
      flaky: value.flaky,
      message: typeof value.message === "string" ? truncateCompareText(value.message) : undefined,
      trace: typeof value.trace === "string" ? truncateCompareText(value.trace) : undefined
    },
    ["known", "muted", "flaky", "message", "trace"]
  );
}

export function truncateCompareText(value: string): string {
  return truncateUtf8(sanitizeCompareText(value), maxMcpPreviewBodyBytes).value;
}

function sanitizeCompareText(value: string): string {
  const sanitized = sanitizePreviewText(value).value;
  return isSensitiveText(sanitized) ? "[redacted]" : sanitized;
}

export function sanitizeCompareUrl(value: string): string {
  try {
    const url = new URL(value);
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return "[redacted-url]";
  }
}

function historyCompareReadPolicy(): Record<string, unknown> {
  return {
    restParity: {
      method: "GET",
      path: "/api/v1/test-cases/{testCaseId}/history/compare"
    },
    projectIdRequired: true,
    actorIdPassThrough: true,
    resultPairRequired: true,
    mutationAllowed: false,
    equalOrNarrowerThanRest: true,
    rawPayloadsIncluded: false,
    maskedParametersPreserved: true,
    availabilityPreserved: true,
    actorScopedAccessPreserved: true,
    enrichedFieldsPreserved: ["label", "executor", "branch", "build", "defect"],
    headersForwarded: [
      "X-TestHistory-Scopes",
      "X-TestHistory-Project-Scope",
      "X-TestHistory-Actor-Id"
    ],
    omittedFields: ["raw", "attachments", "steps", "statusDetails", "path", "storageKey", "url"],
    redactionRules: [
      "Masked and hidden parameter raw values remain omitted from enriched compare pages.",
      "Label, executor, branch/build, and defect strings are bounded and redacted for tokens, credentials, URLs, and local paths.",
      "Raw payloads, status details, attachments, execution steps, storage keys, paths, and signed URLs are omitted from MCP compare pages."
    ]
  };
}
