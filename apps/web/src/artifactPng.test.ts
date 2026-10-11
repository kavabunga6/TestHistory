import { afterEach, describe, expect, it, vi } from "vitest";

import { loadArtifactPng, maxArtifactPngBytes } from "./artifactPng.js";

vi.mock("./auth.js", () => ({ getStoredSessionToken: () => "fixture-session" }));
const png = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]);
const metadata = {
  artifactId: "a".repeat(64),
  contentType: "image/png",
  originalBytes: png.length
};
const signal = () => new AbortController().signal;
const response = (bytes = png, headers: Record<string, string> = {}) =>
  new Response(bytes, { headers: { "content-type": "image/png", ...headers } });

afterEach(() => vi.unstubAllGlobals());

describe("stored PNG content", () => {
  it("loads exact bytes with session bearer, a fixed same-origin route and no redirect", async () => {
    const fetchMock = vi.fn(async () => response());
    vi.stubGlobal("fetch", fetchMock);
    const abortSignal = signal();
    const blob = await loadArtifactPng(metadata, abortSignal);
    expect(blob.type).toBe("image/png");
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(png);
    const [url, init] = fetchMock.mock.calls[0]! as unknown as [string, RequestInit];
    expect(url).toBe(`/api/v1/artifacts/${metadata.artifactId}/content`);
    expect(init).toMatchObject({ method: "GET", redirect: "error", signal: abortSignal });
    expect(new Headers(init.headers).get("authorization")).toBe("Bearer fixture-session");
    expect(url).not.toContain("?");
  });

  it("preserves permission failure without producing an image", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{}", { status: 403 }))
    );
    await expect(loadArtifactPng(metadata, signal())).rejects.toThrow(
      "У вас нет прав для этого действия."
    );
  });

  it.each([
    { artifactId: "../escape" },
    { contentType: "image/svg+xml" },
    { originalBytes: maxArtifactPngBytes + 1 },
    { originalBytes: 7 },
    { originalBytes: Number.NaN }
  ])("rejects unsafe or oversized metadata before any request: %j", async (override) => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(loadArtifactPng({ ...metadata, ...override }, signal())).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    { "content-type": "text/html" },
    { "content-length": String(maxArtifactPngBytes + 1) },
    { "content-length": "unknown" }
  ])("rejects an invalid response before reading the body: %j", async (headers) => {
    const cancelled = vi.fn();
    const body = new ReadableStream({ cancel: cancelled });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(body, { headers }))
    );
    await expect(loadArtifactPng(metadata, signal())).rejects.toThrow("Invalid PNG response");
    expect(cancelled).toHaveBeenCalledOnce();
  });

  it.each([png.slice(0, -1), Uint8Array.from([...png, 0]), new Uint8Array(png.length)])(
    "rejects truncated, extra or non-PNG content",
    async (bytes) => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => response(bytes))
      );
      await expect(loadArtifactPng(metadata, signal())).rejects.toThrow();
    }
  );

  it("cancels a stream as soon as the actual bytes exceed the hard bound", async () => {
    const cancelled = vi.fn();
    let reads = 0;
    const body = new ReadableStream({
      pull(controller) {
        reads += 1;
        controller.enqueue(new Uint8Array(maxArtifactPngBytes + 1));
      },
      cancel: cancelled
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(body, { headers: { "content-type": "image/png" } }))
    );
    await expect(
      loadArtifactPng({ ...metadata, originalBytes: maxArtifactPngBytes }, signal())
    ).rejects.toThrow();
    expect(cancelled).toHaveBeenCalledOnce();
    expect(reads).toBeLessThanOrEqual(2);
  });

  it("aborts a pending body read and cancels the underlying stream", async () => {
    const cancelled = vi.fn();
    const body = new ReadableStream({ cancel: cancelled });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(body, { headers: { "content-type": "image/png" } }))
    );
    const controller = new AbortController();
    const loading = loadArtifactPng(metadata, controller.signal);
    await vi.waitFor(() => expect(body.locked).toBe(true));
    controller.abort();
    await expect(loading).rejects.toThrow();
    expect(cancelled).toHaveBeenCalledOnce();
    expect(body.locked).toBe(false);
  });
});
