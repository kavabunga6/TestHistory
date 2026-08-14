import { fetchApiValue } from "./mcpApiClient.js";
import { sanitizeArchiveText } from "./mcpArchiveText.js";
import { archiveStatusAccess, archiveStatusHeaders } from "./mcpArchiveStatus.js";
import { sanitizeArchiveDiagnosticsReplayDenied } from "./mcpArchiveDiagnosticsReplay.js";
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
  numericField,
  optionalPositiveInteger,
  optionalString,
  pickDefined,
  stringField,
  withQuery
} from "./mcpValueUtils.js";

export async function archiveDiagnosticReplayFixturesRead(
  argumentsValue: Record<string, unknown>
): Promise<unknown | string> {
  const projectId = getRequiredString(argumentsValue, "projectId");
  if (projectId.error !== undefined) {
    return "projectId is required for archive diagnostic replay fixture reads";
  }

  const options: ResourceReadOptions = {
    includeDetails: false,
    includeRaw: false,
    limit: optionalPositiveInteger(argumentsValue.limit, 20, 100),
    cursor: optionalString(argumentsValue.cursor),
    offset: cursorOffset(optionalString(argumentsValue.cursor))
  };
  const actorId = optionalString(argumentsValue.actorId);
  const query = {
    limit: String(options.limit),
    cursor: options.cursor
  };

  return summarizeArchiveDiagnosticReplayFixturesRead(
    await fetchApiValue(
      argumentsValue.apiUrl,
      withQuery(
        `/api/v1/projects/${encodeURIComponent(projectId.value)}/archive/diagnostics/replay/fixtures`,
        query
      ),
      { headers: archiveStatusHeaders(projectId.value, actorId) }
    ),
    options,
    {
      projectId: projectId.value,
      actorId,
      query
    }
  );
}

function summarizeArchiveDiagnosticReplayFixturesRead(
  value: unknown,
  options: ResourceReadOptions,
  scope: {
    projectId: string;
    actorId: string | undefined;
    query: Record<string, string | undefined>;
  }
): unknown {
  if (isApiStatusPayload(value)) {
    return sanitizeArchiveDiagnosticReplayFixtureStatus(value, scope);
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
    kind: "archive-diagnostic-replay-fixture-list",
    project: sanitizeArchiveDiagnosticReplayFixtureProject(value.project, scope.projectId),
    actor: sanitizeArchiveDiagnosticReplayFixtureActor(value.actor, scope.actorId),
    access: archiveStatusAccess(scope.actorId),
    query: archiveDiagnosticReplayFixtureQueryMetadata(scope.projectId, scope.query, options),
    page,
    summary: sanitizeArchiveDiagnosticReplayFixtureSummary(value.summary),
    items: returnedItems.map((item) =>
      sanitizeArchiveDiagnosticReplayFixtureContract(item, scope.projectId)
    ),
    links: sanitizeArchiveDiagnosticReplayFixtureLinks(value.links, scope.projectId),
    policy: archiveDiagnosticReplayFixturePolicy()
  };
}

function sanitizeArchiveDiagnosticReplayFixtureStatus(
  value: Record<string, unknown>,
  scope: { projectId: string; actorId: string | undefined }
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
      project: { id: sanitizeAuditText(scope.projectId), scoped: true },
      actor: sanitizeArchiveDiagnosticReplayFixtureActor(undefined, scope.actorId),
      permissionDenied: sanitizeArchiveDiagnosticsReplayDenied(value.permissionDenied),
      redacted: true,
      policy: archiveDiagnosticReplayFixturePolicy()
    },
    [
      "status",
      "code",
      "message",
      "url",
      "project",
      "actor",
      "permissionDenied",
      "redacted",
      "policy"
    ]
  );
}

export function sanitizeArchiveDiagnosticReplayFixtureProject(
  value: unknown,
  projectId: string
): Record<string, unknown> {
  if (!isRecord(value)) {
    return { id: sanitizeAuditText(projectId), scoped: true };
  }
  return {
    id: sanitizeAuditText(stringField(value, "id") || projectId),
    scoped: true
  };
}

