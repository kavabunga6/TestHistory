import { describe, expect, it } from "vitest";
import {
  classifyArtifact,
  classifyArtifactPreviewDescriptorRetention,
  chooseArtifactCompressionStrategy,
  classifyArtifactRetentionClass,
  createAttachmentPreviewRetentionDryRunArtifactScheduleDescriptors,
  createAttachmentPreviewRetentionDryRunDescriptorEvidence,
  createArtifactPreviewDescriptor,
  createArtifactPreviewDescriptorPersistenceRecord,
  createArtifactStorageKey,
  createRetentionPlan,
  defaultArtifactPolicy,
  detectArtifactContentType,
  evaluateArtifactPreviewEligibility,
  executeArtifactCleanup,
  findDuplicateArtifactChecksums,
  isArtifactStorageKey,
  mapWithConcurrency,
  maxArtifactPreviewDescriptorPersistenceBytes,
  normalizeArtifactSourcePath,
  parseArtifactStorageKey,
  planArtifactDeletionBatches,
  planArtifactRetention,
  planArtifactRetentionDryRunBatches,
  prepareArtifact,
  readArtifactPreviewDescriptor,
  redactArtifactMetadataForLog,
  restoreArtifactPayload,
  serializeArtifactPreviewDescriptor,
  simulateArtifactCleanup,
  toArtifactDescriptor,
  type ArtifactObjectStorePort
} from "./index.js";
import {
  buildSyntheticPosixCorpusPath,
  buildSyntheticPosixCorpusRoot,
  buildSyntheticTempCorpusPath,
  buildSyntheticTempCorpusRoot,
  buildSyntheticWindowsCorpusPath,
  buildSyntheticWindowsCorpusPrefix,
  collectForbiddenPreviewFields,
  expectMaterializedRetentionDescriptorNoLeakage,
  policy
} from "./artifactTestFixtures.js";

