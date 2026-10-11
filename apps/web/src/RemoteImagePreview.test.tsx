// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AttachmentViewerButton } from "./AttachmentViewer.js";
import { RemoteImagePreview } from "./RemoteImagePreview.js";
import type { ResultAttachment } from "./m1Workspace.js";

const png = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]);
const preview: NonNullable<ResultAttachment["preview"]> = {
  artifactId: "a".repeat(64),
  id: "stored-preview",
  contentType: "image/png",
  originalBytes: png.length,
  body: { type: "metadata-only" },
  kind: "image",
  flavor: "image",
  maxPreviewBytes: 3 * 1024 * 1024,
  previewBytes: 0,
  sha256: "b".repeat(64),
  status: "metadata-only",
  support: "metadata-only",
  reason: "content-unavailable",
  safety: {
    blobIncluded: false,
    bounded: true,
    descriptorVersion: 1,
    pathIncluded: false,
    rawPayloadIncluded: false,
    redactionApplied: false,
    signedUrlIncluded: false,
    storageKeyIncluded: false
  }
};
const attachment: ResultAttachment = {
  name: "Скриншот",
  mediaType: "image/png",
  retained: true,
  size: "12 Б",
  source: "screen.png",
  preview
};
let root: Root;
let container: HTMLDivElement;
let createUrl = vi.fn((_blob: Blob | MediaSource) => "blob:fixture-image");
let revokeUrl = vi.fn((_url: string) => undefined);

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  createUrl = vi.fn((_blob: Blob | MediaSource) => "blob:fixture-image");
  revokeUrl = vi.fn((_url: string) => undefined);
  vi.stubGlobal(
    "URL",
    class extends URL {
      static createObjectURL = createUrl;
      static revokeObjectURL = revokeUrl;
    }
  );
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const tick = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
const render = (value = preview) =>
  act(() => root.render(<RemoteImagePreview name="Скриншот" preview={value} />));

describe("production PNG viewer", () => {
  it("requests content only when opened and revokes its Blob on close", async () => {
    const fetchMock = vi.fn(
      async () => new Response(png, { headers: { "content-type": "image/png" } })
    );
    vi.stubGlobal("fetch", fetchMock);
    act(() => root.render(<AttachmentViewerButton attachment={attachment} />));
    expect(fetchMock).not.toHaveBeenCalled();
    await act(async () => container.querySelector<HTMLButtonElement>("button")!.click());
    await tick();
    expect(document.querySelector(".attachment-viewer img")?.getAttribute("src")).toBe(
      "blob:fixture-image"
    );
    expect(createUrl).toHaveBeenCalledOnce();
    const blob = createUrl.mock.calls[0]![0] as Blob;
    expect(blob.size).toBe(png.length);
    await act(async () =>
      document.querySelector<HTMLButtonElement>('[aria-label="Закрыть просмотр вложения"]')!.click()
    );
    expect(revokeUrl).toHaveBeenCalledExactlyOnceWith("blob:fixture-image");
  });

  it("aborts loading on unmount and never publishes a late image", async () => {
    let resolveResponse!: (response: Response) => void;
    const fetchMock = vi.fn(
      (_url: string, _init: RequestInit) =>
        new Promise<Response>((resolve) => {
          resolveResponse = resolve;
        })
    );
    vi.stubGlobal("fetch", fetchMock);
    render();
    expect(container.querySelector('[role="status"]')?.textContent).toContain(
      "Загружаем изображение"
    );
    act(() => root.render(null));
    expect(fetchMock.mock.calls[0]![1].signal?.aborted).toBe(true);
    await act(async () =>
      resolveResponse(new Response(png, { headers: { "content-type": "image/png" } }))
    );
    expect(createUrl).not.toHaveBeenCalled();
  });

  it("revokes the old image and aborts its request when the attachment changes", async () => {
    const fetchMock = vi.fn(
      async () => new Response(png, { headers: { "content-type": "image/png" } })
    );
    vi.stubGlobal("fetch", fetchMock);
    render();
    await tick();
    render({ ...preview, artifactId: "c".repeat(64) });
    await tick();
    expect(revokeUrl).toHaveBeenCalledExactlyOnceWith("blob:fixture-image");
    const init = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(init[1].signal?.aborted).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("shows a safe permission error without response details or an image", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response('{"private":"sentinel"}', { status: 403 }))
    );
    render();
    await tick();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      "Не удалось загрузить изображение"
    );
    expect(container.textContent).not.toContain("sentinel");
    expect(container.querySelector("img")).toBeNull();
  });

  it("ends a stalled load with an error and aborts after the bounded timeout", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError"))
          );
        })
    );
    vi.stubGlobal("fetch", fetchMock);
    render();
    await act(async () => vi.advanceTimersByTimeAsync(15_000));
    expect(fetchMock.mock.calls[0]![1].signal?.aborted).toBe(true);
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
  });

  it("shows an error if the browser cannot decode the PNG, then releases its URL", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(png, { headers: { "content-type": "image/png" } }))
    );
    render();
    await tick();
    act(() => container.querySelector("img")!.dispatchEvent(new Event("error")));
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    act(() => root.render(null));
    expect(revokeUrl).toHaveBeenCalledExactlyOnceWith("blob:fixture-image");
  });
});
