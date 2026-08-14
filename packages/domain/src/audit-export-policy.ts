import { redactSensitiveText } from "./defects.js";
import type {
  SecurityAuditExportCriteriaValue,
  SecurityAuditExportDecision,
  SecurityAuditExportDecisionReason,
  SecurityAuditExportDecisionRequest,
  SecurityAuditExportPolicy,
  SecurityAuditExportRequest
} from "./audit-export-types.js";
import { deepFreeze, uniqueSorted } from "./audit-export-utils.js";

const DEFAULT_MAX_RANGE_DAYS = 31;
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

const REQUEST_ALLOWED_KEYS = new Set([
  "projectId",
  "actorId",
  "requestedAt",
  "range",
  "destination",
  "format",
  "criteria"
]);
const RANGE_ALLOWED_KEYS = new Set(["from", "to"]);
const DECISION_RANGE_ALLOWED_KEYS = new Set(["from", "to", "days"]);
const DESTINATION_ALLOWED_KEYS = new Set(["type", "secretRef"]);
const POLICY_ALLOWED_KEYS = new Set([
  "enabled",
  "placeholderOnly",
  "requireSecretRef",
  "maxRangeDays",
  "allowedProjectIds",
  "allowedActorIds"
]);

type NormalizedSecurityAuditExportPolicy = Required<
  Pick<
    SecurityAuditExportPolicy,
    "enabled" | "placeholderOnly" | "requireSecretRef" | "maxRangeDays"
  >
> &
  Pick<SecurityAuditExportPolicy, "allowedProjectIds" | "allowedActorIds">;

export function defaultSecurityAuditExportPolicy(): Required<
  Pick<
    SecurityAuditExportPolicy,
    "enabled" | "placeholderOnly" | "requireSecretRef" | "maxRangeDays"
  >
> {
  return {
    enabled: false,
    placeholderOnly: true,
    requireSecretRef: true,
    maxRangeDays: DEFAULT_MAX_RANGE_DAYS
  };
}

export function evaluateSecurityAuditExportPolicy(
  request: SecurityAuditExportRequest,
  policy: SecurityAuditExportPolicy = {}
): SecurityAuditExportDecision {
  const normalizedPolicy = normalizeSecurityAuditExportPolicy(policy);
  const normalizedRequest = normalizeSecurityAuditExportRequest(request);
  const reasons: SecurityAuditExportDecisionReason[] = [];
  const unsafeFields = collectUnsafeFields(request, policy);

  if (!normalizedPolicy.enabled) {
    reasons.push({
      code: "audit_export.disabled",
      severity: "deny",
      explanation: "Security audit export is disabled by default and must be enabled explicitly.",
      fields: []
    });
  }

  if (unsafeFields.length > 0) {
    reasons.push({
      code: "audit_export.unsafe_field",
      severity: "deny",
      explanation:
        "Security audit export requests must not contain raw secret, url, path, token, or credential fields.",
      fields: unsafeFields
    });
  }

  if (normalizedPolicy.placeholderOnly && normalizedRequest.destination.type !== "placeholder") {
    reasons.push({
      code: "audit_export.placeholder_destination_required",
      severity: "deny",
      explanation: "Security audit export is modeled for placeholder destinations only.",
      fields: ["destination.type"]
    });
  }

  if (normalizedPolicy.requireSecretRef && normalizedRequest.destination.secretRef === undefined) {
    reasons.push({
      code: "audit_export.secret_ref_required",
      severity: "deny",
      explanation:
        "Security audit export destination credentials must be represented by secretRef only.",
      fields: ["destination.secretRef"]
    });
  }

  if (normalizedRequest.range.days <= 0) {
    reasons.push({
      code: "audit_export.range_invalid",
      severity: "deny",
      explanation: "Security audit export date range must have a from timestamp before to.",
      fields: ["range.from", "range.to"]
    });
  }

  if (normalizedRequest.range.days > normalizedPolicy.maxRangeDays) {
    reasons.push({
      code: "audit_export.range_exceeds_limit",
      severity: "deny",
      explanation: `Security audit export date range must be at most ${normalizedPolicy.maxRangeDays} days.`,
      fields: ["range.from", "range.to"]
    });
  }

  if (!isAllowedScope(normalizedRequest.projectId, normalizedPolicy.allowedProjectIds)) {
    reasons.push({
      code: "audit_export.project_scope_denied",
      severity: "deny",
      explanation: "Security audit export projectId is outside the allowed policy scope.",
      fields: ["projectId"]
    });
  }

  if (!isAllowedScope(normalizedRequest.actorId, normalizedPolicy.allowedActorIds)) {
    reasons.push({
      code: "audit_export.actor_scope_denied",
      severity: "deny",
      explanation: "Security audit export actorId is outside the allowed policy scope.",
      fields: ["actorId"]
    });
  }

  const decisionReasons =
    reasons.length === 0
      ? [
          {
            code: "audit_export.allowed_placeholder",
            severity: "info" as const,
            explanation:
              "Security audit export placeholder request satisfied enabled policy, scope, date range, redaction, and secretRef checks.",
            fields: []
          }
        ]
      : reasons;

  const allowed = reasons.length === 0;

  return deepFreeze({
    schemaVersion: 1,
    status: allowed ? "allowed" : "denied",
    allowed,
    request: normalizedRequest,
    limits: {
      maxRangeDays: normalizedPolicy.maxRangeDays
    },
    reasons: decisionReasons
  });
}

