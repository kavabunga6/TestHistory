import type { ArtifactStorageKey } from "@testhistory/artifacts";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { createFileArtifactObjectStore } from "./artifactObjectStore.js";

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((path) => rm(path, { force: true, recursive: true }))
  );
});

describe("file artifact object store", () => {
  it("persists, reads and deletes artifact bytes by opaque storage key", async () => {
    const temporaryRoot = await mkdtemp(join(tmpdir(), "testhistory-artifacts-"));
    temporaryRoots.push(temporaryRoot);
    const store = createFileArtifactObjectStore(temporaryRoot);
    const key = "launch/attachment/object.txt" as ArtifactStorageKey;
    const body = Buffer.from("stored artifact", "utf8");

    const receipt = await store.putObject({
      key,
      body,
      originalBytes: body.byteLength,
      storedBytes: body.byteLength,
      sha256: "artifact-sha256",
      compression: "none",
      contentType: "text/plain"
    });

    expect(receipt.key).toBe(key);
    expect((await store.getObject(key))?.body.equals(body)).toBe(true);
    expect(await store.headObject(key)).toEqual(
      expect.objectContaining({ key, storedBytes: body.byteLength })
    );
    expect(await store.deleteObjects([key])).toEqual({ deleted: [key], missing: [] });
    expect(await store.getObject(key)).toBeUndefined();
    expect(await store.deleteObjects([key])).toEqual({ deleted: [], missing: [key] });
  });

  it("rejects a truncated object instead of serving corrupted evidence", async () => {
    const temporaryRoot = await mkdtemp(join(tmpdir(), "testhistory-artifacts-"));
    temporaryRoots.push(temporaryRoot);
    const store = createFileArtifactObjectStore(temporaryRoot);
    const key = "launch/attachment/tampered.txt" as ArtifactStorageKey;
    const body = Buffer.from("complete artifact", "utf8");
    await store.putObject({
      body,
      compression: "none",
      key,
      originalBytes: body.byteLength,
      sha256: "artifact-sha256",
      storedBytes: body.byteLength
    });
    const digest = createHash("sha256").update(key).digest("hex");
    await writeFile(join(temporaryRoot, digest.slice(0, 2), `${digest}.bin`), "short");

    await expect(store.getObject(key)).rejects.toThrow(
      "Artifact object size does not match its metadata"
    );
  });
});
