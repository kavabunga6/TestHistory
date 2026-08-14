export type JsonRpcRequest = {
  jsonrpc?: "2.0";
  id?: string | number | null;
  method?: string;
  params?: unknown;
};

export type JsonRpcResponse = {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string };
};

export type ToolDefinition = {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    additionalProperties: false;
    properties: Record<string, unknown>;
    required?: string[];
  };
};

export type ResourceDefinition = {
  uri: string;
  name: string;
  description: string;
  mimeType: "application/json";
};
