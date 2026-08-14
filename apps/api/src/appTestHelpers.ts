import type { FastifyInstance } from "fastify";
import {
  createArtifactPreviewDescriptor,
  createArtifactPreviewDescriptorPersistenceRecord,
  type ArtifactDescriptor,
  type ArtifactPreviewDescriptorRetentionPolicyClass,
  type ArtifactResultStatus,
  type ArtifactRetentionClass
} from "@testhistory/artifacts";
import { expect } from "vitest";
import { createAppStore } from "./store.js";

type ProjectResponse = {
  id: string;
  key: string;
  name: string;
};

type LaunchResponse = {
  id: string;
  projectId: string;
  name: string;
  counters: Record<string, number>;
};

let projectSequence = 0;

export async function createProject(target: FastifyInstance): Promise<ProjectResponse> {
  projectSequence += 1;
  const response = await target.inject({
    method: "POST",
    url: "/api/v1/projects",
    payload: { key: `SHOP-${projectSequence}`, name: "Shop" }
  });

  expect(response.statusCode).toBe(201);
  return response.json<ProjectResponse>();
}

export async function createLaunch(target: FastifyInstance): Promise<LaunchResponse> {
  const project = await createProject(target);
  return createProjectLaunch(target, project.id, "Nightly");
}

export async function createProjectLaunch(
  target: FastifyInstance,
  projectId: string,
  name: string
): Promise<LaunchResponse> {
  const response = await target.inject({
    method: "POST",
    url: `/api/v1/projects/${projectId}/launches`,
    payload: { name }
  });

  expect(response.statusCode).toBe(201);
  return response.json<LaunchResponse>();
}

export function archiveJobReadSnapshot(store: ReturnType<typeof createAppStore>) {
  return Array.from(store.uploadJobs.values()).map((job) => ({
    id: job.id,
    launchId: job.launchId,
    status: job.status,
    receivedFiles: job.receivedFiles,
    importedResults: job.importedResults,
    duplicateResults: job.duplicateResults,
    storedArtifacts: job.storedArtifacts,
    errors: job.errors,
    archive: job.archive,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt
  }));
}

export function previewRetentionArtifact(input: {
  id: string;
  launchId: string;
  projectId: string;
  resultStatus: ArtifactResultStatus;
  retentionClass: ArtifactRetentionClass;
  retentionPolicyClass?: ArtifactPreviewDescriptorRetentionPolicyClass;
  retentionHorizonDays?: number;
  observedAt: string;
  content: string;
}): ArtifactDescriptor {
  const storageKey = `synthetic-preview-retention/${input.launchId}/${input.id}-retention-marker.txt`;
  const artifact: ArtifactDescriptor = {
    id: input.id,
    launchId: input.launchId,
    projectId: input.projectId,
    path: `synthetic://preview-retention/${input.id}-retention-marker.txt`,
    kind: "attachment",
    contentType: "text/plain",
    originalBytes: Buffer.byteLength(input.content, "utf8"),
    storedBytes: Buffer.byteLength(input.content, "utf8"),
    sha256: `${input.id}-preview-retention-secret-sha256`,
    compression: "none",
    compressionMetadata: {
      algorithm: "none",
      originalBytes: Buffer.byteLength(input.content, "utf8"),
      storedBytes: Buffer.byteLength(input.content, "utf8"),
      ratio: 1,
      savedBytes: 0
    },
    storage: {
      backend: "s3-compatible",
      accessTier: "frequent",
      diskIsolation: "separate-from-db",
      kubernetesVolume: "csi",
      key: storageKey as ArtifactDescriptor["storageKey"]
    },
    storageKey: storageKey as ArtifactDescriptor["storageKey"],
    expiresAt: "2026-05-08T00:00:00.000Z",
    retention: {
      days: 1,
      expiresAt: "2026-05-08T00:00:00.000Z",
      cleanupEligibleAt: "2026-05-09T00:00:00.000Z"
    },
    cleanup: {
      status: "eligible",
      reason: "retention-expired",
      evaluatedAt: "2026-05-30T00:00:00.000Z"
    },
    upload: {
      source: "result",
      resultStatus: input.resultStatus
    },
    createdAt: input.observedAt
  };
  const descriptor = createArtifactPreviewDescriptor({ artifact, content: input.content });
  const record = createArtifactPreviewDescriptorPersistenceRecord({
    descriptor,
    retentionClass: input.retentionClass,
    ...(input.retentionPolicyClass !== undefined
      ? { retentionPolicyClass: input.retentionPolicyClass }
      : {}),
    ...(input.retentionHorizonDays !== undefined
      ? { retentionHorizonDays: input.retentionHorizonDays }
      : {})
  });

  return {
    ...artifact,
    previewDescriptorRecord: record,
    previewDescriptorObservedAt: input.observedAt
  } as ArtifactDescriptor;
}

export function expectSafeArtifactMetadata(value: unknown, extraForbidden: string[] = []) {
  const serialized = JSON.stringify(value);
  for (const forbidden of [
    '"storageKey":',
    '"storageKeys":',
    "payload",
    '"content"',
    '"signedUrl":',
    "s3-compatible",
    "C:\\Users\\tester\\Downloads",
    ...extraForbidden
  ]) {
    expect(serialized).not.toContain(forbidden);
  }
}

export function expectSafeChunkedUploadReadModel(value: unknown) {
  const serialized = JSON.stringify(value);
  for (const forbidden of [
    "chunked-incomplete-body-token",
    "chunked-abort-token",
    "chunked-abort-storage",
    "chunked-path-secret",
    "chunked-chunk-path-secret",
    "C:\\",
    "Downloads",
    "object.test",
    "X-Amz-Signature",
    "signedUrl",
    "storageKey",
    "Bearer",
    '"content"',
    '"chunks"'
  ]) {
    expect(serialized).not.toContain(forbidden);
  }
}

export function expectPersistedInvariantNoLeakage(value: unknown) {
  const serialized = JSON.stringify(value);
  for (const forbidden of [
    "raw-compare-base-payload",
    "raw-compare-target-payload",
    "raw-history-payload",
    "cross-scope-raw-history",
    "empty-state-raw-history",
    "persisted-denied-token",
    "persisted-denied-storage",
    "cross-scope-token",
    "empty-state-token",
    "permission-persisted-denied-invariant",
    "permission-persisted-cross-scope",
    "permission-persisted-empty",
    "history-permission-audit-persisted-denied",
    "history-permission-audit-cross-scope",
    "history-permission-audit-persisted-empty",
    buildSyntheticWindowsDownloadRoot(),
    buildSyntheticPosixArtifactRoot(),
    "storage.example",
    "X-Amz-Signature",
    "storageKey",
    "Bearer"
  ]) {
    expect(serialized).not.toContain(forbidden);
  }
}

export function buildSyntheticWindowsDownloadRoot() {
  return ["C:", "Users", "tester", ["Down", "loads"].join("")].join("\\");
}

export function buildSyntheticPosixArtifactRoot() {
  return ["", "home", "tester", ["allure", "results"].join("-")].join("/");
}

export function buildSyntheticPosixArtifactPath(fileName: string) {
  return `${buildSyntheticPosixArtifactRoot()}/${fileName}`;
}
