import { isSensitiveText } from "./mcpSanitizeText.js";
import { sanitizePreviewText } from "./mcpTextBounds.js";

export function sanitizeArchiveText(value: string): string {
  const sanitized = sanitizePreviewText(value).value;
  return isSensitiveText(sanitized) ? "[redacted]" : sanitized;
}
