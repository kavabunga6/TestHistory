import { defaultArtifactPolicy } from "@testhistory/artifacts";
import type { FastifyInstance } from "fastify";
import type { AppStore } from "../store.js";
import { mcpTools } from "./mcp.js";

const healthResponseSchema = {
  type: "object",
  properties: {
    status: { type: "string" },
    service: { type: "string" },
    persistence: {
      type: "object",
      properties: {
        driver: { type: "string" },
        writable: { type: "boolean" },
        migrated: { type: "boolean" },
        migrationVersion: { type: "string" }
      }
    }
  }
} as const;

export async function registerSystemRoutes(app: FastifyInstance, store: AppStore) {
  app.get(
    "/health",
    {
      schema: {
        tags: ["system"],
        response: {
          200: healthResponseSchema,
          503: healthResponseSchema
        }
      }
    },
    async (_request, reply) => {
      try {
        const persistence = await store.health();
        if (!persistence.writable || !persistence.migrated) {
          return reply.code(503).send({
            status: "degraded",
            service: "testhistory-api",
            persistence
          });
        }
        return { status: "ok", service: "testhistory-api", persistence };
      } catch {
        return reply.code(503).send({
          status: "unavailable",
          service: "testhistory-api",
          persistence: { driver: store.driver, writable: false, migrated: false }
        });
      }
    }
  );

  app.get(
    "/api/v1/capabilities",
    {
      schema: {
        tags: ["system"],
        response: {
          200: {
            type: "object",
            additionalProperties: true
          }
        }
      }
    },
    async () => ({
      apiVersion: "v1",
      swagger: "/docs",
      openapiJson: "/docs/json",
      mcp: {
        transport: "stdio",
        package: "@testhistory/mcp",
        tools: mcpTools
      },
      ingestion: {
        modes: ["json-batch", "chunked-json", "archive-planned", "multipart-s3-planned"],
        policy: defaultArtifactPolicy()
      },
      modules: [
        "projects",
        "launches",
        "results",
        "test-cases",
        "artifacts",
        "defects",
        "quality-gates",
        "query",
        "analytics",
        "dashboards",
        "mcp"
      ]
    })
  );
}
