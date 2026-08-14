import type { AuthTokenScope } from "@testhistory/contracts";
import type { FastifyInstance } from "fastify";
import type { AppStore } from "../store.js";
import { trustedHeaderAuthEnabled } from "../requestAuthContext.js";
import { authenticateUser } from "./auth.js";

const sessionScopes: readonly AuthTokenScope[] = [
  "mcp:discover",
  "projects:read",
  "projects:write",
  "launches:read",
  "launches:write",
  "uploads:read",
  "uploads:write",
  "results:read",
  "results:write",
  "test-cases:read",
  "test-cases:write",
  "artifacts:read",
  "artifacts:write",
  "analytics:read",
  "dashboards:read",
  "dashboards:write",
  "defects:read",
  "defects:write",
  "quarantine:write",
  "settings:read",
  "settings:write",
  "exports:read",
  "security:audit:read",
  "quality-gates:evaluate"
];

export async function registerRequestAuthGuard(app: FastifyInstance, store: AppStore) {
  app.addHook("onRequest", async (request) => {
    if (!trustedHeaderAuthEnabled()) {
      delete request.headers["x-testhistory-actor-id"];
      delete request.headers["x-testhistory-project-scope"];
      delete request.headers["x-testhistory-scopes"];
    }

    const principal = authenticateUser(request, store);
    if (principal === undefined || request.url.startsWith("/api/v1/auth/")) {
      return;
    }

    // Downstream project-token handlers must not reinterpret a verified user session
    // as a project API token. They receive server-derived compatibility headers instead.
    delete request.headers.authorization;
    request.headers["x-testhistory-actor-id"] = principal.user.email;
    request.headers["x-testhistory-project-scope"] = projectScopeFor(principal, store);
    request.headers["x-testhistory-scopes"] =
      principal.method === "session" ? sessionScopes.join(" ") : (principal.scopes ?? []).join(" ");
  });
}

function projectScopeFor(
  principal: NonNullable<ReturnType<typeof authenticateUser>>,
  store: AppStore
): string {
  if (principal.user.role === "admin") {
    return "*";
  }

  return Array.from(store.projects.values())
    .filter((project) =>
      project.accessSettings?.memberships?.some(
        (membership) =>
          membership.status === "active" &&
          (membership.subject === principal.user.id || membership.subject === principal.user.email)
      )
    )
    .map((project) => project.id)
    .join(" ");
}
