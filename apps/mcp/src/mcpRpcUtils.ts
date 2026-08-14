import type { JsonRpcResponse } from "./mcpTypes.js";

export function write(response: JsonRpcResponse) {
  process.stdout.write(`${JSON.stringify(response)}\n`);
}

export function invalidParams(id: string | number | null, message: string): JsonRpcResponse {
  return {
    jsonrpc: "2.0",
    id,
    error: { code: -32602, message }
  };
}
