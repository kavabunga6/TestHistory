import { fetchApiValue } from "./mcpApiClient.js";
import { normalizePageMetadata, pageMetadata, paginateItems } from "./mcpPagination.js";
import type { ResourceReadOptions } from "./mcpReadOptions.js";
import {
  defectMuteProjectionHeaders,
  defectMuteProjectionInvariantQuery,
  defectMuteProjectionInvariantQueryMetadata,
  sanitizeDefectMuteProjectionAccess,
  sanitizeDefectMuteProjectionRawEffectiveSeparation,
  sanitizeProjectionDenied,
  sanitizeProjectionStringList,
  sanitizeProjectionText
} from "./mcpDefectMuteProjectionShared.js";
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

export async function defectMuteProjectionInvariantMaterializedRead(
  argumentsValue: Record<string, unknown>
): Promise<unknown | string> {
  const projectId = getRequiredString(argumentsValue, "projectId");
  if (projectId.error !== undefined) {
    return "projectId is required for materialized defect mute replay invariant reads";
  }

  const options: ResourceReadOptions = {
    includeDetails: false,
    includeRaw: false,
    limit: optionalPositiveInteger(argumentsValue.limit, 100, 500),
    cursor: optionalString(argumentsValue.cursor),
    offset: cursorOffset(optionalString(argumentsValue.cursor))
  };
  const actorId = optionalString(argumentsValue.actorId);
  const query = defectMuteProjectionInvariantQuery(options, actorId);
  return summarizeDefectMuteProjectionInvariantMaterializedRead(
    await fetchApiValue(
      argumentsValue.apiUrl,
      withQuery(
        `/api/v1/projects/${encodeURIComponent(projectId.value)}/defect-mutes/projection/replay/invariants/materialized`,
        query
      ),
      { headers: defectMuteProjectionHeaders(projectId.value, actorId) }
    ),
    options,
    { projectId: projectId.value, actorId, query }
  );
}

export function summarizeDefectMuteProjectionInvariantMaterializedRead(
  value: unknown,
  options: ResourceReadOptions,
  scope: {
    projectId: string;
    actorId: string | undefined;
    query: Record<string, string | undefined>;
  }
): unknown {
  if (isApiStatusPayload(value)) {
    return sanitizeDefectMuteProjectionInvariantMaterializedStatus(value);
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
  const actor =
    scope.actorId !== undefined
      ? { type: "actor", actorId: sanitizeProjectionText(scope.actorId), scoped: true }
      : undefined;

  return pickDefined(
    {
      kind: "defect-mute-replay-invariant-materialized-read",
      compact: true,
      projectId: sanitizeProjectionText(scope.projectId),
      actor,
      access: sanitizeDefectMuteProjectionAccess(value.access, scope.actorId),
      availability: sanitizeDefectMuteProjectionInvariantMaterializedAvailability(
        value.availability,
        scope.actorId
      ),
      query: defectMuteProjectionInvariantQueryMetadata(scope.query, scope.projectId, options),
      materialization: sanitizeDefectMuteProjectionInvariantMaterialization(
        value.materialization,
        returnedItems.length
      ),
      summary: sanitizeDefectMuteProjectionInvariantMaterializedSummary(
        value.summary,
        scope.projectId
      ),
      page,
      items: returnedItems.map((item) =>
        sanitizeDefectMuteProjectionInvariantMaterializedItem(item)
      ),
      policy: defectMuteProjectionInvariantMaterializedReadPolicy()
    },
    [
      "kind",
      "compact",
      "projectId",
      "actor",
      "access",
      "availability",
      "query",
      "materialization",
      "summary",
      "page",
      "items",
      "policy"
    ]
  );
}

export function sanitizeDefectMuteProjectionInvariantMaterializedStatus(
  value: Record<string, unknown>
): unknown {
  const deniedAvailability =
    isRecord(value.permissionDenied) && isRecord(value.permissionDenied.availability)
      ? value.permissionDenied.availability
      : value.availability;

  return pickDefined(
    {
      status: value.status,
      code: numericField(value, "code"),
      message:
        typeof value.message === "string" ? sanitizeProjectionText(value.message) : undefined,
      kind:
        stringField(value, "kind") === "defect-mute-replay-invariant-materialized-read"
          ? "defect-mute-replay-invariant-materialized-read"
          : undefined,
      permissionDenied: sanitizeProjectionDenied(value.permissionDenied),
      availability: sanitizeDefectMuteProjectionInvariantMaterializedAvailability(
        deniedAvailability,
        undefined
      ),
      redacted: true,
      policy: defectMuteProjectionInvariantMaterializedReadPolicy()
    },
    ["status", "code", "message", "kind", "permissionDenied", "availability", "redacted", "policy"]
  );
}

export function sanitizeDefectMuteProjectionInvariantMaterializedAvailability(
  value: unknown,
  actorId: string | undefined
): Record<string, unknown> {
  const actorScoped =
    isRecord(value) && typeof value.actorScoped === "boolean"
      ? value.actorScoped
      : actorId !== undefined;

  if (!isRecord(value)) {
    return {
      status: "partial",
      projectScoped: true,
      actorScoped,
      redacted: true,
      partial: true,
      unavailable: []
    };
  }

  const status =
    typeof value.status === "string" &&
    ["ready", "partial", "empty", "denied"].includes(value.status)
      ? value.status
      : "partial";

  return pickDefined(
    {
      status,
      reason: typeof value.reason === "string" ? sanitizeProjectionText(value.reason) : undefined,
      projectScoped: true,
      actorScoped,
      redacted: true,
      partial: typeof value.partial === "boolean" ? value.partial : status === "partial",
      unavailable: sanitizeMaterializedInvariantUnavailableList(arrayField(value, "unavailable"))
    },
    ["status", "reason", "projectScoped", "actorScoped", "redacted", "partial", "unavailable"]
  );
}

export function sanitizeMaterializedInvariantUnavailableList(value: unknown[]): string[] {
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => {
      if (item === "redaction" || item === "defect-mute-replay-invariant-materialized-read") {
        return item;
      }
      return "[redacted]";
    });
}

