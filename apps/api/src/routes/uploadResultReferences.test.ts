import type { FastifyInstance } from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import { createApiApp } from "../app.js";
import { createLaunch } from "../appTestHelpers.js";
import { createAppStore } from "../store.js";

let app: FastifyInstance | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

describe("upload result references", () => {
  it("returns addressable result IDs for every imported and duplicate JSON result", async () => {
    app = await createApiApp();
    const launch = await createLaunch(app);
    const files = ["alpha", "beta"].map((id) => ({
      path: `${id}-result.json`,
      content: JSON.stringify({ uuid: id, name: id, status: "passed" })
    }));

    const first = await app.inject({
      method: "POST",
      url: `/api/v1/launches/${launch.id}/results/json`,
      payload: { files }
    });
    expect(first.statusCode).toBe(200);
    const results = first.json<{
      results: Array<{ path: string; resultId: string; resultUrl: string; status: string }>;
      imported: Array<{ uuid: string }>;
    }>();
    expect(results.imported.map((item) => item.uuid)).toEqual(["alpha", "beta"]);
    expect(results.results).toEqual([
      {
        path: "alpha-result.json",
        resultId: "alpha",
        resultUrl: `/api/v1/launches/${launch.id}/results/alpha`,
        status: "imported"
      },
      {
        path: "beta-result.json",
        resultId: "beta",
        resultUrl: `/api/v1/launches/${launch.id}/results/beta`,
        status: "imported"
      }
    ]);

    for (const result of results.results) {
      const details = await app.inject({ method: "GET", url: result.resultUrl });
      expect(details.statusCode).toBe(200);
      expect(details.json()).toEqual(expect.objectContaining({ uuid: result.resultId }));
    }

    const repeated = await app.inject({
      method: "POST",
      url: `/api/v1/launches/${launch.id}/results/json`,
      payload: { files: [files[0]] }
    });
    expect(repeated.statusCode).toBe(200);
    expect(repeated.json()).toEqual(
      expect.objectContaining({
        imported: [],
        results: [{ ...results.results[0], status: "duplicate" }]
      })
    );

    const renamedSource = await app.inject({
      method: "POST",
      url: `/api/v1/launches/${launch.id}/results/json`,
      payload: {
        files: [
          {
            path: "another-path-result.json",
            content: JSON.stringify({ uuid: "alpha", name: "Different content", status: "failed" })
          }
        ]
      }
    });
    expect(renamedSource.statusCode).toBe(200);
    expect(renamedSource.json()).toEqual(
      expect.objectContaining({
        imported: [],
        results: [
          {
            path: "another-path-result.json",
            resultId: "alpha",
            resultUrl: `/api/v1/launches/${launch.id}/results/alpha`,
            status: "duplicate"
          }
        ]
      })
    );
    const existing = await app.inject({
      method: "GET",
      url: `/api/v1/launches/${launch.id}/results/alpha`
    });
    expect(existing.json()).toEqual(expect.objectContaining({ name: "alpha", status: "passed" }));
  });

  it("returns upload ID first and result ID after processing a chunked upload", async () => {
    const store = createAppStore();
    app = await createApiApp(store);
    const launch = await createLaunch(app);
    const content = JSON.stringify({ uuid: "chunked-id", name: "Chunked", status: "passed" });
    const created = await app.inject({
      method: "POST",
      url: `/api/v1/launches/${launch.id}/uploads/chunked`,
      payload: {
        path: "chunked-result.json",
        totalChunks: 1,
        totalBytes: Buffer.byteLength(content)
      }
    });
    expect(created.statusCode).toBe(201);
    const uploadId = created.json<{ id: string }>().id;
    const chunk = await app.inject({
      method: "PUT",
      url: `/api/v1/uploads/${uploadId}/chunks/0`,
      payload: { content }
    });
    expect(chunk.statusCode).toBe(200);

    const completed = await app.inject({
      method: "POST",
      url: `/api/v1/uploads/${uploadId}/complete`
    });
    expect(completed.statusCode).toBe(202);
    const job = completed.json<{ job: { id: string; results: unknown[] } }>().job;
    expect(job.id).toEqual(expect.any(String));
    expect(job.results).toEqual([]);

    const processed = await app.inject({
      method: "POST",
      url: `/api/v1/uploads/${job.id}/process`
    });
    expect(processed.statusCode).toBe(200);
    const reference = {
      path: "chunked-result.json",
      resultId: "chunked-id",
      resultUrl: `/api/v1/launches/${launch.id}/results/chunked-id`,
      status: "imported"
    };
    expect(processed.json()).toEqual(expect.objectContaining({ results: [reference] }));

    const status = await app.inject({ method: "GET", url: `/api/v1/uploads/${job.id}/status` });
    expect(status.statusCode).toBe(200);
    expect(status.json()).toEqual(
      expect.objectContaining({
        results: [reference],
        job: expect.objectContaining({ results: [reference] })
      })
    );
    const otherProjectStatus = await app.inject({
      method: "GET",
      url: `/api/v1/uploads/${job.id}/status`,
      headers: {
        "x-testhistory-actor-id": "admin",
        "x-testhistory-project-scope": "other-project",
        "x-testhistory-scopes": "uploads:read,launches:read"
      }
    });
    expect(otherProjectStatus.statusCode).toBe(403);
    const otherProjectJob = await app.inject({
      method: "GET",
      url: `/api/v1/uploads/${job.id}`,
      headers: {
        "x-testhistory-actor-id": "admin",
        "x-testhistory-project-scope": "other-project",
        "x-testhistory-scopes": "uploads:read,launches:read"
      }
    });
    expect(otherProjectJob.statusCode).toBe(403);
    expect(otherProjectJob.body).not.toContain("chunked-id");
    const otherProjectResult = await app.inject({
      method: "GET",
      url: reference.resultUrl,
      headers: {
        "x-testhistory-actor-id": "admin",
        "x-testhistory-project-scope": "other-project",
        "x-testhistory-scopes": "launches:read"
      }
    });
    expect(otherProjectResult.statusCode).toBe(403);
    expect(otherProjectResult.body).not.toContain("chunked-id");
    store.uploadJobs.get(job.id)!.lease = {
      claimedBy: "worker",
      claimedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      claimToken: "private-lease-secret"
    };
    const ownJob = await app.inject({ method: "GET", url: `/api/v1/uploads/${job.id}` });
    expect(ownJob.statusCode).toBe(200);
    expect(ownJob.json()).toEqual(expect.objectContaining({ results: [reference] }));
    expect(ownJob.body).not.toContain("private-lease-secret");
    delete store.uploadJobs.get(job.id)!.lease;
    expect(await store.repositories.uploadJobs.findById(job.id)).toEqual(
      expect.objectContaining({ results: [reference] })
    );

    const repeated = await app.inject({
      method: "POST",
      url: `/api/v1/uploads/${job.id}/process`
    });
    expect(repeated.statusCode).toBe(200);
    expect(repeated.json()).toEqual(
      expect.objectContaining({ idempotent: true, results: [reference] })
    );
  });

  it("returns result references from an allurectl-compatible one-shot upload", async () => {
    app = await createApiApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/rs/import/42",
      payload: {
        launchName: "Compatibility import",
        files: [
          {
            path: "compat-result.json",
            content: JSON.stringify({ uuid: "compat-id", name: "Compatibility", status: "passed" })
          }
        ]
      }
    });
    expect(response.statusCode).toBe(200);
    const body = response.json<{
      launch: { launchId: string };
      results: Array<{ resultId: string; resultUrl: string; status: string }>;
    }>();
    expect(body.results).toEqual([
      expect.objectContaining({
        resultId: "compat-id",
        resultUrl: `/api/v1/launches/${body.launch.launchId}/results/compat-id`,
        status: "imported"
      })
    ]);
  });
});
