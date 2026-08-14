import type { ArtifactCleanupExecutionResult, ArtifactStorageKey } from "@testhistory/artifacts";

import type { AppStore } from "../store.js";

export async function removeDeletedArtifactDescriptors(
  store: AppStore,
  deletedStorageKeys: ReadonlySet<ArtifactStorageKey>
): Promise<number> {
  let removed = 0;
  for (const artifact of store.artifacts.values()) {
    if (deletedStorageKeys.has(artifact.storage.key)) {
      store.artifacts.delete(artifact.id);
      if (store.driver === "postgres") {
        await store.repositories.artifacts.deleteById(artifact.id);
      }
      removed += 1;
    }
  }
  return removed;
}

export function serializeArtifactCleanupExecutionResult(
  result: ArtifactCleanupExecutionResult,
  options: { projectId?: string; removedDescriptorCount: number }
) {
  return {
    kind: "artifact-retention-cleanup-execution",
    projectId: options.projectId ?? null,
    runId: result.runId,
    status: result.status,
    scope: result.scope,
    dryRun: result.dryRun,
    scannedArtifactCount: result.scannedArtifactCount,
    stagedCandidateCount: result.stagedCandidateCount,
    skippedOpenLaunchRecords: result.skippedOpenLaunchRecords,
    retainedRecordCount: result.retainedRecordCount,
    deletionBatchCount: result.deletionBatchCount,
    deleteRequestedCount: result.deleteRequestedCount,
    deletedCount: result.deletedCount,
    missingCount: result.missingCount,
    failedBatchCount: result.failedBatchCount,
    totalCandidateBytes: result.totalCandidateBytes,
    ...(result.noopReason !== undefined ? { noopReason: result.noopReason } : {}),
    mutation: {
      descriptorRecordsRemoved: options.removedDescriptorCount,
      objectStoreDeleteExecuted: !result.dryRun,
      rawTargetsReturned: false,
      storageKeysReturned: false,
      signedUrlsReturned: false
    },
    batches: result.batches,
    audit: result.audit
  };
}
