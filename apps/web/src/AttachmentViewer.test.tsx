// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  AttachmentDownloadButton,
  AttachmentPreview,
  AttachmentViewerButton
} from "./AttachmentViewer.js";
import type { ResultAttachment } from "./m1Workspace.js";

describe("AttachmentViewer", () => {
  let root: Root | undefined;
  let container: HTMLDivElement | undefined;

  afterEach(() => {
    root?.unmount();
    container?.remove();
    root = undefined;
    container = undefined;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("loads a stored PNG only after opening the viewer and releases its object URL", async () => {
    const createObjectURL = vi.fn(() => "blob:stored-screenshot");
    const revokeObjectURL = vi.fn();
    stubObjectUrls(createObjectURL, revokeObjectURL);
    const fetchMock = vi.fn(
      async () =>
        new Response(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]), {
          headers: { "content-type": "image/png" }
        })
    );
    vi.stubGlobal("fetch", fetchMock);
    renderViewerButton(storedImage());

    expect(fetchMock).not.toHaveBeenCalled();
    await openAttachment();
    await act(async () => {
      await vi.waitFor(() =>
        expect(document.querySelector('[role="dialog"] img')?.getAttribute("src")).toBe(
          "blob:stored-screenshot"
        )
      );
    });

    expect(fetchMock).toHaveBeenCalledWith("/api/v1/artifacts/stored-screenshot/content", {
      headers: expect.any(Headers),
      signal: expect.any(AbortSignal)
    });
    await act(async () =>
      document.querySelector<HTMLButtonElement>('[aria-label="Закрыть просмотр вложения"]')?.click()
    );
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:stored-screenshot");
  });

  it("rejects a stored image when the response is not a raster image", async () => {
    const createObjectURL = vi.fn(() => "blob:unsafe");
    stubObjectUrls(createObjectURL, vi.fn());
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response("<svg xmlns='http://www.w3.org/2000/svg'></svg>", {
            headers: { "content-type": "image/svg+xml" }
          })
      )
    );
    renderViewerButton(storedImage());
    await openAttachment();
    await act(async () => {
      await vi.waitFor(() =>
        expect(document.querySelector('[role="dialog"]')?.textContent).toContain(
          "Предпросмотр изображения недоступен"
        )
      );
    });
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(document.querySelector('[role="dialog"] img')).toBeNull();
  });

  it("downloads only redacted text even when an inline data URL is present", async () => {
    const createObjectURL = vi.fn((_blob: Blob) => "blob:redacted");
    stubObjectUrls(createObjectURL, vi.fn());
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    const attachment: ResultAttachment = {
      ...storedImage(),
      mediaType: "text/plain",
      name: "secret.log",
      previewUrl: "data:text/plain;base64,c2VjcmV0",
      preview: {
        ...storedImage().preview!,
        kind: "text",
        body: {
          type: "redacted-text",
          value: "[REDACTED]",
          encoding: "utf8",
          lineCount: 1,
          redacted: true,
          truncated: false
        }
      }
    };
    act(() => root!.render(<AttachmentDownloadButton attachment={attachment} />));
    await act(async () => container!.querySelector("button")!.click());

    expect(await createObjectURL.mock.calls[0]![0].text()).toBe("[REDACTED]");
  });

  it("opens image attachments in a modal preview", async () => {
    renderViewerButton({
      mediaType: "image/png",
      name: "Финальный скриншот",
      previewUrl: "data:image/png;base64,iVBORw0KGgo="
    });

    await openAttachment();

    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog?.textContent).toContain("Финальный скриншот");
    expect(dialog?.querySelector("img")?.getAttribute("src")).toContain("data:image/png");
  });

  it("keeps the attachment dialog above the result layout and restores focus on close", async () => {
    renderViewerButton({
      mediaType: "image/png",
      name: "Скриншот",
      previewUrl: "data:image/png;base64,iVBORw0KGgo="
    });
    const opener = container!.querySelector<HTMLButtonElement>("button")!;
    opener.focus();

    await openAttachment();

    const overlay = document.querySelector<HTMLElement>(".attachment-viewer");
    const dialog = overlay?.querySelector<HTMLElement>('[role="dialog"]');
    expect(overlay?.parentElement).toBe(document.body);
    expect(container!.contains(overlay)).toBe(false);
    expect(document.activeElement).toBe(dialog);

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Escape" }));
    });

    expect(document.querySelector(".attachment-viewer")).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it("opens video attachments in a modal player", async () => {
    renderViewerButton({
      mediaType: "video/mp4",
      name: "Видео теста",
      previewUrl: "data:video/mp4;base64,AAAA"
    });

    await openAttachment();

    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog?.textContent).toContain("Видео теста");
    expect(dialog?.querySelector("video")?.getAttribute("src")).toContain("data:video/mp4");
  });

  it("opens redacted text attachments in a modal text viewer", async () => {
    renderViewerButton({
      mediaType: "text/plain",
      name: "Logcat",
      preview: {
        id: "logcat-preview",
        artifactId: "logcat",
        body: {
          encoding: "utf8",
          lineCount: 2,
          redacted: false,
          truncated: false,
          type: "redacted-text",
          value: "Activity started\nAssertion passed"
        },
        contentType: "text/plain",
        flavor: "log",
        kind: "text",
        maxPreviewBytes: 8192,
        originalBytes: 128,
        previewBytes: 33,
        reason: "eligible",
        safety: {
          blobIncluded: false,
          bounded: true,
          descriptorVersion: 1,
          pathIncluded: false,
          rawPayloadIncluded: false,
          redactionApplied: false,
          signedUrlIncluded: false,
          storageKeyIncluded: false
        },
        sha256: "abc",
        status: "ready",
        support: "inline"
      }
    });

    await openAttachment();

    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog?.textContent).toContain("Logcat");
    expect(dialog?.querySelector("pre")?.textContent).toContain("Activity started");
  });

  it("labels truncated JSON previews and renders their content as inert text", async () => {
    renderViewerButton({
      mediaType: "application/json",
      name: "Payload",
      preview: {
        id: "payload-preview",
        artifactId: "payload",
        body: {
          encoding: "utf8",
          lineCount: 1,
          redacted: true,
          truncated: true,
          type: "redacted-text",
          value: '{"value":"<script>unsafe()</script>"}'
        },
        contentType: "application/json",
        flavor: "json",
        kind: "json",
        maxPreviewBytes: 16384,
        originalBytes: 32768,
        previewBytes: 16384,
        reason: "too-large",
        safety: {
          blobIncluded: false,
          bounded: true,
          descriptorVersion: 1,
          pathIncluded: false,
          rawPayloadIncluded: false,
          redactionApplied: true,
          signedUrlIncluded: false,
          storageKeyIncluded: false
        },
        sha256: "json-sha",
        status: "ready",
        support: "inline"
      }
    });

    await openAttachment();

    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog?.textContent).toContain("JSON");
    expect(dialog?.textContent).toContain("Секреты скрыты");
    expect(dialog?.textContent).toContain("Показаны первые 16 КБ");
    expect(dialog?.querySelector("script")).toBeNull();
    expect(dialog?.querySelector("pre")?.textContent).toContain("<script>unsafe()</script>");
  });

  it("loads a bounded text preview only after the dialog is opened", async () => {
    const preview = {
      id: "remote-preview",
      artifactId: "stored-log",
      body: { type: "metadata-only" as const },
      contentType: "text/plain",
      flavor: "log" as const,
      kind: "text" as const,
      maxPreviewBytes: 3 * 1024 * 1024,
      originalBytes: 359 * 1024,
      previewBytes: 0,
      reason: "content-unavailable" as const,
      safety: {
        blobIncluded: false as const,
        bounded: true as const,
        descriptorVersion: 1 as const,
        pathIncluded: false as const,
        rawPayloadIncluded: false as const,
        redactionApplied: false,
        signedUrlIncluded: false as const,
        storageKeyIncluded: false as const
      },
      sha256: "remote-sha",
      status: "metadata-only" as const,
      support: "metadata-only" as const
    };
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            ...preview,
            body: {
              encoding: "utf8",
              lineCount: 2,
              redacted: false,
              truncated: true,
              type: "redacted-text",
              value: "remote line one\nremote line two"
            },
            previewBytes: 31,
            reason: "too-large",
            status: "ready",
            support: "inline"
          }),
          { headers: { "content-type": "application/json" }, status: 200 }
        )
    );
    vi.stubGlobal("fetch", fetchMock);
    renderViewerButton({ mediaType: "text/plain", name: "Remote log", preview });

    expect(fetchMock).not.toHaveBeenCalled();
    await openAttachment();
    await act(async () => Promise.resolve());

    expect(fetchMock).toHaveBeenCalledWith("/api/v1/artifacts/stored-log/preview", {
      headers: expect.any(Headers),
      signal: expect.any(AbortSignal)
    });
    expect(document.querySelector("pre")?.textContent).toContain("remote line one");
  });

  it("does not request oversized text and explains that it is download-only", async () => {
    const preview = {
      id: "oversized-preview",
      artifactId: "oversized-log",
      body: { type: "metadata-only" as const },
      contentType: "text/plain",
      flavor: "log" as const,
      kind: "text" as const,
      maxPreviewBytes: 3 * 1024 * 1024,
      originalBytes: 3 * 1024 * 1024 + 1,
      previewBytes: 0,
      reason: "too-large" as const,
      safety: {
        blobIncluded: false as const,
        bounded: true as const,
        descriptorVersion: 1 as const,
        pathIncluded: false as const,
        rawPayloadIncluded: false as const,
        redactionApplied: false,
        signedUrlIncluded: false as const,
        storageKeyIncluded: false as const
      },
      sha256: "oversized-sha",
      status: "metadata-only" as const,
      support: "metadata-only" as const
    };
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    renderViewerButton({ mediaType: "text/plain", name: "Oversized log", preview });

    await openAttachment();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain(
      "\u0424\u0430\u0439\u043b \u0441\u043b\u0438\u0448\u043a\u043e\u043c \u0431\u043e\u043b\u044c\u0448\u043e\u0439 \u0434\u043b\u044f \u043f\u0440\u043e\u0441\u043c\u043e\u0442\u0440\u0430 \u0432 \u0431\u0440\u0430\u0443\u0437\u0435\u0440\u0435"
    );
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain("3 \u041c\u0411");
  });

  it("opens the full image viewer when inline preview is clicked", async () => {
    renderInlinePreview({
      mediaType: "image/png",
      name: "Финальный скриншот",
      previewUrl: "data:image/png;base64,iVBORw0KGgo="
    });

    const preview = document.querySelector<HTMLButtonElement>(
      '[aria-label="Открыть предпросмотр вложения Финальный скриншот"]'
    );
    expect(preview).not.toBeNull();
    expect(preview?.querySelector("img")?.getAttribute("src")).toContain("data:image/png");

    await act(async () => {
      preview!.click();
    });

    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog?.querySelector("img")?.getAttribute("src")).toContain("data:image/png");
  });

  function renderViewerButton(overrides: Partial<ResultAttachment>) {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    const attachment: ResultAttachment = {
      mediaType: "application/octet-stream",
      name: "Вложение",
      retained: true,
      size: "12 KB",
      source: "attachment.bin",
      ...overrides
    };

    act(() => {
      root!.render(React.createElement(AttachmentViewerButton, { attachment }));
    });
  }

  function renderInlinePreview(overrides: Partial<ResultAttachment>) {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    const attachment: ResultAttachment = {
      mediaType: "application/octet-stream",
      name: "Вложение",
      retained: true,
      size: "12 KB",
      source: "attachment.bin",
      ...overrides
    };

    act(() => {
      root!.render(React.createElement(AttachmentPreview, { attachment }));
    });
  }
});

