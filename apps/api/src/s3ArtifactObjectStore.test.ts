import type { ArtifactStorageKey } from "@testhistory/artifacts";
import {
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  type S3Client
} from "@aws-sdk/client-s3";
import { describe, expect, it, vi } from "vitest";

import {
  createS3ArtifactObjectStore,
  resolveS3ArtifactObjectStorePlan
} from "./s3ArtifactObjectStore.js";

describe("S3 artifact object store configuration", () => {
  it("stays disabled when S3 is not configured", () => {
    expect(resolveS3ArtifactObjectStorePlan({})).toBeUndefined();
  });

  it("builds a path-style MinIO plan without exposing credentials", () => {
    const plan = resolveS3ArtifactObjectStorePlan({
      S3_ENDPOINT: "http://minio.internal:9000",
      S3_BUCKET: "evidence",
      S3_PREFIX: "/tenant-a/",
      S3_ACCESS_KEY_ID: "access",
      S3_SECRET_ACCESS_KEY: "secret"
    });

    expect(plan).toEqual(
      expect.objectContaining({
        bucket: "evidence",
        prefix: "tenant-a/",
        clientConfig: expect.objectContaining({
          endpoint: "http://minio.internal:9000",
          forcePathStyle: true,
          region: "us-east-1"
        })
      })
    );
  });

  it("rejects partial credentials and incomplete S3 configuration", () => {
    expect(() => resolveS3ArtifactObjectStorePlan({ TESTHISTORY_ARTIFACT_STORE: "s3" })).toThrow(
      "S3_BUCKET is required"
    );
    expect(() =>
      resolveS3ArtifactObjectStorePlan({
        S3_BUCKET: "evidence",
        S3_ACCESS_KEY_ID: "access"
      })
    ).toThrow("must be configured together");
  });
});

describe("S3 artifact object store", () => {
  it("writes and reads artifact metadata without changing the domain storage key", async () => {
    const body = Buffer.from("S3 evidence", "utf8");
    const send = vi.fn(async (command: object) => {
      if (command instanceof PutObjectCommand) {
        expect(command.input).toEqual(
          expect.objectContaining({
            Bucket: "evidence",
            Key: "testhistory/launch/result.txt",
            Body: body,
            ContentType: "text/plain",
            Metadata: expect.objectContaining({
              originalbytes: String(body.byteLength),
              storedbytes: String(body.byteLength),
              sha256: "sha256-value",
              compression: "none"
            })
          })
        );
        return { ETag: '"etag-value"' };
      }
      if (command instanceof GetObjectCommand) {
        return {
          Body: { transformToByteArray: async () => body },
          LastModified: new Date("2026-08-09T10:00:00.000Z"),
          Metadata: {
            originalbytes: String(body.byteLength),
            storedbytes: String(body.byteLength),
            sha256: "sha256-value",
            compression: "none",
            contenttype: "text/plain"
          }
        };
      }
      throw new Error("Unexpected command");
    });
    const store = createS3ArtifactObjectStore({
      bucket: "evidence",
      prefix: "testhistory",
      client: { send } as unknown as Pick<S3Client, "send">
    });
    const key = "launch/result.txt" as ArtifactStorageKey;

    await expect(
      store.putObject({
        key,
        body,
        originalBytes: body.byteLength,
        storedBytes: body.byteLength,
        sha256: "sha256-value",
        compression: "none",
        contentType: "text/plain"
      })
    ).resolves.toEqual(expect.objectContaining({ key, etag: "etag-value" }));
    await expect(store.getObject(key)).resolves.toEqual({
      key,
      body,
      originalBytes: body.byteLength,
      storedBytes: body.byteLength,
      sha256: "sha256-value",
      compression: "none",
      contentType: "text/plain",
      updatedAt: "2026-08-09T10:00:00.000Z"
    });
  });

  it("reports missing keys and deletes existing objects in an S3 batch", async () => {
    const deletedKey = "launch/deleted.txt" as ArtifactStorageKey;
    const missingKey = "launch/missing.txt" as ArtifactStorageKey;
    const send = vi.fn(async (command: object) => {
      if (command instanceof HeadObjectCommand) {
        if (command.input.Key?.endsWith("missing.txt")) {
          throw Object.assign(new Error("missing"), {
            name: "NotFound",
            $metadata: { httpStatusCode: 404 }
          });
        }
        return {
          LastModified: new Date("2026-08-09T10:00:00.000Z"),
          Metadata: {
            originalbytes: "1",
            storedbytes: "1",
            sha256: "hash",
            compression: "none"
          }
        };
      }
      if (command instanceof DeleteObjectsCommand) {
        expect(command.input.Delete?.Objects).toEqual([{ Key: `root/${deletedKey}` }]);
        return { Deleted: [{ Key: `root/${deletedKey}` }] };
      }
      throw new Error("Unexpected command");
    });
    const store = createS3ArtifactObjectStore({
      bucket: "evidence",
      prefix: "root",
      client: { send } as unknown as Pick<S3Client, "send">
    });

    await expect(store.deleteObjects([deletedKey, missingKey, deletedKey])).resolves.toEqual({
      deleted: [deletedKey],
      missing: [missingKey]
    });
  });

  it("rejects unsafe storage keys before sending an S3 request", async () => {
    const send = vi.fn();
    const store = createS3ArtifactObjectStore({
      bucket: "evidence",
      client: { send } as unknown as Pick<S3Client, "send">
    });

    await expect(store.headObject("../secret" as ArtifactStorageKey)).rejects.toThrow(
      "Artifact storage key is invalid"
    );
    expect(send).not.toHaveBeenCalled();
  });
});
