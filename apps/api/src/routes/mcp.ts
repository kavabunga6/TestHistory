import type { FastifyInstance } from "fastify";
import type { McpAuthCapabilityMetadata } from "@testhistory/contracts";

export const mcpToolCatalog = [
  { name: "testhistory.health", mode: "static" },
  { name: "testhistory.discovery", mode: "static" },
  { name: "testhistory.openapi", mode: "static" },
  { name: "testhistory.schemas", mode: "static" },
  { name: "testhistory.upload.policy", mode: "static" },
  { name: "testhistory.upload.session.schema", mode: "static" },
  { name: "testhistory.quality-gate.rules", mode: "static" },
  { name: "testhistory.capabilities", mode: "live-api" },
  { name: "testhistory.projects.find", mode: "live-api" },
  { name: "testhistory.launch.get", mode: "live-api" },
  { name: "testhistory.launch.quality-gate", mode: "live-api" },
  { name: "testhistory.test-cases.list", mode: "live-api", deprecated: true },
  { name: "testhistory.test-cases.find", mode: "live-api" },
  { name: "testhistory.test-case.get", mode: "live-api" },
  { name: "testhistory.test-case.history", mode: "live-api" },
  { name: "testhistory.test-results.find", mode: "live-api" },
  { name: "testhistory.test-result.get", mode: "live-api" }
] as const;

export const mcpTools = mcpToolCatalog.map((tool) => tool.name);

export const mcpAuthCapabilities: McpAuthCapabilityMetadata = {
  version: "2026-05-30",
  tokenTransport: "rest-authorization-header",
  noSecretsInManifest: true,
  capabilities: [
    {
      name: "testhistory.discovery",
      access: "anonymous",
      requiredScopes: ["mcp:discover"],
      projectScoped: false,
      denialShape: "PermissionDeniedError",
      notes: ["Static metadata only; does not grant project data access."]
    },
    {
      name: "testhistory.capabilities",
      access: "anonymous",
      requiredScopes: ["mcp:discover"],
      projectScoped: false,
      restParity: { method: "GET", path: "/api/v1/capabilities" },
      denialShape: "PermissionDeniedError"
    },
    {
      name: "testhistory.projects.find",
      access: "rest-authorized",
      requiredScopes: ["projects:read"],
      projectScoped: true,
      restParity: { method: "GET", path: "/api/v1/projects" },
      denialShape: "PermissionDeniedError"
    },
    {
      name: "testhistory.launch.get",
      access: "rest-authorized",
      requiredScopes: ["launches:read"],
      projectScoped: true,
      restParity: { method: "GET", path: "/api/v1/launches/{launchId}" },
      denialShape: "PermissionDeniedError"
    },
    {
      name: "testhistory.launch.quality-gate",
      access: "rest-authorized",
      requiredScopes: ["quality-gates:evaluate"],
      projectScoped: true,
      restParity: { method: "POST", path: "/api/v1/launches/{launchId}/quality-gate" },
      denialShape: "PermissionDeniedError"
    },
    {
      name: "testhistory.test-cases.find",
      access: "rest-authorized",
      requiredScopes: ["test-cases:read"],
      projectScoped: true,
      restParity: { method: "GET", path: "/api/v1/test-cases" },
      denialShape: "PermissionDeniedError"
    },
    {
      name: "testhistory.test-case.get",
      access: "rest-authorized",
      requiredScopes: ["test-cases:read"],
      projectScoped: true,
      restParity: { method: "GET", path: "/api/v1/test-cases/{testCaseId}" },
      denialShape: "PermissionDeniedError"
    },
    {
      name: "testhistory.test-case.history",
      access: "rest-authorized",
      requiredScopes: ["test-cases:read"],
      projectScoped: true,
      restParity: { method: "GET", path: "/api/v1/test-cases/{testCaseId}/history" },
      denialShape: "PermissionDeniedError"
    },
    {
      name: "testhistory.test-results.find",
      access: "rest-authorized",
      requiredScopes: ["launches:read"],
      projectScoped: true,
      restParity: { method: "GET", path: "/api/v1/launches/{launchId}" },
      denialShape: "PermissionDeniedError",
      notes: ["Result search is currently scoped through launch details."]
    },
    {
      name: "testhistory.test-result.get",
      access: "rest-authorized",
      requiredScopes: ["launches:read"],
      projectScoped: true,
      restParity: {
        method: "GET",
        path: "/api/v1/launches/{launchId}/results/{resultUuid}"
      },
      denialShape: "PermissionDeniedError"
    }
  ],
  unsupported: [
    {
      name: "testhistory.artifacts.read",
      access: "unsupported",
      requiredScopes: ["artifacts:read"],
      projectScoped: true,
      restParity: { method: "GET", path: "/api/v1/artifacts" },
      denialShape: "PermissionDeniedError",
      notes: ["No MCP artifact tool is advertised until REST artifact auth is implemented."]
    },
    {
      name: "testhistory.test-case.mutate",
      access: "unsupported",
      requiredScopes: ["test-cases:write"],
      projectScoped: true,
      restParity: { method: "PATCH", path: "/api/v1/test-cases/{testCaseId}" },
      denialShape: "PermissionDeniedError",
      notes: ["Mutation schemas are planning aids only; no MCP mutation tool is advertised."]
    }
  ]
};

export async function registerMcpRoutes(app: FastifyInstance) {
  app.get(
    "/api/v1/mcp/manifest",
    {
      schema: {
        tags: ["mcp"]
      }
    },
    async () => ({
      name: "testhistory-mcp",
      version: "0.1.0",
      transport: "stdio",
      command: "npm",
      args: ["run", "start", "-w", "@testhistory/mcp"],
      tools: mcpTools,
      toolCatalog: mcpToolCatalog,
      auth: mcpAuthCapabilities,
      plannedStatic: {
        schemaNames: ["test-case.mutation", "shared-step.mutation", "mute.mutation"],
        note: "Mutation schemas are static planning aids; no MCP mutation tools are advertised without REST/API parity."
      }
    })
  );
}
