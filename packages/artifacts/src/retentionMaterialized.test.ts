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
  collectForbiddenMaterializedRetentionDescriptorFields,
  collectForbiddenPreviewFields,
  expectMaterializedRetentionDescriptorNoLeakage,
  policy
} from "./artifactTestFixtures.js";

describe("artifacts", () => {
  it("keeps attachment preview retention schedule descriptors deterministic, scoped, and mutation-free", () => {
    const closedFirstAttachment = prepareArtifact({
      launchId: "closed-schedule-deterministic-launch",
      projectId: "project-schedule-deterministic",
      path: "preview/alpha-attachment.txt",
      content:
        "alpha preview contains C:\\synthetic\\private\\trace.txt and storage://bucket/raw-key",
      contentType: "text/plain",
      resultStatus: "passed",
      now: new Date("2026-01-01T00:00:00Z"),
      policy: { ...policy, retentionDays: 1, cleanupGraceDays: 1, compressionMinBytes: 10_000 }
    });
    const closedSecondAttachment = prepareArtifact({
      launchId: "closed-schedule-deterministic-launch",
      projectId: "project-schedule-deterministic",
      path: "preview/beta-attachment.log",
      content: "beta preview contains https://object.test/signed?token=synthetic-token",
      contentType: "text/plain",
      resultStatus: "broken",
      now: new Date("2026-01-01T00:00:00Z"),
      policy: { ...policy, retentionDays: 1, cleanupGraceDays: 1, compressionMinBytes: 10_000 }
    });
    const openAttachment = prepareArtifact({
      launchId: "open-schedule-deterministic-launch",
      projectId: "project-schedule-deterministic",
      path: "preview/open-attachment.txt",
      content: "open launch preview must stay out of schedule descriptors",
      contentType: "text/plain",
      resultStatus: "failed",
      now: new Date("2026-01-01T00:00:00Z"),
      policy: { ...policy, retentionDays: 1, cleanupGraceDays: 1, compressionMinBytes: 10_000 }
    });

    const firstSchedule = createAttachmentPreviewRetentionDryRunArtifactScheduleDescriptors({
      artifacts: [openAttachment, closedSecondAttachment, closedFirstAttachment],
      closedLaunchIds: [
        "closed-schedule-deterministic-launch",
        "closed-schedule-deterministic-launch"
      ],
      now: new Date("2026-01-04T00:00:00Z"),
      maxDescriptors: 10,
      maxPreviewBytes: 48,
      maxDescriptorsPerSchedule: 1,
      scheduleIntervalMinutes: 13
    });
    const replaySchedule = createAttachmentPreviewRetentionDryRunArtifactScheduleDescriptors({
      artifacts: [closedFirstAttachment, openAttachment, closedSecondAttachment],
      closedLaunchIds: [
        "closed-schedule-deterministic-launch",
        "closed-schedule-deterministic-launch"
      ],
      now: new Date("2026-01-04T00:00:00Z"),
      maxDescriptors: 10,
      maxPreviewBytes: 48,
      maxDescriptorsPerSchedule: 1,
      scheduleIntervalMinutes: 13
    });
    const serialized = JSON.stringify(firstSchedule);
    const scheduleLike = firstSchedule as Record<string, unknown>;
    const nestedSchedules = firstSchedule.schedules.map(
      (schedule) => schedule as Record<string, unknown>
    );

    expect(firstSchedule).toMatchObject({
      scope: "closed-launches",
      artifactKind: "attachment",
      dryRun: true,
      executionMode: "dry-run",
      mutationAllowed: false,
      scannedArtifactCount: 3,
      stagedCandidateCount: 2,
      descriptorCount: 2,
      scheduleDescriptorCount: 2,
      skippedOpenLaunchRecords: 1,
      skippedNonAttachmentRecords: 0,
      retainedRecordCount: 0,
      descriptorLimit: 10,
      scheduleDescriptorLimit: 1,
      scheduleIntervalMinutes: 13,
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
    expect(firstSchedule.scheduleDigest).toBe(replaySchedule.scheduleDigest);
    expect(firstSchedule.schedules.map((schedule) => schedule.scheduleDigest)).toEqual(
      replaySchedule.schedules.map((schedule) => schedule.scheduleDigest)
    );
    expect(firstSchedule.schedules.map((schedule) => schedule.scheduleRef)).toEqual(
      replaySchedule.schedules.map((schedule) => schedule.scheduleRef)
    );
    expect(firstSchedule.schedules.map((schedule) => schedule.scheduledAfterMinutes)).toEqual([
      0, 13
    ]);
    expect(firstSchedule.schedules.flatMap((schedule) => schedule.descriptorDigests)).toEqual(
      [...firstSchedule.schedules.flatMap((schedule) => schedule.descriptorDigests)].sort()
    );
    expect(scheduleLike.deletionExecution).toBeUndefined();
    expect(nestedSchedules.every((schedule) => schedule.deletionExecution === undefined)).toBe(
      true
    );
    expect(nestedSchedules.every((schedule) => schedule.mutationAllowed === false)).toBe(true);
    expect(collectForbiddenPreviewFields(firstSchedule)).toEqual([]);
    expect(serialized).not.toContain("deletionExecution");
    expect(serialized).not.toContain("deleteObjects");
    expect(serialized).not.toContain("closed-schedule-deterministic-launch");
    expect(serialized).not.toContain("open-schedule-deterministic-launch");
    expect(serialized).not.toContain("project-schedule-deterministic");
    expect(serialized).not.toContain("alpha-attachment");
    expect(serialized).not.toContain("beta-attachment");
    expect(serialized).not.toContain("open-attachment");
    expect(serialized).not.toContain("C:\\synthetic");
    expect(serialized).not.toContain("storage://bucket");
    expect(serialized).not.toContain("raw-key");
    expect(serialized).not.toContain("object.test");
    expect(serialized).not.toContain("token=synthetic-token");
    expect(serialized).not.toContain(closedFirstAttachment.storageKey);
    expect(serialized).not.toContain(closedSecondAttachment.storageKey);
    expect(serialized).not.toContain(openAttachment.storageKey);
  });

  it("guards materialized attachment preview retention descriptors as bounded redacted records", () => {
    const closedFirstAttachment = prepareArtifact({
      launchId: "closed-materialized-retention-launch",
      projectId: "project-materialized-retention",
      path: "retention/materialized-alpha-descriptor-attachment.txt",
      content:
        "alpha materialized preview carries materialized-source-path and materialized-storage-marker",
      contentType: "text/plain",
      resultStatus: "passed",
      now: new Date("2026-01-01T00:00:00Z"),
      policy: { ...policy, retentionDays: 1, cleanupGraceDays: 1, compressionMinBytes: 10_000 }
    });
    const closedSecondAttachment = prepareArtifact({
      launchId: "closed-materialized-retention-launch",
      projectId: "project-materialized-retention",
      path: "retention/materialized-beta-descriptor-attachment.log",
      content:
        "beta materialized preview carries materialized-signed-url-marker and provider mutation text",
      contentType: "text/plain",
      resultStatus: "failed",
      now: new Date("2026-01-01T00:00:00Z"),
      policy: { ...policy, retentionDays: 1, cleanupGraceDays: 1, compressionMinBytes: 10_000 }
    });
    const openAttachment = prepareArtifact({
      launchId: "open-materialized-retention-launch",
      projectId: "project-materialized-retention",
      path: "retention/materialized-open-descriptor-attachment.txt",
      content: "open materialized descriptor must stay outside closed-launch retention records",
      contentType: "text/plain",
      resultStatus: "broken",
      now: new Date("2026-01-01T00:00:00Z"),
      policy: { ...policy, retentionDays: 1, cleanupGraceDays: 1, compressionMinBytes: 10_000 }
    });

    const schedule = createAttachmentPreviewRetentionDryRunArtifactScheduleDescriptors({
      artifacts: [openAttachment, closedSecondAttachment, closedFirstAttachment],
      closedLaunchIds: ["closed-materialized-retention-launch"],
      now: new Date("2026-01-04T00:00:00Z"),
      maxDescriptors: 2,
      maxPreviewBytes: 72,
      maxDescriptorsPerSchedule: 1,
      scheduleIntervalMinutes: 17
    });
    const materialized = JSON.parse(JSON.stringify(schedule)) as typeof schedule;
    const serialized = JSON.stringify(materialized);

    expect(materialized).toMatchObject({
      schema: "testhistory.attachment-preview-retention-dry-run-artifact-schedule-descriptors",
      scope: "closed-launches",
      artifactKind: "attachment",
      dryRun: true,
      executionMode: "dry-run",
      mutationAllowed: false,
      scannedArtifactCount: 3,
      stagedCandidateCount: 2,
      descriptorCount: 2,
      scheduleDescriptorCount: 2,
      skippedOpenLaunchRecords: 1,
      skippedNonAttachmentRecords: 0,
      retainedRecordCount: 0,
      descriptorLimit: 2,
      scheduleDescriptorLimit: 1,
      scheduleIntervalMinutes: 17,
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
    expect(materialized.scheduleDescriptorCount).toBeLessThanOrEqual(materialized.descriptorLimit);
    expect(materialized.schedules).toHaveLength(materialized.scheduleDescriptorCount);
    expect(materialized.schedules).toEqual([
      expect.objectContaining({
        index: 0,
        scheduledAfterMinutes: 0,
        descriptorCount: 1,
        maxDescriptors: 1,
        dryRun: true,
        executionMode: "dry-run",
        mutationAllowed: false,
        scheduleRef: expect.stringMatching(/^artifact-preview-retention-schedule:[0-9a-f]{24}$/),
        descriptorRefs: [
          expect.stringMatching(/^artifact-preview-retention-descriptor:[0-9a-f]{24}$/)
        ],
        descriptorDigests: [expect.stringMatching(/^[0-9a-f]{24}$/)],
        safety: expect.objectContaining({
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
        })
      }),
      expect.objectContaining({
        index: 1,
        scheduledAfterMinutes: 17,
        descriptorCount: 1,
        maxDescriptors: 1
      })
    ]);
    expect(materialized.schedules.flatMap((descriptor) => descriptor.descriptorDigests)).toEqual(
      [...materialized.schedules.flatMap((descriptor) => descriptor.descriptorDigests)].sort()
    );
    expect(collectForbiddenMaterializedRetentionDescriptorFields(materialized)).toEqual([]);
    expect(serialized).not.toContain("closed-materialized-retention-launch");
    expect(serialized).not.toContain("open-materialized-retention-launch");
    expect(serialized).not.toContain("project-materialized-retention");
    expect(serialized).not.toContain("materialized-alpha-descriptor");
    expect(serialized).not.toContain("materialized-beta-descriptor");
    expect(serialized).not.toContain("materialized-open-descriptor");
    expect(serialized).not.toContain("materialized-source-path");
    expect(serialized).not.toContain("materialized-storage-marker");
    expect(serialized).not.toContain("materialized-signed-url-marker");
    expect(serialized).not.toContain("provider mutation text");
  });

  it("guards materialized attachment preview retention descriptors with a synthetic redaction corpus", () => {
    const windowsCorpusPath = buildSyntheticWindowsCorpusPath("raw.txt");
    const posixCorpusPath = buildSyntheticPosixCorpusPath("raw.xml");
    const retainedCorpusPath = buildSyntheticTempCorpusPath("raw-retained.txt");
    const corpusPolicy = {
      ...policy,
      retentionDays: 1,
      cleanupGraceDays: 1,
      compressionMinBytes: 10_000
    };
    const closedLaunchIds = ["closed-corpus-launch-a", "closed-corpus-launch-b"];
    const closedEligibleArtifacts = [
      prepareArtifact({
        launchId: "closed-corpus-launch-a",
        projectId: "project-corpus-secret",
        path: "corpus/text-token-attachment.txt",
        content: `text corpus ${windowsCorpusPath} token=corpus-token deleteObjects would run`,
        contentType: "text/plain",
        resultStatus: "passed",
        now: new Date("2026-01-01T00:00:00Z"),
        policy: corpusPolicy
      }),
      prepareArtifact({
        launchId: "closed-corpus-launch-a",
        projectId: "project-corpus-secret",
        path: "corpus/json-storage-attachment.json",
        content:
          '{"message":"bounded descriptor preview keeps later object references outside the body with deterministic padding before sensitive fields are encountered in source content","storageKey":"closed-corpus-launch-a/attachment/corpus-storage-ref","signedUrl":"https://object.test/blob?X-Amz-Signature=corpus-signature","password":"corpus-password","deletionExecution":true}',
        contentType: "application/json",
        resultStatus: "failed",
        now: new Date("2026-01-01T00:00:00Z"),
        policy: corpusPolicy
      }),
      prepareArtifact({
        launchId: "closed-corpus-launch-b",
        projectId: "project-corpus-secret",
        path: "corpus/xml-signed-attachment.xml",
        content: `<root path="${posixCorpusPath}" authorization="Bearer corpus-bearer" signedUrl="https://object.test/xml?token=corpus-url-token" />`,
        contentType: "application/xml",
        resultStatus: "broken",
        now: new Date("2026-01-01T00:00:00Z"),
        policy: corpusPolicy
      }),
      prepareArtifact({
        launchId: "closed-corpus-launch-b",
        projectId: "project-corpus-secret",
        path: "corpus/html-cookie-attachment.html",
        content:
          '<a href="https://object.test/html?secret=corpus-secret">cookie=session=corpus-cookie</a>',
        contentType: "text/html",
        resultStatus: "skipped",
        now: new Date("2026-01-01T00:00:00Z"),
        policy: corpusPolicy
      }),
      prepareArtifact({
        launchId: "closed-corpus-launch-b",
        projectId: "project-corpus-secret",
        path: "corpus/image-preview-attachment.png",
        content: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        contentType: "image/png",
        resultStatus: "unknown",
        now: new Date("2026-01-01T00:00:00Z"),
        policy: corpusPolicy
      })
    ];
    const openAttachment = prepareArtifact({
      launchId: "open-corpus-launch",
      projectId: "project-corpus-secret",
      path: "corpus/open-leaky-attachment.txt",
      content:
        "open corpus D:\\private\\raw-open.txt https://object.test/open?X-Amz-Signature=open-signature token=open-token",
      contentType: "text/plain",
      resultStatus: "failed",
      now: new Date("2026-01-01T00:00:00Z"),
      policy: corpusPolicy
    });
    const retainedAttachment = prepareArtifact({
      launchId: "closed-corpus-launch-a",
      projectId: "project-corpus-secret",
      path: "corpus/retained-leaky-attachment.txt",
      content: `retained corpus must not materialize ${retainedCorpusPath} token=retained-token`,
      contentType: "text/plain",
      resultStatus: "passed",
      now: new Date("2026-01-03T00:00:00Z"),
      policy: corpusPolicy
    });
    const nonAttachment = prepareArtifact({
      launchId: "closed-corpus-launch-a",
      projectId: "project-corpus-secret",
      path: "corpus-result.json",
      content: '{"message":"non attachment body must stay out","token":"non-attachment-token"}',
      contentType: "application/json",
      resultStatus: "failed",
      now: new Date("2026-01-01T00:00:00Z"),
      policy: corpusPolicy
    });
    const artifacts = [
      openAttachment,
      closedEligibleArtifacts[3]!,
      nonAttachment,
      closedEligibleArtifacts[1]!,
      retainedAttachment,
      closedEligibleArtifacts[4]!,
      closedEligibleArtifacts[0]!,
      closedEligibleArtifacts[2]!
    ];

    const firstSchedule = createAttachmentPreviewRetentionDryRunArtifactScheduleDescriptors({
      artifacts,
      closedLaunchIds,
      now: new Date("2026-01-04T00:00:00Z"),
      maxDescriptors: 5,
      maxPreviewBytes: 96,
      maxDescriptorsPerSchedule: 2,
      scheduleIntervalMinutes: 19,
      retentionHorizonDays: 14
    });
    const replaySchedule = createAttachmentPreviewRetentionDryRunArtifactScheduleDescriptors({
      artifacts: [...artifacts].reverse(),
      closedLaunchIds: [...closedLaunchIds].reverse(),
      now: new Date("2026-01-04T00:00:00Z"),
      maxDescriptors: 5,
      maxPreviewBytes: 96,
      maxDescriptorsPerSchedule: 2,
      scheduleIntervalMinutes: 19,
      retentionHorizonDays: 14
    });
    const materialized = JSON.parse(JSON.stringify(firstSchedule)) as typeof firstSchedule;

    expect(materialized).toEqual(replaySchedule);
    expect(materialized).toMatchObject({
      schema: "testhistory.attachment-preview-retention-dry-run-artifact-schedule-descriptors",
      scope: "closed-launches",
      artifactKind: "attachment",
      dryRun: true,
      executionMode: "dry-run",
      mutationAllowed: false,
      scannedArtifactCount: 8,
      stagedCandidateCount: 5,
      descriptorCount: 5,
      scheduleDescriptorCount: 3,
      skippedOpenLaunchRecords: 1,
      skippedNonAttachmentRecords: 1,
      retainedRecordCount: 1,
      descriptorLimit: 5,
      scheduleDescriptorLimit: 2,
      scheduleIntervalMinutes: 19,
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
    expect(materialized.scheduleDescriptorCount).toBeLessThanOrEqual(
      Math.ceil(materialized.descriptorLimit / materialized.scheduleDescriptorLimit)
    );
    expect(materialized.schedules.map((schedule) => schedule.descriptorCount)).toEqual([2, 2, 1]);
    expect(materialized.schedules.every((schedule) => schedule.descriptorCount <= 2)).toBe(true);
    expect(materialized.schedules.map((schedule) => schedule.scheduledAfterMinutes)).toEqual([
      0, 19, 38
    ]);
    expect(materialized.schedules.flatMap((schedule) => schedule.descriptorDigests)).toEqual(
      [...materialized.schedules.flatMap((schedule) => schedule.descriptorDigests)].sort()
    );
    expect(materialized.totalDescriptorPreviewBytes).toBeLessThanOrEqual(5 * 96);

    const evidence = createAttachmentPreviewRetentionDryRunDescriptorEvidence({
      artifacts,
      closedLaunchIds,
      now: new Date("2026-01-04T00:00:00Z"),
      maxDescriptors: 5,
      maxPreviewBytes: 96,
      retentionHorizonDays: 14
    });
    expect(evidence.descriptors).toHaveLength(5);
    expect(evidence.descriptors.map((descriptor) => descriptor.retentionClass).sort()).toEqual([
      "failure-diagnostic",
      "failure-diagnostic",
      "passed-short",
      "skipped-short",
      "unknown-diagnostic"
    ]);
    expect(evidence.descriptors.map((descriptor) => descriptor.preview.contentType).sort()).toEqual(
      ["application/json", "application/xml", "image/png", "text/html", "text/plain"]
    );
    expect(
      evidence.descriptors.every(
        (descriptor) =>
          descriptor.preview.previewBytes <= descriptor.preview.maxPreviewBytes &&
          descriptor.preview.maxPreviewBytes === 96
      )
    ).toBe(true);
    expect(evidence.descriptors.every((descriptor) => descriptor.safety.closedLaunchScope)).toBe(
      true
    );

    expectMaterializedRetentionDescriptorNoLeakage(materialized, [
      "closed-corpus-launch-a",
      "closed-corpus-launch-b",
      "open-corpus-launch",
      "project-corpus-secret",
      "text-token-attachment",
      "json-storage-attachment",
      "xml-signed-attachment",
      "html-cookie-attachment",
      "image-preview-attachment",
      "open-leaky-attachment",
      "retained-leaky-attachment",
      "corpus-result",
      buildSyntheticWindowsCorpusPrefix(),
      "D:\\private",
      buildSyntheticPosixCorpusRoot(),
      buildSyntheticTempCorpusRoot(),
      ["allure", "results"].join("-"),
      "object.test",
      "X-Amz-Signature",
      "corpus-signature",
      "corpus-token",
      "corpus-password",
      "corpus-bearer",
      "corpus-url-token",
      "corpus-secret",
      "corpus-cookie",
      "open-signature",
      "open-token",
      "retained-token",
      "non-attachment-token",
      "raw-open",
      "raw-retained",
      ...closedEligibleArtifacts.map((artifact) => artifact.storageKey),
      openAttachment.storageKey,
      retainedAttachment.storageKey,
      nonAttachment.storageKey
    ]);
  });
});
