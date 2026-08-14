import { fetchApiValue } from "./mcpApiClient.js";
import { isUnsafeExportFieldKey, sanitizeExportText } from "./mcpExportSanitizers.js";
import { truncateCompareText } from "./mcpHistoryCompare.js";
import { sanitizeStringArray } from "./mcpSanitizeText.js";
import {
  arrayField,
  getRequiredString,
  integerField,
  isApiStatusPayload,
  isRecord,
  numericField,
  optionalString,
  pickDefined,
  stringField
} from "./mcpValueUtils.js";

function sanitizeAuditText(value: string): string {
  return truncateCompareText(value);
}

export async function securityAuditExportEvaluateRead(
  argumentsValue: Record<string, unknown>
): Promise<unknown | string> {
  const request = isRecord(argumentsValue.request) ? argumentsValue.request : undefined;
  if (request === undefined) {
    return "request is required for security audit export evaluation reads";
  }

  const projectId = getRequiredString(request, "projectId");
  if (projectId.error !== undefined) {
    return "request.projectId is required for security audit export evaluation reads";
  }

  const actorId = getRequiredString(request, "actorId");
  if (actorId.error !== undefined) {
    return "request.actorId is required for security audit export evaluation reads";
  }

  const body = pickDefined(
    {
      request,
      policy: isRecord(argumentsValue.policy) ? argumentsValue.policy : undefined
    },
    ["request", "policy"]
  );

  return summarizeSecurityAuditExportEvaluationRead(
    await fetchApiValue(argumentsValue.apiUrl, "/api/v1/security/audit/export/evaluate", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "X-TestHistory-Scopes": "security:audit:read",
        "X-TestHistory-Project-Scope": projectId.value,
        "X-TestHistory-Actor-Id": actorId.value
      },
      body: JSON.stringify(body)
    }),
    {
      projectId: projectId.value,
      actorId: actorId.value
    }
  );
}

function summarizeSecurityAuditExportEvaluationRead(
  value: unknown,
  scope: { projectId: string; actorId: string }
): unknown {
  if (isApiStatusPayload(value)) {
    return value;
  }

  if (!isRecord(value)) {
    return value;
  }

  return {
    kind: "security-audit-export-policy-evaluation",
    projectId: sanitizeAuditText(
      typeof value.projectId === "string" ? value.projectId : scope.projectId
    ),
    actor: sanitizeSecurityAuditExportActor(value.actor, scope.actorId),
    access: sanitizeSecurityAuditExportAccess(),
    decision: sanitizeSecurityAuditExportDecision(value.decision),
    policy: securityAuditExportEvaluationPolicy()
  };
}

function sanitizeSecurityAuditExportActor(
  value: unknown,
  fallbackActorId: string
): Record<string, unknown> {
  return {
    type: "actor",
    actorId: sanitizeAuditText(
      isRecord(value) && typeof value.actorId === "string" ? value.actorId : fallbackActorId
    ),
    scoped: true
  };
}

function sanitizeSecurityAuditExportAccess(): Record<string, unknown> {
  return {
    scope: "security:audit:read",
    projectScoped: true,
    actorScoped: true,
    mutation: false,
    redacted: true
  };
}

function sanitizeSecurityAuditExportDecision(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) {
    return {};
  }

  return pickDefined(
    {
      schemaVersion: integerField(value, "schemaVersion") ?? 1,
      status: optionalString(value.status),
      allowed: typeof value.allowed === "boolean" ? value.allowed : undefined,
      request: sanitizeSecurityAuditExportDecisionRequest(value.request),
      limits: sanitizeSecurityAuditExportLimits(value.limits),
      reasons: arrayField(value, "reasons").map((reason) =>
        sanitizeSecurityAuditExportReason(reason)
      )
    },
    ["schemaVersion", "status", "allowed", "request", "limits", "reasons"]
  );
}

function sanitizeSecurityAuditExportDecisionRequest(value: unknown): unknown {
  if (!isRecord(value)) {
    return undefined;
  }

  return pickDefined(
    {
      projectId: sanitizeAuditText(stringField(value, "projectId")),
      actorId: sanitizeAuditText(stringField(value, "actorId")),
      requestedAt: value.requestedAt,
      range: sanitizeSecurityAuditExportRange(value.range),
      destination: sanitizeSecurityAuditExportDestination(value.destination),
      format: optionalString(value.format),
      criteria: sanitizeSecurityAuditExportValue(value.criteria)
    },
    ["projectId", "actorId", "requestedAt", "range", "destination", "format", "criteria"]
  );
}

