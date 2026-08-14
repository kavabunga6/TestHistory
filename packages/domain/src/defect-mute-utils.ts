export function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].filter((value) => value.length > 0).sort();
}

export function sortRecord<T>(record: Record<string, T>): Record<string, T> {
  return Object.fromEntries(
    Object.entries(record).sort(([left], [right]) => left.localeCompare(right))
  );
}

export function containsObjectKey(value: unknown, key: string): boolean {
  if (value === null || typeof value !== "object") {
    return false;
  }
  if (Array.isArray(value)) {
    return value.some((item) => containsObjectKey(item, key));
  }
  return Object.entries(value).some(
    ([entryKey, entryValue]) => entryKey === key || containsObjectKey(entryValue, key)
  );
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

export function collectUnsafeFieldPaths(
  value: unknown,
  path: string,
  seen: WeakSet<object>
): string[] {
  if (value === null || typeof value !== "object") {
    return [];
  }

  if (seen.has(value)) {
    return [];
  }
  seen.add(value);

  if (Array.isArray(value)) {
    return value.flatMap((item, index) => collectUnsafeFieldPaths(item, `${path}[${index}]`, seen));
  }

  return Object.entries(value).flatMap(([key, entryValue]) => {
    const fieldPath = `${path}.${key}`;
    const nested = collectUnsafeFieldPaths(entryValue, fieldPath, seen);
    return isUnsafePayloadFieldName(key) ? [fieldPath, ...nested] : nested;
  });
}

function isUnsafePayloadFieldName(key: string): boolean {
  return /authorization|body|content|cookie|credential|hidden|masked|password|passwd|payload|path|secret|signed[-_]?url|storage|token|api[-_]?key|access[-_]?key|session|url|uri/i.test(
    key
  );
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