async function openAttachment() {
  const button = document.querySelector<HTMLButtonElement>("button");
  expect(button).not.toBeNull();

  await act(async () => {
    button!.click();
  });
}

function storedImage(): ResultAttachment {
  return {
    mediaType: "image/png",
    name: "Screenshot",
    retained: true,
    size: "374 KB",
    source: "screenshot.png",
    preview: {
      id: "preview-screenshot",
      artifactId: "stored-screenshot",
      body: {
        type: "image-metadata",
        mediaType: "image/png",
        inline: false,
        downloadRequired: true
      },
      contentType: "image/png",
      flavor: "image",
      kind: "image",
      maxPreviewBytes: 3 * 1024 * 1024,
      originalBytes: 374 * 1024,
      previewBytes: 0,
      reason: "image-metadata-only",
      safety: {
        blobIncluded: false,
        bounded: true,
        descriptorVersion: 1,
        pathIncluded: false,
        rawPayloadIncluded: false,
        redactionApplied: false,
        signedUrlIncluded: false,
        storageKeyIncluded: false
      },
      sha256: "image-sha",
      status: "metadata-only",
      support: "metadata-only"
    }
  };
}

function stubObjectUrls(
  createObjectURL: ReturnType<typeof vi.fn>,
  revokeObjectURL: ReturnType<typeof vi.fn>
) {
  vi.stubGlobal("URL", Object.assign(class extends URL {}, { createObjectURL, revokeObjectURL }));
}