function sanitizeSecurityAuditExportRange(value: unknown): unknown {
  if (!isRecord(value)) {
    return undefined;
  }

  return pickDefined(
    {
      from: value.from,
      to: value.to,
      days: numericField(value, "days")
    },
    ["from", "to", "days"]
  );
}

function sanitizeSecurityAuditExportDestination(value: unknown): unknown {
  if (!isRecord(value)) {
    return undefined;
  }

  return pickDefined(
    {
      type: value.type === "placeholder" ? "placeholder" : optionalString(value.type)
    },
    ["type"]
  );
}

function sanitizeSecurityAuditExportLimits(value: unknown): unknown {
  if (!isRecord(value)) {
    return undefined;
  }

  return pickDefined(
    {
      maxRangeDays: numericField(value, "maxRangeDays")
    },
    ["maxRangeDays"]
  );
}

function sanitizeSecurityAuditExportReason(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) {
    return {};
  }

  return pickDefined(
    {
      code: sanitizeAuditText(stringField(value, "code")),
      severity: optionalString(value.severity),
      explanation:
        typeof value.explanation === "string" ? sanitizeExportText(value.explanation) : undefined,
      fields: sanitizeStringArray(arrayField(value, "fields"))
    },
    ["code", "severity", "explanation", "fields"]
  );
}

function sanitizeSecurityAuditExportValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeSecurityAuditExportValue(item));
  }

  if (typeof value === "string") {
    return sanitizeExportText(value);
  }

  if (!isRecord(value)) {
    return value;
  }

  const safe: Record<string, unknown> = {};
  for (const [key, fieldValue] of Object.entries(value)) {
    if (isUnsafeExportFieldKey(key)) {
      continue;
    }
    safe[key] = sanitizeSecurityAuditExportValue(fieldValue);
  }
  return safe;
}

function securityAuditExportEvaluationPolicy(): Record<string, unknown> {
  return {
    restParity: {
      method: "POST",
      path: "/api/v1/security/audit/export/evaluate"
    },
    projectIdRequired: true,
    actorIdRequired: true,
    headersForwarded: [
      "X-TestHistory-Scopes",
      "X-TestHistory-Project-Scope",
      "X-TestHistory-Actor-Id"
    ],
    equalOrNarrowerThanRest: true,
    providerNeutral: true,
    mutationAllowed: false,
    rawPayloadsIncluded: false,
    credentialReferencesIncluded: false,
    providerRuntimeMetadataIncluded: false,
    redactionRules: [
      "MCP forwards the REST evaluation body and scope headers but omits REST provider runtime metadata.",
      "Destination credential references are used only for REST evaluation and are omitted from the MCP decision view.",
      "Raw secret, URL, URI, path, endpoint, token, credential, payload, body, content, storage key, and signature fields are omitted or redacted.",
      "The MCP view is read-only and does not advertise any export start, retry, credential resolution, provider call, artifact creation, or mutation tool."
    ]
  };
}

export function securityAuditExportRequestFromSearch(
  searchParams: URLSearchParams
): Record<string, unknown> {
  const destinationType = optionalString(searchParams.get("destinationType")) ?? "placeholder";
  return pickDefined(
    {
      projectId: optionalString(searchParams.get("projectId")),
      actorId: optionalString(searchParams.get("actorId")),
      requestedAt: optionalString(searchParams.get("requestedAt")),
      range: pickDefined(
        {
          from: optionalString(searchParams.get("from")),
          to: optionalString(searchParams.get("to"))
        },
        ["from", "to"]
      ),
      destination: pickDefined(
        {
          type: destinationType,
          secretRef: optionalString(searchParams.get("secretRef"))
        },
        ["type", "secretRef"]
      ),
      format: optionalString(searchParams.get("format")),
      criteria: jsonSearchParam(searchParams, "criteria")
    },
    ["projectId", "actorId", "requestedAt", "range", "destination", "format", "criteria"]
  );
}

export function jsonSearchParam(searchParams: URLSearchParams, key: string): unknown {
  const value = searchParams.get(key);
  if (value === null || value.length === 0) {
    return undefined;
  }

  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}
