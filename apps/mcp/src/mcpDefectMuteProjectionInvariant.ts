import { fetchApiValue } from "./mcpApiClient.js";
import { normalizePageMetadata, pageMetadata, paginateItems } from "./mcpPagination.js";
import type { ResourceReadOptions } from "./mcpReadOptions.js";
import {
  defectMuteProjectionHeaders,
  defectMuteProjectionInvariantQuery,
  defectMuteProjectionInvariantQueryMetadata,
  defectMuteProjectionInvariantScope,
  sanitizeDefectMuteProjectionAccess,
  sanitizeDefectMuteProjectionRawEffectiveSeparation,
  sanitizeProjectionDenied,
  sanitizeProjectionStringList,
  sanitizeProjectionText
} from "./mcpDefectMuteProjectionShared.js";
import {
  arrayField,
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

export async function defectMuteProjectionInvariantRead(
  argumentsValue: Record<string, unknown>
): Promise<unknown | string> {
  const projectId = getRequiredString(argumentsValue, "projectId");
  if (projectId.error !== undefined) {
    return "projectId is required for defect mute replay invariant reads";
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
  return summarizeDefectMuteProjectionInvariantRead(
    await fetchApiValue(
      argumentsValue.apiUrl,
      withQuery(
        `/api/v1/projects/${encodeURIComponent(projectId.value)}/defect-mutes/projection/replay/invariants`,
        query
      ),
      { headers: defectMuteProjectionHeaders(projectId.value, actorId) }
    ),
    options,
    { projectId: projectId.value, actorId, query }
  );
}

export function summarizeDefectMuteProjectionInvariantRead(
  value: unknown,
  options: ResourceReadOptions,
  scope: {
    projectId: string;
    actorId: string | undefined;
    query: Record<string, string | undefined>;
  }
): unknown {
  if (isApiStatusPayload(value)) {
    return sanitizeDefectMuteProjectionInvariantStatus(value);
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
    kind: "defect-mute-replay-invariant",
    compact: true,
    scope: defectMuteProjectionInvariantScope(scope.projectId, scope.actorId),
    access: sanitizeDefectMuteProjectionAccess(value.access, scope.actorId),
    query: defectMuteProjectionInvariantQueryMetadata(scope.query, scope.projectId, options),
    invariant: sanitizeDefectMuteProjectionInvariantMetadata(value.invariant),
    rawEffectiveSeparation: sanitizeDefectMuteProjectionRawEffectiveSeparation(
      value.rawEffectiveSeparation
    ),
    appendOnly: sanitizeDefectMuteProjectionAppendOnly(value.appendOnly),
    redaction: sanitizeDefectMuteProjectionInvariantRedaction(value.redaction),
    page,
    items: returnedItems.map((item) => sanitizeDefectMuteProjectionInvariantItem(item)),
    policy: defectMuteProjectionInvariantReadPolicy()
  };
}

export function sanitizeDefectMuteProjectionInvariantStatus(
  value: Record<string, unknown>
): unknown {
  return pickDefined(
    {
      status: value.status,
      code: numericField(value, "code"),
      message:
        typeof value.message === "string" ? sanitizeProjectionText(value.message) : undefined,
      permissionDenied: sanitizeProjectionDenied(value.permissionDenied),
      kind:
        stringField(value, "kind") === "defect-mute-replay-invariant"
          ? "defect-mute-replay-invariant"
          : undefined,
      policy: defectMuteProjectionInvariantReadPolicy()
    },
    ["status", "code", "message", "permissionDenied", "kind", "policy"]
  );
}

export function sanitizeDefectMuteProjectionInvariantMetadata(
  value: unknown
): Record<string, unknown> {
  if (!isRecord(value)) {
    return {
      source: "worker-local-mute-projection",
      mutationBoundary: "rest-read-only-no-replay-mutation",
      mcpReplayExecution: false,
      deterministic: false,
      recomputable: false,
      projectScoped: false
    };
  }

  return pickDefined(
    {
      boundary:
        stringField(value, "boundary") === "read-only-defect-mute-replay-invariant"
          ? "read-only-defect-mute-replay-invariant"
          : "read-only-defect-mute-replay-invariant",
      source:
        stringField(value, "source") === "worker-local-mute-projection"
          ? "worker-local-mute-projection"
          : "worker-local-mute-projection",
      consistency:
        stringField(value, "consistency") === "append-only-replay"
          ? "append-only-replay"
          : "append-only-replay",
      mutationBoundary: "rest-read-only-no-replay-mutation",
      mcpReplayExecution: false,
      deterministic: typeof value.deterministic === "boolean" ? value.deterministic : false,
      recomputable: typeof value.recomputable === "boolean" ? value.recomputable : false,
      projectScoped: typeof value.projectScoped === "boolean" ? value.projectScoped : false,
      projectionDigest: sanitizeProjectionText(stringField(value, "projectionDigest")),
      recomputedDigest: sanitizeProjectionText(stringField(value, "recomputedDigest"))
    },
    [
      "boundary",
      "source",
      "consistency",
      "mutationBoundary",
      "mcpReplayExecution",
      "deterministic",
      "recomputable",
      "projectScoped",
      "projectionDigest",
      "recomputedDigest"
    ]
  );
}

export function sanitizeDefectMuteProjectionAppendOnly(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) {
    return {
      uniqueProjectedEventIds: false,
      duplicateEventIds: [],
      totalProjectedEventIds: 0
    };
  }

  return {
    uniqueProjectedEventIds:
      typeof value.uniqueProjectedEventIds === "boolean" ? value.uniqueProjectedEventIds : false,
    duplicateEventIds: sanitizeProjectionStringList(arrayField(value, "duplicateEventIds")),
    totalProjectedEventIds: integerField(value, "totalProjectedEventIds") ?? 0
  };
}

export function sanitizeDefectMuteProjectionInvariantRedaction(
  value: unknown
): Record<string, unknown> {
  if (!isRecord(value)) {
    return {
      passed: false,
      leakedMarkers: []
    };
  }

  return pickDefined(
    {
      passed: typeof value.passed === "boolean" ? value.passed : false,
      leakedMarkers: sanitizeProjectionStringList(arrayField(value, "leakedMarkers")),
      policy: typeof value.policy === "string" ? sanitizeProjectionText(value.policy) : undefined
    },
    ["passed", "leakedMarkers", "policy"]
  );
}

export function sanitizeDefectMuteProjectionInvariantItem(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) {
    return {};
  }

  return pickDefined(
    {
      ordinal: integerField(value, "ordinal"),
      eventId: sanitizeProjectionText(stringField(value, "eventId"))
    },
    ["ordinal", "eventId"]
  );
}

export function defectMuteProjectionInvariantReadPolicy(): Record<string, unknown> {
  return {
    restParity: {
      method: "GET",
      path: "/api/v1/projects/{projectId}/defect-mutes/projection/replay/invariants"
    },
    headersForwarded: [
      "X-TestHistory-Scopes",
      "X-TestHistory-Project-Scope",
      "X-TestHistory-Actor-Id"
    ],
    equalOrNarrowerThanRest: true,
    mutationAllowed: false,
    mcpReplayExecution: false,
    replayInvariantReadModel: true,
    rawFailurePayloadsIncluded: false,
    rawEffectiveSeparation: true,
    deniedStateMasked: true,
    redactionRules: [
      "MCP reads the REST defect mute replay invariant read model and never executes replay work.",
      "Project and optional actor scope are forwarded to REST; MCP does not broaden scope.",
      "Only invariant booleans, bounded event identifiers, counters, digests, and page metadata are returned.",
      "Raw failure payloads, traces, local paths, storage refs, signed URLs, tokens, cookies, passwords, and authorization fields are omitted or redacted.",
      "No invariant refresh, defect mute create, delete, unmute, replay, or projection mutation tool is advertised."
    ]
  };
}
