import { fetchApiValue } from "./mcpApiClient.js";
import { sanitizeArchiveText } from "./mcpArchiveText.js";
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
  optionalPositiveInteger,
  optionalString,
  pickDefined,
  stringField,
  withQuery
} from "./mcpValueUtils.js";

export async function archiveStatusRead(
  argumentsValue: Record<string, unknown>
): Promise<unknown | string> {
  const projectId = getRequiredString(argumentsValue, "projectId");
  if (projectId.error !== undefined) {
    return "projectId is required for archive status reads";
  }

  const launchId = optionalString(argumentsValue.launchId);
  const uploadId = optionalString(argumentsValue.uploadId);
  if (
    (launchId === undefined && uploadId === undefined) ||
    (launchId !== undefined && uploadId !== undefined)
  ) {
    return "exactly one of launchId or uploadId is required for archive status reads";
  }

  const options: ResourceReadOptions = {
    includeDetails: false,
    includeRaw: false,
    limit: optionalPositiveInteger(argumentsValue.limit, 20, 100),
    cursor: optionalString(argumentsValue.cursor),
    offset: cursorOffset(optionalString(argumentsValue.cursor))
  };
  const diagnosticsLimit = optionalPositiveInteger(
    argumentsValue.diagnosticsLimit,
    options.limit,
    100
  );
  const diagnosticsCursor =
    optionalString(argumentsValue.diagnosticsCursor) ?? optionalString(argumentsValue.cursor);
  const actorId = optionalString(argumentsValue.actorId);
  const headers = archiveStatusHeaders(projectId.value, actorId);

  if (launchId !== undefined) {
    const query = archiveStatusQuery(argumentsValue, options, diagnosticsLimit, diagnosticsCursor);
    return summarizeArchiveStatusRead(
      await fetchApiValue(
        argumentsValue.apiUrl,
        withQuery(`/api/v1/launches/${encodeURIComponent(launchId)}/uploads/archive/status`, query),
        { headers }
      ),
      options,
      {
        kind: "launch",
        projectId: projectId.value,
        actorId,
        launchId,
        query
      }
    );
  }

  if (uploadId === undefined) {
    return "exactly one of launchId or uploadId is required for archive status reads";
  }

  const query = {
    limit: String(diagnosticsLimit),
    cursor: diagnosticsCursor
  };
  return summarizeArchiveStatusRead(
    await fetchApiValue(
      argumentsValue.apiUrl,
      withQuery(`/api/v1/uploads/${encodeURIComponent(uploadId)}/archive/status`, query),
      { headers }
    ),
    options,
    {
      kind: "upload",
      projectId: projectId.value,
      actorId,
      uploadId,
      query
    }
  );
}

export function archiveStatusHeaders(
  projectId: string,
  actorId: string | undefined
): Record<string, string> {
  return {
    "X-TestHistory-Scopes": "uploads:read,launches:read",
    "X-TestHistory-Project-Scope": projectId,
    ...(actorId !== undefined ? { "X-TestHistory-Actor-Id": actorId } : {})
  };
}

function archiveStatusQuery(
  value: Record<string, unknown>,
  options: ResourceReadOptions,
  diagnosticsLimit: number,
  diagnosticsCursor: string | undefined
): Record<string, string | undefined> {
  return {
    status: optionalString(value.status),
    limit: String(options.limit),
    cursor: options.cursor,
    diagnosticsLimit: String(diagnosticsLimit),
    diagnosticsCursor
  };
}

function summarizeArchiveStatusRead(
  value: unknown,
  options: ResourceReadOptions,
  scope: {
    kind: "launch" | "upload";
    projectId: string;
    actorId: string | undefined;
    launchId?: string;
    uploadId?: string;
    query: Record<string, string | undefined>;
  }
): unknown {
  if (isApiStatusPayload(value)) {
    return value;
  }

  if (!isRecord(value)) {
    return value;
  }

  if (scope.kind === "launch") {
    const items = arrayField(value, "items");
    const localPage = isRecord(value.page) ? undefined : paginateItems(items, options);
    const returnedItems = localPage?.items ?? items;
    const page = isRecord(value.page)
      ? normalizePageMetadata(value.page, options, returnedItems.length)
      : (localPage?.metadata ?? pageMetadata(items.length, 0, items.length, options.limit));

    return {
      kind: "archive-upload-status-list",
      scope: archiveStatusScope(scope),
      access: archiveStatusAccess(scope.actorId),
      query: archiveStatusQueryMetadata(scope.query, options),
      launch: sanitizeArchiveLaunch(value.launch),
      processing: sanitizeArchiveProcessing(value.processing),
      page,
      summary: sanitizeArchiveSummary(value.summary),
      diagnostics: sanitizeArchiveDiagnosticsPage(value.diagnostics, options),
      items: returnedItems.map((item) => sanitizeArchiveStatusItem(item)),
      policy: archiveStatusReadPolicy("/api/v1/launches/{launchId}/uploads/archive/status")
    };
  }

  return {
    kind: "archive-upload-status",
    scope: archiveStatusScope(scope),
    access: archiveStatusAccess(scope.actorId),
    query: archiveStatusQueryMetadata(scope.query, options),
    status: sanitizeArchiveStatusItem(value),
    policy: archiveStatusReadPolicy("/api/v1/uploads/{uploadId}/archive/status")
  };
}

