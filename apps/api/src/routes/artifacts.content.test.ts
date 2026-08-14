import { prepareArtifact } from "@testhistory/artifacts";
import type { FastifyInstance } from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createApiApp } from "../app.js";
import { createLaunch } from "../appTestHelpers.js";
import { createAppStore } from "../store.js";
import { maxBrowserTextPreviewBytes } from "./uploadAttachmentPreviews.js";

let app: FastifyInstance | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
  vi.unstubAllEnvs();
});

describe("artifact content", () => {
  it("serves stored bytes only to an authorized project reader", async () => {
    const store = createAppStore();
    app = await createApiApp(store);
    const launch = await createLaunch(app);
    const prepared = prepareArtifact({
      content: "stored evidence",
      contentType: "text/plain",
      launchId: launch.id,
      path: "evidence.txt",
      projectId: launch.projectId
    });
    const { payload, ...descriptor } = prepared;
    store.artifacts.set(descriptor.id, descriptor);
    await store.artifactObjects.putObject({
      body: payload,
      compression: descriptor.compression,
      ...(descriptor.contentType !== undefined ? { contentType: descriptor.contentType } : {}),
      key: descriptor.storageKey,
      originalBytes: descriptor.originalBytes,
      sha256: descriptor.sha256,
      storedBytes: descriptor.storedBytes
    });
    vi.stubEnv("TESTHISTORY_REQUIRE_PROJECT_AUTH", "true");

    const denied = await app.inject({
      method: "GET",
      url: `/api/v1/artifacts/${descriptor.id}/content`
    });
    const allowed = await app.inject({
      method: "GET",
      url: `/api/v1/artifacts/${descriptor.id}/content`,
      headers: {
        "x-testhistory-actor-id": "project-owner",
        "x-testhistory-project-scope": launch.projectId,
        "x-testhistory-scopes": "artifacts:read"
      }
    });

    expect(denied.statusCode).toBe(403);
    expect(allowed.statusCode).toBe(200);
    expect(allowed.body).toBe("stored evidence");
    expect(allowed.headers["cache-control"]).toBe("private, no-store");
    expect(allowed.headers["content-type"]).toContain("text/plain");
    expect(allowed.headers["x-content-type-options"]).toBe("nosniff");
  });

  it("does not leak storage keys when physical content is missing", async () => {
    const store = createAppStore();
    app = await createApiApp(store);
    const launch = await createLaunch(app);
    const prepared = prepareArtifact({
      content: "missing evidence",
      launchId: launch.id,
      path: "missing.log",
      projectId: launch.projectId
    });
    const { payload: _payload, ...descriptor } = prepared;
    store.artifacts.set(descriptor.id, descriptor);

    const response = await app.inject({
      method: "GET",
      url: `/api/v1/artifacts/${descriptor.id}/content`
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ message: "Artifact content not found", redacted: true });
    expect(response.body).not.toContain(descriptor.storageKey);
  });

  it("returns a complete redacted text preview within the browser limit", async () => {
    const store = createAppStore();
    app = await createApiApp(store);
    const launch = await createLaunch(app);
    const prepared = prepareArtifact({
      content: `token=do-not-expose\n${"x".repeat(32 * 1024)}`,
      contentType: "text/plain",
      launchId: launch.id,
      path: "large.log",
      projectId: launch.projectId
    });
    const { payload, ...descriptor } = prepared;
    store.artifacts.set(descriptor.id, descriptor);
    await store.artifactObjects.putObject({
      body: payload,
      compression: descriptor.compression,
      ...(descriptor.contentType !== undefined ? { contentType: descriptor.contentType } : {}),
      key: descriptor.storageKey,
      originalBytes: descriptor.originalBytes,
      sha256: descriptor.sha256,
      storedBytes: descriptor.storedBytes
    });

    const response = await app.inject({
      method: "GET",
      url: `/api/v1/artifacts/${descriptor.id}/preview`
    });
    const preview = response.json<{
      previewBytes: number;
      body: { type: string; value: string; redacted: boolean; truncated: boolean };
    }>();

    expect(response.statusCode).toBe(200);
    expect(preview.previewBytes).toBeLessThanOrEqual(maxBrowserTextPreviewBytes);
    expect(preview.body).toMatchObject({
      redacted: true,
      truncated: false,
      type: "redacted-text"
    });
    expect(preview.body.value).not.toContain("do-not-expose");
    expect(response.headers["cache-control"]).toBe("private, no-store");
    expect(response.headers["content-security-policy"]).toContain("default-src 'none'");
  });

  it("rejects oversized previews before reading artifact storage", async () => {
    const store = createAppStore();
    app = await createApiApp(store);
    const launch = await createLaunch(app);
    const prepared = prepareArtifact({
      content: Buffer.alloc(maxBrowserTextPreviewBytes + 1, "x"),
      contentType: "text/plain",
      launchId: launch.id,
      path: "oversized.log",
      projectId: launch.projectId
    });
    const { payload: _payload, ...descriptor } = prepared;
    store.artifacts.set(descriptor.id, descriptor);

    const response = await app.inject({
      method: "GET",
      url: `/api/v1/artifacts/${descriptor.id}/preview`
    });

    expect(response.statusCode).toBe(413);
    expect(response.json()).toEqual({
      code: "ARTIFACT_PREVIEW_TOO_LARGE",
      maxPreviewBytes: maxBrowserTextPreviewBytes,
      message: "Artifact is too large for browser preview",
      redacted: true
    });
  });

  it("rejects executable text previews", async () => {
    const store = createAppStore();
    app = await createApiApp(store);
    const launch = await createLaunch(app);
    const prepared = prepareArtifact({
      content: "<script>alert(1)</script>",
      contentType: "text/html",
      launchId: launch.id,
      path: "report.html",
      projectId: launch.projectId
    });
    const { payload, ...descriptor } = prepared;
    store.artifacts.set(descriptor.id, descriptor);
    await store.artifactObjects.putObject({
      body: payload,
      compression: descriptor.compression,
      ...(descriptor.contentType !== undefined ? { contentType: descriptor.contentType } : {}),
      key: descriptor.storageKey,
      originalBytes: descriptor.originalBytes,
      sha256: descriptor.sha256,
      storedBytes: descriptor.storedBytes
    });

    const response = await app.inject({
      method: "GET",
      url: `/api/v1/artifacts/${descriptor.id}/preview`
    });

    expect(response.statusCode).toBe(415);
    expect(response.body).not.toContain("script");
  });
});
