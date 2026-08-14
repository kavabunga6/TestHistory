import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync
} from "node:fs";
import { dirname, resolve } from "node:path";
import { createAppStore, type AppStore } from "./store.js";
import { createFileArtifactObjectStore } from "./artifactObjectStore.js";
import { seedDefaultUsers } from "./storeUsers.js";

const SNAPSHOT_VERSION = 1;
const MAP_MARKER = "__testhistoryMap";
const MAX_SNAPSHOT_BYTES = 256 * 1024 * 1024;

type StoreSnapshot = {
  version: typeof SNAPSHOT_VERSION;
  savedAt: string;
  maps: Record<string, unknown>;
  arrays: Record<string, unknown[]>;
};

export type FileBackedAppStoreOptions = {
  autosaveMs?: number;
};

export function createFileBackedAppStore(
  filePath: string,
  options: FileBackedAppStoreOptions = {}
): AppStore {
  const store = createAppStore();
  const resolvedPath = resolve(filePath);

  loadSnapshot(store, resolvedPath);
  seedDefaultUsers(store);

  let lastDataSnapshot = serializeStoreData(store);
  persistSnapshot(resolvedPath, snapshotPayload(lastDataSnapshot));

  const autosaveMs = options.autosaveMs ?? 1000;
  const timer = setInterval(() => {
    lastDataSnapshot = saveIfChanged(store, resolvedPath, lastDataSnapshot);
  }, autosaveMs);
  timer.unref?.();

  const flush = () => {
    lastDataSnapshot = saveIfChanged(store, resolvedPath, lastDataSnapshot);
  };

  const handleInterrupt = () => {
    flush();
  };
  const handleTermination = () => {
    flush();
  };
  process.once("beforeExit", flush);
  process.once("SIGINT", handleInterrupt);
  process.once("SIGTERM", handleTermination);

  let closed = false;
  const closePersistence = () => {
    if (closed) {
      return;
    }
    flush();
    closed = true;
    clearInterval(timer);
    process.removeListener("beforeExit", flush);
    process.removeListener("SIGINT", handleInterrupt);
    process.removeListener("SIGTERM", handleTermination);
  };

  const baseHealth = store.health;
  return {
    ...store,
    artifactObjects: createFileArtifactObjectStore(`${resolvedPath}.objects`),
    closePersistence,
    driver: "file",
    health: async () => ({
      ...(await baseHealth()),
      driver: "file",
      migrationVersion: `file-snapshot-v${SNAPSHOT_VERSION}`,
      persistenceFile: resolvedPath
    })
  };
}

function saveIfChanged(store: AppStore, filePath: string, previousDataSnapshot: string): string {
  const nextDataSnapshot = serializeStoreData(store);
  if (nextDataSnapshot !== previousDataSnapshot) {
    persistSnapshot(filePath, snapshotPayload(nextDataSnapshot));
    return nextDataSnapshot;
  }
  return previousDataSnapshot;
}

function loadSnapshot(store: AppStore, filePath: string) {
  if (!existsSync(filePath)) {
    return;
  }

  assertSafeSnapshotFile(filePath);
  const size = statSync(filePath).size;
  if (size > MAX_SNAPSHOT_BYTES) {
    throw new Error(
      `TestHistory store snapshot exceeds the ${MAX_SNAPSHOT_BYTES} byte safety limit: ${filePath}`
    );
  }

  let snapshot: StoreSnapshot;
  try {
    snapshot = JSON.parse(readFileSync(filePath, "utf8"), reviveMaps) as StoreSnapshot;
  } catch {
    throw new Error(`TestHistory store snapshot is not valid JSON: ${filePath}`);
  }
  if (snapshot.version !== SNAPSHOT_VERSION) {
    throw new Error(
      `Unsupported TestHistory store snapshot version ${String(snapshot.version)}: ${filePath}`
    );
  }
  for (const [key, value] of Object.entries(snapshot.maps ?? {})) {
    const target = (store as unknown as Record<string, unknown>)[key];
    if (!(target instanceof Map) || !(value instanceof Map)) {
      continue;
    }

    target.clear();
    for (const [entryKey, entryValue] of value.entries()) {
      target.set(entryKey, entryValue);
    }
  }

  for (const [key, value] of Object.entries(snapshot.arrays ?? {})) {
    const target = (store as unknown as Record<string, unknown>)[key];
    if (!Array.isArray(target)) {
      continue;
    }
    target.splice(0, target.length, ...value);
  }
}

function serializeStoreData(store: AppStore): string {
  const maps: Record<string, unknown> = {};
  const arrays: Record<string, unknown[]> = {};

  for (const [key, value] of Object.entries(store as unknown as Record<string, unknown>)) {
    if (value instanceof Map) {
      maps[key] = value;
      continue;
    }
    if (Array.isArray(value)) {
      arrays[key] = value;
    }
  }

  return JSON.stringify({ maps, arrays }, replaceMaps, 2);
}

function snapshotPayload(dataSnapshot: string): string {
  const data = JSON.parse(dataSnapshot, reviveMaps) as Pick<StoreSnapshot, "maps" | "arrays">;
  return JSON.stringify(
    {
      version: SNAPSHOT_VERSION,
      savedAt: new Date().toISOString(),
      maps: data.maps,
      arrays: data.arrays
    } satisfies StoreSnapshot,
    replaceMaps,
    2
  );
}

function persistSnapshot(filePath: string, payload: string) {
  if (existsSync(filePath)) {
    assertSafeSnapshotFile(filePath);
  }
  mkdirSync(dirname(filePath), { mode: 0o700, recursive: true });
  const tempPath = `${filePath}.${process.pid}.tmp`;
  writeFileSync(tempPath, payload, { encoding: "utf8", mode: 0o600 });
  renameSync(tempPath, filePath);
  if (process.platform !== "win32") {
    chmodSync(filePath, 0o600);
  }
}

function assertSafeSnapshotFile(filePath: string) {
  if (lstatSync(filePath).isSymbolicLink()) {
    throw new Error(`Refusing to use a symbolic link as the TestHistory store: ${filePath}`);
  }
}

function replaceMaps(_key: string, value: unknown) {
  if (value instanceof Map) {
    return {
      [MAP_MARKER]: true,
      entries: Array.from(value.entries())
    };
  }
  return value;
}

function reviveMaps(_key: string, value: unknown) {
  if (
    value &&
    typeof value === "object" &&
    (value as { [MAP_MARKER]?: unknown })[MAP_MARKER] === true &&
    Array.isArray((value as { entries?: unknown }).entries)
  ) {
    return new Map((value as { entries: Array<[unknown, unknown]> }).entries);
  }
  return value;
}