function normalizeSecurityAuditExportPolicy(
  policy: SecurityAuditExportPolicy
): NormalizedSecurityAuditExportPolicy {
  const defaults = defaultSecurityAuditExportPolicy();
  const maxRangeDays = policy.maxRangeDays ?? defaults.maxRangeDays;
  if (!Number.isFinite(maxRangeDays) || maxRangeDays <= 0) {
    throw new Error("Security audit export maxRangeDays must be a positive finite number.");
  }

  return {
    enabled: policy.enabled ?? defaults.enabled,
    placeholderOnly: policy.placeholderOnly ?? defaults.placeholderOnly,
    requireSecretRef: policy.requireSecretRef ?? defaults.requireSecretRef,
    maxRangeDays,
    ...(policy.allowedProjectIds !== undefined
      ? {
          allowedProjectIds: uniqueSorted(
            policy.allowedProjectIds.map((value) => normalizeText(value))
          )
        }
      : {}),
    ...(policy.allowedActorIds !== undefined
      ? {
          allowedActorIds: uniqueSorted(policy.allowedActorIds.map((value) => normalizeText(value)))
        }
      : {})
  };
}

export function normalizeSecurityAuditExportRequest(
  request: SecurityAuditExportRequest
): SecurityAuditExportDecisionRequest {
  const from = normalizeIsoDateTime(request.range.from, "range.from");
  const to = normalizeIsoDateTime(request.range.to, "range.to");
  const criteria = sanitizeCriteriaValue(request.criteria, "criteria");
  const secretRef = sanitizeSecretRef(request.destination.secretRef);

  return {
    projectId: normalizeText(request.projectId),
    actorId: normalizeText(request.actorId),
    requestedAt: normalizeIsoDateTime(request.requestedAt, "requestedAt"),
    range: {
      from,
      to,
      days: rangeDays(from, to)
    },
    destination: {
      type: request.destination.type,
      ...(secretRef !== undefined ? { secretRef } : {})
    },
    format: request.format ?? "jsonl",
    ...(criteria !== undefined ? { criteria } : {})
  };
}

export function collectUnsafeFields(
  request: SecurityAuditExportRequest,
  policy: SecurityAuditExportPolicy
): string[] {
  return uniqueSorted([
    ...collectUnsafeObjectFields(request, "request", REQUEST_ALLOWED_KEYS),
    ...collectUnsafeObjectFields(request.range, "request.range", RANGE_ALLOWED_KEYS),
    ...collectUnsafeObjectFields(
      request.destination as Record<string, unknown>,
      "request.destination",
      DESTINATION_ALLOWED_KEYS
    ),
    ...collectUnsafeObjectFields(policy, "policy", POLICY_ALLOWED_KEYS),
    ...collectUnsafeCriteriaFields(request.criteria, "request.criteria")
  ]);
}

function collectUnsafeObjectFields(
  value: Record<string, unknown>,
  path: string,
  allowedKeys: ReadonlySet<string>
): string[] {
  return Object.keys(value)
    .filter((key) => !allowedKeys.has(key) || isUnsafeRawFieldKey(key))
    .map((key) => `${path}.${key}`);
}

function collectUnsafeCriteriaFields(
  value: SecurityAuditExportCriteriaValue | undefined,
  path: string
): string[] {
  if (value === undefined || value === null || typeof value !== "object") {
    return [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item, index) => collectUnsafeCriteriaFields(item, `${path}[${index}]`));
  }

  return Object.entries(value).flatMap(([key, nested]) => {
    const fieldPath = `${path}.${key}`;
    return [
      ...(isUnsafeRawFieldKey(key) ? [fieldPath] : []),
      ...collectUnsafeCriteriaFields(nested, fieldPath)
    ];
  });
}

