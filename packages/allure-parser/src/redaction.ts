export const redactedTextValue = "***";
const credentialAssignmentKeyPattern =
  "(?:[A-Za-z0-9]+[-_.])*(?:credential|credentials|password|passwd|pwd|secret|token|api[-_]?key|access[-_]?key|client[-_]?secret|private[-_]?key|session[-_]?id|signature|signed[-_]?url|apiKey|accessToken|authToken|clientSecret|privateKey|sessionId|signedUrl)(?:[-_.][A-Za-z0-9]+)*";
const privateKeyBlockPattern =
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g;
const authorizationHeaderPattern =
  /\b(Authorization\s*[:=]\s*(?:Bearer|Basic|Digest|Token)\s+)([^\s<>"'`]+)/gi;
const cookieHeaderPattern = /\b((?:Set-)?Cookie\s*[:=]\s*)([^\r\n<]+)/gi;
const localFilesystemPathPattern =
  /\b(?:[A-Za-z]:[\\/][^\s<>"'`|]+|\/(?:Users|home|var|tmp|private|opt|workspace|builds|runner|mnt|Volumes)\/[^\s<>"'`]+)/g;
const quotedCredentialPattern = new RegExp(
  `(["'])(${credentialAssignmentKeyPattern})\\1(\\s*[:=]\\s*)(["'])([^"'\\r\\n]{0,2048})\\4`,
  "gi"
);
const quotedCredentialValuePattern = new RegExp(
  `\\b(${credentialAssignmentKeyPattern})(\\s*[:=]\\s*)(["'])([^"'\\r\\n]{0,2048})\\3`,
  "gi"
);
const unquotedCredentialPattern = new RegExp(
  `\\b(${credentialAssignmentKeyPattern})(\\s*[:=]\\s*)(?!\\*\\*\\*)([^\\s,;&<>"')\\]}]+)`,
  "gi"
);
const urlUserInfoPattern = /\b([a-z][a-z0-9+.-]*:\/\/)([^/\s:@]+):([^/\s@]+)@/gi;

export function sanitizeTextFields(value: unknown, key?: string): unknown {
  if (typeof value === "string") {
    return key !== undefined && shouldRedactTextKey(key)
      ? redactedTextValue
      : sanitizeTextField(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeTextFields(item));
  }

  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([nestedKey, nestedValue]) => [
        nestedKey,
        sanitizeTextFields(nestedValue, nestedKey)
      ])
    );
  }

  return value;
}

export function sanitizeTextField(value: string): string {
  return value
    .replace(privateKeyBlockPattern, "[redacted-private-key]")
    .replace(authorizationHeaderPattern, `$1${redactedTextValue}`)
    .replace(cookieHeaderPattern, `$1${redactedTextValue}`)
    .replace(localFilesystemPathPattern, "[redacted-local-path]")
    .replace(quotedCredentialPattern, `$1$2$1$3$4${redactedTextValue}$4`)
    .replace(quotedCredentialValuePattern, `$1$2$3${redactedTextValue}$3`)
    .replace(unquotedCredentialPattern, `$1$2${redactedTextValue}`)
    .replace(urlUserInfoPattern, `$1${redactedTextValue}:${redactedTextValue}@`);
}

export function shouldRedactTextKey(key: string): boolean {
  const normalized = key.replace(/([a-z])([A-Z])/g, "$1_$2").toLowerCase();
  return /(^|[._-])(authorization|cookie|credentials?|password|passwd|pwd|secret|token|api[-_]?key|access[-_]?key|client[-_]?secret|private[-_]?key|session[-_]?id|signature|signed[-_]?url)([._-]|$)/.test(
    normalized
  );
}

function shouldRedactAttachmentMetadataKey(key: string): boolean {
  const normalized = key.replace(/([a-z])([A-Z])/g, "$1_$2").toLowerCase();
  return /(^|[._-])(absolute[-_]?path|body|buffer|bytes|content|data|file[-_]?path|local[-_]?path|payload|raw|source[-_]?path|url)([._-]|$)/.test(
    normalized
  );
}

export function sanitizeAttachmentMetadata(value: unknown, key?: string): unknown {
  if (key !== undefined && shouldRedactAttachmentMetadataKey(key)) {
    return redactedTextValue;
  }

  if (typeof value === "string") {
    return sanitizeTextField(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeAttachmentMetadata(item));
  }

  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([nestedKey, nestedValue]) => [
        nestedKey,
        sanitizeAttachmentMetadata(nestedValue, nestedKey)
      ])
    );
  }

  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
