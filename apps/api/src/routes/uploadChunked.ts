import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  normalizeArtifactSourcePath,
  createArtifactStorageKey,
  parseArtifactStorageKey,
  type ArtifactObjectStorePort,
  type ArtifactPolicy,
  type ArtifactStorageKey
} from "@testhistory/artifacts";
import {
  type AppStore,
  type UploadChunkPayload,
  type UploadSession,
  type UploadSessionFile
} from "../store.js";

import { type ChunkEncoding, type ChunkedUploadFileInput } from "./uploadTypes.js";
import { sha256, sum } from "./uploadCore.js";

export function normalizeChunkedUploadFiles(body: {
  path?: string;
  totalChunks?: number;
  totalBytes?: number;
  files?: ChunkedUploadFileInput[];
}): ChunkedUploadFileInput[] {
  if (body.files !== undefined) {
    return body.files;
  }

  if (body.path !== undefined && body.totalChunks !== undefined) {
    return [
      {
        path: body.path,
        totalChunks: body.totalChunks,
        ...(body.totalBytes !== undefined ? { totalBytes: body.totalBytes } : {})
      }
    ];
  }

  return [];
}

export function validateChunkedUploadFiles(
  files: ChunkedUploadFileInput[],
  policy: ArtifactPolicy
): string | undefined {
  if (files.length === 0) {
    return "Upload session must include either path/totalChunks or files";
  }

  const paths = new Set<string>();
  let totalChunks = 0;
  let totalBytes = 0;

  for (const file of files) {
    const normalizedPath = normalizeChunkedUploadPath(file.path);
    if (normalizedPath === undefined) {
      return "Upload file path must be a safe relative path";
    }
    file.path = normalizedPath;
    if (paths.has(normalizedPath)) {
      return `Duplicate upload file path: ${normalizedPath}`;
    }
    if (!Number.isInteger(file.totalChunks) || file.totalChunks < 1) {
      return `Invalid chunk count for ${normalizedPath}`;
    }
    if (file.totalChunks > policy.maxUploadChunks) {
      return `${normalizedPath} exceeds max chunk count of ${policy.maxUploadChunks}`;
    }
    if (
      file.totalBytes !== undefined &&
      (!Number.isInteger(file.totalBytes) || file.totalBytes < 0)
    ) {
      return `Invalid byte count for ${normalizedPath}`;
    }
    if (file.totalBytes !== undefined && file.totalBytes > policy.maxArtifactBytes) {
      return `${normalizedPath} exceeds max artifact size of ${policy.maxArtifactBytes} bytes`;
    }
    paths.add(normalizedPath);
    totalChunks += file.totalChunks;
    totalBytes += file.totalBytes ?? 0;
  }

  if (totalChunks > policy.maxUploadChunks) {
    return `Upload session exceeds max chunk count of ${policy.maxUploadChunks}`;
  }
  if (totalBytes > policy.maxUploadSessionBytes) {
    return `Upload session exceeds max size of ${policy.maxUploadSessionBytes} bytes`;
  }

  return undefined;
}

export function resolveSessionFile(
  session: UploadSession,
  requestedPath: string | undefined
): UploadSessionFile | undefined {
  if (requestedPath !== undefined) {
    return session.files.get(requestedPath);
  }

  return session.files.size === 1 ? Array.from(session.files.values())[0] : undefined;
}

export function normalizeOptionalChunkedPath(path: string | undefined): string | undefined | false {
  if (path === undefined) {
    return undefined;
  }

  return normalizeChunkedUploadPath(path) ?? false;
}

function normalizeChunkedUploadPath(path: string): string | undefined {
  try {
    return normalizeArtifactSourcePath(path);
  } catch {
    return undefined;
  }
}

export function decodeChunk(content: string, encoding: ChunkEncoding): Buffer {
  return Buffer.from(content, encoding);
}

export async function persistUploadChunk(
  store: AppStore,
  session: UploadSession,
  file: UploadSessionFile,
  chunkIndex: number,
  content: Buffer
): Promise<UploadChunkPayload> {
  const digest = sha256(content);
  const storageKey = uploadChunkStorageKey(session.id, file.path, chunkIndex);
  if (store.driver === "postgres") {
    await store.artifactObjects.putObject({
      key: storageKey,
      body: content,
      originalBytes: content.byteLength,
      storedBytes: content.byteLength,
      sha256: digest,
      compression: "none",
      contentType: "application/octet-stream"
    });
    return {
      storage: "object",
      bytes: content.byteLength,
      sha256: digest,
      storageKey
    };
  }
  const fullPath = uploadChunkStoragePath(storageKey);
  // Artifact storage keys are intentionally hierarchical (launch/kind/id).
  // Keep the same opaque key shape for the local spool, but create its full
  // parent tree before writing the chunk.
  await mkdir(dirname(fullPath), { recursive: true });
  await writeFile(fullPath, content);
  return {
    storage: "filesystem",
    bytes: content.byteLength,
    sha256: digest,
    storageKey
  };
}

