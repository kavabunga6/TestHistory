import type {
  ArtifactObject,
  ArtifactObjectMetadata,
  ArtifactObjectStorePort,
  ArtifactStorageKey
} from "@testhistory/artifacts";
import { createHash } from "node:crypto";
import { chmod, lstat, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

type StoredObject = ArtifactObject & { updatedAt: string };

export function createMemoryArtifactObjectStore(): ArtifactObjectStorePort {
  const objects = new Map<ArtifactStorageKey, StoredObject>();
  return {
    async putObject(object) {
      const updatedAt = new Date().toISOString();
      objects.set(object.key, { ...object, body: Buffer.from(object.body), updatedAt });
      return {
        key: object.key,
        etag: object.sha256,
        storedBytes: object.storedBytes,
        writtenAt: updatedAt
      };
    },
    async getObject(key) {
      const object = objects.get(key);
      return object === undefined ? undefined : { ...object, body: Buffer.from(object.body) };
    },
    async headObject(key) {
      const object = objects.get(key);
      return object === undefined ? undefined : toMetadata(object);
    },
    async deleteObjects(keys) {
      const deleted: ArtifactStorageKey[] = [];
      const missing: ArtifactStorageKey[] = [];
      for (const key of keys) {
        (objects.delete(key) ? deleted : missing).push(key);
      }
      return { deleted, missing };
    }
  };
}

export function createFileArtifactObjectStore(rootPath: string): ArtifactObjectStorePort {
  const root = resolve(rootPath);

  return {
    async putObject(object) {
      const paths = await objectPaths(root, object.key);
      const writtenAt = new Date().toISOString();
      const metadata = { ...toMetadata({ ...object, updatedAt: writtenAt }), key: object.key };
      await mkdir(dirname(paths.body), { recursive: true, mode: 0o700 });
      await atomicWrite(paths.body, object.body);
      await atomicWrite(paths.metadata, Buffer.from(JSON.stringify(metadata), "utf8"));
      return {
        key: object.key,
        etag: object.sha256,
        storedBytes: object.storedBytes,
        writtenAt
      };
    },
    async getObject(key) {
      const paths = await objectPaths(root, key);
      const metadata = await readMetadata(paths.metadata, key);
      if (metadata === undefined || !(await isRegularFile(paths.body))) {
        return undefined;
      }
      const body = await readFile(paths.body);
      if (body.byteLength !== metadata.storedBytes) {
        throw new Error("Artifact object size does not match its metadata");
      }
      return { ...metadata, key, body };
    },
    async headObject(key) {
      const paths = await objectPaths(root, key);
      const metadata = await readMetadata(paths.metadata, key);
      return metadata;
    },
    async deleteObjects(keys) {
      const deleted: ArtifactStorageKey[] = [];
      const missing: ArtifactStorageKey[] = [];
      for (const key of keys) {
        const paths = await objectPaths(root, key);
        const exists = (await isRegularFile(paths.body)) || (await isRegularFile(paths.metadata));
        if (!exists) {
          missing.push(key);
          continue;
        }
        await rm(paths.body, { force: true });
        await rm(paths.metadata, { force: true });
        deleted.push(key);
      }
      return { deleted, missing };
    }
  };
}

function toMetadata(object: StoredObject | (ArtifactObject & { updatedAt: string })) {
  const { body: _body, ...metadata } = object;
  void _body;
  return metadata satisfies ArtifactObjectMetadata;
}

async function objectPaths(root: string, key: ArtifactStorageKey) {
  if (typeof key !== "string" || key.length === 0 || key.length > 2048 || key.includes("\0")) {
    throw new Error("Artifact storage key is invalid");
  }
  await ensureSafeRoot(root);
  const digest = createHash("sha256").update(key).digest("hex");
  const directory = join(root, digest.slice(0, 2));
  return {
    body: join(directory, `${digest}.bin`),
    metadata: join(directory, `${digest}.json`)
  };
}

async function ensureSafeRoot(root: string) {
  await mkdir(root, { recursive: true, mode: 0o700 });
  const info = await lstat(root);
  if (info.isSymbolicLink() || !info.isDirectory()) {
    throw new Error("Artifact object root must be a real directory");
  }
}

async function atomicWrite(path: string, body: Buffer) {
  const temporaryPath = `${path}.${process.pid}.${Date.now()}.tmp`;
  let renamed = false;
  try {
    await writeFile(temporaryPath, body, { mode: 0o600 });
    await rename(temporaryPath, path);
    renamed = true;
    if (process.platform !== "win32") {
      await chmod(path, 0o600);
    }
  } finally {
    if (!renamed) {
      await rm(temporaryPath, { force: true });
    }
  }
}

async function isRegularFile(path: string) {
  try {
    const info = await lstat(path);
    if (info.isSymbolicLink()) {
      throw new Error("Artifact object path must not be a symbolic link");
    }
    return info.isFile();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

async function readMetadata(
  path: string,
  expectedKey: ArtifactStorageKey
): Promise<(ArtifactObjectMetadata & { key: ArtifactStorageKey }) | undefined> {
  if (!(await isRegularFile(path))) {
    return undefined;
  }
  const value = JSON.parse(await readFile(path, "utf8")) as ArtifactObjectMetadata & {
    key: ArtifactStorageKey;
  };
  if (value.key !== expectedKey) {
    throw new Error("Artifact object metadata key mismatch");
  }
  return value;
}
