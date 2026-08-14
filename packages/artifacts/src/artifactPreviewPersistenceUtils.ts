export function assertArtifactPreviewSerializedBytes(
  serialized: string,
  maxSerializedBytes: number
): void {
  const serializedBytes = Buffer.byteLength(serialized, "utf8");
  if (serializedBytes > maxSerializedBytes) {
    throw new Error(
      `Artifact preview descriptor persistence record exceeds ${maxSerializedBytes} bytes`
    );
  }
}

export function assertArtifactPreviewPersistenceSafe(value: unknown, path = "$"): void {
  if (Buffer.isBuffer(value)) {
    throw new Error("Artifact preview descriptor persistence record includes raw binary data");
  }
  if (typeof value === "string") {
    if (
      containsSignedUrl(value) ||
      containsArtifactPreviewUnsafePath(value) ||
      containsArtifactStorageKey(value) ||
      /^data:/i.test(value) ||
      containsUnredactedTokenLikeValue(value)
    ) {
      throw new Error("Artifact preview descriptor persistence record includes unsafe data");
    }
    return;
  }
  if (value === null || value === undefined || typeof value !== "object") {
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertArtifactPreviewPersistenceSafe(item, `${path}[${index}]`));
    return;
  }

  for (const [key, entryValue] of Object.entries(value)) {
    if (isForbiddenArtifactPreviewPersistenceKey(key)) {
      throw new Error("Artifact preview descriptor persistence record includes unsafe fields");
    }
    assertArtifactPreviewPersistenceSafe(entryValue, `${path}.${key}`);
  }
}

function isForbiddenArtifactPreviewPersistenceKey(key: string): boolean {
  if (
    key === "pathIncluded" ||
    key === "storageKeyIncluded" ||
    key === "rawPayloadIncluded" ||
    key === "blobIncluded" ||
    key === "signedUrlIncluded"
  ) {
    return false;
  }

  const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, "");
  return (
    normalized === "blob" ||
    normalized === "blobs" ||
    normalized === "payload" ||
    normalized === "payloads" ||
    normalized === "path" ||
    normalized === "paths" ||
    normalized === "raw" ||
    normalized === "rawpayload" ||
    normalized === "storage" ||
    normalized === "storagekey" ||
    normalized === "storagekeys" ||
    normalized === "signedurl" ||
    normalized === "signedurls" ||
    normalized === "url" ||
    normalized === "urls" ||
    normalized === "authorization" ||
    normalized === "cookie" ||
    normalized === "token" ||
    normalized === "accesstoken" ||
    normalized === "secret" ||
    normalized === "password" ||
    normalized === "passwd" ||
    normalized === "pwd" ||
    normalized.endsWith("token") ||
    normalized.endsWith("secret") ||
    normalized.endsWith("password") ||
    normalized.endsWith("signedurl")
  );
}

function containsUnredactedTokenLikeValue(value: string): boolean {
  return (
    /\b(?:authorization|cookie)\s*[:=]\s*(?!\[REDACTED\])\S+/i.test(value) ||
    /\bbearer\s+(?!\[REDACTED\])[A-Za-z0-9._~+/=-]{8,}/i.test(value) ||
    /\b(?:token|access_token|password|passwd|pwd|secret|signature|x-amz-signature)\s*[:=]\s*["']?(?!\[REDACTED\])[^"',\s;&]{3,}/i.test(
      value
    ) ||
    /["'](?:authorization|cookie|token|access_token|password|passwd|pwd|secret|signature|x-amz-signature)["']\s*:\s*["'](?!\[REDACTED\])[^"']+["']/i.test(
      value
    )
  );
}

function containsArtifactPreviewUnsafePath(value: string): boolean {
  return (
    containsLocalPath(value) ||
    /[A-Za-z]:[\\/][^\s"'<>]+/.test(value) ||
    /\\\\[^\s\\]+\\[^\s"'<>]+/.test(value) ||
    /\/(?:Users|home|tmp|var|private|mnt|Volumes)\/[^\s"'<>]+/.test(value)
  );
}

function containsArtifactStorageKey(value: string): boolean {
  return /[A-Za-z0-9][A-Za-z0-9._:-]{0,127}\/(?:allure-result|allure-container|attachment|fixture|scenario|environment|executor|unknown)\/[A-Za-z0-9][A-Za-z0-9._:-]{0,127}/.test(
    value
  );
}

export function stableArtifactJsonStringify(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("Artifact preview descriptor persistence record has invalid number");
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableArtifactJsonStringify(item)).join(",")}]`;
  }
  if (typeof value === "object" && value !== null) {
    const entries = Object.entries(value)
      .filter(([, entryValue]) => entryValue !== undefined)
      .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries
      .map(
        ([key, entryValue]) => `${JSON.stringify(key)}:${stableArtifactJsonStringify(entryValue)}`
      )
      .join(",")}}`;
  }
  throw new Error("Artifact preview descriptor persistence record has unsupported value");
}

export function readArtifactRecord(value: unknown, label: string): Record<string, unknown> {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Buffer.isBuffer(value)
  ) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

export function readArtifactString(value: unknown, label: string): string {
  if (typeof value !== "string") {
    throw new Error(`${label} must be a string`);
  }
  return value;
}

export function readOptionalArtifactString(value: unknown, label: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  return readArtifactString(value, label);
}

export function readArtifactNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label} must be a number`);
  }
  return value;
}

export function readNonNegativeArtifactInteger(value: unknown, label: string): number {
  const number = readArtifactNumber(value, label);
  if (!Number.isInteger(number) || number < 0) {
    throw new Error(`${label} must be a non-negative integer`);
  }
  return number;
}

export function readArtifactBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`${label} must be a boolean`);
  }
  return value;
}

function containsSignedUrl(value: string): boolean {
  if (!/https?:\/\//i.test(value)) {
    return false;
  }

  try {
    const url = new URL(value);
    return Array.from(url.searchParams.keys()).some((key) =>
      /^(x-amz-signature|x-amz-credential|signature|sig|token|access_token|secret)$/i.test(key)
    );
  } catch {
    return /[?&](x-amz-signature|x-amz-credential|signature|sig|token|access_token|secret)=/i.test(
      value
    );
  }
}

function containsLocalPath(value: string): boolean {
  return (
    /(^|\s)[A-Za-z]:[\\/][^\s]+/.test(value) ||
    /(^|\s)\\\\[^\s\\]+\\[^\s]+/.test(value) ||
    /(^|\s)\/(?:Users|home|tmp|var|private|mnt|Volumes)\//.test(value)
  );
}
