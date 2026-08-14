import { attachmentBlobFieldNames } from "./mcpPreviewConstants.js";
import { isSensitiveText } from "./mcpSanitizeText.js";
import { sanitizePreviewText } from "./mcpTextBounds.js";

export function sanitizeExportText(value: string): string {
  const preview = sanitizePreviewText(value).value;
  if (preview.includes("[REDACTED")) {
    return "[redacted]";
  }
  const withoutUrls = preview.replace(/https?:\/\/[^\s"'<>]+/gi, "[REDACTED_URL]");
  const withoutWindowsPaths = withoutUrls.replace(/[A-Za-z]:\\[^\s"'<>]+/g, "[REDACTED_PATH]");
  const withoutUnixPaths = withoutWindowsPaths.replace(
    /\/(?:Users|home|var|tmp|private|opt|workspace|builds|runner|mnt|Volumes)\/[^\s"'<>]+/g,
    "[REDACTED_PATH]"
  );
  if (withoutUnixPaths.includes("[REDACTED")) {
    return "[redacted]";
  }
  return isSensitiveText(withoutUnixPaths) ? "[redacted]" : withoutUnixPaths;
}

export function isUnsafeExportFieldKey(key: string): boolean {
  const normalized = key.toLowerCase();
  if (normalized === "secretref") {
    return true;
  }
  return (
    attachmentBlobFieldNames.has(key) ||
    /authorization|credential|password|passwd|secret|token|api[-_]?key|access[-_]?key|url|uri|path|endpoint|storage[-_]?key|signature|session|payload|body|content/i.test(
      key
    )
  );
}
