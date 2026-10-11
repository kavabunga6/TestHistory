import { requestResponse } from "./apiHttp.js";

export const maxArtifactPngBytes = 8 * 1024 * 1024;
const pngSignature = [137, 80, 78, 71, 13, 10, 26, 10];

export type ArtifactPngMetadata = {
  artifactId: string;
  contentType?: string;
  originalBytes: number;
};

export async function loadArtifactPng(
  metadata: ArtifactPngMetadata,
  signal: AbortSignal
): Promise<Blob> {
  if (
    !/^[a-f0-9]{64}$/.test(metadata.artifactId) ||
    metadata.contentType?.toLowerCase() !== "image/png" ||
    !Number.isSafeInteger(metadata.originalBytes) ||
    metadata.originalBytes < pngSignature.length ||
    metadata.originalBytes > maxArtifactPngBytes
  ) {
    throw new Error("Invalid PNG metadata");
  }
  signal.throwIfAborted();
  const response = await requestResponse(`/api/v1/artifacts/${metadata.artifactId}/content`, {
    method: "GET",
    redirect: "error",
    signal
  });
  const declaredLength = response.headers.get("content-length");
  if (
    response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() !== "image/png" ||
    response.body === null ||
    (declaredLength !== null &&
      (!/^\d+$/.test(declaredLength) ||
        Number(declaredLength) > maxArtifactPngBytes ||
        Number(declaredLength) < pngSignature.length))
  ) {
    await response.body?.cancel();
    throw new Error("Invalid PNG response");
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  const abort = () => void reader.cancel().catch(() => undefined);
  signal.addEventListener("abort", abort, { once: true });
  try {
    while (true) {
      signal.throwIfAborted();
      const chunk = await reader.read();
      signal.throwIfAborted();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > maxArtifactPngBytes || bytes > metadata.originalBytes) {
        throw new Error("PNG exceeds declared size");
      }
      chunks.push(chunk.value);
    }
    if (bytes !== metadata.originalBytes) throw new Error("PNG size mismatch");
    const data = new Uint8Array(bytes);
    let offset = 0;
    for (const chunk of chunks) {
      data.set(chunk, offset);
      offset += chunk.byteLength;
    }
    if (!pngSignature.every((value, index) => data[index] === value)) {
      throw new Error("Invalid PNG signature");
    }
    return new Blob([data], { type: "image/png" });
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    signal.removeEventListener("abort", abort);
    reader.releaseLock();
  }
}
