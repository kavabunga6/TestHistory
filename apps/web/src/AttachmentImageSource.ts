import { useEffect, useRef, useState } from "react";

import { getBinary } from "./apiHttp.js";
import type { ResultAttachment } from "./m1Workspace.js";

const inlineImageLimit = 8 * 1024 * 1024;
const safeImageTypes = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

export function canDownloadAttachment(attachment: ResultAttachment): boolean {
  return (
    hasUsableInlineUrl(attachment) ||
    attachment.preview?.body.type === "redacted-text" ||
    (safeImageTypes.has(mediaTypeOf(attachment)) &&
      attachment.preview?.kind === "image" &&
      Boolean(attachment.preview.artifactId))
  );
}

export function canPreviewImage(attachment: ResultAttachment): boolean {
  if (!safeImageTypes.has(mediaTypeOf(attachment))) return false;
  if (hasUsableInlineUrl(attachment)) return true;
  return Boolean(
    attachment.preview?.kind === "image" &&
    attachment.preview.artifactId &&
    attachment.preview.originalBytes <= inlineImageLimit
  );
}

export function useAttachmentImageSource(attachment: ResultAttachment, enabled: boolean) {
  const artifactId = attachment.preview?.artifactId;
  const inlineUrl = hasUsableInlineUrl(attachment) ? attachment.previewUrl : undefined;
  const shouldFetch = enabled && inlineUrl === undefined && canPreviewImage(attachment);
  const request = useRef(0);
  const [remote, setRemote] = useState<{
    artifactId: string;
    request: number;
    url?: string;
    failed?: boolean;
  }>();

  useEffect(() => {
    if (!shouldFetch || artifactId === undefined) return;
    const currentRequest = ++request.current;
    const controller = new AbortController();
    let objectUrl: string | undefined;
    void getBinary(`/api/v1/artifacts/${encodeURIComponent(artifactId)}/content`, {
      signal: controller.signal
    })
      .then(async (blob) => {
        if (controller.signal.aborted) return;
        if (blob.size > inlineImageLimit || !(await isSafeRasterBlob(blob))) {
          setRemote({ artifactId, request: currentRequest, failed: true });
          return;
        }
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob);
        setRemote({ artifactId, request: currentRequest, url: objectUrl });
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setRemote({ artifactId, request: currentRequest, failed: true });
        }
      });
    return () => {
      controller.abort();
      request.current += 1;
      if (objectUrl !== undefined) URL.revokeObjectURL(objectUrl);
    };
  }, [artifactId, shouldFetch]);

  const current =
    shouldFetch &&
    remote !== undefined &&
    remote.artifactId === artifactId &&
    remote.request === request.current;

  return {
    url: inlineUrl ?? (current ? remote?.url : undefined),
    loading: shouldFetch && !current,
    failed: current && remote?.failed === true
  };
}

function mediaTypeOf(attachment: ResultAttachment): string {
  return attachment.mediaType.split(";", 1)[0]?.trim().toLowerCase() ?? "";
}

function hasUsableInlineUrl(attachment: ResultAttachment): boolean {
  const url = attachment.previewUrl;
  if (url === undefined) return false;
  if (safeImageTypes.has(mediaTypeOf(attachment))) {
    return /^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+=*$/i.test(url);
  }
  return url.startsWith("data:");
}

async function isSafeRasterBlob(blob: Blob): Promise<boolean> {
  const type = blob.type.split(";", 1)[0]?.trim().toLowerCase() ?? "";
  if (!safeImageTypes.has(type)) return false;
  const signature = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
  if (type === "image/png") {
    return [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => signature[index] === byte);
  }
  if (type === "image/jpeg") {
    return signature[0] === 255 && signature[1] === 216 && signature[2] === 255;
  }
  if (type === "image/gif") {
    return ["GIF87a", "GIF89a"].includes(String.fromCharCode(...signature.slice(0, 6)));
  }
  return (
    String.fromCharCode(...signature.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...signature.slice(8, 12)) === "WEBP"
  );
}