export function sanitizeArchiveDiagnosticReplayFixtureActor(
  value: unknown,
  actorId: string | undefined
): Record<string, unknown> {
  if (!isRecord(value)) {
    return {
      id: actorId !== undefined ? sanitizeAuditText(actorId) : "anonymous",
      scoped: actorId !== undefined
    };
  }

  const restActorId = stringField(value, "id");
  return {
    id: sanitizeAuditText(restActorId || actorId || "anonymous"),
    scoped: value.scoped === true || actorId !== undefined
  };
}

export function archiveDiagnosticReplayFixtureQueryMetadata(
  projectId: string,
  query: Record<string, string | undefined>,
  options: ResourceReadOptions
): Record<string, unknown> {
  return {
    projectId: sanitizeAuditText(projectId),
    limit: integerStringField(query.limit) ?? options.limit,
    cursor: query.cursor ?? null
  };
}

function sanitizeArchiveDiagnosticReplayFixtureSummary(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) {
    return archiveDiagnosticReplayFixtureEmptySummary();
  }

  return pickDefined(
    {
      totalFixtures: integerField(value, "totalFixtures"),
      fixtureNames: arrayField(value, "fixtureNames")
        .map((item) => (typeof item === "string" ? sanitizeArchiveText(item) : undefined))
        .filter((item): item is string => item !== undefined),
      supportedFiles: integerField(value, "supportedFiles"),
      attachmentFiles: integerField(value, "attachmentFiles"),
      ignoredFiles: integerField(value, "ignoredFiles"),
      warningCount: integerField(value, "warningCount"),
      parseErrors: integerField(value, "parseErrors"),
      attemptGroups: integerField(value, "attemptGroups"),
      readOnly: true,
      mutation: false,
      archivePayloadAvailable: false,
      rawManifestEntriesReturned: false,
      rawResultFilesReturned: false,
      resultContentReturned: false,
      rawPathsReturned: false,
      payloadBytesReturned: 0,
      redacted: true
    },
    [
      "totalFixtures",
      "fixtureNames",
      "supportedFiles",
      "attachmentFiles",
      "ignoredFiles",
      "warningCount",
      "parseErrors",
      "attemptGroups",
      "readOnly",
      "mutation",
      "archivePayloadAvailable",
      "rawManifestEntriesReturned",
      "rawResultFilesReturned",
      "resultContentReturned",
      "rawPathsReturned",
      "payloadBytesReturned",
      "redacted"
    ]
  );
}

function archiveDiagnosticReplayFixtureEmptySummary(): Record<string, unknown> {
  return {
    totalFixtures: 0,
    fixtureNames: [],
    supportedFiles: 0,
    attachmentFiles: 0,
    ignoredFiles: 0,
    warningCount: 0,
    parseErrors: 0,
    attemptGroups: 0,
    readOnly: true,
    mutation: false,
    archivePayloadAvailable: false,
    rawManifestEntriesReturned: false,
    rawResultFilesReturned: false,
    resultContentReturned: false,
    rawPathsReturned: false,
    payloadBytesReturned: 0,
    redacted: true
  };
}

function sanitizeArchiveDiagnosticReplayFixtureContract(
  value: unknown,
  projectId: string
): Record<string, unknown> {
  if (!isRecord(value)) {
    return {};
  }

  return pickDefined(
    {
      kind: "archive-diagnostic-replay-fixture",
      projectId: sanitizeAuditText(stringField(value, "projectId") || projectId),
      fixtureRef: sanitizeArchiveText(stringField(value, "fixtureRef")),
      name: sanitizeArchiveText(stringField(value, "name")),
      scenario: sanitizeArchiveText(stringField(value, "scenario")),
      expected: sanitizeArchiveDiagnosticReplayFixtureExpected(value.expected),
      replay: sanitizeArchiveDiagnosticReplayFixtureReplay(value.replay),
      payload: sanitizeArchiveDiagnosticReplayFixturePayload(value.payload),
      digest: sanitizeAuditText(stringField(value, "digest"))
    },
    [
      "kind",
      "projectId",
      "fixtureRef",
      "name",
      "scenario",
      "expected",
      "replay",
      "payload",
      "digest"
    ]
  );
}

