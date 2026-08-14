import { fetchApiValue } from "./mcpApiClient.js";
import { sanitizeArchiveText } from "./mcpArchiveText.js";
import {
  archiveStatusAccess,
  archiveStatusHeaders,
  sanitizeArchiveLaunch
} from "./mcpArchiveStatus.js";
import { sanitizeCompareUrl } from "./mcpHistoryCompare.js";
import { normalizePageMetadata, pageMetadata, paginateItems } from "./mcpPagination.js";
import { maxMcpPreviewBodyBytes } from "./mcpPreviewConstants.js";
import type { ResourceReadOptions } from "./mcpReadOptions.js";
import { sanitizeAuditText } from "./mcpSanitizeText.js";
import { truncateUtf8 } from "./mcpTextBounds.js";
import {
  arrayField,
  cursorOffset,
  getRequiredString,
  integerField,
  integerStringField,
  isApiStatusPayload,
  isRecord,
  isSensitiveKey,
  numericField,
  optionalPositiveInteger,
  optionalString,
  pickDefined,
  stringField,
  withQuery
} from "./mcpValueUtils.js";

export async function archiveDiagnosticsReplayRead(
  argumentsValue: Record<string, unknown>
): Promise<unknown | string> {
  const launchId = getRequiredString(argumentsValue, "launchId");
  if (launchId.error !== undefined) {
    return "launchId is required for archive diagnostic replay reads";
  }
  const projectId = getRequiredString(argumentsValue, "projectId");
  if (projectId.error !== undefined) {
    return "projectId is required for archive diagnostic replay reads";
  }

  const options: ResourceReadOptions = {
    includeDetails: false,
    includeRaw: false,
    limit: optionalPositiveInteger(argumentsValue.limit, 20, 100),
    cursor: optionalString(argumentsValue.cursor),
    offset: cursorOffset(optionalString(argumentsValue.cursor))
  };
  const actorId = optionalString(argumentsValue.actorId);
  const archiveRef = optionalString(argumentsValue.archiveRef);
  const query = {
    archiveRef,
    limit: String(options.limit),
    cursor: options.cursor
  };

  return summarizeArchiveDiagnosticsReplayRead(
    await fetchApiValue(
      argumentsValue.apiUrl,
      withQuery(
        `/api/v1/launches/${encodeURIComponent(launchId.value)}/archive/diagnostics/replay`,
        query
      ),
      { headers: archiveStatusHeaders(projectId.value, actorId) }
    ),
    options,
    {
      projectId: projectId.value,
      launchId: launchId.value,
      actorId,
      archiveRef,
      query
    }
  );
}

function summarizeArchiveDiagnosticsReplayRead(
  value: unknown,
  options: ResourceReadOptions,
  scope: {
    projectId: string;
    launchId: string;
    actorId: string | undefined;
    archiveRef: string | undefined;
    query: Record<string, string | undefined>;
  }
): unknown {
  if (isApiStatusPayload(value)) {
    return sanitizeArchiveDiagnosticsReplayStatus(value, scope);
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
    kind: "archive-diagnostic-replay-summary-list",
    scope: archiveDiagnosticsReplayScope(scope),
    launch: sanitizeArchiveLaunch(value.launch),
    access: archiveStatusAccess(scope.actorId),
    query: archiveDiagnosticsReplayQueryMetadata(scope.query, options),
    worker: sanitizeArchiveDiagnosticsReplayWorker(value.worker),
    page,
    summary: sanitizeArchiveDiagnosticsReplaySummary(value.summary),
    items: returnedItems.map((item) => sanitizeArchiveDiagnosticsReplayProjection(item, scope)),
    policy: archiveDiagnosticsReplayPolicy()
  };
}

