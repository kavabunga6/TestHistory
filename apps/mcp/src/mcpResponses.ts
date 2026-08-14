import { compactOptionsFromSearch, type ResourceReadOptions } from "./mcpReadOptions.js";
import type { JsonRpcResponse } from "./mcpTypes.js";
import { optionalString, toMcpSafeValue } from "./mcpValueUtils.js";

export function textResult(id: string | number | null, text: string): JsonRpcResponse {
  return {
    jsonrpc: "2.0",
    id,
    result: {
      content: [
        {
          type: "text",
          text
        }
      ]
    }
  };
}

export function jsonTextResult(id: string | number | null, value: unknown): JsonRpcResponse {
  return textResult(id, JSON.stringify(toMcpSafeValue(value), null, 2));
}

export function resourceTextResult(
  id: string | number | null,
  uri: string,
  value: unknown
): JsonRpcResponse {
  return {
    jsonrpc: "2.0",
    id,
    result: {
      contents: [
        {
          uri,
          mimeType: "application/json",
          text: JSON.stringify(toMcpSafeValue(value), null, 2)
        }
      ]
    }
  };
}

export function parseTestHistoryUri(uri: string):
  | {
      apiUrl: string | undefined;
      parts: string[];
      searchParams: URLSearchParams;
      options: ResourceReadOptions;
    }
  | string {
  let parsed: URL;
  try {
    parsed = new URL(uri);
  } catch {
    return `Invalid resource URI: ${uri}`;
  }

  if (parsed.protocol !== "testhistory:") {
    return `Unsupported resource URI scheme: ${parsed.protocol}`;
  }

  const parts = [
    parsed.hostname,
    ...parsed.pathname.split("/").filter((part) => part.length > 0)
  ].map((part) => decodeURIComponent(part));
  const apiUrl = optionalString(parsed.searchParams.get("apiUrl"));

  return {
    apiUrl,
    parts,
    searchParams: parsed.searchParams,
    options: compactOptionsFromSearch(parsed.searchParams)
  };
}
