import type { ResultAttachment } from "../m1Workspace.js";

export function downloadAttachment(attachment: ResultAttachment) {
  const body = getAttachmentDownloadBody(attachment);
  const blob = new Blob([body], { type: attachment.mediaType || "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = attachment.name || "attachment.bin";
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function getAttachmentDownloadBody(attachment: ResultAttachment): BlobPart {
  if (attachment.previewUrl?.startsWith("data:") === true) {
    return dataUrlToBytes(attachment.previewUrl);
  }

  if (attachment.preview?.body.type === "redacted-text") {
    return attachment.preview.body.value;
  }

  return JSON.stringify(
    {
      mediaType: attachment.mediaType,
      name: attachment.name,
      retained: attachment.retained,
      sha256: attachment.preview?.sha256,
      size: attachment.size,
      source: attachment.source
    },
    null,
    2
  );
}

function dataUrlToBytes(dataUrl: string): ArrayBuffer {
  const commaIndex = dataUrl.indexOf(",");
  const meta = dataUrl.slice(0, commaIndex);
  const payload = dataUrl.slice(commaIndex + 1);

  if (meta.includes(";base64")) {
    const binary = window.atob(payload);
    const buffer = new ArrayBuffer(binary.length);
    const bytes = new Uint8Array(buffer);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return buffer;
  }

  const text = decodeURIComponent(payload);
  const buffer = new ArrayBuffer(text.length);
  const bytes = new Uint8Array(buffer);
  for (let index = 0; index < text.length; index += 1) {
    bytes[index] = text.charCodeAt(index);
  }
  return buffer;
}