function sanitizeArchiveDiagnosticsReplayStatus(
  value: Record<string, unknown>,
  scope: {
    projectId: string;
    launchId: string;
    actorId: string | undefined;
    archiveRef: string | undefined;
  }
): Record<string, unknown> {
  return pickDefined(
    {
      status: value.status,
      code: numericField(value, "code"),
      message:
        typeof value.message === "string"
          ? truncateUtf8(sanitizeArchiveText(value.message), maxMcpPreviewBodyBytes).value
          : undefined,
      url: typeof value.url === "string" ? sanitizeCompareUrl(value.url) : undefined,
      scope: archiveDiagnosticsReplayScope(scope),
      permissionDenied: sanitizeArchiveDiagnosticsReplayDenied(value.permissionDenied),
      redacted: true,
      policy: archiveDiagnosticsReplayPolicy()
    },
    ["status", "code", "message", "url", "scope", "permissionDenied", "redacted", "policy"]
  );
}

export function sanitizeArchiveDiagnosticsReplayDenied(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeArchiveDiagnosticsReplayDenied(item));
  }
  if (!isRecord(value)) {
    return typeof value === "string" ? sanitizeArchiveText(value) : value;
  }

  const safe: Record<string, unknown> = {};
  for (const [key, fieldValue] of Object.entries(value)) {
    if (isUnsafeArchiveDiagnosticsReplayField(key)) {
      continue;
    }
    if (isSensitiveKey(key)) {
      safe[key] = "[redacted]";
      continue;
    }
    safe[key] = sanitizeArchiveDiagnosticsReplayDenied(fieldValue);
  }
  return safe;
}

function isUnsafeArchiveDiagnosticsReplayField(key: string): boolean {
  const normalized = key.toLowerCase();
  return (
    normalized === "raw" ||
    normalized.includes("rawhistory") ||
    normalized.includes("rawpayload") ||
    normalized.includes("manifestentries") ||
    normalized.includes("resultfiles") ||
    normalized.includes("archivepayload") ||
    normalized === "payload" ||
    normalized === "content" ||
    normalized.includes("storage") ||
    normalized.includes("signedurl") ||
    normalized.includes("signed_url") ||
    normalized.includes("signature") ||
    normalized.endsWith("path") ||
    normalized.endsWith("url")
  );
}

function archiveDiagnosticsReplayScope(scope: {
  projectId: string;
  launchId: string;
  actorId: string | undefined;
  archiveRef?: string | undefined;
}): Record<string, unknown> {
  return pickDefined(
    {
      projectId: sanitizeAuditText(scope.projectId),
      launchId: sanitizeAuditText(scope.launchId),
      actorId: scope.actorId !== undefined ? sanitizeAuditText(scope.actorId) : undefined,
      archiveRef: scope.archiveRef !== undefined ? sanitizeArchiveText(scope.archiveRef) : undefined
    },
    ["projectId", "launchId", "actorId", "archiveRef"]
  );
}

function archiveDiagnosticsReplayQueryMetadata(
  query: Record<string, string | undefined>,
  options: ResourceReadOptions
): Record<string, unknown> {
  return pickDefined(
    {
      archiveRef:
        query.archiveRef !== undefined ? sanitizeArchiveText(query.archiveRef) : undefined,
      limit: integerStringField(query.limit) ?? options.limit,
      cursor: query.cursor ?? null
    },
    ["archiveRef", "limit", "cursor"]
  );
}

function sanitizeArchiveDiagnosticsReplayWorker(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) {
    return archiveDiagnosticsReplayWorkerContract();
  }

  return {
    queue:
      value.queue === "archive.diagnostics.replay"
        ? "archive.diagnostics.replay"
        : "archive.diagnostics.replay",
    boundary:
      value.boundary === "worker-local-archive-diagnostics-replay"
        ? "worker-local-archive-diagnostics-replay"
        : "worker-local-archive-diagnostics-replay",
    adapterKind:
      value.adapterKind === "in-memory-archive-diagnostics-replay-wip"
        ? "in-memory-archive-diagnostics-replay-wip"
        : "in-memory-archive-diagnostics-replay-wip",
    consistency:
      value.consistency === "append-only-idempotent-replay"
        ? "append-only-idempotent-replay"
        : "append-only-idempotent-replay",
    payloadsAvailable: false
  };
}

function archiveDiagnosticsReplayWorkerContract(): Record<string, unknown> {
  return {
    queue: "archive.diagnostics.replay",
    boundary: "worker-local-archive-diagnostics-replay",
    adapterKind: "in-memory-archive-diagnostics-replay-wip",
    consistency: "append-only-idempotent-replay",
    payloadsAvailable: false
  };
}

