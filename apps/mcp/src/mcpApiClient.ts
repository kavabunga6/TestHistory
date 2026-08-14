import { isRecord, toMcpSafeValue } from "./mcpValueUtils.js";

type FetchApiOptions = Pick<RequestInit, "method" | "headers" | "body">;

export async function fetchApiJson(
  apiUrl: unknown,
  path: string,
  init: FetchApiOptions = {}
): Promise<string> {
  return JSON.stringify(toMcpSafeValue(await fetchApiValue(apiUrl, path, init)));
}

export async function fetchApiValue(
  apiUrl: unknown,
  path: string,
  init: FetchApiOptions = {}
): Promise<unknown> {
  const baseUrl =
    typeof apiUrl === "string" && apiUrl.length > 0 ? apiUrl : process.env.TESTHISTORY_API_URL;
  const resolvedBaseUrl = baseUrl ?? "http://127.0.0.1:18080";
  const url = new URL(path, resolvedBaseUrl);

  try {
    const response = await fetch(url, init);
    if (!response.ok) {
      const permissionDenied = await permissionDeniedFromResponse(response);
      return {
        status: "error",
        code: response.status,
        message: response.statusText,
        url: url.toString(),
        ...(permissionDenied !== undefined ? { permissionDenied } : {})
      };
    }
    return await response.json();
  } catch (error) {
    return {
      status: "unavailable",
      message: error instanceof Error ? error.message : "Unable to reach TestHistory API",
      url: url.toString(),
      backendRequirement: "This live API tool requires a running TestHistory API backend."
    };
  }
}

export async function permissionDeniedFromResponse(
  response: Response
): Promise<unknown | undefined> {
  if (response.status !== 401 && response.status !== 403) {
    return undefined;
  }

  const body = await response
    .clone()
    .json()
    .catch(() => undefined);
  if (
    isRecord(body) &&
    (body.error === "permission_denied" || body.error === "PermissionDeniedError")
  ) {
    return toMcpSafeValue(removeUnsafeDeniedFields(body));
  }

  return {
    error: "permission_denied",
    message: response.statusText || "Permission denied",
    reason: response.status === 401 ? "missing_token" : "permission_denied"
  };
}

export function removeUnsafeDeniedFields(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => removeUnsafeDeniedFields(item));
  }
  if (!isRecord(value)) {
    return value;
  }

  const safe: Record<string, unknown> = {};
  for (const [key, fieldValue] of Object.entries(value)) {
    if (isUnsafeDeniedField(key)) {
      continue;
    }
    safe[key] = removeUnsafeDeniedFields(fieldValue);
  }
  return safe;
}

function isUnsafeDeniedField(key: string): boolean {
  const normalized = key.toLowerCase();
  const attachmentBlobFieldNames = new Set([
    "raw",
    "blob",
    "body",
    "content",
    "data",
    "payload",
    "bytes",
    "buffer",
    "base64",
    "path",
    "source",
    "storageKey",
    "signedUrl",
    "downloadUrl",
    "url"
  ]);

  return (
    normalized === "raw" ||
    normalized === "attachments" ||
    normalized === "steps" ||
    normalized === "statusdetails" ||
    attachmentBlobFieldNames.has(key) ||
    normalized.includes("storage") ||
    normalized === "downloadurl" ||
    normalized === "artifacturl" ||
    normalized.includes("signature") ||
    normalized.includes("signedurl") ||
    normalized.includes("signed_url") ||
    normalized.endsWith("path")
  );
}
