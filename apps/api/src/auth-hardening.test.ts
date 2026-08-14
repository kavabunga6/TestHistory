import type { FastifyInstance } from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import { createApiApp } from "./app.js";
import { createAppStore } from "./store.js";

const originalEnvironment = {
  allowRegistration: process.env.TESTHISTORY_ALLOW_REGISTRATION,
  bootstrapEmail: process.env.TESTHISTORY_BOOTSTRAP_ADMIN_EMAIL,
  bootstrapPassword: process.env.TESTHISTORY_BOOTSTRAP_ADMIN_PASSWORD,
  nodeEnvironment: process.env.NODE_ENV,
  trustedHeaderAuth: process.env.TESTHISTORY_TRUSTED_HEADER_AUTH,
  workerToken: process.env.TESTHISTORY_WORKER_TOKEN
};

let app: FastifyInstance | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
  restoreEnvironment();
});

describe("production authentication boundary", () => {
  it("reuses precomputed demo hashes across ephemeral stores", () => {
    process.env.NODE_ENV = "test";
    const firstStore = createAppStore();
    const secondStore = createAppStore();

    expect(firstStore.users.get("default-admin")?.passwordHash).toMatch(/^scrypt:/);
    expect(secondStore.users.get("default-admin")?.passwordHash).toBe(
      firstStore.users.get("default-admin")?.passwordHash
    );
    expect(secondStore.users.get("default-user")?.passwordHash).toBe(
      firstStore.users.get("default-user")?.passwordHash
    );
  });

  it("ignores actor, project, and scope headers from an untrusted client", async () => {
    useProductionEnvironment();
    const store = createAppStore();
    store.projects.set("private-project", {
      createdAt: "2026-08-06T00:00:00.000Z",
      id: "private-project",
      key: "PRIVATE",
      name: "Private project"
    });
    app = await createApiApp(store);

    const response = await app.inject({
      headers: {
        "x-testhistory-actor-id": "project-owner",
        "x-testhistory-project-scope": "*",
        "x-testhistory-scopes": "projects:read settings:write"
      },
      method: "GET",
      url: "/api/v1/projects"
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual(
      expect.objectContaining({
        error: "PermissionDeniedError",
        redacted: true,
        requiredScopes: ["projects:read"]
      })
    );
  });

  it("derives admin authorization from a verified bootstrap session", async () => {
    useProductionEnvironment();
    process.env.TESTHISTORY_BOOTSTRAP_ADMIN_EMAIL = "admin@example.test";
    process.env.TESTHISTORY_BOOTSTRAP_ADMIN_PASSWORD = "production-password";
    const store = createAppStore();
    store.projects.set("private-project", {
      createdAt: "2026-08-06T00:00:00.000Z",
      id: "private-project",
      key: "PRIVATE",
      name: "Private project"
    });
    app = await createApiApp(store);

    const loginResponse = await app.inject({
      method: "POST",
      payload: { email: "admin@example.test", password: "production-password" },
      url: "/api/v1/auth/login"
    });
    const token = loginResponse.json<{ session: { token: string } }>().session.token;
    const projectsResponse = await app.inject({
      headers: { authorization: `Bearer ${token}` },
      method: "GET",
      url: "/api/v1/projects"
    });

    expect(loginResponse.statusCode).toBe(200);
    expect(store.users.get("bootstrap-admin")?.passwordHash).toMatch(/^scrypt:/);
    expect(projectsResponse.statusCode).toBe(200);
    expect(projectsResponse.json()).toEqual([
      expect.objectContaining({ id: "private-project", key: "PRIVATE" })
    ]);
  });

  it("keeps public registration disabled by default in production", async () => {
    useProductionEnvironment();
    app = await createApiApp(createAppStore());

    const response = await app.inject({
      method: "POST",
      payload: {
        email: "new-user@example.test",
        name: "New User",
        password: "correct-password"
      },
      url: "/api/v1/auth/register"
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ message: "User registration is disabled", redacted: true });
  });

  it("protects the internal worker queue with a separate service credential", async () => {
    useProductionEnvironment();
    process.env.TESTHISTORY_WORKER_TOKEN = "worker-service-secret";
    app = await createApiApp(createAppStore());

    const deniedResponse = await app.inject({
      headers: { authorization: "Bearer wrong-worker-secret" },
      method: "POST",
      payload: { limit: 1, source: "chunked-session", workerId: "spoofed-worker" },
      url: "/api/v1/uploads/jobs/claim"
    });
    const allowedResponse = await app.inject({
      headers: { authorization: "Bearer worker-service-secret" },
      method: "POST",
      payload: { limit: 1, source: "chunked-session", workerId: "real-worker" },
      url: "/api/v1/uploads/jobs/claim"
    });

    expect(deniedResponse.statusCode).toBe(401);
    expect(deniedResponse.json()).toEqual(
      expect.objectContaining({ error: "WorkerAuthenticationRequiredError", redacted: true })
    );
    expect(deniedResponse.body).not.toContain("wrong-worker-secret");
    expect(allowedResponse.statusCode).toBe(200);
  });
});

function useProductionEnvironment(): void {
  process.env.NODE_ENV = "production";
  delete process.env.TESTHISTORY_ALLOW_REGISTRATION;
  delete process.env.TESTHISTORY_BOOTSTRAP_ADMIN_EMAIL;
  delete process.env.TESTHISTORY_BOOTSTRAP_ADMIN_PASSWORD;
  delete process.env.TESTHISTORY_TRUSTED_HEADER_AUTH;
  delete process.env.TESTHISTORY_WORKER_TOKEN;
}

function restoreEnvironment(): void {
  restoreVariable("NODE_ENV", originalEnvironment.nodeEnvironment);
  restoreVariable("TESTHISTORY_ALLOW_REGISTRATION", originalEnvironment.allowRegistration);
  restoreVariable("TESTHISTORY_BOOTSTRAP_ADMIN_EMAIL", originalEnvironment.bootstrapEmail);
  restoreVariable("TESTHISTORY_BOOTSTRAP_ADMIN_PASSWORD", originalEnvironment.bootstrapPassword);
  restoreVariable("TESTHISTORY_TRUSTED_HEADER_AUTH", originalEnvironment.trustedHeaderAuth);
  restoreVariable("TESTHISTORY_WORKER_TOKEN", originalEnvironment.workerToken);
}

function restoreVariable(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}
