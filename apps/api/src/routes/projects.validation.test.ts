import type { FastifyInstance } from "fastify";
import { afterEach, describe, expect, it } from "vitest";

import { createApiApp } from "../app.js";
import { createAppStore } from "../store.js";

let app: FastifyInstance | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

describe("project creation validation", () => {
  it("normalizes keys and rejects case-insensitive duplicates", async () => {
    app = await createApiApp(createAppStore());

    const created = await app.inject({
      method: "POST",
      payload: { key: "demo_project", name: " Demo project " },
      url: "/api/v1/projects"
    });
    const duplicate = await app.inject({
      method: "POST",
      payload: { key: "DEMO_PROJECT", name: "Another project" },
      url: "/api/v1/projects"
    });

    expect(created.statusCode).toBe(201);
    expect(created.json()).toEqual(
      expect.objectContaining({ key: "DEMO_PROJECT", name: "Demo project" })
    );
    expect(duplicate.statusCode).toBe(409);
    expect(duplicate.json()).toEqual(
      expect.objectContaining({
        error: "ProjectConflictError",
        field: "key",
        redacted: true
      })
    );
  });

  it("rejects empty names and unsafe project keys", async () => {
    app = await createApiApp(createAppStore());

    const emptyName = await app.inject({
      method: "POST",
      payload: { key: "EMPTY", name: "   " },
      url: "/api/v1/projects"
    });
    const unsafeKey = await app.inject({
      method: "POST",
      payload: { key: "../escape", name: "Unsafe" },
      url: "/api/v1/projects"
    });

    expect(emptyName.statusCode).toBe(400);
    expect(unsafeKey.statusCode).toBe(400);
  });
});
