import { afterEach, describe, expect, it, vi } from "vitest";

import { deprecateTestCaseFromApi } from "./workspaceMutations.js";

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

describe("workspace mutations", () => {
  it("persists test-case deprecation through the authenticated API", async () => {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => (key === "testhistory.sessionToken" ? "session-1" : null)
      }
    });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "case/one",
          updatedAt: "2026-08-08T10:00:00.000Z",
          workflowStatus: "deprecated"
        }),
        { headers: { "content-type": "application/json" }, status: 200 }
      )
    );
    globalThis.fetch = fetchMock;

    await deprecateTestCaseFromApi("case/one");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/test-cases/case%2Fone",
      expect.objectContaining({
        body: JSON.stringify({ workflowStatus: "deprecated" }),
        method: "PATCH"
      })
    );
    const headers = new Headers(fetchMock.mock.calls[0]?.[1]?.headers);
    expect(headers.get("authorization")).toBe("Bearer session-1");
    expect(headers.get("content-type")).toBe("application/json");
  });
});
