import { afterEach, describe, expect, it, vi } from "vitest";

import { getBinary, getJson } from "./apiHttp.js";

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

describe("getJson", () => {
  it("uses the stored session for ordinary API reads", async () => {
    installSessionToken("session-1");
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
    globalThis.fetch = fetchMock;

    await getJson("/api/v1/projects");

    const headers = new Headers(fetchMock.mock.calls[0]?.[1]?.headers);
    expect(headers.get("authorization")).toBe("Bearer session-1");
  });

  it("keeps explicit trusted actor reads separate from the user session", async () => {
    installSessionToken("session-1");
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
    globalThis.fetch = fetchMock;

    await getJson("/api/v1/diagnostics", {
      headers: {
        "x-testhistory-actor-id": "diagnostics-ui",
        "x-testhistory-project-scope": "project-1",
        "x-testhistory-scopes": "uploads:read"
      }
    });

    const headers = new Headers(fetchMock.mock.calls[0]?.[1]?.headers);
    expect(headers.get("authorization")).toBeNull();
    expect(headers.get("x-testhistory-actor-id")).toBe("diagnostics-ui");
  });
});

describe("getBinary", () => {
  it("retrieves image bytes with the same session as JSON requests", async () => {
    installSessionToken("session-1");
    const imageBytes = new Uint8Array([137, 80, 78, 71]);
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(imageBytes, {
        headers: { "content-type": "image/png" },
        status: 200
      })
    );
    globalThis.fetch = fetchMock;

    const image = await getBinary("/api/v1/artifacts/image-1/content");

    expect(Array.from(new Uint8Array(await image.arrayBuffer()))).toEqual(Array.from(imageBytes));
    expect(new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get("authorization")).toBe(
      "Bearer session-1"
    );
  });

  it("does not expose an API path or status in a binary request error", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 404 }));
    globalThis.fetch = fetchMock;

    await expect(getBinary("/api/v1/artifacts/secret/content")).rejects.toThrow(
      "Данные не найдены. Обновите страницу и попробуйте ещё раз."
    );
  });
});

function installSessionToken(token: string) {
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => (key === "testhistory.sessionToken" ? token : null)
    }
  });
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status: 200
  });
}
