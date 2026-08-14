export function sanitizeLogValue(value: unknown): unknown {
  if (typeof value === "string") {
    return sanitizePotentialUrl(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeLogValue(item));
  }

  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [
        key,
        shouldRedactKey(key) || shouldRedactRawValueKey(key, nestedValue)
          ? "[redacted]"
          : sanitizeLogValue(nestedValue)
      ])
    );
  }

  return value;
}

function shouldRedactKey(key: string): boolean {
  if (/^has[A-Z]/.test(key)) {
    return false;
  }

  return /(authorization|cookie|credential|hidden|masked|password|secret|signed[-_]?url|storage[-_]?keys?|token|idempotency[-_]?key|api[-_]?key|access[-_]?key)/i.test(
    key
  );
}

function shouldRedactRawValueKey(key: string, value: unknown): boolean {
  if (typeof value !== "string") {
    return false;
  }

  const normalizedKey = key.toLowerCase();
  return (
    normalizedKey === "source" ||
    normalizedKey === "body" ||
    normalizedKey === "text" ||
    normalizedKey === "path" ||
    normalizedKey.endsWith("path") ||
    normalizedKey === "raw" ||
    normalizedKey.startsWith("raw") ||
    normalizedKey === "content" ||
    normalizedKey.endsWith("content") ||
    normalizedKey === "attachment" ||
    normalizedKey === "attachments"
  );
}

function sanitizePotentialUrl(value: string): string {
  if (!value.includes("://")) {
    return looksLikeLocalPath(value) ? "[redacted-path]" : value;
  }

  try {
    const url = new URL(value);
    url.username = "";
    url.password = "";
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return "[redacted-url]";
  }
}

function looksLikeLocalPath(value: string): boolean {
  return /^([a-z]:\\|\\\\|\/(?!\/))/i.test(value);
}