export function sanitizeDefectMuteProjectionInvariantMaterialization(
  value: unknown,
  materializedRecordCount: number
): Record<string, unknown> {
  if (!isRecord(value)) {
    return {
      adapterKind: "api-read-model-defect-mute-replay-invariant-materialized-wip",
      boundary: "worker-compatible-defect-mute-replay-invariant-materialized-read",
      consistency: "retry-safe-idempotent-projected-mute-state",
      source: "projected-defect-mute-state",
      readOnly: true,
      rawFailurePayloadsIncluded: false,
      mutationBoundary: "rest-read-only-no-worker-or-replay-mutation",
      materializedRecordCount,
      materializationDigest: ""
    };
  }

  return pickDefined(
    {
      adapterKind: "api-read-model-defect-mute-replay-invariant-materialized-wip",
      boundary: "worker-compatible-defect-mute-replay-invariant-materialized-read",
      consistency: "retry-safe-idempotent-projected-mute-state",
      source: "projected-defect-mute-state",
      readOnly: true,
      rawFailurePayloadsIncluded: false,
      mutationBoundary: "rest-read-only-no-worker-or-replay-mutation",
      materializedAt:
        typeof value.materializedAt === "string"
          ? sanitizeProjectionText(value.materializedAt)
          : undefined,
      materializedRecordCount:
        integerField(value, "materializedRecordCount") ?? materializedRecordCount,
      materializationDigest: sanitizeProjectionText(stringField(value, "materializationDigest"))
    },
    [
      "adapterKind",
      "boundary",
      "consistency",
      "source",
      "readOnly",
      "rawFailurePayloadsIncluded",
      "mutationBoundary",
      "materializedAt",
      "materializedRecordCount",
      "materializationDigest"
    ]
  );
}

export function sanitizeDefectMuteProjectionInvariantMaterializedSummary(
  value: unknown,
  projectId: string
): Record<string, unknown> {
  if (!isRecord(value)) {
    return {
      projectId: sanitizeProjectionText(projectId),
      materializedRecordCount: 0,
      deterministic: false,
      recomputable: false,
      projectScoped: false,
      redactionPassed: false,
      rawFailureOccurrenceCount: 0,
      effectiveRecordCount: 0,
      projectedMuteStateCompatible: true,
      mutationBoundary: "api-materialized-read-only-no-rest-or-worker-mutation",
      plannedOperations: []
    };
  }

  return pickDefined(
    {
      projectId: sanitizeProjectionText(stringField(value, "projectId") || projectId),
      materializedRecordCount: integerField(value, "materializedRecordCount") ?? 0,
      deterministic: booleanField(value, "deterministic") ?? false,
      recomputable: booleanField(value, "recomputable") ?? false,
      projectScoped: booleanField(value, "projectScoped") ?? false,
      appendOnlyUniqueProjectedEventIds:
        booleanField(value, "appendOnlyUniqueProjectedEventIds") ?? false,
      redactionPassed: booleanField(value, "redactionPassed") ?? false,
      effectiveStateExcludesRawFailureHistory:
        booleanField(value, "effectiveStateExcludesRawFailureHistory") ?? false,
      rawFailureHistoryPreserved: booleanField(value, "rawFailureHistoryPreserved") ?? false,
      rawFailureHistoryNotMutatedByUnmute:
        booleanField(value, "rawFailureHistoryNotMutatedByUnmute") ?? false,
      rawFailureOccurrenceCount: integerField(value, "rawFailureOccurrenceCount") ?? 0,
      effectiveRecordCount: integerField(value, "effectiveRecordCount") ?? 0,
      materializationDigest: sanitizeProjectionText(stringField(value, "materializationDigest")),
      projectedMuteStateCompatible: true,
      mutationBoundary: "api-materialized-read-only-no-rest-or-worker-mutation",
      plannedOperations: sanitizeProjectionStringList(
        arrayField(value, "plannedOperations")
      ).filter(
        (operation) =>
          operation === "defect_mute.replay_invariant.summarize" ||
          operation === "defect_mute.replay_invariant.materialized_read"
      )
    },
    [
      "projectId",
      "materializedRecordCount",
      "deterministic",
      "recomputable",
      "projectScoped",
      "appendOnlyUniqueProjectedEventIds",
      "redactionPassed",
      "effectiveStateExcludesRawFailureHistory",
      "rawFailureHistoryPreserved",
      "rawFailureHistoryNotMutatedByUnmute",
      "rawFailureOccurrenceCount",
      "effectiveRecordCount",
      "materializationDigest",
      "projectedMuteStateCompatible",
      "mutationBoundary",
      "plannedOperations"
    ]
  );
}

