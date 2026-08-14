import type { ArtifactKind, ArtifactStorageKey, ArtifactStorageKeyParts } from "./types.js";

export function classifyArtifact(path: string): ArtifactKind {
  if (path.endsWith("-result.json")) {
    return "allure-result";
  }
  if (path.endsWith("-container.json")) {
    return "allure-container";
  }
  if (path.endsWith("environment.properties") || path.endsWith("environment.xml")) {
    return "environment";
  }
  if (path.endsWith("executor.json")) {
    return "executor";
  }
  if (path.includes("-attachment.")) {
    return "attachment";
  }
  if (path.endsWith(".feature") || path.includes("/scenarios/") || path.includes("\\scenarios\\")) {
    return "scenario";
  }
  if (
    path.includes("/fixtures/") ||
    path.includes("\\fixtures\\") ||
    path.includes("setup") ||
    path.includes("teardown")
  ) {
    return "fixture";
  }
  return "unknown";
}

export function createArtifactStorageKey(input: ArtifactStorageKeyParts): ArtifactStorageKey {
  assertArtifactStorageKeySegment("launchId", input.launchId);
  assertArtifactStorageKeyKind(input.kind);
  assertArtifactStorageKeySegment("artifactId", input.artifactId);

  return `${input.launchId}/${input.kind}/${input.artifactId}` as ArtifactStorageKey;
}

export function parseArtifactStorageKey(key: string): ArtifactStorageKeyParts & {
  storageKey: ArtifactStorageKey;
} {
  const parts = key.split("/");
  if (parts.length !== 3) {
    throw new Error("Artifact storage key must contain launchId/kind/artifactId");
  }

  const launchId = parts[0];
  const kind = parts[1];
  const artifactId = parts[2];
  if (launchId === undefined || kind === undefined || artifactId === undefined) {
    throw new Error("Artifact storage key must contain launchId/kind/artifactId");
  }
  if (!isArtifactKind(kind)) {
    throw new Error(`Artifact storage key has unsupported kind: ${kind}`);
  }

  const storageKey = createArtifactStorageKey({ launchId, kind, artifactId });
  return { launchId, kind, artifactId, storageKey };
}

export function isArtifactStorageKey(value: string): value is ArtifactStorageKey {
  try {
    parseArtifactStorageKey(value);
    return true;
  } catch {
    return false;
  }
}

function assertArtifactStorageKeySegment(name: string, value: string): void {
  if (value.trim() !== value || value.length === 0) {
    throw new Error(`Artifact storage key ${name} must be a non-empty trimmed segment`);
  }
  if (value.length > 128) {
    throw new Error(`Artifact storage key ${name} exceeds 128 characters`);
  }
  if (value === "." || value === "..") {
    throw new Error(`Artifact storage key ${name} cannot be a relative path segment`);
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value)) {
    throw new Error(
      `Artifact storage key ${name} may contain only letters, numbers, dot, underscore, colon, or hyphen`
    );
  }
}

function assertArtifactStorageKeyKind(kind: ArtifactKind): void {
  if (!isArtifactKind(kind)) {
    throw new Error(`Artifact storage key has unsupported kind: ${kind}`);
  }
}

function isArtifactKind(value: string): value is ArtifactKind {
  return (
    value === "allure-result" ||
    value === "allure-container" ||
    value === "attachment" ||
    value === "fixture" ||
    value === "scenario" ||
    value === "environment" ||
    value === "executor" ||
    value === "unknown"
  );
}
