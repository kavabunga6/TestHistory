import { removeUnsafeDeniedFields } from "./mcpApiClient.js";
import { sanitizeArchiveText } from "./mcpArchiveText.js";
import { sanitizeCompareUrl } from "./mcpHistoryCompare.js";
import { maxMcpPreviewBodyBytes } from "./mcpPreviewConstants.js";
import { sanitizeAuditText } from "./mcpSanitizeText.js";
import { truncateUtf8 } from "./mcpTextBounds.js";
import { numericField, pickDefined } from "./mcpValueUtils.js";

export function optionalPreviewRetentionStatus(value: unknown): string | undefined {
  return value === "cleanup_eligible" || value === "retained" || value === "preserved"
    ? value
    : undefined;
}

export function attachmentPreviewRetentionHeaders(
  projectId: string,
  actorId: string | undefined
): Record<string, string> {
  return {
    "X-TestHistory-Scopes": "artifacts:read",
    "X-TestHistory-Project-Scope": projectId,
    ...(actorId !== undefined ? { "X-TestHistory-Actor-Id": actorId } : {})
  };
}

export function sanitizeAttachmentPreviewRetentionStatus(
  value: Record<string, unknown>
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
      permissionDenied: removeUnsafeDeniedFields(value.permissionDenied),
      redacted: true
    },
    ["status", "code", "message", "url", "permissionDenied", "redacted"]
  );
}

export function attachmentPreviewRetentionScope(scope: {
  projectId: string;
  launchId: string;
  actorId: string | undefined;
}): Record<string, unknown> {
  return pickDefined(
    {
      projectId: sanitizeAuditText(scope.projectId),
      launchId: sanitizeAuditText(scope.launchId),
      actorId: scope.actorId !== undefined ? sanitizeAuditText(scope.actorId) : undefined
    },
    ["projectId", "launchId", "actorId"]
  );
}

export function attachmentPreviewRetentionAccess(
  actorId: string | undefined
): Record<string, unknown> {
  return {
    scope: "artifacts:read",
    projectScoped: true,
    actorScoped: actorId !== undefined,
    mutation: false,
    redacted: true
  };
}

export function sanitizeOptionalDigest(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  return sanitizeAuditText(value);
}
