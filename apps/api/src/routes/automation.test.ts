import { afterEach, describe, expect, it } from "vitest";
import { createApiApp } from "../app.js";
import { createAppStore, type Launch } from "../store.js";

describe("test plans and automation jobs API", () => {
  const apps: Awaited<ReturnType<typeof createApiApp>>[] = [];
  afterEach(async () => Promise.all(apps.splice(0).map((app) => app.close())));

  it("persists automated selectors and enforces CI job transitions and project relations", async () => {
    const store = createAppStore();
    const projectId = "2c4074f7-759a-4b24-b8c1-0a57884d325d";
    const otherProjectId = "535bb7c5-b92f-4642-b62b-d8b9ebf36f0d";
    store.projects.set(projectId, {
      id: projectId,
      key: "mobile",
      name: "Mobile",
      createdAt: new Date().toISOString()
    });
    store.projects.set(otherProjectId, {
      id: otherProjectId,
      key: "other",
      name: "Other",
      createdAt: new Date().toISOString()
    });
    const launch: Launch = {
      id: "ba5abf31-7565-40e0-ae87-7e87c12fa652",
      projectId,
      name: "CI #42",
      status: "open",
      createdAt: new Date().toISOString(),
      results: []
    };
    store.launches.set(launch.id, launch as unknown as Parameters<typeof store.launches.set>[1]);
    const app = await createApiApp(store);
    apps.push(app);

    const planResponse = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/test-plans`,
      payload: { name: "Smoke", selector: { tags: ["smoke", "smoke"], testCaseIds: ["case-1"] } }
    });
    expect(planResponse.statusCode).toBe(201);
    const plan = planResponse.json<{ id: string; selector: unknown }>();
    expect(plan.selector).toEqual({ tags: ["smoke"], testCaseIds: ["case-1"] });
    expect(await store.repositories.testPlans.findById(projectId, plan.id)).toBeDefined();

    const jobResponse = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/automation-jobs`,
      payload: {
        name: "GitLab pipeline 42",
        trigger: "ci",
        testPlanId: plan.id,
        launchId: launch.id,
        external: {
          provider: "gitlab",
          pipelineId: "42",
          pipelineUrl: "https://gitlab.example/pipelines/42"
        }
      }
    });
    expect(jobResponse.statusCode).toBe(201);
    const job = jobResponse.json<{ id: string; status: string }>();
    expect(job.status).toBe("queued");

    expect(
      (
        await app.inject({
          method: "PATCH",
          url: `/api/v1/projects/${projectId}/automation-jobs/${job.id}`,
          payload: { status: "running" }
        })
      ).statusCode
    ).toBe(200);
    expect(
      (
        await app.inject({
          method: "PATCH",
          url: `/api/v1/projects/${projectId}/automation-jobs/${job.id}`,
          payload: { status: "succeeded" }
        })
      ).statusCode
    ).toBe(200);
    expect(
      (
        await app.inject({
          method: "PATCH",
          url: `/api/v1/projects/${projectId}/automation-jobs/${job.id}`,
          payload: { status: "running" }
        })
      ).statusCode
    ).toBe(409);

    const foreignRelation = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${otherProjectId}/automation-jobs`,
      payload: { name: "Foreign", testPlanId: plan.id }
    });
    expect(foreignRelation.statusCode).toBe(400);

    const list = await app.inject({
      method: "GET",
      url: `/api/v1/projects/${projectId}/automation-jobs?testPlanId=${plan.id}`
    });
    expect(list.statusCode).toBe(200);
    expect(list.json<{ items: unknown[] }>().items).toHaveLength(1);
    expect(store.securityAuditEvents.map((event) => event.type)).toEqual(
      expect.arrayContaining([
        "test-plan.created",
        "automation-job.created",
        "automation-job.updated"
      ])
    );
  });

  it("rejects empty selectors and archives plans through the protected update model", async () => {
    const store = createAppStore();
    const projectId = "c542fb15-bd17-4e12-a75c-56aee5ec0648";
    store.projects.set(projectId, {
      id: projectId,
      key: "api",
      name: "API",
      createdAt: new Date().toISOString()
    });
    const app = await createApiApp(store);
    apps.push(app);

    const invalid = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/test-plans`,
      payload: { name: "Empty", selector: {} }
    });
    expect(invalid.statusCode).toBe(400);
    const created = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/test-plans`,
      payload: { name: "Regression", selector: { thql: "status != skipped" } }
    });
    const planId = created.json<{ id: string }>().id;
    const archived = await app.inject({
      method: "PATCH",
      url: `/api/v1/projects/${projectId}/test-plans/${planId}`,
      payload: { status: "archived" }
    });
    expect(archived.statusCode).toBe(200);
    expect(archived.json<{ status: string }>().status).toBe("archived");
  });
});
