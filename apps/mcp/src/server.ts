import { createInterface } from "node:readline";
import { pathToFileURL } from "node:url";

import { readResource } from "./mcpResourceReadHandler.js";
import { callTool } from "./mcpToolCallHandler.js";
import { resources } from "./mcpResources.js";
import { tools } from "./mcpTools.js";
import type { JsonRpcRequest, JsonRpcResponse } from "./mcpTypes.js";
import { write } from "./mcpRpcUtils.js";

if (isMainModule()) {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false
  });

  rl.on("line", (line) => {
    if (!line.trim()) {
      return;
    }

    let request: JsonRpcRequest;
    try {
      request = JSON.parse(line) as JsonRpcRequest;
    } catch {
      write({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
      return;
    }

    void handle(request).then(write);
  });
}

export async function handle(request: JsonRpcRequest): Promise<JsonRpcResponse> {
  const id = request.id ?? null;

  switch (request.method) {
    case "initialize":
      return {
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: "2024-11-05",
          serverInfo: {
            name: "testhistory-mcp",
            version: "0.1.0"
          },
          capabilities: {
            tools: {},
            resources: {}
          }
        }
      };
    case "tools/list":
      return { jsonrpc: "2.0", id, result: { tools } };
    case "tools/call":
      return callTool(id, request.params);
    case "resources/list":
      return { jsonrpc: "2.0", id, result: { resources } };
    case "resources/read":
      return readResource(id, request.params);
    default:
      return {
        jsonrpc: "2.0",
        id,
        error: { code: -32601, message: `Unknown method: ${request.method ?? "<missing>"}` }
      };
  }
}

function isMainModule(): boolean {
  const entrypoint = process.argv[1];
  return entrypoint !== undefined && import.meta.url === pathToFileURL(entrypoint).href;
}
