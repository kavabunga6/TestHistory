// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ResultAttachment } from "../m1Workspace.js";
import { AttachmentList } from "./LaunchesResultAttachments.js";

describe("result step attachments", () => {
  let root: Root | undefined;
  let container: HTMLDivElement | undefined;

  afterEach(() => {
    root?.unmount();
    container?.remove();
    root = undefined;
    container = undefined;
    vi.unstubAllGlobals();
  });

  it("loads a stored screenshot only on expansion and revokes its URL on collapse", async () => {
    let urlNumber = 0;
    const createObjectURL = vi.fn(() => `blob:screenshot-${++urlNumber}`);
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", Object.assign(class extends URL {}, { createObjectURL, revokeObjectURL }));
    const fetchMock = vi.fn(
      async () =>
        new Response(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]), {
          headers: { "content-type": "image/png" }
        })
    );
    vi.stubGlobal("fetch", fetchMock);
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    act(() => root!.render(<AttachmentList attachments={[storedImage()]} compact depth={1} />));

    const details = container.querySelector("details")!;
    expect(fetchMock).not.toHaveBeenCalled();
    await toggle(details, true);
    await act(async () => {
      await vi.waitFor(() =>
        expect(details.querySelector(".attachment-inline-preview img")?.getAttribute("src")).toBe(
          "blob:screenshot-1"
        )
      );
    });

    await toggle(details, false);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:screenshot-1");
    await toggle(details, true);
    await act(async () => {
      await vi.waitFor(() =>
        expect(details.querySelector(".attachment-inline-preview img")?.getAttribute("src")).toBe(
          "blob:screenshot-2"
        )
      );
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("keeps safe text preview available without offering a raw download", () => {
    const image = storedImage();
    const attachment: ResultAttachment = {
      ...image,
      name: "execution.log",
      mediaType: "text/plain",
      preview: {
        ...image.preview!,
        kind: "text",
        flavor: "log",
        body: { type: "metadata-only" },
        reason: "eligible"
      }
    };
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    act(() => root!.render(<AttachmentList attachments={[attachment]} compact depth={1} />));

    expect(container.querySelector("details")).toBeNull();
    expect(
      container.querySelector('button[aria-label="Открыть вложение execution.log"]')
    ).not.toBeNull();
    expect(
      container.querySelector('button[aria-label="Скачать вложение execution.log"]')
    ).toBeNull();
    expect(container.textContent).not.toContain("Просмотр недоступен");
  });
});

async function toggle(details: HTMLDetailsElement, open: boolean) {
  await act(async () => {
    details.open = open;
    details.dispatchEvent(new Event("toggle"));
  });
}

function storedImage(): ResultAttachment {
  return {
    mediaType: "image/png",
    name: "completed",
    retained: true,
    size: "374 KB",
    source: "completed.png",
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
