import { createHash } from "node:crypto";
import { lstat, readFile, stat } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

import { createFileArtifactObjectStore } from "../apps/api/dist/artifactObjectStore.js";

const maxSnapshotBytes = 256 * 1024 * 1024;
const workspaceRoot = resolve(new URL("..", import.meta.url).pathname.replace(/^\/(.:)/, "$1"));
const storeFile = resolve(
  workspaceRoot,
  process.env.TESTHISTORY_STORE_FILE ?? ".testhistory/local-store.json"
);
const snapshotInfo = await stat(storeFile);
if (!snapshotInfo.isFile() || snapshotInfo.size > maxSnapshotBytes) {
  throw new Error(`Local store snapshot is missing or exceeds ${maxSnapshotBytes} bytes`);
}

const snapshot = JSON.parse(await readFile(storeFile, "utf8"));
const launches = readSnapshotMap(snapshot, "launches");
const artifacts = readSnapshotMap(snapshot, "artifacts");
const evidenceRoots = new Map();

for (const [launchId, launch] of launches) {
  const buildNumber = /^android-evidence-(\d+)$/.exec(String(launch.buildNumber ?? ""))?.[1];
  if (buildNumber === undefined) continue;
  const root = resolve(workspaceRoot, `.tmp/testhistory-evidence-${buildNumber}/allure-results`);
  if (await isSafeDirectory(root)) evidenceRoots.set(launchId, root);
}

const objectStore = createFileArtifactObjectStore(`${storeFile}.objects`);
const counters = { restored: 0, alreadyPresent: 0, sourceMissing: 0, mismatched: 0 };

for (const artifact of artifacts.values()) {
  const evidenceRoot = evidenceRoots.get(artifact.launchId);
  if (evidenceRoot === undefined) continue;

  const existing = await objectStore.getObject(artifact.storageKey);
  if (existing !== undefined) {
    counters.alreadyPresent += 1;
    continue;
  }

  const sourcePath = safeEvidencePath(evidenceRoot, artifact.path);
  if (sourcePath === undefined || !(await isSafeFile(sourcePath))) {
    counters.sourceMissing += 1;
    continue;
  }

  const source = await readFile(sourcePath);
  const sha256 = digest(source);
  if (source.byteLength !== artifact.originalBytes || sha256 !== artifact.sha256) {
    counters.mismatched += 1;
    continue;
  }

  const body = artifact.compression === "gzip" ? gzipSync(source) : source;
  await objectStore.putObject({
    body,
    compression: artifact.compression,
    key: artifact.storageKey,
    originalBytes: source.byteLength,
    sha256,
    storedBytes: body.byteLength,
    ...(artifact.contentType !== undefined ? { contentType: artifact.contentType } : {})
  });
  counters.restored += 1;
}

console.log(
  JSON.stringify(
    {
      ...counters,
      evidenceLaunches: evidenceRoots.size,
      storeFile
    },
    null,
    2
  )
);

function readSnapshotMap(snapshot, name) {
  const value = snapshot?.maps?.[name];
  if (value?.__testhistoryMap !== true || !Array.isArray(value.entries)) {
    throw new Error(`Local store snapshot map ${name} is invalid`);
  }
  return new Map(value.entries);
}

function safeEvidencePath(root, artifactPath) {
  if (
    typeof artifactPath !== "string" ||
    artifactPath.length === 0 ||
    artifactPath.includes("\0") ||
    isAbsolute(artifactPath)
  ) {
    return undefined;
  }
  const candidate = resolve(root, artifactPath.replaceAll("/", sep));
  const relativePath = relative(root, candidate);
  return relativePath === "" || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath)
    ? undefined
    : candidate;
}

async function isSafeDirectory(path) {
  try {
    const info = await lstat(path);
    return info.isDirectory() && !info.isSymbolicLink();
  } catch {
    return false;
  }
}

async function isSafeFile(path) {
  try {
    const info = await lstat(path);
    return info.isFile() && !info.isSymbolicLink();
  } catch {
    return false;
  }
}

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}
