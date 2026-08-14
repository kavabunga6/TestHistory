import type { FastifyInstance, FastifyRequest } from "fastify";
import type { AppStore } from "../store.js";
import { getRequestUserPrincipal, trustedHeaderAuthEnabled } from "../requestAuthContext.js";

const guardedMethods = new Set(["DELETE"]);

export async function registerMutationAuthGuard(app: FastifyInstance, _store: AppStore) {
  app.addHook("onRequest", async (request, reply) => {
    if (!guardedMethods.has(request.method) || hasAuthSignal(request)) {
      return;
    }

    return reply.code(401).send({
      error: "AuthenticationRequiredError",
      message: "Authentication is required for delete operations",
      redacted: true
    });
  });
}

function hasAuthSignal(request: FastifyRequest): boolean {
  return (
    getRequestUserPrincipal(request) !== undefined ||
    request.headers.authorization !== undefined ||
    (trustedHeaderAuthEnabled() &&
      (hasHeaderValue(request.headers["x-testhistory-actor-id"]) ||
        hasHeaderValue(request.headers["x-testhistory-project-scope"]) ||
        hasHeaderValue(request.headers["x-testhistory-scopes"])))
  );
}

function hasHeaderValue(value: FastifyRequest["headers"][string]): boolean {
  if (Array.isArray(value)) {
    return value.some(hasHeaderValue);
  }
  return typeof value === "string" && value.trim().length > 0;
}