describe("artifacts", () => {
  it("executes cleanup for closed launches with safe audit records and idempotent reruns", async () => {
    const first = prepareArtifact({
      launchId: "closed-secret-launch",
      path: "first-attachment.txt",
      content: "a".repeat(30),
      resultStatus: "passed",
      now: new Date("2026-01-01T00:00:00Z"),
      policy: { ...policy, retentionDays: 1, cleanupGraceDays: 1, compressionMinBytes: 10_000 }
    });
    const second = prepareArtifact({
      launchId: "closed-secret-launch",
      path: "second-attachment.txt",
      content: "b".repeat(50),
      resultStatus: "failed",
      now: new Date("2026-01-01T00:00:00Z"),
      policy: { ...policy, retentionDays: 1, cleanupGraceDays: 1, compressionMinBytes: 10_000 }
    });
    const third = prepareArtifact({
      launchId: "closed-secret-launch",
      path: "third-attachment.txt",
      content: "c".repeat(80),
      resultStatus: "failed",
      now: new Date("2026-01-01T00:00:00Z"),
      policy: { ...policy, retentionDays: 1, cleanupGraceDays: 1, compressionMinBytes: 10_000 }
    });
    const existingKeys = new Set([first.storageKey, second.storageKey, third.storageKey]);
    const deleteCalls: string[][] = [];
    const objectStore: Pick<ArtifactObjectStorePort, "deleteObjects"> = {
      async deleteObjects(keys) {
        deleteCalls.push([...keys]);
        const deleted = keys.filter((key) => existingKeys.delete(key));
        const missing = keys.filter((key) => !deleted.includes(key));
        return { deleted, missing };
      }
    };
    const input = {
      artifacts: [third, first, second],
      closedLaunchIds: ["closed-secret-launch"],
      objectStore,
      now: new Date("2026-01-04T00:00:00Z"),
      maxCount: 2,
      maxBytes: 100,
      intervalMinutes: 7
    };

    const firstRun = await executeArtifactCleanup(input);
    const secondRun = await executeArtifactCleanup(input);
    const serializedAudit = JSON.stringify([...firstRun.audit, ...secondRun.audit]);
    const serializedResult = JSON.stringify(firstRun);

    expect(firstRun.status).toBe("completed");
    expect(secondRun.status).toBe("completed");
    expect(secondRun.runId).toBe(firstRun.runId);
    expect(firstRun.deletedCount).toBe(3);
    expect(firstRun.missingCount).toBe(0);
    expect(secondRun.deletedCount).toBe(0);
    expect(secondRun.missingCount).toBe(3);
    expect(deleteCalls).toHaveLength(4);
    expect(firstRun.batches).toEqual([
      expect.objectContaining({
        index: 0,
        candidateCount: 1,
        totalBytes: 80,
        scheduledAfterMinutes: 0
      }),
      expect.objectContaining({
        index: 1,
        candidateCount: 2,
        totalBytes: 80,
        scheduledAfterMinutes: 7
      })
    ]);
    expect(firstRun.audit).toContainEqual(
      expect.objectContaining({
        action: "retention.preview",
        status: "planned",
        candidateCount: 3
      })
    );
    expect(firstRun.audit).toContainEqual(
      expect.objectContaining({
        action: "cleanup.batch.delete",
        status: "completed",
        batchIndex: 0,
        deletedCount: 1,
        missingCount: 0
      })
    );
    expect(serializedAudit).not.toContain("closed-secret-launch/attachment");
    expect(serializedResult).not.toContain("closed-secret-launch/attachment");
    expect(serializedResult).not.toContain("first-attachment.txt");
  });

  it("produces explicit no-op audit evidence for open launches without deleting", async () => {
    const openArtifact = prepareArtifact({
      launchId: "open-secret-launch",
      path: "open-attachment.txt",
      content: "synthetic",
      resultStatus: "failed",
      now: new Date("2026-01-01T00:00:00Z"),
      policy: { ...policy, retentionDays: 1, cleanupGraceDays: 1 }
    });
    const deleteCalls: string[][] = [];
    const objectStore: Pick<ArtifactObjectStorePort, "deleteObjects"> = {
      async deleteObjects(keys) {
        deleteCalls.push([...keys]);
        return { deleted: keys, missing: [] };
      }
    };

    const result = await executeArtifactCleanup({
      artifacts: [openArtifact],
      closedLaunchIds: [],
      objectStore,
      now: new Date("2026-01-04T00:00:00Z"),
      maxCount: 10,
      maxBytes: 1000
    });

    expect(result).toMatchObject({
      status: "noop",
      scannedArtifactCount: 1,
      stagedCandidateCount: 0,
      skippedOpenLaunchRecords: 1,
      deleteRequestedCount: 0,
      deletedCount: 0,
      missingCount: 0,
      noopReason: "open-launches-only"
    });
    expect(result.audit).toContainEqual(
      expect.objectContaining({
        action: "cleanup.noop",
        status: "noop",
        noopReason: "open-launches-only",
        skippedOpenLaunchRecords: 1
      })
    );
    expect(deleteCalls).toEqual([]);
    expect(JSON.stringify(result)).not.toContain("open-secret-launch/attachment");
  });

  it("returns retry-safe cleanup errors without leaking failed deletion targets", async () => {
    const artifact = prepareArtifact({
      launchId: "closed-secret-launch",
      path: "failed-attachment.txt",
      content: "synthetic",
      resultStatus: "failed",
      now: new Date("2026-01-01T00:00:00Z"),
      policy: { ...policy, retentionDays: 1, cleanupGraceDays: 1 }
    });
    const objectStore: Pick<ArtifactObjectStorePort, "deleteObjects"> = {
      async deleteObjects() {
        throw new Error(
          `delete failed for ${artifact.storageKey} via https://object.test/x?X-Amz-Signature=secret`
        );
      }
    };

    const result = await executeArtifactCleanup({
      artifacts: [artifact],
      closedLaunchIds: ["closed-secret-launch"],
      objectStore,
      now: new Date("2026-01-04T00:00:00Z"),
      maxCount: 10,
      maxBytes: 1000
    });
    const serialized = JSON.stringify(result);

    expect(result.status).toBe("failed");
    expect(result.failedBatchCount).toBe(1);
    expect(result.audit).toContainEqual(
      expect.objectContaining({
        action: "cleanup.batch.delete",
        status: "failed",
        error: {
          code: "object-store-delete-failed",
          name: "Error",
          message: "Artifact cleanup delete failed; retry the batch",
          retryable: true
        }
      })
    );
    expect(serialized).not.toContain("closed-secret-launch/attachment");
    expect(serialized).not.toContain("X-Amz-Signature");
  });

  it("runs bounded concurrent work and preserves result order", async () => {
    const results = await mapWithConcurrency([1, 2, 3, 4], 2, async (item) => item * 2);
    expect(results).toEqual([2, 4, 6, 8]);
  });
});
