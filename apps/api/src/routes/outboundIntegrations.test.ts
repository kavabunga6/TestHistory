import { afterEach, describe, expect, it, vi } from "vitest";
import { createApiApp } from "../app.js";
import { createAppStore } from "../store.js";

const integrationTestApps: Awaited<ReturnType<typeof createApiApp>>[] = [];

describe("outbound integrations", () => {
  const originalSigningSecret = process.env.TEST_NOTIFY_SECRET;
  const originalIssueToken = process.env.TEST_GITHUB_TOKEN;
  const originalAllowlist = process.env.TESTHISTORY_OUTBOUND_HOST_ALLOWLIST;
  const originalNodeEnv = process.env.NODE_ENV;
  const originalWorkerToken = process.env.TESTHISTORY_WORKER_TOKEN;

  afterEach(async () => {
    vi.unstubAllGlobals();
    restoreEnv("TEST_NOTIFY_SECRET", originalSigningSecret);
    restoreEnv("TEST_GITHUB_TOKEN", originalIssueToken);
    restoreEnv("TESTHISTORY_OUTBOUND_HOST_ALLOWLIST", originalAllowlist);
    restoreEnv("NODE_ENV", originalNodeEnv);
    restoreEnv("TESTHISTORY_WORKER_TOKEN", originalWorkerToken);
    await Promise.all(integrationTestApps.splice(0).map((app) => app.close()));
  });

  it("queues a terminal CI notification, signs it, dispatches it once, and redacts configuration", async () => {
    process.env.TEST_NOTIFY_SECRET = "notification-signing-secret-123";
    process.env.TESTHISTORY_OUTBOUND_HOST_ALLOWLIST = "hooks.example.test";
    const fetchMock = vi.fn<typeof fetch>(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const { app, projectId } = await testApp();

    const notification = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/integrations/notifications`,
      payload: {
        name: "Ops webhook",
        provider: "generic",
        endpointUrl: "https://hooks.example.test/testhistory",
        events: ["automation-job.failed"],
        secretEnvVar: "TEST_NOTIFY_SECRET"
      }
    });
    expect(notification.statusCode).toBe(201);
    expect(notification.body).not.toContain("TEST_NOTIFY_SECRET");
    expect(notification.json().integration.signingSecretConfigured).toBe(true);

    const ci = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/integrations/ci`,
      payload: { name: "GitLab", provider: "gitlab" }
    });
    const ciReceipt = ci.json<{ secret: string; webhookUrl: string }>();
    const event = await app.inject({
      method: "POST",
      url: ciReceipt.webhookUrl,
      headers: { "x-testhistory-webhook-token": ciReceipt.secret },
      payload: {
        eventId: "evt-failed",
        pipelineId: "pipeline-1",
        name: "main #1",
        status: "failed"
      }
    });
    expect(event.statusCode).toBe(201);
    expect(appStore(app).integrationDeliveries.size).toBe(1);

    const dispatched = await app.inject({
      method: "POST",
      url: "/api/v1/integrations/deliveries/dispatch",
      payload: { workerId: "test-worker" }
    });
    expect(dispatched.statusCode).toBe(200);
    expect(dispatched.json()).toMatchObject({
      processed: 1,
      items: [{ status: "delivered", attempts: 1 }]
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe("https://hooks.example.test/testhistory");
    expect((init?.headers as Record<string, string>)["x-testhistory-signature"]).toMatch(
      /^sha256=[a-f0-9]{64}$/
    );
    expect(String(init?.body)).toContain("automation-job.failed");
  });

  it("formats Pachca notifications for an incoming webhook", async () => {
    process.env.TESTHISTORY_OUTBOUND_HOST_ALLOWLIST = "hooks.pachca.test";
    const fetchMock = vi.fn<typeof fetch>(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const { app, projectId } = await testApp();

    const notification = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/integrations/notifications`,
      payload: {
        name: "Пачка QA",
        provider: "pachca",
        endpointUrl: "https://hooks.pachca.test/incoming/testhistory",
        events: ["automation-job.failed"]
      }
    });
    expect(notification.statusCode).toBe(201);
    expect(notification.json()).toMatchObject({
      integration: { name: "Пачка QA", provider: "pachca", enabled: true }
    });

    const ci = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/integrations/ci`,
      payload: { name: "GitLab", provider: "gitlab" }
    });
    const ciReceipt = ci.json<{ secret: string; webhookUrl: string }>();
    await app.inject({
      method: "POST",
      url: ciReceipt.webhookUrl,
      headers: { "x-testhistory-webhook-token": ciReceipt.secret },
      payload: {
        eventId: "evt-pachca-failed",
        pipelineId: "pipeline-pachca",
        name: "Android regression",
        status: "failed"
      }
    });

    const dispatched = await app.inject({
      method: "POST",
      url: "/api/v1/integrations/deliveries/dispatch",
      payload: { workerId: "test-worker" }
    });
    expect(dispatched.statusCode).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe("https://hooks.pachca.test/incoming/testhistory");
    expect(JSON.parse(String(init?.body))).toEqual({
      message: "[TestHistory] Android regression: failed"
    });
  });

  it("creates an issue through a GitHub adapter without persisting or returning credentials", async () => {
    process.env.TEST_GITHUB_TOKEN = "github-integration-token-123";
    process.env.TESTHISTORY_OUTBOUND_HOST_ALLOWLIST = "api.github.example";
    const fetchMock = vi.fn<typeof fetch>(
      async () =>
        new Response(
          JSON.stringify({ number: 42, html_url: "https://github.example/acme/app/issues/42" }),
          { status: 201 }
        )
    );
    vi.stubGlobal("fetch", fetchMock);
    const { app, projectId } = await testApp();

    const created = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/integrations/issue-trackers`,
      payload: {
        name: "GitHub Issues",
        provider: "github",
        baseUrl: "https://api.github.example/",
        projectKey: "acme/app",
        credentialEnvVar: "TEST_GITHUB_TOKEN"
      }
    });
    expect(created.statusCode).toBe(201);
    expect(created.body).not.toContain("TEST_GITHUB_TOKEN");
    expect(created.body).not.toContain("github-integration-token-123");
    const integrationId = created.json().integration.id as string;

    const issue = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/issues`,
      payload: {
        integrationId,
        summary: "Checkout is broken",
        description: "Failure from run #42",
        labels: ["e2e"]
      }
    });
    expect(issue.statusCode).toBe(201);
    expect(issue.json()).toMatchObject({
      delivery: {
        status: "delivered",
        externalReference: "https://github.example/acme/app/issues/42"
      }
    });
    expect(issue.body).not.toContain("github-integration-token-123");
    const [, init] = fetchMock.mock.calls[0]!;
    expect((init?.headers as Record<string, string>).authorization).toBe(
      "Bearer github-integration-token-123"
    );
    expect([...appStore(app).integrationDeliveries.values()][0]?.payload).not.toHaveProperty(
      "credential"
    );
  });

  it("rejects insecure and private integration endpoints", async () => {
    const { app, projectId } = await testApp();
    for (const endpointUrl of [
      "http://hooks.example.test/path",
      "https://127.0.0.1/hook",
      "https://user:pass@hooks.example.test/hook"
    ]) {
      const response = await app.inject({
        method: "POST",
        url: `/api/v1/projects/${projectId}/integrations/notifications`,
        payload: {
          name: "unsafe",
          provider: "generic",
          endpointUrl,
          events: ["automation-job.failed"]
        }
      });
      expect(response.statusCode).toBe(400);
    }
  });

  it("requires the worker credential before dispatching the durable outbox in production", async () => {
    process.env.NODE_ENV = "production";
    process.env.TESTHISTORY_WORKER_TOKEN = "integration-worker-secret";
    const { app } = await testApp();
    const denied = await app.inject({
      method: "POST",
      url: "/api/v1/integrations/deliveries/dispatch",
      payload: { workerId: "worker-1" }
    });
    expect(denied.statusCode).toBe(401);
    const accepted = await app.inject({
      method: "POST",
      url: "/api/v1/integrations/deliveries/dispatch",
      headers: { authorization: "Bearer integration-worker-secret" },
      payload: { workerId: "worker-1" }
    });
    expect(accepted.statusCode).toBe(200);
  });
});

async function testApp() {
  const store = createAppStore();
  const projectId = "ee043e8f-70ef-4b8e-9f4f-31110324a457";
  store.projects.set(projectId, {
    id: projectId,
    key: "integrations",
    name: "Integrations",
    createdAt: new Date().toISOString()
  });
  const app = await createApiApp(store);
  // Tests need access to the same injected store without exposing it from production Fastify.
  (app as unknown as { testStore: typeof store }).testStore = store;
  integrationTestApps.push(app);
  return { app, projectId };
}
function appStore(app: Awaited<ReturnType<typeof createApiApp>>) {
  return (app as unknown as { testStore: ReturnType<typeof createAppStore> }).testStore;
}
function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