export async function readUploadChunk(
  chunk: UploadChunkPayload,
  objectStore?: ArtifactObjectStorePort
): Promise<Buffer> {
  if (chunk.storage === "memory" && chunk.buffer !== undefined) {
    return chunk.buffer;
  }
  if (chunk.storageKey === undefined) {
    return Buffer.alloc(0);
  }
  if (chunk.storage === "object") {
    const object = await objectStore?.getObject(
      parseArtifactStorageKey(chunk.storageKey).storageKey
    );
    if (object === undefined) {
      throw new Error("Upload chunk object is missing");
    }
    return object.body;
  }
  return readFile(uploadChunkStoragePath(chunk.storageKey));
}

export async function deleteUploadChunk(
  chunk: UploadChunkPayload,
  objectStore?: ArtifactObjectStorePort
) {
  if (chunk.storageKey === undefined) {
    return;
  }
  if (chunk.storage === "object") {
    await objectStore?.deleteObjects([parseArtifactStorageKey(chunk.storageKey).storageKey]);
    return;
  }
  await rm(uploadChunkStoragePath(chunk.storageKey), { force: true });
}

function uploadChunkStorageKey(
  sessionId: string,
  filePath: string,
  chunkIndex: number
): ArtifactStorageKey {
  const artifactId = createHash("sha256")
    .update(["upload-chunk", sessionId, filePath, String(chunkIndex)].join("\0"))
    .digest("hex");
  return createArtifactStorageKey({ launchId: sessionId, kind: "unknown", artifactId });
}

function uploadChunkStoragePath(storageKey: string): string {
  return join(".tmp", "testhistory-upload-buffer", `${storageKey}.chunk`);
}

export function refreshUploadSessionCounters(session: UploadSession) {
  let receivedChunks = 0;
  let receivedBytes = 0;

  for (const file of session.files.values()) {
    file.receivedChunks = file.chunks.size;
    file.receivedBytes = sum(Array.from(file.chunks.values()).map((chunk) => chunk.bytes));
    receivedChunks += file.receivedChunks;
    receivedBytes += file.receivedBytes;
  }

  session.receivedChunks = receivedChunks;
  session.receivedBytes = receivedBytes;
}

export function getIncompleteFiles(session: UploadSession) {
  return Array.from(session.files.values())
    .filter(
      (file) =>
        file.receivedChunks !== file.totalChunks ||
        file.receivedBytes !== (file.totalBytes ?? file.receivedBytes)
    )
    .map((file) => ({
      path: file.path,
      receivedChunks: file.receivedChunks,
      totalChunks: file.totalChunks,
      ...(file.totalBytes !== undefined ? { totalBytes: file.totalBytes } : {}),
      receivedBytes: file.receivedBytes
    }));
}

export async function assembleFile(
  file: UploadSessionFile,
  objectStore?: ArtifactObjectStorePort
): Promise<Buffer> {
  const chunks = await Promise.all(
    Array.from({ length: file.totalChunks }, async (_, index) => {
      const chunk = file.chunks.get(index);
      return chunk === undefined ? Buffer.alloc(0) : readUploadChunk(chunk, objectStore);
    })
  );
  return Buffer.concat(chunks);
}

export async function clearSessionChunks(
  session: UploadSession,
  reason: NonNullable<UploadSession["cleanup"]>["reason"],
  objectStore?: ArtifactObjectStorePort
) {
  const chunks = [];
  for (const file of session.files.values()) {
    for (const chunk of file.chunks.values()) {
      chunks.push(deleteUploadChunk(chunk, objectStore));
    }
    file.chunks.clear();
  }
  await Promise.all(chunks);
  session.cleanup = {
    chunksClearedAt: new Date().toISOString(),
    reason
  };
}

export function expireSessionIfNeeded(
  session: UploadSession,
  objectStore?: ArtifactObjectStorePort
): boolean {
  if (session.status !== "open") {
    return session.status === "expired";
  }
  if (Date.parse(session.expiresAt) > Date.now()) {
    return false;
  }

  session.status = "expired";
  session.closedAt = new Date().toISOString();
  session.updatedAt = session.closedAt;
  if (
    objectStore === undefined &&
    Array.from(session.files.values()).some((file) =>
      Array.from(file.chunks.values()).some((chunk) => chunk.storage === "object")
    )
  ) {
    return true;
  }
  void clearSessionChunks(session, "expired", objectStore);
  return true;
}
