import { expect } from "vitest";
import { type ArtifactPolicy } from "./index.js";

export const policy: ArtifactPolicy = {
  compressionMinBytes: 100,
  retentionDays: 1,
  maxUploadConcurrency: 2,
  chunkBytes: 1024,
  maxArtifactBytes: 1024 * 1024,
  maxUploadSessionBytes: 2 * 1024 * 1024,
  maxUploadChunks: 100,
  uploadSessionTtlMinutes: 60,
  cleanupGraceDays: 7,
  cleanupBatchSize: 1000,
  cleanupBatchIntervalMinutes: 5,
  metadataSource: "result"
};

const forbiddenPreviewFieldNames = new Set([
  "blob",
  "payload",
  "path",
  "raw",
  "signedUrl",
  "storageKey",
  "storageKeys",
  "url"
]);

export function collectForbiddenPreviewFields(
  value: unknown,
  path = "$",
  found: string[] = []
): string[] {
  if (value === null || typeof value !== "object") {
    return found;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => collectForbiddenPreviewFields(item, `${path}[${index}]`, found));
    return found;
  }

  for (const [key, entryValue] of Object.entries(value)) {
    const nextPath = `${path}.${key}`;
    if (forbiddenPreviewFieldNames.has(key)) {
      found.push(nextPath);
    }
    collectForbiddenPreviewFields(entryValue, nextPath, found);
  }

  return found;
}

const forbiddenMaterializedRetentionDescriptorFieldNames = new Set([
  "blob",
  "body",
  "deleteObjects",
  "deletedCount",
  "deleteRequestedCount",
  "deletionExecution",
  "path",
  "payload",
  "raw",
  "signedUrl",
  "storage",
  "storageKey",
  "storageKeys",
  "url"
]);

export function collectForbiddenMaterializedRetentionDescriptorFields(
  value: unknown,
  path = "$",
  found: string[] = []
): string[] {
  if (value === null || typeof value !== "object") {
    return found;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      collectForbiddenMaterializedRetentionDescriptorFields(item, `${path}[${index}]`, found)
    );
    return found;
  }

  for (const [key, entryValue] of Object.entries(value)) {
    const nextPath = `${path}.${key}`;
    if (forbiddenMaterializedRetentionDescriptorFieldNames.has(key)) {
      found.push(nextPath);
    }
    collectForbiddenMaterializedRetentionDescriptorFields(entryValue, nextPath, found);
  }

  return found;
}

export function expectMaterializedRetentionDescriptorNoLeakage(
  value: unknown,
  forbidden: string[]
): void {
  const serialized = JSON.stringify(value);

  expect(collectForbiddenMaterializedRetentionDescriptorFields(value)).toEqual([]);
  expect(serialized).not.toMatch(
    /[A-Za-z0-9][A-Za-z0-9._:-]{0,127}\/(?:allure-result|allure-container|attachment|fixture|scenario|environment|executor|unknown)\/[A-Za-z0-9][A-Za-z0-9._:-]{0,127}/
  );
  expect(serialized).not.toContain("deletionExecution");
  expect(serialized).not.toContain("deleteObjects");
  expect(serialized).not.toContain("deletedCount");
  expect(serialized).not.toContain("deleteRequestedCount");

  for (const marker of forbidden) {
    expect(serialized).not.toContain(marker);
  }
}

export function buildSyntheticWindowsCorpusPrefix() {
  return ["C:", "Users"].join("\\");
}

export function buildSyntheticWindowsCorpusPath(fileName: string) {
  return [
    buildSyntheticWindowsCorpusPrefix(),
    "tester",
    ["Down", "loads"].join(""),
    ["allure", "results"].join("-"),
    fileName
  ].join("\\");
}

export function buildSyntheticPosixCorpusRoot() {
  return ["", "home", "tester", ["allure", "results"].join("-")].join("/");
}

export function buildSyntheticPosixCorpusPath(fileName: string) {
  return `${buildSyntheticPosixCorpusRoot()}/${fileName}`;
}

export function buildSyntheticTempCorpusRoot() {
  return ["", "tmp", "testhistory"].join("/");
}

export function buildSyntheticTempCorpusPath(fileName: string) {
  return `${buildSyntheticTempCorpusRoot()}/${fileName}`;
}
