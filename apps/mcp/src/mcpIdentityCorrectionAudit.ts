import { fetchApiValue } from "./mcpApiClient.js";
import { normalizePageMetadata, pageMetadata, paginateItems } from "./mcpPagination.js";
import { defaultResultLimit, type ResourceReadOptions } from "./mcpReadOptions.js";
import { sanitizeAuditText, sanitizeParameterVariantSignature } from "./mcpSanitizeText.js";
import {
  arrayField,
  cursorOffset,
  getRequiredString,
  isApiStatusPayload,
  isRecord,
  optionalPositiveInteger,
  optionalString,
  pickDefined,
  stringField,
  withQuery
} from "./mcpValueUtils.js";

export async function identityCorrectionAuditRead(
  argumentsValue: Record<string, unknown>
): Promise<unknown | string> {
  const projectId = getRequiredString(argumentsValue, "projectId");
  if (projectId.error !== undefined) {
    return projectId.error;
  }

  const originType = optionalString(argumentsValue.originType) ?? "actor";
  if (originType !== "actor" && originType !== "system") {
    return "originType must be actor or system";
  }

  const actorId = optionalString(argumentsValue.actorId);
  if (originType === "actor" && actorId === undefined) {
    return "actorId is required for actor-origin identity correction audit reads";
  }

  const options: ResourceReadOptions = {
    includeDetails: false,
    includeRaw: false,
    limit: optionalPositiveInteger(argumentsValue.limit, defaultResultLimit, 100),
    cursor: optionalString(argumentsValue.cursor),
    offset: cursorOffset(optionalString(argumentsValue.cursor))
  };
  const query = identityCorrectionAuditQuery(argumentsValue, options, originType, actorId);
  const value = await fetchApiValue(
    argumentsValue.apiUrl,
    withQuery(
      `/api/v1/projects/${encodeURIComponent(projectId.value)}/identity-corrections/audit`,
      query
    )
  );

  return summarizeIdentityCorrectionAuditRead(value, options, {
    projectId: projectId.value,
    actorId,
    originType,
    query
  });
}

function identityCorrectionAuditQuery(
  value: Record<string, unknown>,
  options: ResourceReadOptions,
  originType: string,
  actorId: string | undefined
): Record<string, string | undefined> {
  return {
    actorId,
    originType,
    kind: optionalString(value.kind),
    beforeId: optionalString(value.beforeId),
    afterId: optionalString(value.afterId),
    parameterVariantSignature: optionalString(value.parameterVariantSignature),
    limit: String(options.limit),
    cursor: options.cursor
  };
}

function summarizeIdentityCorrectionAuditRead(
  value: unknown,
  options: ResourceReadOptions,
  scope: {
    projectId: string;
    actorId: string | undefined;
    originType: string;
    query: Record<string, string | undefined>;
  }
): unknown {
  if (isApiStatusPayload(value)) {
    return value;
  }

  const events = Array.isArray(value)
    ? value
    : isRecord(value)
      ? arrayField(value, "events").length > 0
        ? arrayField(value, "events")
        : arrayField(value, "items")
      : [];
  const page = Array.isArray(value) ? paginateItems(events, options) : undefined;
  const apiPage = isRecord(value) && isRecord(value.page) ? value.page : undefined;
  const pageMetadataValue =
    apiPage !== undefined
      ? normalizePageMetadata(apiPage, options, events.length)
      : (page?.metadata ?? pageMetadata(events.length, 0, events.length, options.limit));

  return {
    kind: "identity-correction-audit",
    projectId: scope.projectId,
    ...(scope.actorId !== undefined ? { actorId: sanitizeAuditText(scope.actorId) } : {}),
    originType: scope.originType,
    query: {
      kind: scope.query.kind,
      beforeId:
        scope.query.beforeId !== undefined ? sanitizeAuditText(scope.query.beforeId) : undefined,
      afterId:
        scope.query.afterId !== undefined ? sanitizeAuditText(scope.query.afterId) : undefined,
      parameterVariantSignature:
        scope.query.parameterVariantSignature !== undefined
          ? sanitizeParameterVariantSignature(scope.query.parameterVariantSignature)
          : undefined,
      limit: options.limit,
      cursor: options.cursor ?? null
    },
    page: pageMetadataValue,
    events: (page?.items ?? events).map((event) => sanitizeIdentityCorrectionAuditEvent(event)),
    policy: identityCorrectionAuditReadPolicy
  };
}

