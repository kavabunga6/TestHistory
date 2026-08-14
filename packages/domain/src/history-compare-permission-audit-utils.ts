import { redactSensitiveText } from "./defects.js";

export function sanitizeFieldPath(value: string): string {
  assertNoApiSurfaceClaim(value, "field");
  const sanitized = redactAuditText(value);
  if (sanitized.length === 0 || isUnsafeFieldPath(sanitized)) {
    return "[redacted-field]";
  }

  return sanitized;
}

function isUnsafeFieldPath(value: string): boolean {
  return /authorization|cookie|credential|hidden|masked|password|passwd|path|secret|signed[-_]?url|signedurl|statusdetails|storage|token|api[-_]?key|access[-_]?key|signature|session|url|uri/i.test(
    value
  );
}

export function assertNoApiSurfaceClaim(value: string, label: string): void {
  if (/\b(rest|mcp|openapi|endpoint|route|response[-_\s]?shape)\b/i.test(value)) {
    throw new Error(
      `History compare permission audit ${label} must not claim REST, MCP, OpenAPI, endpoint, route, or response shape changes.`
    );
  }
}

export function normalizeRequiredText(value: string | undefined, label: string): string {
  const sanitized = redactAuditText(value ?? "");
  if (sanitized.length === 0) {
    throw new Error(`History compare permission audit ${label} must not be empty.`);
  }

  return sanitized;
}

export function sanitizeOptionalText(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  const sanitized = redactAuditText(value);
  return sanitized.length === 0 ? undefined : sanitized;
}

export function normalizeIsoDateTime(value: string, label: string): string {
  const sanitized = normalizeRequiredText(value, label);
  const time = Date.parse(sanitized);
  if (!Number.isFinite(time)) {
    throw new Error(`History compare permission audit ${label} must be a valid ISO timestamp.`);
  }

  return new Date(time).toISOString();
}

export function normalizeNonNegativeInteger(value: number, label: string): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`History compare permission audit ${label} must be a non-negative integer.`);
  }

  return value;
}

function redactAuditText(value: string): string {
  const redactedUrls = value
    .replace(
      /\b(signed[-_]?url|signedurl|artifact[-_]?url|download[-_]?url|storage[-_]?url|url|uri)\b\s*[:=]\s*[^\s,;]+/gi,
      "$1=[redacted]"
    )
    .replace(
      /[a-z][a-z0-9+.-]*:\/\/[^\s)'"<>]*(?:x-amz-signature|x-amz-credential|signature|token|expires|credential)[^\s)'"<>]*/gi,
      "[redacted-signed-url]"
    );

  return redactSensitiveText(redactedUrls)
    .replace(/\[storage-url\]/g, "[redacted-storage]")
    .replace(/\[path\]/g, "[redacted-path]")
    .trim();
}

export function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].filter((value) => value.length > 0).sort();
}

export function duplicateStrings(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) {
      duplicates.add(value);
    }
    seen.add(value);
  }
  return uniqueSorted([...duplicates]);
}

export function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }

  for (const nested of Object.values(value)) {
    deepFreeze(nested);
  }

  return Object.freeze(value);
}

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }

  const entries = Object.entries(value)
    .filter(([, entryValue]) => entryValue !== undefined)
    .sort(([left], [right]) => left.localeCompare(right));

  return `{${entries
    .map(([key, entryValue]) => `${JSON.stringify(key)}:${stableStringify(entryValue)}`)
    .join(",")}}`;
}

export function stableHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0).toString(16).padStart(8, "0");
}
