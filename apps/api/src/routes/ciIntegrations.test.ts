import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { createApiApp } from "../app.js";
import { createAppStore } from "../store.js";

describe("CI integration webhooks", () => {
  const apps: Awaited<ReturnType<typeof createApiApp>>[] = [];
  const originalMasterKey = process.env.TESTHISTORY_INTEGRATION_MASTER_KEY;
  afterEach(async () => {
    if (originalMasterKey === undefined) delete process.env.TESTHISTORY_INTEGRATION_MASTER_KEY;
    else process.env.TESTHISTORY_INTEGRATION_MASTER_KEY = originalMasterKey;
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });

  it("shows a secret once, authenticates webhook events, and updates a durable job idempotently", async () => {
    const store = createAppStore();
    const projectId = "ee043e8f-70ef-4b8e-9f4f-31110324a456";
    store.projects.set(projectId, {
      id: projectId,
      key: "ci",
      name: "CI project",
      createdAt: new Date().toISOString()
    });
    const app = await createApiApp(store);
    apps.push(app);

    const created = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/integrations/ci`,
      payload: { name: "GitLab", provider: "gitlab" }
    });
    expect(created.statusCode).toBe(201);
    const receipt = created.json<{
      secret: string;
      webhookUrl: string;
      integration: { id: string; secretHash?: string };
    }>();
    expect(receipt.secret).toMatch(/^thci_/);
    expect(receipt.integration).not.toHaveProperty("secretHash");

    const listed = await app.inject({
      method: "GET",
      url: `/api/v1/projects/${projectId}/integrations/ci`
    });
    expect(listed.body).not.toContain(receipt.secret);
    expect(listed.body).not.toContain("secretHash");

    const payload = {
      eventId: "evt-1",
      pipelineId: "pipeline-42",
      name: "main #42",
      status: "running",
      branch: "main",
      pipelineUrl: "https://gitlab.example/pipelines/42"
    };
    const denied = await app.inject({
      method: "POST",
      url: receipt.webhookUrl,
      headers: { "x-testhistory-webhook-token": "wrong" },
      payload
    });
    expect(denied.statusCode).toBe(401);

    const oversized = await app.inject({
      method: "POST",
      url: receipt.webhookUrl,
      headers: { "x-testhistory-webhook-token": receipt.secret },
      payload: { ...payload, eventId: "x".repeat(301) }
    });
    expect(oversized.statusCode).toBe(400);
    expect(oversized.json()).toMatchObject({ message: "eventId is invalid", redacted: true });

    const accepted = await app.inject({
      method: "POST",
      url: receipt.webhookUrl,
      headers: { "x-testhistory-webhook-token": receipt.secret },
      payload
    });
    expect(accepted.statusCode).toBe(201);
    const job = accepted.json<{ job: { id: string; status: string } }>().job;
    expect(job.status).toBe("running");

    const completed = await app.inject({
      method: "POST",
      url: receipt.webhookUrl,
      headers: { "x-testhistory-webhook-token": receipt.secret },
      payload: { ...payload, eventId: "evt-2", status: "succeeded" }
    });
    expect(completed.statusCode).toBe(200);
    expect(completed.json<{ job: { id: string; status: string } }>().job).toMatchObject({
      id: job.id,
      status: "succeeded"
    });

    const stale = await app.inject({
      method: "POST",
      url: receipt.webhookUrl,
      headers: { "x-testhistory-webhook-token": receipt.secret },
      payload: { ...payload, eventId: "evt-3", status: "running" }
    });
    expect(stale.json<{ idempotent: boolean; ignoredStatus: string }>()).toMatchObject({
      idempotent: true,
      ignoredStatus: "running"
    });
    expect(store.automationJobs.size).toBe(1);
    expect(store.securityAuditEvents.map((event) => event.type)).toEqual(
      expect.arrayContaining(["ci-integration.created", "ci-webhook.denied", "ci-webhook.accepted"])
    );
  });

  it("normalizes native GitLab pipelines and verifies native GitHub workflow signatures", async () => {
    process.env.TESTHISTORY_INTEGRATION_MASTER_KEY =
      "test-master-key-with-at-least-thirty-two-characters";
    const store = createAppStore();
    const projectId = "ee043e8f-70ef-4b8e-9f4f-31110324a458";
    store.projects.set(projectId, {
      id: projectId,
      key: "native-ci",
      name: "Native CI",
      createdAt: new Date().toISOString()
    });
    const app = await createApiApp(store);
    apps.push(app);

    const gitlabReceipt = (
      await app.inject({
        method: "POST",
        url: `/api/v1/projects/${projectId}/integrations/ci`,
        payload: { name: "GitLab", provider: "gitlab" }
      })
    ).json<{ secret: string; webhookUrl: string }>();
    const gitlab = await app.inject({
      method: "POST",
      url: gitlabReceipt.webhookUrl,
      headers: { "x-gitlab-token": gitlabReceipt.secret, "x-gitlab-event-uuid": "gl-event-1" },
      payload: {
        object_kind: "pipeline",
        object_attributes: { id: 73, status: "success", ref: "main", sha: "abc123" },
        project: {
          path_with_namespace: "acme/android",
          web_url: "https://gitlab.example/acme/android"
        }
      }
    });
    expect(gitlab.statusCode).toBe(201);
    expect(gitlab.json()).toMatchObject({
      job: {
        name: "acme/android #73",
        status: "succeeded",
        branch: "main",
        external: {
          pipelineId: "73",
          pipelineUrl: "https://gitlab.example/acme/android/-/pipelines/73"
        }
      }
    });

    const githubCreated = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/integrations/ci`,
      payload: { name: "GitHub", provider: "github" }
    });
    const githubReceipt = githubCreated.json<{
      secret: string;
      webhookUrl: string;
      integration: Record<string, unknown>;
    }>();
    expect(githubReceipt.integration).not.toHaveProperty("secretCiphertext");
    const githubPayload = JSON.stringify({
      action: "completed",
      workflow_run: {
        id: 91,
        name: "E2E",
        status: "completed",
        conclusion: "failure",
        html_url: "https://github.example/acme/app/actions/runs/91",
        head_branch: "develop",
        head_sha: "def456"
      }
    });
    const signature = `sha256=${createHmac("sha256", githubReceipt.secret).update(githubPayload).digest("hex")}`;
    const github = await app.inject({
      method: "POST",
      url: githubReceipt.webhookUrl,
      headers: {
        "content-type": "application/json",
        "x-hub-signature-256": signature,
        "x-github-delivery": "gh-event-1"
      },
      payload: githubPayload
    });
    expect(github.statusCode).toBe(201);
    expect(github.json()).toMatchObject({
      job: { name: "E2E", status: "failed", branch: "develop", external: { pipelineId: "91" } }
    });
  });
});
