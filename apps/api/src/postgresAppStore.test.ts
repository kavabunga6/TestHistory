import { describe, expect, it } from "vitest";
import type { TestHistoryPersistence } from "@testhistory/domain";
import { createAppStore } from "./store.js";
import { hydratePostgresAppStore } from "./postgresAppStore.js";

describe("PostgreSQL runtime projection", () => {
  it("hydrates durable repositories into the route-compatible runtime read model", async () => {
    const source = createAppStore();
    const persistence: TestHistoryPersistence = {
      repositories: source.repositories,
      health: async () => ({ driver: "postgres", writable: true, migrated: true }),
      transaction: source.transaction
    };
    await source.repositories.projects.save({
      id: "00000000-0000-4000-8000-000000000901",
      key: "PG",
      name: "PostgreSQL project",
      createdAt: "2026-08-09T00:00:00.000Z",
      updatedAt: "2026-08-09T00:00:00.000Z",
      version: 1
    });
    await source.repositories.launches.save({
      id: "launch-pg-1",
      projectId: "00000000-0000-4000-8000-000000000901",
      name: "PostgreSQL launch",
      status: "closed",
      resultCount: 0,
      createdAt: "2026-08-09T00:01:00.000Z",
      updatedAt: "2026-08-09T00:02:00.000Z",
      version: 1
    });
    await source.repositories.defectDispositions.append({
      id: "disposition-pg-1",
      projectId: "00000000-0000-4000-8000-000000000901",
      defectId: "defect:pg",
      action: "archived",
      occurrences: [{ launchId: "launch-pg-1", resultUuid: "result-pg-1" }],
      actorId: "owner",
      reason: "Test projection",
      occurredAt: "2026-08-09T00:03:00.000Z",
      createdAt: "2026-08-09T00:03:00.000Z",
      updatedAt: "2026-08-09T00:03:00.000Z",
      version: 1
    });

    const hydrated = await hydratePostgresAppStore(persistence);

    expect(hydrated.driver).toBe("postgres");
    expect(hydrated.projects.get("00000000-0000-4000-8000-000000000901")?.name).toBe(
      "PostgreSQL project"
    );
    expect(hydrated.launches.get("launch-pg-1")).toEqual(
      expect.objectContaining({ name: "PostgreSQL launch", results: [] })
    );
    expect(hydrated.defectDispositionEvents).toEqual([
      expect.objectContaining({ id: "disposition-pg-1" })
    ]);
    await expect(hydrated.health()).resolves.toEqual(
      expect.objectContaining({ driver: "postgres", writable: true })
    );
  });
});
