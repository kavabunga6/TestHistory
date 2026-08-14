import { isSensitiveText } from "./mcpSanitizeText.js";

export function truncateUtf8(
  value: string,
  maxBytes: number
): { value: string; truncated: boolean } {
  if (Buffer.byteLength(value, "utf8") <= maxBytes) {
    return { value, truncated: false };
  }

  let end = value.length;
  while (end > 0 && Buffer.byteLength(value.slice(0, end), "utf8") > maxBytes) {
    end -= 1;
  }
  return { value: value.slice(0, end), truncated: true };
}

export function countLines(value: string): number {
  return value.length === 0 ? 0 : value.split(/\r\n|\r|\n/).length;
}

export function safeAttachmentText(value: string): string | undefined {
  if (value.length === 0) {
    return undefined;
  }
  return isSensitiveText(value) ? "[redacted]" : value;
}

export function sanitizePreviewText(value: string): { value: string; redacted: boolean } {
  let redacted = false;
  let next = value.replace(/[A-Za-z]:\\[^\s"'<>]+/g, () => {
    redacted = true;
    return "[REDACTED_PATH]";
  });
  next = next.replace(
    /\/(?:Users|home|var|tmp|private|opt|workspace|builds|runner|mnt|Volumes)\/[^\s"'<>]+/g,
    () => {
      redacted = true;
      return "[REDACTED_PATH]";
    }
  );
  next = next.replace(/\ballure-results[\\/][^\s"'<>]+/gi, () => {
    redacted = true;
    return "[REDACTED_PATH]";
  });
  next = next.replace(
    /https?:\/\/[^\s"'<>]*(?:signature|token|credential|x-amz)[^\s"'<>]*/gi,
    () => {
      redacted = true;
      return "[REDACTED_URL]";
    }
  );
  next = next.replace(/\b(?:s3|gs|azure|minio|storage|blob):\/\/[^\s"'<>]+/gi, () => {
    redacted = true;
    return "[REDACTED_STORAGE_URL]";
  });
  next = next.replace(
    /\b(authorization|cookie|password|passwd|pwd|secret|token|api[_-]?key)\s*[:=]\s*[^\s"'<>]+/gi,
    (_match, key: string) => {
      redacted = true;
      return `${key}=[REDACTED]`;
    }
  );
  next = next
    .split(/\r\n|\r|\n/)
    .map((line) => {
      if (/\b(authorization|cookie|password|passwd|pwd|secret|token|api[_-]?key)\b/i.test(line)) {
        redacted = true;
        return "[REDACTED]";
      }
      return line;
    })
    .join("\n");
  return { value: next, redacted };
}
