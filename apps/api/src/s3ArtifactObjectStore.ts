import type {
  ArtifactCompression,
  ArtifactObject,
  ArtifactObjectMetadata,
  ArtifactObjectStorePort,
  ArtifactStorageKey
} from "@testhistory/artifacts";
import {
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig
} from "@aws-sdk/client-s3";

const DELETE_BATCH_SIZE = 1_000;

export type S3ArtifactObjectStoreConfig = {
  bucket: string;
  prefix?: string;
  client: Pick<S3Client, "send">;
};

export type S3ArtifactObjectStorePlan = {
  bucket: string;
  prefix: string;
  clientConfig: S3ClientConfig;
};

export function resolveS3ArtifactObjectStorePlan(
  env: NodeJS.ProcessEnv = process.env
): S3ArtifactObjectStorePlan | undefined {
  const endpoint = optionalTrim(env.S3_ENDPOINT);
  const bucket = optionalTrim(env.S3_BUCKET);
  const explicitlyEnabled = env.TESTHISTORY_ARTIFACT_STORE?.trim().toLowerCase() === "s3";
  if (!explicitlyEnabled && endpoint === undefined && bucket === undefined) {
    return undefined;
  }
  if (bucket === undefined || bucket.length === 0) {
    throw new Error("S3_BUCKET is required when the S3 artifact store is configured");
  }

  const accessKeyId = optionalTrim(env.S3_ACCESS_KEY_ID);
  const secretAccessKey = optionalTrim(env.S3_SECRET_ACCESS_KEY);
  const sessionToken = optionalTrim(env.S3_SESSION_TOKEN);
  if ((accessKeyId === undefined) !== (secretAccessKey === undefined)) {
    throw new Error("S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY must be configured together");
  }

  const region = env.S3_REGION?.trim() || "us-east-1";
  const clientConfig: S3ClientConfig = {
    region,
    forcePathStyle: readBoolean(env.S3_FORCE_PATH_STYLE, endpoint !== undefined)
  };
  if (endpoint !== undefined && endpoint.length > 0) {
    clientConfig.endpoint = endpoint;
  }
  if (accessKeyId !== undefined && secretAccessKey !== undefined) {
    clientConfig.credentials = {
      accessKeyId,
      secretAccessKey,
      ...(sessionToken !== undefined ? { sessionToken } : {})
    };
  }

  return {
    bucket,
    prefix: normalizePrefix(env.S3_PREFIX),
    clientConfig
  };
}

export function createS3ArtifactObjectStoreFromEnv(
  env: NodeJS.ProcessEnv = process.env
): ArtifactObjectStorePort | undefined {
  const plan = resolveS3ArtifactObjectStorePlan(env);
  if (plan === undefined) {
    return undefined;
  }
  return createS3ArtifactObjectStore({
    bucket: plan.bucket,
    prefix: plan.prefix,
    client: new S3Client(plan.clientConfig)
  });
}

export function createS3ArtifactObjectStore(
  config: S3ArtifactObjectStoreConfig
): ArtifactObjectStorePort {
  const bucket = assertBucket(config.bucket);
  const prefix = normalizePrefix(config.prefix);
  const client = config.client;

  return {
    async putObject(object) {
      const key = objectKey(prefix, object.key);
      const response = await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: object.body,
          ContentLength: object.storedBytes,
          ...(object.contentType !== undefined ? { ContentType: object.contentType } : {}),
          Metadata: encodeMetadata(object)
        })
      );
      return {
        key: object.key,
        storedBytes: object.storedBytes,
        writtenAt: new Date().toISOString(),
        ...(response.ETag !== undefined ? { etag: response.ETag.replaceAll('"', "") } : {})
      };
    },

    async getObject(key) {
      const normalizedKey = assertStorageKey(key);
      try {
        const response = await client.send(
          new GetObjectCommand({ Bucket: bucket, Key: objectKey(prefix, normalizedKey) })
        );
        if (response.Body === undefined) {
          throw new Error("S3 returned an artifact object without a body");
        }
        const body = Buffer.from(await response.Body.transformToByteArray());
        const metadata = decodeMetadata(normalizedKey, response.Metadata, response.LastModified);
        if (body.byteLength !== metadata.storedBytes) {
          throw new Error("Artifact object size does not match its metadata");
        }
        return { ...metadata, body };
      } catch (error) {
        if (isNotFound(error)) {
          return undefined;
        }
        throw error;
      }
    },

    async headObject(key) {
      const normalizedKey = assertStorageKey(key);
      try {
        const response = await client.send(
          new HeadObjectCommand({ Bucket: bucket, Key: objectKey(prefix, normalizedKey) })
        );
        return decodeMetadata(normalizedKey, response.Metadata, response.LastModified);
      } catch (error) {
        if (isNotFound(error)) {
          return undefined;
        }
        throw error;
      }
    },

    async deleteObjects(keys) {
      const uniqueKeys = Array.from(new Set(keys.map(assertStorageKey)));
      const existing: ArtifactStorageKey[] = [];
      const missing: ArtifactStorageKey[] = [];
      for (const key of uniqueKeys) {
        ((await this.headObject(key)) === undefined ? missing : existing).push(key);
      }

      const deleted: ArtifactStorageKey[] = [];
      for (let index = 0; index < existing.length; index += DELETE_BATCH_SIZE) {
        const batch = existing.slice(index, index + DELETE_BATCH_SIZE);
        const response = await client.send(
          new DeleteObjectsCommand({
            Bucket: bucket,
            Delete: {
              Quiet: false,
              Objects: batch.map((key) => ({ Key: objectKey(prefix, key) }))
            }
          })
        );
        const failed = new Set(
          (response.Errors ?? []).map((item) => stripPrefix(prefix, item.Key ?? ""))
        );
        if (failed.size > 0) {
          throw new Error(`S3 failed to delete ${failed.size} artifact object(s)`);
        }
        deleted.push(...batch);
      }
      return { deleted, missing };
    }
  };
}