export function isUnsafeRawFieldKey(key: string): boolean {
  if (key === "secretRef") {
    return false;
  }

  return /authorization|credential|password|passwd|secret|token|api[-_]?key|access[-_]?key|url|uri|path|endpoint/i.test(
    key
  );
}

export function sanitizeCriteriaValue(
  value: SecurityAuditExportCriteriaValue | undefined,
  key: string
): SecurityAuditExportCriteriaValue | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value === null || typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    return isSensitiveCriteriaKey(key) ? "[redacted]" : redactSensitiveText(value);
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => sanitizeCriteriaValue(item, key))
      .filter((item): item is SecurityAuditExportCriteriaValue => item !== undefined);
  }

  const normalized: Record<string, SecurityAuditExportCriteriaValue> = {};
  for (const [entryKey, entryValue] of Object.entries(value).sort(([left], [right]) =>
    left.localeCompare(right)
  )) {
    const sanitized = sanitizeCriteriaValue(entryValue, entryKey);
    if (sanitized !== undefined) {
      normalized[entryKey] = sanitized;
    }
  }
  return normalized;
}

function isSensitiveCriteriaKey(key: string): boolean {
  return /authorization|cookie|credential|hidden|masked|password|passwd|secret|storage[-_]?key|token|api[-_]?key|access[-_]?key|signature|session|payload|body|content/i.test(
    key
  );
}

function sanitizeSecretRef(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return undefined;
  }
  if (
    /\s/.test(trimmed) ||
    /[=&?]/.test(trimmed) ||
    /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ||
    /^[a-z]:\\/i.test(trimmed)
  ) {
    throw new Error("Security audit export secretRef must be a reference name, not a raw secret.");
  }
  return trimmed;
}

export function normalizeText(value: string): string {
  const trimmed = redactSensitiveText(value).trim();
  if (trimmed.length === 0) {
    throw new Error("Security audit export text fields must not be empty.");
  }
  return trimmed;
}

export function normalizeIsoDateTime(value: string, label: string): string {
  const trimmed = normalizeText(value);
  const time = Date.parse(trimmed);
  if (!Number.isFinite(time)) {
    throw new Error(`Security audit export ${label} must be a valid ISO timestamp.`);
  }
  return new Date(time).toISOString();
}

function rangeDays(from: string, to: string): number {
  return (Date.parse(to) - Date.parse(from)) / MILLISECONDS_PER_DAY;
}

function isAllowedScope(value: string, allowedValues: readonly string[] | undefined): boolean {
  return allowedValues === undefined || allowedValues.includes(value);
}

export function normalizeSecurityAuditExportDecisionRequest(
  request: SecurityAuditExportDecisionRequest
): SecurityAuditExportDecisionRequest {
  const from = normalizeIsoDateTime(request.range.from, "decision.request.range.from");
  const to = normalizeIsoDateTime(request.range.to, "decision.request.range.to");
  const criteria = sanitizeCriteriaValue(request.criteria, "criteria");
  const secretRef = sanitizeSecretRef(request.destination.secretRef);

  return {
    projectId: normalizeText(request.projectId),
    actorId: normalizeText(request.actorId),
    requestedAt: normalizeIsoDateTime(request.requestedAt, "decision.request.requestedAt"),
    range: {
      from,
      to,
      days: rangeDays(from, to)
    },
    destination: {
      type: request.destination.type,
      ...(secretRef !== undefined ? { secretRef } : {})
    },
    format: request.format,
    ...(criteria !== undefined ? { criteria } : {})
  };
}

export function sanitizeSecurityAuditExportDecisionReason(
  reason: SecurityAuditExportDecisionReason
): SecurityAuditExportDecisionReason {
  return {
    code: normalizeText(reason.code),
    severity: reason.severity,
    explanation: normalizeText(reason.explanation),
    fields: uniqueSorted(
      reason.fields
        .map((field) => redactSensitiveText(field).trim())
        .filter((field) => field.length > 0)
    )
  };
}

export function collectUnsafeDecisionRequestFields(
  request: SecurityAuditExportDecisionRequest
): string[] {
  return uniqueSorted([
    ...collectUnsafeObjectFields(
      request as unknown as Record<string, unknown>,
      "decision.request",
      REQUEST_ALLOWED_KEYS
    ),
    ...collectUnsafeObjectFields(
      request.range as unknown as Record<string, unknown>,
      "decision.request.range",
      DECISION_RANGE_ALLOWED_KEYS
    ),
    ...collectUnsafeObjectFields(
      request.destination as unknown as Record<string, unknown>,
      "decision.request.destination",
      DESTINATION_ALLOWED_KEYS
    ),
    ...collectUnsafeCriteriaFields(request.criteria, "decision.request.criteria")
  ]);
}
