import { toMcpSafeValue } from "./mcpValueUtils.js";

export function sanitizeParameterVariantSignature(value: string): string {
  if (isSensitiveText(value)) {
    try {
      return JSON.stringify(toMcpSafeValue(JSON.parse(value)));
    } catch {
      return "[redacted]";
    }
  }

  try {
    return JSON.stringify(toMcpSafeValue(JSON.parse(value)));
  } catch {
    return value;
  }
}

export function sanitizeAuditText(value: string): string {
  return isSensitiveText(value) ? "[redacted]" : value;
}

export function isSensitiveText(value: string): boolean {
  return /password|secret|token|hidden|cookie|authorization|api[_-]?key|private[_-]?key|storage[_-]?key|signed[_-]?url/i.test(
    value
  );
}

export function sanitizeStringArray(value: unknown[]): string[] {
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => sanitizeAuditText(item));
}
