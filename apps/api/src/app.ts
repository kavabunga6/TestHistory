import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { defaultArtifactPolicy } from "@testhistory/artifacts";
import Fastify from "fastify";
import { registerApiRoutes } from "./routes/index.js";
import { createAppStore, type AppStore } from "./store.js";

export async function createApiApp(store: AppStore = createAppStore()) {
  const artifactPolicy = defaultArtifactPolicy();
  const app = Fastify({
    logger: process.env.NODE_ENV !== "test",
    bodyLimit: Math.max(1_048_576, artifactPolicy.chunkBytes * 2)
  });

  app.removeContentTypeParser("application/json");
  app.addContentTypeParser("application/json", { parseAs: "string" }, (request, body, done) => {
    const source = String(body);
    (request as typeof request & { rawBody?: string }).rawBody = source;
    try {
      done(null, JSON.parse(source));
    } catch (error) {
      done(error as Error, undefined);
    }
  });

  await app.register(swagger, {
    openapi: {
      info: {
        title: "TestHistory API",
        description: "Allure-compatible Test Intelligence Platform API",
        version: "0.1.0"
      },
      tags: [
        { name: "system" },
        { name: "auth" },
        { name: "projects" },
        { name: "launches" },
        { name: "uploads" },
        { name: "artifacts" },
        { name: "test-cases" },
        { name: "test-plans" },
        { name: "automation-jobs" },
        { name: "integrations" },
        { name: "quality-gates" },
        { name: "defects" },
        { name: "query" },
        { name: "analytics" },
        { name: "dashboards" },
        { name: "security" },
        { name: "mcp" }
      ]
    }
  });

  await app.register(swaggerUi, {
    routePrefix: "/docs",
    uiConfig: {
      docExpansion: "list",
      deepLinking: true
    }
  });

  await registerApiRoutes(app, store);
  app.addHook("onClose", async () => {
    store.closePersistence?.();
  });

  return app;
}