function encodeMetadata(object: ArtifactObject): Record<string, string> {
  return {
    originalbytes: String(object.originalBytes),
    storedbytes: String(object.storedBytes),
    sha256: object.sha256,
    compression: object.compression,
    ...(object.contentType !== undefined ? { contenttype: object.contentType } : {})
  };
}

function decodeMetadata(
  key: ArtifactStorageKey,
  metadata: Record<string, string> | undefined,
  lastModified: Date | undefined
): ArtifactObjectMetadata {
  const originalBytes = readNonNegativeInteger(metadata?.originalbytes, "originalbytes");
  const storedBytes = readNonNegativeInteger(metadata?.storedbytes, "storedbytes");
  const sha256 = metadata?.sha256;
  const compression = metadata?.compression;
  if (sha256 === undefined || sha256.length === 0 || compression === undefined) {
    throw new Error("S3 artifact object metadata is incomplete");
  }
  return {
    key,
    originalBytes,
    storedBytes,
    sha256,
    compression: compression as ArtifactCompression,
    updatedAt: (lastModified ?? new Date(0)).toISOString(),
    ...(metadata?.contenttype !== undefined ? { contentType: metadata.contenttype } : {})
  };
}

function readNonNegativeInteger(value: string | undefined, field: string): number {
  const parsed = Number(value);
  if (value === undefined || !Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`S3 artifact object metadata ${field} is invalid`);
  }
  return parsed;
}

function assertBucket(value: string): string {
  const bucket = value.trim();
  if (bucket.length === 0 || bucket.length > 255 || /[\0\r\n]/u.test(bucket)) {
    throw new Error("S3 artifact bucket is invalid");
  }
  return bucket;
}

function assertStorageKey(value: ArtifactStorageKey): ArtifactStorageKey {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 2_048 ||
    value.includes("\0") ||
    value.startsWith("/") ||
    value.split("/").some((segment) => segment === "..")
  ) {
    throw new Error("Artifact storage key is invalid");
  }
  return value;
}

function objectKey(prefix: string, key: ArtifactStorageKey): string {
  return `${prefix}${assertStorageKey(key)}`;
}

function stripPrefix(prefix: string, key: string): string {
  return prefix.length > 0 && key.startsWith(prefix) ? key.slice(prefix.length) : key;
}

function normalizePrefix(value: string | undefined): string {
  const normalized = value?.trim().replace(/^\/+|\/+$/gu, "") ?? "";
  if (normalized.includes("\0") || normalized.split("/").some((segment) => segment === "..")) {
    throw new Error("S3_PREFIX is invalid");
  }
  return normalized.length === 0 ? "" : `${normalized}/`;
}

function readBoolean(value: string | undefined, fallback: boolean): boolean {
  const normalized = optionalTrim(value);
  if (normalized === undefined) {
    return fallback;
  }
  if (normalized === "true") {
    return true;
  }
  if (normalized === "false") {
    return false;
  }
  throw new Error("S3_FORCE_PATH_STYLE must be true or false");
}

function optionalTrim(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed.length === 0 ? undefined : trimmed;
}

function isNotFound(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }
  const candidate = error as {
    name?: string;
    Code?: string;
    $metadata?: { httpStatusCode?: number };
  };
  return (
    candidate.name === "NoSuchKey" ||
    candidate.name === "NotFound" ||
    candidate.Code === "NoSuchKey" ||
    candidate.$metadata?.httpStatusCode === 404
  );
}
