import { fetchApiValue } from "./mcpApiClient.js";
import { sanitizeArchiveText } from "./mcpArchiveText.js";
import { archiveStatusAccess, archiveStatusHeaders } from "./mcpArchiveStatus.js";
import { sanitizeArchiveDiagnosticsReplayDenied } from "./mcpArchiveDiagnosticsReplay.js";
import {
  archiveDiagnosticReplayFixtureQueryMetadata,
  sanitizeArchiveDiagnosticReplayFixtureActor,
  sanitizeArchiveDiagnosticReplayFixtureProject
} from "./mcpArchiveDiagnosticReplayFixtures.js";
import { sanitizeCompareUrl } from "./mcpHistoryCompare.js";
import { normalizePageMetadata, pageMetadata, paginateItems } from "./mcpPagination.js";
import { maxMcpPreviewBodyBytes } from "./mcpPreviewConstants.js";
import type { ResourceReadOptions } from "./mcpReadOptions.js";
import { sanitizeAuditText } from "./mcpSanitizeText.js";
import { truncateUtf8 } from "./mcpTextBounds.js";
import {
  arrayField,
  booleanField,
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

export async function archiveDiagnosticReplayMaterializedFixturesRead(
  argumentsValue: Record<string, unknown>
): Promise<unknown | string> {
  const projectId = getRequiredString(argumentsValue, "projectId");
  if (projectId.error !== undefined) {
    return "projectId is required for archive diagnostic replay materialized fixture reads";
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

  return summarizeArchiveDiagnosticReplayMaterializedFixturesRead(
    await fetchApiValue(
      argumentsValue.apiUrl,
      withQuery(
        `/api/v1/projects/${encodeURIComponent(projectId.value)}/archive/diagnostics/replay/fixtures/materialized`,
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

function summarizeArchiveDiagnosticReplayMaterializedFixturesRead(
  value: unknown,
  options: ResourceReadOptions,
  scope: {
    projectId: string;
    actorId: string | undefined;
    query: Record<string, string | undefined>;
  }
): unknown {
  if (isApiStatusPayload(value)) {
    return sanitizeArchiveDiagnosticReplayMaterializedFixtureStatus(value, scope);
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
    kind: "archive-diagnostic-replay-fixture-materialized-list",
    project: sanitizeArchiveDiagnosticReplayFixtureProject(value.project, scope.projectId),
    actor: sanitizeArchiveDiagnosticReplayFixtureActor(value.actor, scope.actorId),
    access: archiveStatusAccess(scope.actorId),
    query: archiveDiagnosticReplayFixtureQueryMetadata(scope.projectId, scope.query, options),
    materialization: sanitizeArchiveDiagnosticReplayMaterializedFixtureMaterialization(
      value.materialization,
      returnedItems.length
    ),
    page,
    summary: sanitizeArchiveDiagnosticReplayMaterializedFixtureSummary(
      value.summary,
      scope.projectId
    ),
    items: returnedItems.map((item) =>
      sanitizeArchiveDiagnosticReplayMaterializedFixtureRecord(item, scope.projectId)
    ),
    links: sanitizeArchiveDiagnosticReplayMaterializedFixtureLinks(value.links, scope.projectId),
    policy: archiveDiagnosticReplayMaterializedFixturePolicy()
  };
}

function sanitizeArchiveDiagnosticReplayMaterializedFixtureStatus(
  value: Record<string, unknown>,
  scope: { projectId: string; actorId: string | undefined }
): Record<string, unknown> {
  return pickDefined(
    {
      kind: "archive-diagnostic-replay-fixture-materialized-list",
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
      policy: archiveDiagnosticReplayMaterializedFixturePolicy()
    },
    [
      "kind",
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

function sanitizeArchiveDiagnosticReplayMaterializedFixtureMaterialization(
  value: unknown,
  returnedCount: number
): Record<string, unknown> {
  const materializedRecordCount = isRecord(value)
    ? (integerField(value, "materializedRecordCount") ?? returnedCount)
    : returnedCount;

  return pickDefined(
    {
      adapterKind: "api-read-model-archive-diagnostic-replay-fixture-materialized-wip",
      boundary: "worker-compatible-archive-diagnostic-replay-fixture-materialized-read",
      consistency: "synthetic-fixture-contracts-idempotent",
      source: "synthetic-archive-diagnostic-replay-fixture-contracts",
      readOnly: true,
      mutation: false,
      rawArchivePayloadsIncluded: false,
      storageRefsIncluded: false,
      signedUrlsIncluded: false,
      tokensIncluded: false,
      materializedAt: isRecord(value) ? optionalString(value.materializedAt) : undefined,
      materializedRecordCount,
      materializationDigest: isRecord(value)
        ? sanitizeAuditText(stringField(value, "materializationDigest"))
        : undefined,
      mutationBoundary: "rest-materialized-read-only-no-archive-or-worker-mutation"
    },
    [
      "adapterKind",
      "boundary",
      "consistency",
      "source",
      "readOnly",
      "mutation",
      "rawArchivePayloadsIncluded",
      "storageRefsIncluded",
      "signedUrlsIncluded",
      "tokensIncluded",
      "materializedAt",
      "materializedRecordCount",
      "materializationDigest",
      "mutationBoundary"
    ]
  );
}

function sanitizeArchiveDiagnosticReplayMaterializedFixtureSummary(
  value: unknown,
  projectId: string
): Record<string, unknown> {
  if (!isRecord(value)) {
    return {
      projectId: sanitizeAuditText(projectId),
      materializedRecordCount: 0,
      fixtureNames: [],
      rawArchivePayloadsIncluded: false,
      storageRefsIncluded: false,
      signedUrlsIncluded: false,
      tokensIncluded: false,
      redactionPassed: true,
      mutationBoundary: "api-materialized-fixture-read-only-no-rest-or-worker-mutation"
    };
  }

  return pickDefined(
    {
      projectId: sanitizeAuditText(stringField(value, "projectId") || projectId),
      materializedRecordCount: integerField(value, "materializedRecordCount"),
      fixtureNames: arrayField(value, "fixtureNames")
        .map((item) => (typeof item === "string" ? sanitizeArchiveText(item) : undefined))
        .filter((item): item is string => item !== undefined),
      supportedFiles: integerField(value, "supportedFiles"),
      attachmentFiles: integerField(value, "attachmentFiles"),
      ignoredFiles: integerField(value, "ignoredFiles"),
      warningCount: integerField(value, "warningCount"),
      parseErrors: integerField(value, "parseErrors"),
      attemptGroups: integerField(value, "attemptGroups"),
      retryAwareCount: integerField(value, "retryAwareCount"),
      duplicateAwareCount: integerField(value, "duplicateAwareCount"),
      deniedFixtureCount: integerField(value, "deniedFixtureCount"),
      rawArchivePayloadsIncluded: false,
      storageRefsIncluded: false,
      signedUrlsIncluded: false,
      tokensIncluded: false,
      redactionPassed: true,
      materializationDigest: sanitizeAuditText(stringField(value, "materializationDigest")),
      mutationBoundary: "api-materialized-fixture-read-only-no-rest-or-worker-mutation"
    },
    [
      "projectId",
      "materializedRecordCount",
      "fixtureNames",
      "supportedFiles",
      "attachmentFiles",
      "ignoredFiles",
      "warningCount",
      "parseErrors",
      "attemptGroups",
      "retryAwareCount",
      "duplicateAwareCount",
      "deniedFixtureCount",
      "rawArchivePayloadsIncluded",
      "storageRefsIncluded",
      "signedUrlsIncluded",
      "tokensIncluded",
      "redactionPassed",
      "materializationDigest",
      "mutationBoundary"
    ]
  );
}

function sanitizeArchiveDiagnosticReplayMaterializedFixtureRecord(
  value: unknown,
  projectId: string
): Record<string, unknown> {
  if (!isRecord(value)) {
    return {};
  }

  return pickDefined(
    {
      kind: "archive-diagnostic-replay-fixture-materialized",
      projectId: sanitizeAuditText(stringField(value, "projectId") || projectId),
      fixtureRef: sanitizeArchiveText(stringField(value, "fixtureRef")),
      materializedRef: sanitizeArchiveText(stringField(value, "materializedRef")),
      name: sanitizeArchiveText(stringField(value, "name")),
      scenario: sanitizeArchiveText(stringField(value, "scenario")),
      materializedAt: optionalString(value.materializedAt),
      sourceDigest: sanitizeAuditText(stringField(value, "sourceDigest")),
      recordDigest: sanitizeAuditText(stringField(value, "recordDigest")),
      status: optionalString(value.status),
      evidence: sanitizeArchiveDiagnosticReplayMaterializedFixtureEvidence(value.evidence),
      materialization: sanitizeArchiveDiagnosticReplayMaterializedFixtureItemMaterialization(
        value.materialization
      ),
      execution: sanitizeArchiveDiagnosticReplayMaterializedFixtureExecution(value.execution)
    },
    [
      "kind",
      "projectId",
      "fixtureRef",
      "materializedRef",
      "name",
      "scenario",
      "materializedAt",
      "sourceDigest",
      "recordDigest",
      "status",
      "evidence",
      "materialization",
      "execution"
    ]
  );
}

function sanitizeArchiveDiagnosticReplayMaterializedFixtureEvidence(
  value: unknown
): Record<string, unknown> {
  const record = isRecord(value) ? value : {};
  return pickDefined(
    {
      supportedFiles: integerField(record, "supportedFiles"),
      attachmentFiles: integerField(record, "attachmentFiles"),
      ignoredFiles: integerField(record, "ignoredFiles"),
      warningCount: integerField(record, "warningCount"),
      parseErrors: integerField(record, "parseErrors"),
      attemptGroups: integerField(record, "attemptGroups"),
      retryAware: booleanField(record, "retryAware"),
      duplicateAware: booleanField(record, "duplicateAware"),
      deniedFixture: booleanField(record, "deniedFixture"),
      rawArchivePayloadsIncluded: false,
      storageRefsIncluded: false,
      signedUrlsIncluded: false,
      tokensIncluded: false,
      redactionPassed: true,
      mutationBoundary: "rest-materialized-read-only-no-archive-or-worker-mutation"
    },
    [
      "supportedFiles",
      "attachmentFiles",
      "ignoredFiles",
      "warningCount",
      "parseErrors",
      "attemptGroups",
      "retryAware",
      "duplicateAware",
      "deniedFixture",
      "rawArchivePayloadsIncluded",
      "storageRefsIncluded",
      "signedUrlsIncluded",
      "tokensIncluded",
      "redactionPassed",
      "mutationBoundary"
    ]
  );
}

function sanitizeArchiveDiagnosticReplayMaterializedFixtureItemMaterialization(
  _value: unknown
): Record<string, unknown> {
  return {
    adapterKind: "api-read-model-archive-diagnostic-replay-fixture-materialized-wip",
    boundary: "worker-compatible-archive-diagnostic-replay-fixture-materialized-read",
    consistency: "synthetic-fixture-contracts-idempotent",
    source: "synthetic-archive-diagnostic-replay-fixture-contract",
    readOnly: true,
    rawArchivePayloadsIncluded: false,
    storageRefsIncluded: false,
    signedUrlsIncluded: false,
    tokensIncluded: false,
    mutationBoundary: "rest-materialized-read-only-no-archive-or-worker-mutation"
  };
}

function sanitizeArchiveDiagnosticReplayMaterializedFixtureExecution(
  _value: unknown
): Record<string, unknown> {
  return {
    replayStarted: false,
    workerJobEnqueued: false,
    storageMutationStarted: false,
    readOnly: true,
    mutation: false
  };
}

function sanitizeArchiveDiagnosticReplayMaterializedFixtureLinks(
  value: unknown,
  projectId: string
): Record<string, unknown> {
  const self =
    isRecord(value) && typeof value.self === "string"
      ? sanitizeCompareUrl(value.self)
      : `/api/v1/projects/${encodeURIComponent(projectId)}/archive/diagnostics/replay/fixtures/materialized`;
  return {
    self,
    fixtureContracts: `/api/v1/projects/${encodeURIComponent(projectId)}/archive/diagnostics/replay/fixtures`
  };
}

function archiveDiagnosticReplayMaterializedFixturePolicy(): Record<string, unknown> {
  return {
    restParity: {
      method: "GET",
      path: "/api/v1/projects/{projectId}/archive/diagnostics/replay/fixtures/materialized"
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
    storageMutationAllowed: false,
    rawManifestEntriesIncluded: false,
    rawResultFilesIncluded: false,
    resultContentIncluded: false,
    rawPayloadsIncluded: false,
    rawPathsIncluded: false,
    storageRefsIncluded: false,
    signedUrlsIncluded: false,
    tokensIncluded: false,
    credentialsIncluded: false,
    paginationRequired: true,
    redactionRules: [
      "MCP reads materialized synthetic fixture summaries from REST and does not import, unpack, replay, retry, delete, enqueue workers, write storage, or mutate archives.",
      "Manifest entries, result files, result content, local paths, storage references, signed URLs, tokens, credentials, cookies, passwords, authorization data, and archive bytes are omitted or redacted.",
      "Project and actor scope headers are forwarded to REST and MCP never broadens the requested scope."
    ]
  };
}
