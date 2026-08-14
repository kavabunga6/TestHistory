import type { AuthTokenScope } from "./auth.js";

export type McpAuthCapabilityAccess = "anonymous" | "rest-authorized" | "unsupported";

export type McpAuthCapability = {
  name: string;
  access: McpAuthCapabilityAccess;
  requiredScopes: AuthTokenScope[];
  projectScoped: boolean;
  restParity?: {
    method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
    path: string;
  };
  denialShape: "PermissionDeniedError";
  notes?: string[];
};

export type McpAuthCapabilityMetadata = {
  version: string;
  tokenTransport: "rest-authorization-header";
  noSecretsInManifest: true;
  capabilities: McpAuthCapability[];
  unsupported: McpAuthCapability[];
};

export type McpToolCatalogItem = {
  name: string;
  mode: "static" | "live-api";
  deprecated?: boolean;
};

export type McpManifestReadModel = {
  name: string;
  version: string;
  transport: "stdio";
  command: string;
  args: string[];
  tools: string[];
  toolCatalog: McpToolCatalogItem[];
  auth: McpAuthCapabilityMetadata;
  plannedStatic: {
    schemaNames: string[];
    note: string;
  };
};