const identityCorrectionAuditReadPolicy = {
  projectIdRequired: true,
  actorOriginRequiresActorId: true,
  systemOriginProjectScoped: true,
  mutationAllowed: false,
  redactionRules: [
    {
      field: "origin",
      rule: "same-actor-only",
      explanation:
        "Actor-origin audit reads require actorId at the MCP boundary; system-origin reads require originType=system and remain project-scoped."
    },
    {
      field: "reason",
      rule: "mcp-safe-redacted",
      explanation: "Sensitive-looking free text is replaced with [redacted]."
    },
    {
      field: "beforeIds",
      rule: "mcp-safe-redacted",
      explanation: "Identity values that look like secrets are replaced with [redacted]."
    },
    {
      field: "afterIds",
      rule: "mcp-safe-redacted",
      explanation: "Identity values that look like secrets are replaced with [redacted]."
    },
    {
      field: "scope.parameterVariantSignature",
      rule: "mcp-safe-redacted",
      explanation:
        "Masked parameter values are emitted as ***, hidden values are omitted, and sensitive parameter names are redacted."
    },
    {
      field: "evidence.parameterVariantSignature",
      rule: "mcp-safe-redacted",
      explanation:
        "Evidence signatures follow the same parameter redaction rules as test history reads."
    }
  ]
} as const;

function sanitizeIdentityCorrectionAuditEvent(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) {
    return {};
  }

  return pickDefined(
    {
      id: sanitizeAuditText(stringField(value, "id")),
      projectId: sanitizeAuditText(stringField(value, "projectId")),
      kind: value.kind,
      source: value.source,
      confidence: value.confidence,
      origin: sanitizeIdentityCorrectionOrigin(value.origin),
      reason: sanitizeAuditText(stringField(value, "reason")),
      beforeIds: arrayField(value, "beforeIds").map((item) =>
        sanitizeAuditText(typeof item === "string" ? item : "")
      ),
      afterIds: arrayField(value, "afterIds").map((item) =>
        sanitizeAuditText(typeof item === "string" ? item : "")
      ),
      scope: sanitizeIdentityCorrectionScope(value.scope),
      evidence: arrayField(value, "evidence").map((item) =>
        sanitizeIdentityCorrectionEvidence(item)
      ),
      occurredAt: value.occurredAt,
      createdAt: value.createdAt,
      updatedAt: value.updatedAt,
      version: value.version
    },
    [
      "id",
      "projectId",
      "kind",
      "source",
      "confidence",
      "origin",
      "reason",
      "beforeIds",
      "afterIds",
      "scope",
      "evidence",
      "occurredAt",
      "createdAt",
      "updatedAt",
      "version"
    ]
  );
}

function sanitizeIdentityCorrectionOrigin(value: unknown): unknown {
  if (!isRecord(value)) {
    return undefined;
  }

  if (value.type === "system") {
    return {
      type: "system",
      name: sanitizeAuditText(stringField(value, "name"))
    };
  }

  if (value.type === "actor") {
    return pickDefined(
      {
        type: "actor",
        actorId: sanitizeAuditText(stringField(value, "actorId")),
        displayName:
          typeof value.displayName === "string" ? sanitizeAuditText(value.displayName) : undefined
      },
      ["type", "actorId", "displayName"]
    );
  }

  return undefined;
}

function sanitizeIdentityCorrectionScope(value: unknown): unknown {
  if (!isRecord(value)) {
    return undefined;
  }

  return pickDefined(
    {
      launchId: typeof value.launchId === "string" ? sanitizeAuditText(value.launchId) : undefined,
      historyId:
        typeof value.historyId === "string" ? sanitizeAuditText(value.historyId) : undefined,
      parameterVariantSignature:
        typeof value.parameterVariantSignature === "string"
          ? sanitizeParameterVariantSignature(value.parameterVariantSignature)
          : undefined
    },
    ["launchId", "historyId", "parameterVariantSignature"]
  );
}

function sanitizeIdentityCorrectionEvidence(value: unknown): unknown {
  if (!isRecord(value)) {
    return {};
  }

  return pickDefined(
    {
      launchId: typeof value.launchId === "string" ? sanitizeAuditText(value.launchId) : undefined,
      resultUuid:
        typeof value.resultUuid === "string" ? sanitizeAuditText(value.resultUuid) : undefined,
      historyId:
        typeof value.historyId === "string" ? sanitizeAuditText(value.historyId) : undefined,
      attemptIndex: value.attemptIndex,
      parameterVariantSignature:
        typeof value.parameterVariantSignature === "string"
          ? sanitizeParameterVariantSignature(value.parameterVariantSignature)
          : undefined
    },
    ["launchId", "resultUuid", "historyId", "attemptIndex", "parameterVariantSignature"]
  );
}