function sanitizeArchiveDiagnosticsReplaySummary(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) {
    return {
      totalProjections: 0,
      eventCount: 0,
      acceptedEventCount: 0,
      retryableEventCount: 0,
      severityCounts: {},
      sourceCounts: {},
      readOnly: true,
      mutation: false,
      rawMaterialReturned: false
    };
  }

  return pickDefined(
    {
      totalProjections: integerField(value, "totalProjections"),
      eventCount: integerField(value, "eventCount"),
      acceptedEventCount: integerField(value, "acceptedEventCount"),
      duplicateEventCount: integerField(value, "duplicateEventCount"),
      rejectedOpenLaunchEventCount: integerField(value, "rejectedOpenLaunchEventCount"),
      rejectedOutOfScopeEventCount: integerField(value, "rejectedOutOfScopeEventCount"),
      invalidEventCount: integerField(value, "invalidEventCount"),
      retryableEventCount: integerField(value, "retryableEventCount"),
      severityCounts: sanitizeNumericMap(value.severityCounts),
      sourceCounts: sanitizeNumericMap(value.sourceCounts),
      readOnly: true,
      mutation: false,
      rawMaterialReturned: false
    },
    [
      "totalProjections",
      "eventCount",
      "acceptedEventCount",
      "duplicateEventCount",
      "rejectedOpenLaunchEventCount",
      "rejectedOutOfScopeEventCount",
      "invalidEventCount",
      "retryableEventCount",
      "severityCounts",
      "sourceCounts",
      "readOnly",
      "mutation",
      "rawMaterialReturned"
    ]
  );
}

function sanitizeArchiveDiagnosticsReplayProjection(
  value: unknown,
  scope: { projectId: string; launchId: string }
): Record<string, unknown> {
  if (!isRecord(value)) {
    return {};
  }

  return pickDefined(
    {
      kind: "archive-diagnostic-replay-summary",
      projectId: sanitizeAuditText(stringField(value, "projectId") || scope.projectId),
      launchId: sanitizeAuditText(stringField(value, "launchId") || scope.launchId),
      archiveRef: sanitizeArchiveText(stringField(value, "archiveRef")),
      uploadId: sanitizeAuditText(stringField(value, "uploadId")),
      status: optionalString(value.status),
      phase: optionalString(value.phase),
      worker: sanitizeArchiveDiagnosticsReplayWorker(value.worker),
      execution: sanitizeArchiveDiagnosticsReplayExecution(value.execution),
      summary: sanitizeArchiveDiagnosticsReplayProjectionSummary(value.summary, scope),
      records: arrayField(value, "records").map((record) =>
        sanitizeArchiveDiagnosticsReplayRecord(record, scope)
      )
    },
    [
      "kind",
      "projectId",
      "launchId",
      "archiveRef",
      "uploadId",
      "status",
      "phase",
      "worker",
      "execution",
      "summary",
      "records"
    ]
  );
}

function sanitizeArchiveDiagnosticsReplayExecution(_value: unknown): Record<string, unknown> {
  return {
    readOnly: true,
    mutation: false,
    rawMaterialReturned: false
  };
}