function sanitizeArchiveDiagnosticReplayFixtureExpected(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) {
    return {};
  }

  return pickDefined(
    {
      supportedFiles: integerField(value, "supportedFiles"),
      attachmentFiles: integerField(value, "attachmentFiles"),
      ignoredFiles: integerField(value, "ignoredFiles"),
      warningCount: integerField(value, "warningCount"),
      parseErrors: integerField(value, "parseErrors"),
      attemptGroups: integerField(value, "attemptGroups"),
      latestStatuses: arrayField(value, "latestStatuses")
        .map((item) => (typeof item === "string" ? sanitizeArchiveText(item) : undefined))
        .filter((item): item is string => item !== undefined)
    },
    [
      "supportedFiles",
      "attachmentFiles",
      "ignoredFiles",
      "warningCount",
      "parseErrors",
      "attemptGroups",
      "latestStatuses"
    ]
  );
}

function sanitizeArchiveDiagnosticReplayFixtureReplay(value: unknown): Record<string, unknown> {
  const compatibleSources = isRecord(value)
    ? arrayField(value, "compatibleSources")
        .map((item) => (typeof item === "string" ? sanitizeArchiveText(item) : undefined))
        .filter(
          (item): item is string =>
            item !== undefined &&
            ["archive.status.read", "archive.diagnostics.read", "archive.cleanup.preview"].includes(
              item
            )
        )
    : [];

  return {
    deterministic: true,
    compatibleSources:
      compatibleSources.length > 0
        ? compatibleSources
        : ["archive.status.read", "archive.diagnostics.read", "archive.cleanup.preview"],
    retryAware: isRecord(value) && value.retryAware === true,
    duplicateAware: isRecord(value) && value.duplicateAware === true,
    deniedFixture: isRecord(value) && value.deniedFixture === true,
    closedArchiveStatusReadCompatible: true,
    closedArchiveDiagnosticsReadCompatible: true,
    mutationBoundary: "fixture-read-only-no-replay-mutation"
  };
}

function sanitizeArchiveDiagnosticReplayFixturePayload(_value: unknown): Record<string, unknown> {
  return {
    archivePayloadAvailable: false,
    manifestEntriesReturned: false,
    resultFilesReturned: false,
    resultContentReturned: false,
    rawPathsReturned: false,
    payloadBytesReturned: 0,
    redacted: true
  };
}

function sanitizeArchiveDiagnosticReplayFixtureLinks(
  value: unknown,
  projectId: string
): Record<string, unknown> {
  const self =
    isRecord(value) && typeof value.self === "string"
      ? sanitizeCompareUrl(value.self)
      : `/api/v1/projects/${encodeURIComponent(projectId)}/archive/diagnostics/replay/fixtures`;
  return { self };
}

function archiveDiagnosticReplayFixturePolicy(): Record<string, unknown> {
  return {
    restParity: {
      method: "GET",
      path: "/api/v1/projects/{projectId}/archive/diagnostics/replay/fixtures"
    },
    projectIdRequired: true,
    actorIdPassThrough: true,
    headersForwarded: [
      "X-TestHistory-Scopes",
      "X-TestHistory-Project-Scope",
      "X-TestHistory-Actor-Id"
    ],
    equalOrNarrowerThanRest: true,
    syntheticOnly: true,
    mutationAllowed: false,
    workerExecutionAllowed: false,
    rawManifestEntriesIncluded: false,
    rawResultFilesIncluded: false,
    resultContentIncluded: false,
    rawPayloadsIncluded: false,
    rawPathsIncluded: false,
    storageRefsIncluded: false,
    signedUrlsIncluded: false,
    tokensIncluded: false,
    paginationRequired: true,
    redactionRules: [
      "MCP reads synthetic fixture contracts from REST and does not import, unpack, replay, retry, delete, or mutate archives.",
      "Manifest entries, result files, result content, local paths, storage references, signed URLs, tokens, cookies, passwords, authorization data, and archive bytes are omitted or redacted.",
      "Project and actor scope headers are forwarded to REST and MCP never broadens the requested scope."
    ]
  };
}
