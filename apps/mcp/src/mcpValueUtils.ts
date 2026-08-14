export function isApiStatusPayload(value: unknown): value is { status: string } {
  return isRecord(value) && (value.status === "error" || value.status === "unavailable");
}

export function arrayField(value: Record<string, unknown>, key: string): unknown[] {
  const field = value[key];
  return Array.isArray(field) ? field : [];
}

export function stringField(value: unknown, key: string): string {
  return isRecord(value) && typeof value[key] === "string" ? value[key] : "";
}

export function integerField(value: unknown, key: string): number | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const field = value[key];
  return typeof field === "number" && Number.isInteger(field) ? field : undefined;
}

export function booleanField(value: unknown, key: string): boolean | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const field = value[key];
  return typeof field === "boolean" ? field : undefined;
}

export function numericField(value: unknown, key: string): number | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const field = value[key];
  return typeof field === "number" && Number.isFinite(field) ? field : undefined;
}

export function pickDefined(
  value: Record<string, unknown>,
  keys: string[]
): Record<string, unknown> {
  const picked: Record<string, unknown> = {};
  for (const key of keys) {
    if (value[key] !== undefined) {
      picked[key] = value[key];
    }
  }
  return picked;
}

export function omitKeys(value: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  const omitted = { ...value };
  for (const key of keys) {
    delete omitted[key];
  }
  return omitted;
}

export function toMcpSafeValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => toMcpSafeValue(item));
  }
  if (!isRecord(value)) {
    return value;
  }

  const mode = typeof value.mode === "string" ? value.mode : undefined;
  const parameterName = typeof value.name === "string" ? value.name : undefined;
  const safe: Record<string, unknown> = {};
  for (const [key, fieldValue] of Object.entries(value)) {
    if (key === "raw") {
      if (isSafeRawEffectiveReadModel(value, fieldValue)) {
        safe[key] = toMcpSafeValue(fieldValue);
        continue;
      }
      continue;
    }
    if (isSensitiveKey(key)) {
      safe[key] = "[redacted]";
      continue;
    }
    if (key === "value" && mode === "hidden") {
      continue;
    }
    if (key === "value" && mode === "masked") {
      safe[key] = "***";
      continue;
    }
    if (key === "value" && parameterName !== undefined && isSensitiveKey(parameterName)) {
      safe[key] = "[redacted]";
      safe.redacted = true;
      continue;
    }
    safe[key] = toMcpSafeValue(fieldValue);
  }
  if (mode === "hidden" || mode === "masked") {
    safe.redacted = true;
  }

  return safe;
}

export function isSafeRawEffectiveReadModel(
  container: Record<string, unknown>,
  rawValue: unknown
): boolean {
  if (!isRecord(rawValue) || !isRecord(container.effective)) {
    return false;
  }
  if (typeof container.distinction !== "string" && typeof container.launchId !== "string") {
    return false;
  }

  return Object.keys(rawValue).every((key) =>
    ["status", "metrics", "statusCounters"].includes(key)
  );
}

export function isSensitiveKey(key: string): boolean {
  const normalized = key.toLowerCase();
  if (
    normalized === "tokentransport" ||
    normalized === "nosecretsinmanifest" ||
    normalized === "tokensincluded" ||
    normalized === "secretsexposed"
  ) {
    return false;
  }
  return (
    normalized.includes("password") ||
    normalized.includes("secret") ||
    normalized.includes("token") ||
    normalized.includes("cookie") ||
    normalized.includes("authorization") ||
    normalized.includes("apikey") ||
    normalized.includes("api_key") ||
    normalized.includes("privatekey") ||
    normalized.includes("private_key")
  );
}

export function numberSearchParam(searchParams: URLSearchParams, key: string): number | undefined {
  const value = searchParams.get(key);
  if (value === null) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : undefined;
}

export function optionalPositiveInteger(value: unknown, fallback: number, maximum: number): number {
  return typeof value === "number" && Number.isInteger(value) && value > 0
    ? Math.min(value, maximum)
    : fallback;
}

export function cursorOffset(cursor: string | undefined): number {
  if (cursor === undefined) {
    return 0;
  }
  const parsed = Number(cursor);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function getRequiredString(
  value: Record<string, unknown>,
  key: string
): { value: string; error?: undefined } | { value?: undefined; error: string } {
  const field = value[key];
  if (typeof field !== "string" || field.length === 0) {
    return { error: `Missing required string argument: ${key}` };
  }
  return { value: field };
}

export function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function optionalBooleanString(value: unknown): boolean | undefined {
  if (value === true || value === "true" || value === "1") {
    return true;
  }
  if (value === false || value === "false" || value === "0") {
    return false;
  }
  return undefined;
}

export function optionalIntegerString(value: unknown): string | undefined {
  return typeof value === "number" && Number.isInteger(value) && value > 0
    ? String(value)
    : undefined;
}

export function integerStringField(value: unknown): number | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : undefined;
}

export function searchQueryArguments(
  value: Record<string, unknown>
): Record<string, string | undefined> {
  return {
    aql: optionalString(value.aql),
    query: optionalString(value.query),
    limit: optionalIntegerString(value.limit)
  };
}

export function withQuery(path: string, query: Record<string, string | undefined>): string {
  const url = new URL(path, "http://testhistory.local");
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      url.searchParams.set(key, value);
    }
  }
  return `${url.pathname}${url.search}`;
}