export function sanitizeDefectMuteProjectionInvariantMaterializedItem(
  value: unknown
): Record<string, unknown> {
  if (!isRecord(value)) {
    return {};
  }

  return pickDefined(
    {
      invariantRef: sanitizeProjectionText(stringField(value, "invariantRef")),
      projectId: sanitizeProjectionText(stringField(value, "projectId")),
      source: "projected-defect-mute-state",
      materializedAt: sanitizeProjectionText(stringField(value, "materializedAt")),
      deterministic: booleanField(value, "deterministic") ?? false,
      recomputable: booleanField(value, "recomputable") ?? false,
      projectScoped: booleanField(value, "projectScoped") ?? false,
      appendOnly: sanitizeDefectMuteProjectionMaterializedAppendOnly(value.appendOnly),
      redaction: sanitizeDefectMuteProjectionMaterializedRedaction(value.redaction),
      rawEffectiveSeparation: sanitizeDefectMuteProjectionMaterializedRawEffectiveSeparation(
        value.rawEffectiveSeparation
      ),
      projectionDigest: sanitizeProjectionText(stringField(value, "projectionDigest")),
      recomputedDigest: sanitizeProjectionText(stringField(value, "recomputedDigest")),
      evidenceDigest: sanitizeProjectionText(stringField(value, "evidenceDigest"))
    },
    [
      "invariantRef",
      "projectId",
      "source",
      "materializedAt",
      "deterministic",
      "recomputable",
      "projectScoped",
      "appendOnly",
      "redaction",
      "rawEffectiveSeparation",
      "projectionDigest",
      "recomputedDigest",
      "evidenceDigest"
    ]
  );
}

export function sanitizeDefectMuteProjectionMaterializedAppendOnly(
  value: unknown
): Record<string, unknown> {
  if (!isRecord(value)) {
    return {
      uniqueProjectedEventIds: false,
      projectedEventCount: 0,
      duplicateEventCount: 0,
      duplicateEventIdHashes: []
    };
  }
  return {
    uniqueProjectedEventIds: booleanField(value, "uniqueProjectedEventIds") ?? false,
    projectedEventCount: integerField(value, "projectedEventCount") ?? 0,
    duplicateEventCount: integerField(value, "duplicateEventCount") ?? 0,
    duplicateEventIdHashes: sanitizeProjectionStringList(
      arrayField(value, "duplicateEventIdHashes")
    )
  };
}

export function sanitizeDefectMuteProjectionMaterializedRedaction(
  value: unknown
): Record<string, unknown> {
  if (!isRecord(value)) {
    return { passed: false, leakedMarkerCount: 0, leakedMarkerHashes: [] };
  }
  return {
    passed: booleanField(value, "passed") ?? false,
    leakedMarkerCount: integerField(value, "leakedMarkerCount") ?? 0,
    leakedMarkerHashes: sanitizeProjectionStringList(arrayField(value, "leakedMarkerHashes"))
  };
}

export function sanitizeDefectMuteProjectionMaterializedRawEffectiveSeparation(
  value: unknown
): Record<string, unknown> {
  const separation = sanitizeDefectMuteProjectionRawEffectiveSeparation(value);
  const safe = { ...separation };
  delete safe.documentation;
  return { ...safe, rawFailurePayloadIncluded: false };
}

export function defectMuteProjectionInvariantMaterializedReadPolicy(): Record<string, unknown> {
  return {
    restParity: {
      method: "GET",
      path: "/api/v1/projects/{projectId}/defect-mutes/projection/replay/invariants/materialized"
    },
    headersForwarded: [
      "X-TestHistory-Scopes",
      "X-TestHistory-Project-Scope",
      "X-TestHistory-Actor-Id"
    ],
    equalOrNarrowerThanRest: true,
    mutationAllowed: false,
    mcpReplayExecution: false,
    mcpWorkerExecution: false,
    materializedInvariantReadModel: true,
    rawFailurePayloadsIncluded: false,
    deniedStateMasked: true,
    redactionRules: [
      "MCP reads the REST materialized defect mute replay invariant read model and never executes replay, worker, or persistence work.",
      "Project and optional actor scope are forwarded to REST; MCP does not broaden scope.",
      "Only materialized summaries, digests, counters, page metadata, and read policy are returned.",
      "Raw failure payloads, traces, local paths, storage refs, signed URLs, tokens, cookies, passwords, and authorization fields are omitted or redacted.",
      "No materialized invariant refresh, defect mute create, delete, unmute, replay, worker execution, or projection mutation tool is advertised."
    ]
  };
}
