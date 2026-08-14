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
  it("indexes compressed materialized attachment preview retention descriptors without raw blobs", () => {
    const corpusPath = buildSyntheticWindowsCorpusPath("compressed-raw.txt");
    const compressedPolicy = {
      ...policy,
      retentionDays: 1,
      cleanupGraceDays: 1,
      compressionMinBytes: 1
    };
    const syntheticToken = ["token", "compressed-corpus-token"].join("=");
    const syntheticSignatureUrl = [
      "https://object.test/compressed",
      ["X-Amz", "Signature"].join("-"),
      "compressed-signature"
    ].join("?");
    const syntheticStorageRef = ["storage", "://compressed-bucket/raw-object"].join("");
    const syntheticDeleteObjectsMarker = ["delete", "Objects"].join("");
    const syntheticSecretUrlField = ["signed", "Url"].join("");
    const syntheticJsonTokenUrl = [
      "https://object.test/json",
      ["token", "compressed-json-token"].join("=")
    ].join("?");
    const largeCompressibleBody = [
      "compressed descriptor preview keeps only index metadata",
      corpusPath,
      syntheticToken,
      syntheticSignatureUrl,
      syntheticStorageRef,
      `${syntheticDeleteObjectsMarker} should never be represented`
    ].join(" ");
    const closedPassed = prepareArtifact({
      launchId: "closed-compressed-index-launch-a",
      projectId: "project-compressed-index-secret",
      path: "compressed/passed-attachment.txt",
      content: `${largeCompressibleBody} ${"alpha ".repeat(128)}`,
      contentType: "text/plain",
      resultStatus: "passed",
      now: new Date("2026-01-01T00:00:00Z"),
      policy: compressedPolicy
    });
    const closedFailed = prepareArtifact({
      launchId: "closed-compressed-index-launch-a",
      projectId: "project-compressed-index-secret",
      path: "compressed/failed-attachment.log",
      content: `${largeCompressibleBody} ${"failure ".repeat(128)}`,
      contentType: "text/plain",
      resultStatus: "failed",
      now: new Date("2026-01-01T00:00:00Z"),
      policy: compressedPolicy
    });
    const closedBroken = prepareArtifact({
      launchId: "closed-compressed-index-launch-b",
      projectId: "project-compressed-index-secret",
      path: "compressed/broken-attachment.json",
      content: JSON.stringify({
        message: `${largeCompressibleBody} ${"broken ".repeat(128)}`,
        [syntheticSecretUrlField]: syntheticJsonTokenUrl
      }),
      contentType: "application/json",
      resultStatus: "broken",
      now: new Date("2026-01-01T00:00:00Z"),
      policy: compressedPolicy
    });
    const closedSkipped = prepareArtifact({
      launchId: "closed-compressed-index-launch-b",
      projectId: "project-compressed-index-secret",
      path: "compressed/skipped-attachment.xml",
      content: `<root>${largeCompressibleBody} ${"skipped ".repeat(128)}</root>`,
      contentType: "application/xml",
      resultStatus: "skipped",
      now: new Date("2026-01-01T00:00:00Z"),
      policy: compressedPolicy
    });
    const retainedAttachment = prepareArtifact({
      launchId: "closed-compressed-index-launch-a",
      projectId: "project-compressed-index-secret",
      path: "compressed/retained-attachment.txt",
      content: `${largeCompressibleBody} retained`,
      contentType: "text/plain",
      resultStatus: "failed",
      now: new Date("2026-01-03T00:00:00Z"),
      policy: compressedPolicy
    });
    const openAttachment = prepareArtifact({
      launchId: "open-compressed-index-launch",
      projectId: "project-compressed-index-secret",
      path: "compressed/open-attachment.txt",
      content: `${largeCompressibleBody} open`,
      contentType: "text/plain",
      resultStatus: "failed",
      now: new Date("2026-01-01T00:00:00Z"),
      policy: compressedPolicy
    });
    const nonAttachment = prepareArtifact({
      launchId: "closed-compressed-index-launch-a",
      projectId: "project-compressed-index-secret",
      path: "compressed-result.json",
      content: `${largeCompressibleBody} non attachment`,
      contentType: "application/json",
      resultStatus: "failed",
      now: new Date("2026-01-01T00:00:00Z"),
      policy: compressedPolicy
    });
    const artifacts = [
      retainedAttachment,
      closedSkipped,
      openAttachment,
      closedFailed,
      nonAttachment,
      closedPassed,
      closedBroken
    ];

    expect(
      [closedPassed, closedFailed, closedBroken, closedSkipped].map(
        (artifact) => artifact.compression
      )
    ).toEqual(["gzip", "gzip", "gzip", "gzip"]);

    const firstSchedule = createAttachmentPreviewRetentionDryRunArtifactScheduleDescriptors({
      artifacts,
      closedLaunchIds: ["closed-compressed-index-launch-a", "closed-compressed-index-launch-b"],
      now: new Date("2026-01-04T00:00:00Z"),
      maxDescriptors: 4,
      maxPreviewBytes: 40,
      maxDescriptorsPerSchedule: 2,
      scheduleIntervalMinutes: 23,
      retentionHorizonDays: 21
    });
    const replaySchedule = createAttachmentPreviewRetentionDryRunArtifactScheduleDescriptors({
      artifacts: [...artifacts].reverse(),
      closedLaunchIds: ["closed-compressed-index-launch-b", "closed-compressed-index-launch-a"],
      now: new Date("2026-01-04T00:00:00Z"),
      maxDescriptors: 4,
      maxPreviewBytes: 40,
      maxDescriptorsPerSchedule: 2,
      scheduleIntervalMinutes: 23,
      retentionHorizonDays: 21
    });
    const evidence = createAttachmentPreviewRetentionDryRunDescriptorEvidence({
      artifacts,
      closedLaunchIds: ["closed-compressed-index-launch-a", "closed-compressed-index-launch-b"],
      now: new Date("2026-01-04T00:00:00Z"),
      maxDescriptors: 4,
      maxPreviewBytes: 40,
      retentionHorizonDays: 21
    });
    const materialized = JSON.parse(JSON.stringify(firstSchedule)) as typeof firstSchedule;
    const descriptorIndex = materialized.schedules.flatMap((schedule) =>
      schedule.descriptorRefs.map((descriptorRef, index) => ({
        descriptorRef,
        descriptorDigest: schedule.descriptorDigests[index],
        scheduleRef: schedule.scheduleRef
      }))
    );

    expect(materialized).toEqual(replaySchedule);
    expect(materialized).toMatchObject({
      schema: "testhistory.attachment-preview-retention-dry-run-artifact-schedule-descriptors",
      scope: "closed-launches",
      artifactKind: "attachment",
      dryRun: true,
      executionMode: "dry-run",
      mutationAllowed: false,
      scannedArtifactCount: 7,
      stagedCandidateCount: 4,
      descriptorCount: 4,
      scheduleDescriptorCount: 2,
      skippedOpenLaunchRecords: 1,
      skippedNonAttachmentRecords: 1,
      retainedRecordCount: 1,
      descriptorLimit: 4,
      scheduleDescriptorLimit: 2,
      scheduleIntervalMinutes: 23,
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
        credentialIncluded: false,
        mutationAllowed: false
      }
    });
    expect(descriptorIndex).toHaveLength(4);
    expect(materialized.schedules.map((schedule) => schedule.descriptorCount)).toEqual([2, 2]);
    expect(materialized.schedules.map((schedule) => schedule.scheduledAfterMinutes)).toEqual([
      0, 23
    ]);
    expect(materialized.schedules.every((schedule) => schedule.totalPreviewBytes <= 2 * 40)).toBe(
      true
    );
    expect(materialized.totalDescriptorPreviewBytes).toBeLessThanOrEqual(4 * 40);
    expect(evidence.descriptors.map((descriptor) => descriptor.retentionClass).sort()).toEqual([
      "failure-diagnostic",
      "failure-diagnostic",
      "passed-short",
      "skipped-short"
    ]);
    expect(
      evidence.descriptors.every(
        (descriptor) =>
          descriptor.descriptorRetention.retentionHorizonDays === 21 &&
          descriptor.preview.previewBytes <= 40 &&
          descriptor.preview.maxPreviewBytes === 40
      )
    ).toBe(true);

    expectMaterializedRetentionDescriptorNoLeakage(materialized, [
      "closed-compressed-index-launch-a",
      "closed-compressed-index-launch-b",
      "open-compressed-index-launch",
      "project-compressed-index-secret",
      "passed-attachment",
      "failed-attachment",
      "broken-attachment",
      "skipped-attachment",
      "retained-attachment",
      "open-attachment",
      "compressed-result",
      corpusPath,
      buildSyntheticWindowsCorpusPrefix(),
      ["allure", "results"].join("-"),
      "compressed descriptor preview keeps only index metadata",
      "compressed-corpus-token",
      "compressed-signature",
      "compressed-json-token",
      "object.test",
      ["storage", "://compressed-bucket"].join(""),
      "raw-object",
      syntheticDeleteObjectsMarker,
      ...artifacts.map((artifact) => artifact.storageKey)
    ]);
  });

  it("keeps descriptor evidence compatible with preview retention classification", () => {
    const passedAttachment = prepareArtifact({
      launchId: "classification-launch",
      path: "passed-attachment.txt",
      content: "short lived preview",
      contentType: "text/plain",
      resultStatus: "passed",
      now: new Date("2026-01-01T00:00:00Z"),
      policy: { ...policy, retentionDays: 1, cleanupGraceDays: 1, compressionMinBytes: 10_000 }
    });
    const brokenAttachment = prepareArtifact({
      launchId: "classification-launch",
      path: "broken-attachment.txt",
      content: "diagnostic preview",
      contentType: "text/plain",
      resultStatus: "broken",
      now: new Date("2026-01-01T00:00:00Z"),
      policy: { ...policy, retentionDays: 1, cleanupGraceDays: 1, compressionMinBytes: 10_000 }
    });

    const evidence = createAttachmentPreviewRetentionDryRunDescriptorEvidence({
      artifacts: [brokenAttachment, passedAttachment],
      closedLaunchIds: ["classification-launch"],
      now: new Date("2026-01-04T00:00:00Z"),
      maxDescriptors: 10
    });
    const byStatus = new Map(
      evidence.descriptors.map((descriptor) => [descriptor.resultStatus, descriptor])
    );

    expect(byStatus.get("passed")?.retentionClass).toBe(classifyArtifactRetentionClass("passed"));
    expect(byStatus.get("passed")?.descriptorRetention).toMatchObject({
      policyClass: "short-lived-preview",
      retentionClass: "passed-short",
      cleanupEligibility: {
        eligible: true,
        reason: "preview-retention-horizon-applies"
      },
      auditReason: "short-lived-preview-descriptor"
    });
    expect(byStatus.get("broken")?.retentionClass).toBe(classifyArtifactRetentionClass("broken"));
    expect(byStatus.get("broken")?.descriptorRetention).toMatchObject({
      policyClass: "evidence-retained",
      retentionClass: "failure-diagnostic",
      cleanupEligibility: {
        eligible: true,
        reason: "evidence-retention-horizon-applies"
      },
      auditReason: "evidence-preview-descriptor"
    });
  });
});