function archiveStatusScope(scope: {
  projectId: string;
  actorId: string | undefined;
  launchId?: string;
  uploadId?: string;
}): Record<string, unknown> {
  return pickDefined(
    {
      projectId: sanitizeAuditText(scope.projectId),
      actorId: scope.actorId !== undefined ? sanitizeAuditText(scope.actorId) : undefined,
      launchId: scope.launchId !== undefined ? sanitizeAuditText(scope.launchId) : undefined,
      uploadId: scope.uploadId !== undefined ? sanitizeAuditText(scope.uploadId) : undefined
    },
    ["projectId", "actorId", "launchId", "uploadId"]
  );
}

export function archiveStatusAccess(actorId: string | undefined): Record<string, unknown> {
  return {
    scope: "uploads:read",
    requiredScopes: ["uploads:read", "launches:read"],
    projectScoped: true,
    actorScoped: actorId !== undefined,
    mutation: false,
    redacted: true
  };
}

function archiveStatusQueryMetadata(
  query: Record<string, string | undefined>,
  options: ResourceReadOptions
): Record<string, unknown> {
  return pickDefined(
    {
      status: query.status,
      limit: integerStringField(query.limit) ?? options.limit,
      cursor: query.cursor ?? null,
      diagnosticsLimit: integerStringField(query.diagnosticsLimit ?? query.limit) ?? options.limit,
      diagnosticsCursor: query.diagnosticsCursor ?? query.cursor ?? null
    },
    ["status", "limit", "cursor", "diagnosticsLimit", "diagnosticsCursor"]
  );
}

export function sanitizeArchiveLaunch(value: unknown): unknown {
  if (!isRecord(value)) {
    return undefined;
  }

  return pickDefined(
    {
      id: sanitizeAuditText(stringField(value, "id")),
      projectId: sanitizeAuditText(stringField(value, "projectId")),
      name: sanitizeArchiveText(stringField(value, "name")),
      status: optionalString(value.status),
      branch: typeof value.branch === "string" ? sanitizeArchiveText(value.branch) : undefined,
      commitSha:
        typeof value.commitSha === "string" ? sanitizeArchiveText(value.commitSha) : undefined,
      buildNumber:
        typeof value.buildNumber === "string" ? sanitizeArchiveText(value.buildNumber) : undefined,
      createdAt: value.createdAt,
      closedAt: value.closedAt,
      failedAt: value.failedAt,
      archivedAt: value.archivedAt
    },
    [
      "id",
      "projectId",
      "name",
      "status",
      "branch",
      "commitSha",
      "buildNumber",
      "createdAt",
      "closedAt",
      "failedAt",
      "archivedAt"
    ]
  );
}

function sanitizeArchiveProcessing(value: unknown): unknown {
  if (!isRecord(value)) {
    return undefined;
  }

  return pickDefined(
    {
      mode: optionalString(value.mode),
      extraction: optionalString(value.extraction),
      queue: optionalString(value.queue),
      workerBoundary: optionalString(value.workerBoundary),
      bounded: sanitizeArchiveBounded(value.bounded)
    },
    ["mode", "extraction", "queue", "workerBoundary", "bounded"]
  );
}

function sanitizeArchiveBounded(value: unknown): unknown {
  if (!isRecord(value)) {
    return undefined;
  }

  return pickDefined(
    {
      maxEntries: integerField(value, "maxEntries"),
      maxDiagnostics: integerField(value, "maxDiagnostics"),
      maxUploadSessionBytes: integerField(value, "maxUploadSessionBytes"),
      maxArtifactBytes: integerField(value, "maxArtifactBytes"),
      maxUploadConcurrency: integerField(value, "maxUploadConcurrency"),
      compression: optionalString(value.compression)
    },
    [
      "maxEntries",
      "maxDiagnostics",
      "maxUploadSessionBytes",
      "maxArtifactBytes",
      "maxUploadConcurrency",
      "compression"
    ]
  );
}

function sanitizeArchiveSummary(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) {
    return {};
  }

  return pickDefined(
    {
      total: integerField(value, "total"),
      queued: integerField(value, "queued"),
      processing: integerField(value, "processing"),
      completed: integerField(value, "completed"),
      completedWithErrors: integerField(value, "completedWithErrors"),
      failed: integerField(value, "failed"),
      acceptedEntries: integerField(value, "acceptedEntries"),
      ignoredEntries: integerField(value, "ignoredEntries"),
      importedResults: integerField(value, "importedResults"),
      storedArtifacts: integerField(value, "storedArtifacts"),
      diagnostics: integerField(value, "diagnostics"),
      warnings: integerField(value, "warnings"),
      errors: integerField(value, "errors")
    },
    [
      "total",
      "queued",
      "processing",
      "completed",
      "completedWithErrors",
      "failed",
      "acceptedEntries",
      "ignoredEntries",
      "importedResults",
      "storedArtifacts",
      "diagnostics",
      "warnings",
      "errors"
    ]
  );
}

