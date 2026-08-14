import { describe, expect, it } from "vitest";
import { parseArtifactStorageKey } from "@testhistory/artifacts";
import { createAppStore, type UploadSession, type UploadSessionFile } from "../store.js";
import { clearSessionChunks, persistUploadChunk, readUploadChunk } from "./uploadChunked.js";

describe("production chunk object storage", () => {
  it("stores PostgreSQL runtime chunks through the shared object-store port", async () => {
    const store = createAppStore();
    store.driver = "postgres";
    const file: UploadSessionFile = {
      path: "allure/result.json",
      totalChunks: 1,
      receivedChunks: 0,
      receivedBytes: 0,
      chunks: new Map()
    };
    const session: UploadSession = {
      id: "session-object-1",
      launchId: "launch-object-1",
      path: file.path,
      status: "open",
      totalChunks: 1,
      receivedChunks: 0,
      receivedBytes: 0,
      files: new Map([[file.path, file]]),
      createdAt: "2026-08-09T00:00:00.000Z",
      updatedAt: "2026-08-09T00:00:00.000Z",
      expiresAt: "2026-08-09T01:00:00.000Z"
    };

    const chunk = await persistUploadChunk(store, session, file, 0, Buffer.from("chunk-body"));
    expect(chunk).toEqual(
      expect.objectContaining({ storage: "object", bytes: 10, storageKey: expect.any(String) })
    );
    await expect(readUploadChunk(chunk, store.artifactObjects)).resolves.toEqual(
      Buffer.from("chunk-body")
    );

    file.chunks.set(0, chunk);
    await clearSessionChunks(session, "completed", store.artifactObjects);
    await expect(
      store.artifactObjects.headObject(parseArtifactStorageKey(chunk.storageKey!).storageKey)
    ).resolves.toBeUndefined();
  });
});
