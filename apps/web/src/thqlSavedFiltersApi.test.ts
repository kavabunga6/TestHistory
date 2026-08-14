import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createThqlFilterInApi,
  deleteThqlFilterFromApi,
  loadThqlFiltersFromApi
} from "./thqlSavedFiltersApi.js";

const originalFetch = globalThis.fetch;
const originalLocalStorage = globalThis.localStorage;

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalLocalStorage === undefined) {
    Reflect.deleteProperty(globalThis, "localStorage");
  } else {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: originalLocalStorage
    });
  }
  vi.restoreAllMocks();
});

describe("THQL saved filters API client", () => {
  it("loads visible filters with actor, session, project, and settings read headers", async () => {
    installMemoryLocalStorage({ "testhistory.sessionToken": "session-1" });
    const fetchMock = installFetch({
      items: [
        {
          createdAt: "2026-06-08T00:00:00.000Z",
          createdBy: "admin",
          entity: "testCases",
          id: "server-1",
          name: "Checkout",
          query: 'tag = "checkout"',
          scope: "project",
          updatedAt: "2026-06-08T00:00:00.000Z"
        }
      ],
      kind: "thql-filter-list"
    });

    const filters = await loadThqlFiltersFromApi({
      actorId: "admin",
      entity: "testCases",
      projectId: "ws"
    });

    expect(filters).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/thql/filters?entity=testCases&projectId=ws",
      expect.objectContaining({
        headers: expect.objectContaining({
          authorization: "Bearer session-1",
          "x-testhistory-actor-id": "admin",
          "x-testhistory-project-scope": "ws",
          "x-testhistory-scopes": "settings:read"
        })
      })
    );
  });

  it("creates project filters with separate name/query payload and settings write headers", async () => {
    const fetchMock = installFetch({
      filter: {
        createdAt: "2026-06-08T00:00:00.000Z",
        createdBy: "project-owner",
        entity: "launches",
        id: "server-created",
        name: "Nightly",
        projectId: "ws",
        query: 'name ~= "nightly"',
        scope: "project",
        updatedAt: "2026-06-08T00:00:00.000Z"
      },
      kind: "thql-filter-created"
    });

    const filter = await createThqlFilterInApi({
      actorId: "project-owner",
      entity: "launches",
      name: "Nightly",
      projectId: "ws",
      query: 'name ~= "nightly"',
      scope: "project"
    });

    expect(filter.id).toBe("server-created");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/thql/filters",
      expect.objectContaining({
        body: JSON.stringify({
          entity: "launches",
          name: "Nightly",
          projectId: "ws",
          query: 'name ~= "nightly"',
          scope: "project"
        }),
        headers: expect.objectContaining({
          "content-type": "application/json",
          "x-testhistory-actor-id": "project-owner",
          "x-testhistory-project-scope": "ws",
          "x-testhistory-scopes": "settings:write"
        }),
        method: "POST"
      })
    );
  });

  it("deletes filters through encoded filter ids", async () => {
    const fetchMock = installFetch({ filterId: "filter/1", kind: "thql-filter-deleted" });

    await deleteThqlFilterFromApi({
      actorId: "admin",
      filter: {
        entity: "testCases",
        id: "filter/1",
        name: "Saved",
        query: "muted = false",
        scope: "personal"
      },
      projectId: "ws"
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/thql/filters/filter%2F1",
      expect.objectContaining({
        headers: expect.objectContaining({
          "x-testhistory-actor-id": "admin"
        }),
        method: "DELETE"
      })
    );
  });
});

function installFetch(payload: unknown) {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify(payload), { status: 200 }));
  globalThis.fetch = fetchMock;
  return fetchMock;
}

function installMemoryLocalStorage(values: Record<string, string>) {
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => values[key] ?? null,
      setItem: (key: string, value: string) => {
        values[key] = value;
      }
    }
  });
}
