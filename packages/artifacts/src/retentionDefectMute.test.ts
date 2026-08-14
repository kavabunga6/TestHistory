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
  it("guards materialized defect mute invariant evidence descriptors for retention-safe cleanup preview", () => {
    const defectPolicy = {
      ...policy,
      retentionDays: 1,
      cleanupGraceDays: 1,
      compressionMinBytes: 10_000
    };
    const closedLaunchIds = ["closed-defect-mute-invariant-launch"];
    const rawFailurePayloadMarker = "rawFailurePayload=synthetic-stack-and-assertion-body";
    const blobMarker = "blob:synthetic-defect-mute-invariant-payload";
    const storageRefMarker = ["storage", "://synthetic-defect-evidence/raw-event"].join("");
    const signedUrlMarker = "https://object.test/defect-evidence?X-Amz-Signature=synthetic";
    const tokenMarker = "token=synthetic-defect-mute-token";
    const deletionMarker = "deleteObjects would execute if this were not a descriptor preview";
    const localPathMarker = buildSyntheticWindowsCorpusPath("defect-mute-invariant.json");
    const eligibleArtifacts = [
      prepareArtifact({
        launchId: "closed-defect-mute-invariant-launch",
        projectId: "project-defect-mute-invariant",
        path: "defect-mute/materialized-replay-invariant-attachment.json",
        content: JSON.stringify({
          summary:
            "synthetic materialized defect mute invariant evidence descriptor keeps only metadata",
          rawFailurePayload: rawFailurePayloadMarker,
          blob: blobMarker,
          storageRef: storageRefMarker,
          signedUrl: signedUrlMarker,
          authorization: `Bearer ${tokenMarker}`,
          localPath: localPathMarker,
          deletionExecution: deletionMarker
        }),
        contentType: "application/json",
        resultStatus: "failed",
        now: new Date("2026-02-01T00:00:00Z"),
        policy: defectPolicy
      }),
      prepareArtifact({
        launchId: "closed-defect-mute-invariant-launch",
        projectId: "project-defect-mute-invariant",
        path: "defect-mute/materialized-append-only-invariant-attachment.log",
        content:
          "synthetic append-only defect invariant evidence includes providerMutationHandle=synthetic-delete and signedUrl=https://object.test/raw?token=synthetic-append-token",
        contentType: "text/plain",
        resultStatus: "broken",
        now: new Date("2026-02-01T00:00:00Z"),
        policy: defectPolicy
      }),
      prepareArtifact({
        launchId: "closed-defect-mute-invariant-launch",
        projectId: "project-defect-mute-invariant",
        path: "defect-mute/materialized-redaction-invariant-attachment.txt",
        content:
          "synthetic redaction defect invariant evidence hides C:\\synthetic\\raw-failure.txt and api_key=synthetic-defect-key",
        contentType: "text/plain",
        resultStatus: "unknown",
        now: new Date("2026-02-01T00:00:00Z"),
        policy: defectPolicy
      }),
      prepareArtifact({
        launchId: "closed-defect-mute-invariant-launch",
        projectId: "project-defect-mute-invariant",
        path: "defect-mute/materialized-over-limit-invariant-attachment.txt",
        content:
          "synthetic over-limit defect invariant evidence should be bounded by maxDescriptors",
        contentType: "text/plain",
        resultStatus: "failed",
        now: new Date("2026-02-01T00:00:00Z"),
        policy: defectPolicy
      })
    ];
    const openArtifact = prepareArtifact({
      launchId: "open-defect-mute-invariant-launch",
      projectId: "project-defect-mute-invariant",
      path: "defect-mute/open-raw-invariant-attachment.txt",
      content: `open launch raw defect evidence must stay out ${signedUrlMarker} ${tokenMarker}`,
      contentType: "text/plain",
      resultStatus: "failed",
      now: new Date("2026-02-01T00:00:00Z"),
      policy: defectPolicy
    });
    const retainedArtifact = prepareArtifact({
      launchId: "closed-defect-mute-invariant-launch",
      projectId: "project-defect-mute-invariant",
      path: "defect-mute/retained-raw-invariant-attachment.txt",
      content: `retained defect evidence must stay out ${storageRefMarker} ${tokenMarker}`,
      contentType: "text/plain",
      resultStatus: "broken",
      now: new Date("2026-02-03T12:00:00Z"),
      policy: defectPolicy
    });
    const nonAttachmentArtifact = prepareArtifact({
      launchId: "closed-defect-mute-invariant-launch",
      projectId: "project-defect-mute-invariant",
      path: "defect-mute/materialized-invariant-result.json",
      content: `{"message":"non attachment defect evidence must stay out","token":"synthetic-non-attachment-token"}`,
      contentType: "application/json",
      resultStatus: "failed",
      now: new Date("2026-02-01T00:00:00Z"),
      policy: defectPolicy
    });
    const artifacts = [
      eligibleArtifacts[2]!,
      openArtifact,
      eligibleArtifacts[0]!,
      retainedArtifact,
      eligibleArtifacts[3]!,
      nonAttachmentArtifact,
      eligibleArtifacts[1]!
    ];

    const evidence = createAttachmentPreviewRetentionDryRunDescriptorEvidence({
      artifacts,
      closedLaunchIds,
      now: new Date("2026-02-04T00:00:00Z"),
      maxDescriptors: 3,
      maxPreviewBytes: 64,
      retentionHorizonDays: 30
    });
    const replayEvidence = createAttachmentPreviewRetentionDryRunDescriptorEvidence({
      artifacts: [...artifacts].reverse(),
      closedLaunchIds: [...closedLaunchIds].reverse(),
      now: new Date("2026-02-04T00:00:00Z"),
      maxDescriptors: 3,
      maxPreviewBytes: 64,
      retentionHorizonDays: 30
    });
    const materialized = createAttachmentPreviewRetentionDryRunArtifactScheduleDescriptors({
      artifacts,
      closedLaunchIds,
      now: new Date("2026-02-04T00:00:00Z"),
      maxDescriptors: 3,
      maxPreviewBytes: 64,
      maxDescriptorsPerSchedule: 2,
      scheduleIntervalMinutes: 11,
      retentionHorizonDays: 30
    });
    const replayMaterialized = createAttachmentPreviewRetentionDryRunArtifactScheduleDescriptors({
      artifacts: [...artifacts].reverse(),
      closedLaunchIds: [...closedLaunchIds].reverse(),
      now: new Date("2026-02-04T00:00:00Z"),
      maxDescriptors: 3,
      maxPreviewBytes: 64,
      maxDescriptorsPerSchedule: 2,
      scheduleIntervalMinutes: 11,
      retentionHorizonDays: 30
    });

    expect(evidence).toEqual(replayEvidence);
    expect(materialized).toEqual(replayMaterialized);
    expect(evidence).toMatchObject({
      schema: "testhistory.attachment-preview-retention-dry-run-descriptor-evidence",
      scope: "closed-launches",
      artifactKind: "attachment",
      dryRun: true,
      executionMode: "dry-run",
      deletionExecution: false,
      scannedArtifactCount: 7,
      stagedCandidateCount: 4,
      descriptorCount: 3,
      skippedOpenLaunchRecords: 1,
      skippedNonAttachmentRecords: 1,
      retainedRecordCount: 1,
      descriptorLimit: 3,
      safety: {
        bounded: true,
        descriptorOnly: true,
        closedLaunchScope: true,
        pathIncluded: false,
        storageKeyIncluded: false,
        objectTargetIncluded: false,
        rawPayloadIncluded: false,
        blobIncluded: false,
        signedUrlIncluded: false,
        deletionExecution: false
      }
    });
    expect(materialized).toMatchObject({
      schema: "testhistory.attachment-preview-retention-dry-run-artifact-schedule-descriptors",
      dryRun: true,
      executionMode: "dry-run",
      mutationAllowed: false,
      descriptorCount: 3,
      scheduleDescriptorCount: 2,
      descriptorLimit: 3,
      scheduleDescriptorLimit: 2,
      scheduleIntervalMinutes: 11,
      safety: {
        bounded: true,
        descriptorOnly: true,
        closedLaunchScope: true,
        pathIncluded: false,
        storageKeyIncluded: false,
        objectTargetIncluded: false,
        providerMutationHandleIncluded: false,
        rawPayloadIncluded: false,
        blobIncluded: false,
        signedUrlIncluded: false,
        credentialIncluded: false,
        mutationAllowed: false
      }
    });
    expect(evidence.descriptors).toHaveLength(3);
    expect(evidence.descriptors.map((descriptor) => descriptor.retentionClass).sort()).toEqual([
      "failure-diagnostic",
      "failure-diagnostic",
      "unknown-diagnostic"
    ]);
    expect(
      evidence.descriptors.every(
        (descriptor) =>
          descriptor.descriptorRetention.retentionHorizonDays === 30 &&
          descriptor.descriptorRetention.auditReason === "evidence-preview-descriptor" &&
          descriptor.descriptorRetention.cleanupEligibility.eligible === true &&
          descriptor.descriptorRetention.cleanupEligibility.reason ===
            "evidence-retention-horizon-applies" &&
          descriptor.preview.previewBytes <= 64 &&
          descriptor.preview.maxPreviewBytes === 64 &&
          descriptor.safety.bounded &&
          descriptor.safety.descriptorOnly &&
          descriptor.safety.closedLaunchScope &&
          !descriptor.safety.rawPayloadIncluded &&
          !descriptor.safety.blobIncluded &&
          !descriptor.safety.storageKeyIncluded &&
          !descriptor.safety.signedUrlIncluded &&
          !descriptor.safety.deletionExecution
      )
    ).toBe(true);
    expect(materialized.schedules.map((schedule) => schedule.descriptorCount)).toEqual([2, 1]);
    expect(materialized.schedules.map((schedule) => schedule.scheduledAfterMinutes)).toEqual([
      0, 11
    ]);
    expect(materialized.schedules.flatMap((schedule) => schedule.descriptorDigests)).toEqual(
      [...materialized.schedules.flatMap((schedule) => schedule.descriptorDigests)].sort()
    );
    expect(materialized.totalDescriptorPreviewBytes).toBeLessThanOrEqual(3 * 64);
    expectMaterializedRetentionDescriptorNoLeakage(materialized, [
      "closed-defect-mute-invariant-launch",
      "open-defect-mute-invariant-launch",
      "project-defect-mute-invariant",
      "materialized-replay-invariant",
      "materialized-append-only-invariant",
      "materialized-redaction-invariant",
      "materialized-over-limit-invariant",
      "open-raw-invariant",
      "retained-raw-invariant",
      "materialized-invariant-result",
      "synthetic materialized defect mute invariant evidence descriptor keeps only metadata",
      rawFailurePayloadMarker,
      blobMarker,
      storageRefMarker,
      signedUrlMarker,
      tokenMarker,
      deletionMarker,
      localPathMarker,
      "providerMutationHandle=synthetic-delete",
      "synthetic-append-token",
      "synthetic-defect-key",
      "synthetic-non-attachment-token",
      ...eligibleArtifacts.map((artifact) => artifact.storageKey),
      openArtifact.storageKey,
      retainedArtifact.storageKey,
      nonAttachmentArtifact.storageKey
    ]);
  });
});