function sanitizeArchiveStatusItem(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) {
    return {};
  }

  return pickDefined(
    {
      kind: "archive-upload-status",
      id: sanitizeAuditText(stringField(value, "id")),
      launchId: sanitizeAuditText(stringField(value, "launchId")),
      status: optionalString(value.status),
      phase: optionalString(value.phase),
      progress: sanitizeArchiveProgress(value.progress),
      archive: sanitizeArchiveMetadata(value.archive),
      worker: sanitizeArchiveWorker(value.worker),
      diagnostics: sanitizeArchiveDiagnosticsPage(value.diagnostics, {
        includeDetails: false,
        includeRaw: false,
        limit: 20,
        cursor: undefined,
        offset: 0
      }),
      createdAt: value.createdAt,
      updatedAt: value.updatedAt
    },
    [
      "kind",
      "id",
      "launchId",
      "status",
      "phase",
      "progress",
      "archive",
      "worker",
      "diagnostics",
      "createdAt",
      "updatedAt"
    ]
  );
}

function sanitizeArchiveProgress(value: unknown): unknown {
  if (!isRecord(value)) {
    return undefined;
  }

  return pickDefined(
    {
      receivedFiles: integerField(value, "receivedFiles"),
      importedResults: integerField(value, "importedResults"),
      duplicateResults: integerField(value, "duplicateResults"),
      storedArtifacts: integerField(value, "storedArtifacts"),
      errors: integerField(value, "errors")
    },
    ["receivedFiles", "importedResults", "duplicateResults", "storedArtifacts", "errors"]
  );
}

function sanitizeArchiveMetadata(value: unknown): unknown {
  if (!isRecord(value)) {
    return undefined;
  }

  return pickDefined(
    {
      name: typeof value.name === "string" ? sanitizeArchiveText(value.name) : undefined,
      format: optionalString(value.format),
      totalEntries: integerField(value, "totalEntries"),
      supportedFiles: integerField(value, "supportedFiles"),
      attachmentFiles: integerField(value, "attachmentFiles"),
      ignoredFiles: integerField(value, "ignoredFiles"),
      totalUncompressedBytes: integerField(value, "totalUncompressedBytes"),
      totalCompressedBytes: integerField(value, "totalCompressedBytes")
    },
    [
      "name",
      "format",
      "totalEntries",
      "supportedFiles",
      "attachmentFiles",
      "ignoredFiles",
      "totalUncompressedBytes",
      "totalCompressedBytes"
    ]
  );
}

function sanitizeArchiveWorker(value: unknown): unknown {
  if (!isRecord(value)) {
    return undefined;
  }

  return pickDefined(
    {
      queue: optionalString(value.queue),
      boundary: optionalString(value.boundary),
      retryable: typeof value.retryable === "boolean" ? value.retryable : undefined,
      persistence: optionalString(value.persistence)
    },
    ["queue", "boundary", "retryable", "persistence"]
  );
}

function sanitizeArchiveDiagnosticsPage(
  value: unknown,
  options: ResourceReadOptions
): Record<string, unknown> {
  if (!isRecord(value)) {
    return {
      page: pageMetadata(0, 0, 0, options.limit),
      items: []
    };
  }

  const items = arrayField(value, "items");
  return {
    page: isRecord(value.page)
      ? normalizePageMetadata(value.page, options, items.length)
      : pageMetadata(items.length, 0, items.length, options.limit),
    items: items.map((item) => sanitizeArchiveDiagnostic(item))
  };
}

function sanitizeArchiveDiagnostic(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) {
    return {};
  }

  return pickDefined(
    {
      scope: optionalString(value.scope),
      severity: optionalString(value.severity),
      code: sanitizeAuditText(stringField(value, "code")),
      message:
        typeof value.message === "string"
          ? truncateUtf8(sanitizeArchiveText(value.message), maxMcpPreviewBodyBytes).value
          : undefined,
      index: integerField(value, "index"),
      kind: optionalString(value.kind)
    },
    ["scope", "severity", "code", "message", "index", "kind"]
  );
}

function archiveStatusReadPolicy(restPath: string): Record<string, unknown> {
  return {
    restParity: {
      method: "GET",
      path: restPath
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
    rawPayloadsIncluded: false,
    rawPathsIncluded: false,
    storageKeysIncluded: false,
    signedUrlsIncluded: false,
    diagnosticsBounded: true,
    redactionRules: [
      "MCP requires projectId and forwards scope headers for the requested project only.",
      "Diagnostics are bounded and omit path fields even when REST includes redacted relative paths.",
      "Raw payload-like, storage key, URL, signed URL, token, cookie, password, and authorization fields are omitted or redacted.",
      "Archive status is read-only; no archive upload, retry, delete, or mutation tool is advertised."
    ]
  };
}