function sanitizeArchiveDiagnosticsReplayProjectionSummary(
  value: unknown,
  scope: { projectId: string; launchId: string }
): Record<string, unknown> {
  if (!isRecord(value)) {
    return {};
  }

  return pickDefined(
    {
      projectId: sanitizeAuditText(stringField(value, "projectId") || scope.projectId),
      launchId: sanitizeAuditText(stringField(value, "launchId") || scope.launchId),
      archiveRef: sanitizeArchiveText(stringField(value, "archiveRef")),
      eventCount: integerField(value, "eventCount"),
      acceptedEventCount: integerField(value, "acceptedEventCount"),
      duplicateEventCount: integerField(value, "duplicateEventCount"),
      rejectedOpenLaunchEventCount: integerField(value, "rejectedOpenLaunchEventCount"),
      rejectedOutOfScopeEventCount: integerField(value, "rejectedOutOfScopeEventCount"),
      invalidEventCount: integerField(value, "invalidEventCount"),
      retryableEventCount: integerField(value, "retryableEventCount"),
      severityCounts: sanitizeNumericMap(value.severityCounts),
      sourceCounts: sanitizeNumericMap(value.sourceCounts),
      replayDigest: sanitizeAuditText(stringField(value, "replayDigest")),
      closedArchiveStatusReadCompatible:
        value.closedArchiveStatusReadCompatible === true ? true : undefined,
      closedArchiveDiagnosticsReadCompatible:
        value.closedArchiveDiagnosticsReadCompatible === true ? true : undefined,
      mutationBoundary:
        value.mutationBoundary === "worker-replay-only-no-rest-or-ui-claims"
          ? "worker-replay-only-no-rest-or-ui-claims"
          : undefined
    },
    [
      "projectId",
      "launchId",
      "archiveRef",
      "eventCount",
      "acceptedEventCount",
      "duplicateEventCount",
      "rejectedOpenLaunchEventCount",
      "rejectedOutOfScopeEventCount",
      "invalidEventCount",
      "retryableEventCount",
      "severityCounts",
      "sourceCounts",
      "replayDigest",
      "closedArchiveStatusReadCompatible",
      "closedArchiveDiagnosticsReadCompatible",
      "mutationBoundary"
    ]
  );
}

function sanitizeArchiveDiagnosticsReplayRecord(
  value: unknown,
  scope: { projectId: string; launchId: string }
): Record<string, unknown> {
  if (!isRecord(value)) {
    return {};
  }

  return pickDefined(
    {
      eventRef: sanitizeArchiveText(stringField(value, "eventRef")),
      projectId: sanitizeAuditText(stringField(value, "projectId") || scope.projectId),
      launchId: sanitizeAuditText(stringField(value, "launchId") || scope.launchId),
      archiveRef: sanitizeArchiveText(stringField(value, "archiveRef")),
      source: optionalString(value.source),
      code: sanitizeAuditText(stringField(value, "code")),
      severity: optionalString(value.severity),
      retryable: typeof value.retryable === "boolean" ? value.retryable : undefined,
      occurredAt: optionalString(value.occurredAt),
      entryRef: sanitizeArchiveText(stringField(value, "entryRef")),
      chunkRef: sanitizeArchiveText(stringField(value, "chunkRef"))
    },
    [
      "eventRef",
      "projectId",
      "launchId",
      "archiveRef",
      "source",
      "code",
      "severity",
      "retryable",
      "occurredAt",
      "entryRef",
      "chunkRef"
    ]
  );
}

function sanitizeNumericMap(value: unknown): Record<string, number> | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const safe: Record<string, number> = {};
  for (const [key, fieldValue] of Object.entries(value)) {
    if (typeof fieldValue === "number" && Number.isFinite(fieldValue)) {
      safe[sanitizeArchiveText(key)] = fieldValue;
    }
  }
  return safe;
}

function archiveDiagnosticsReplayPolicy(): Record<string, unknown> {
  return {
    restParity: {
      method: "GET",
      path: "/api/v1/launches/{launchId}/archive/diagnostics/replay"
    },
    projectIdRequired: true,
    actorIdPassThrough: true,
    headersForwarded: [
      "X-TestHistory-Scopes",
      "X-TestHistory-Project-Scope",
      "X-TestHistory-Actor-Id"
    ],
    equalOrNarrowerThanRest: true,
    mutationAllowed: false,
    workerExecutionAllowed: false,
    rawPayloadsIncluded: false,
    rawPathsIncluded: false,
    storageRefsIncluded: false,
    signedUrlsIncluded: false,
    tokensIncluded: false,
    paginationRequired: true,
    redactionRules: [
      "MCP requires projectId and forwards archive read scope headers before calling REST.",
      "Replay summaries are read-model metadata only; MCP does not run worker jobs or expose mutation handles.",
      "Raw payload, path, storage key, signed URL, token, cookie, password, and authorization fields are omitted or redacted."
    ]
  };
}
