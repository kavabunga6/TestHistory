import type { FastifyInstance } from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApiApp } from "../app.js";
import { createProject, createProjectLaunch } from "../appTestHelpers.js";
import { createAppStore } from "../store.js";

let app: FastifyInstance | undefined;

afterEach(async () => {
  vi.unstubAllGlobals();
  await app?.close();
  app = undefined;
});

describe("local nested-step UI seed", () => {
  it("keeps user data and existing v3 while idempotently creating a closed 100-result showcase", async () => {
    const store = createAppStore();
    app = await createApiApp(store);
    const otherProject = await createProject(app);
    const project = await createProject(app);
    const userLaunch = await createProjectLaunch(app, project.id, "User's existing launch");
    const legacyLaunch = await createProjectLaunch(app, project.id, "Nested steps UI fixture v3");
    const legacyUpload = await app.inject({
      method: "POST",
      url: `/api/v1/launches/${legacyLaunch.id}/results/json`,
      payload: {
        files: [
          {
            path: "legacy-result.json",
            content: JSON.stringify({ uuid: "legacy-v3-result", name: "Legacy", status: "passed" })
          }
        ]
      }
    });
    expect(legacyUpload.statusCode).toBe(200);
    const legacyClose = await app.inject({
      method: "POST",
      url: `/api/v1/launches/${legacyLaunch.id}/close`,
      payload: {}
    });
    expect(legacyClose.statusCode).toBe(200);
    stubApiFetch();
    const { seedLocalNestedSteps } = await import(
      new URL("../../../../scripts/seed-local-nested-steps.mjs", import.meta.url).href
    );

    const first = await seedLocalNestedSteps({
      baseUrl: "http://127.0.0.1:18080",
      projectId: project.id
    });
    expect(first.projectId).toBe(project.id);
    expect(first.showcase).toEqual(
      expect.objectContaining({ created: true, results: 100, batches: 10, status: "closed" })
    );
    expect(store.launches.get(userLaunch.id)?.name).toBe("User's existing launch");
    expect(store.launches.get(legacyLaunch.id)?.results).toEqual([
      expect.objectContaining({ uuid: "legacy-v3-result" })
    ]);
    expect(
      [...store.launches.values()].filter((launch) => launch.projectId === otherProject.id)
    ).toEqual([]);

    const showcase = store.launches.get(first.showcase.launchId)!;
    expect(showcase.status).toBe("closed");
    expect(showcase.results).toHaveLength(100);
    expect(new Set(showcase.results.map((result) => result.uuid)).size).toBe(100);
    const failedRequest = showcase.results.find((result) => result.uuid === "nested-v6-002");
    expect(failedRequest?.raw.statusDetails?.message).toContain("Ожидалось:");
    expect(failedRequest?.raw.statusDetails?.message).toContain("HTTP 200");
    expect(failedRequest?.raw.statusDetails?.message).toContain("Получено: HTTP 401");
    expect(failedRequest?.raw.statusDetails?.trace).toContain("AssertionError");
    expect(failedRequest?.raw.statusDetails?.trace).not.toContain("synthetic diagnostic");
    expect(failedRequest?.steps[1]?.steps?.[0]?.statusDetails?.trace).toContain("AssertionError");
    expect(new Set(showcase.results.map((result) => result.status))).toEqual(
      new Set(["passed", "failed", "broken", "skipped", "unknown"])
    );
    const depths = showcase.results.map((result) => stepDepth(result.steps));
    expect(depths).toContain(5);
    expect(depths).toContain(6);
    const attachmentCounts = new Set(
      showcase.results.map(
        (result) => result.attachments.length + stepAttachmentCount(result.steps)
      )
    );
    expect(attachmentCounts).toEqual(new Set([0, 1, 2, 3]));

    const second = await seedLocalNestedSteps({
      baseUrl: "http://127.0.0.1:18080",
      projectId: project.id
    });
    expect(second.showcase.created).toBe(false);
    expect(second.showcase.launchId).toBe(first.showcase.launchId);
    expect(store.launches.size).toBe(3);
    expect(store.launches.get(userLaunch.id)?.name).toBe("User's existing launch");
    expect(store.launches.get(legacyLaunch.id)?.results).toHaveLength(1);
  }, 30_000);

  it("creates only the new showcase in an empty store", async () => {
    const store = createAppStore();
    app = await createApiApp(store);
    stubApiFetch();
    const { seedLocalNestedSteps } = await import(
      new URL("../../../../scripts/seed-local-nested-steps.mjs", import.meta.url).href
    );

    const result = await seedLocalNestedSteps({ baseUrl: "http://127.0.0.1:18080" });
    expect(result.showcase).toEqual(
      expect.objectContaining({ created: true, results: 100, status: "closed" })
    );
    expect(store.launches.size).toBe(1);
    expect(store.launches.get(result.showcase.launchId)?.results).toHaveLength(100);
    expect([...store.launches.values()].some((launch) => launch.name.includes("v3"))).toBe(false);
  }, 30_000);
});

function stubApiFetch() {
  vi.stubGlobal("fetch", async (input: string | URL, options?: RequestInit) => {
    const url = new URL(String(input));
    const method = options?.method === "POST" ? "POST" : "GET";
    const response = await app!.inject({
      method,
      url: `${url.pathname}${url.search}`,
      ...(options?.body !== undefined ? { payload: String(options.body) } : {}),
      ...(options?.headers !== undefined
        ? { headers: options.headers as Record<string, string> }
        : {})
    });
    return new Response(response.body, { status: response.statusCode });
  });
}

function stepDepth(steps: Array<{ steps?: unknown[] }>, depth = 1): number {
  return Math.max(
    0,
    ...steps.map((step) =>
      Math.max(depth, stepDepth((step.steps ?? []) as Array<{ steps?: unknown[] }>, depth + 1))
    )
  );
}

function stepAttachmentCount(steps: Array<{ attachments?: unknown[]; steps?: unknown[] }>): number {
  return steps.reduce(
    (total, step) =>
      total +
      (step.attachments?.length ?? 0) +
      stepAttachmentCount(
        (step.steps ?? []) as Array<{ attachments?: unknown[]; steps?: unknown[] }>
      ),
    0
  );
}
