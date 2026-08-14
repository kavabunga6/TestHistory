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
  it("normalizes upload policy defaults from env", () => {
    const parsed = defaultArtifactPolicy({
      ARTIFACT_CLEANUP_BATCH_SIZE: "250",
      ARTIFACT_CLEANUP_BATCH_INTERVAL_MINUTES: "3",
      UPLOAD_METADATA_SOURCE: "test-case"
    });

    expect(parsed.cleanupBatchSize).toBe(250);
    expect(parsed.cleanupBatchIntervalMinutes).toBe(3);
    expect(parsed.metadataSource).toBe("test-case");
  });

  it("builds retention plans", () => {
    const expired = prepareArtifact({
      launchId: "launch-1",
      path: "old-result.json",
      content: "{}",
      now: new Date("2026-01-01T00:00:00Z"),
      policy
    });
    const retained = prepareArtifact({
      launchId: "launch-1",
      path: "new-result.json",
      content: "{}",
      now: new Date("2026-01-03T00:00:00Z"),
      policy: { ...policy, retentionDays: 10 }
    });

    const plan = createRetentionPlan([expired, retained], new Date("2026-01-04T00:00:00Z"));
    expect(plan.expired.map((item) => item.path)).toEqual(["old-result.json"]);
    expect(plan.retained.map((item) => item.path)).toEqual(["new-result.json"]);
  });

  it("simulates cleanup only for closed launches and creates delete batches", () => {
    const oldPassedAttachment = prepareArtifact({
      launchId: "closed-1",
      projectId: "project-1",
      path: "passed-attachment.txt",
      content: "attachment",
      resultStatus: "passed",
      now: new Date("2026-01-01T00:00:00Z"),
      policy
    });
    const oldFixture = prepareArtifact({
      launchId: "closed-1",
      projectId: "project-1",
      path: "fixtures/setup.json",
      content: "{}",
      resultStatus: "failed",
      now: new Date("2025-12-01T00:00:00Z"),
      policy
    });
    const projectSpecificAttachment = prepareArtifact({
      launchId: "closed-1",
      projectId: "project-1",
      path: "failed-attachment.txt",
      content: "attachment",
      resultStatus: "failed",
      now: new Date("2026-01-09T00:00:00Z"),
      policy
    });
    const openLaunchAttachment = prepareArtifact({
      launchId: "open-1",
      projectId: "project-1",
      path: "open-attachment.txt",
      content: "attachment",
      resultStatus: "passed",
      now: new Date("2026-01-01T00:00:00Z"),
      policy
    });

    const simulation = simulateArtifactCleanup({
      artifacts: [oldPassedAttachment, oldFixture, projectSpecificAttachment, openLaunchAttachment],
      closedLaunchIds: ["closed-1"],
      now: new Date("2026-01-10T00:00:00Z"),
      policy: { ...policy, cleanupBatchSize: 1, cleanupBatchIntervalMinutes: 5 },
      projectRules: {
        "project-1": [
          {
            id: "project-failed-attachments-12h",
            kinds: ["attachment"],
            statuses: ["failed"],
            maxAgeHours: 12
          }
        ]
      }
    });

    expect(simulation.query).toEqual(
      expect.objectContaining({
        scope: "closed-launches",
        scannedRecords: 4,
        eligibleRecords: 3,
        skippedOpenLaunchRecords: 1,
        batchSize: 1,
        batchIntervalMinutes: 5,
        globalRuleCount: 3,
        projectRuleCount: 1
      })
    );
    expect(simulation.eligible.map((item) => item.rule.id)).toEqual([
      "passed-attachments-168h",
      "scenarios-fixtures-720h",
      "project-failed-attachments-12h"
    ]);
    expect(simulation.batches).toEqual([
      expect.objectContaining({ index: 0, size: 1, scheduledAfterMinutes: 0 }),
      expect.objectContaining({ index: 1, size: 1, scheduledAfterMinutes: 5 }),
      expect.objectContaining({ index: 2, size: 1, scheduledAfterMinutes: 10 })
    ]);
  });

  it("stages retention candidates only for closed launches without sensitive source metadata", () => {
    const sensitivePath = "private-workstation/synthetic-allure-results/secret-attachment.txt";
    const closedPassed = prepareArtifact({
      launchId: "closed-1",
      projectId: "project-1",
      path: sensitivePath,
      content: "safe synthetic content",
      resultStatus: "passed",
      now: new Date("2026-01-01T00:00:00Z"),
      policy: { ...policy, retentionDays: 1, cleanupGraceDays: 1 }
    });
    const openFailed = prepareArtifact({
      launchId: "open-1",
      projectId: "project-1",
      path: "failed-attachment.txt",
      content: "safe synthetic content",
      resultStatus: "failed",
      now: new Date("2026-01-01T00:00:00Z"),
      policy: { ...policy, retentionDays: 1, cleanupGraceDays: 1 }
    });

    const plan = planArtifactRetention({
      artifacts: [openFailed, closedPassed],
      closedLaunchIds: ["closed-1"],
      now: new Date("2026-01-04T00:00:00Z")
    });
    const serialized = JSON.stringify(plan);

    expect(plan.query).toEqual(
      expect.objectContaining({
        scope: "closed-launches",
        scannedRecords: 2,
        stagedRecords: 1,
        skippedOpenLaunchRecords: 1
      })
    );
    expect(plan.candidates).toEqual([
      expect.objectContaining({
        artifactId: closedPassed.id,
        launchId: "closed-1",
        retentionClass: "passed-short",
        reason: "cleanup-window-open"
      })
    ]);
    expect(serialized).not.toContain("private-workstation");
    expect(serialized).not.toContain("synthetic-allure-results");
    expect(serialized).not.toContain("secret-attachment.txt");
  });

  it("classifies passed and failed retention classes", () => {
    expect(classifyArtifactRetentionClass("passed")).toBe("passed-short");
    expect(classifyArtifactRetentionClass("skipped")).toBe("skipped-short");
    expect(classifyArtifactRetentionClass("failed")).toBe("failure-diagnostic");
    expect(classifyArtifactRetentionClass("broken")).toBe("failure-diagnostic");
    expect(classifyArtifactRetentionClass("unknown")).toBe("unknown-diagnostic");
  });

  it("plans deterministic bounded deletion batches by count and bytes", () => {
    const first = prepareArtifact({
      launchId: "closed-1",
      path: "first-attachment.txt",
      content: "a".repeat(30),
      resultStatus: "passed",
      now: new Date("2026-01-01T00:00:00Z"),
      policy: { ...policy, retentionDays: 1, cleanupGraceDays: 1, compressionMinBytes: 10_000 }
    });
    const second = prepareArtifact({
      launchId: "closed-1",
      path: "second-attachment.txt",
      content: "b".repeat(50),
      resultStatus: "failed",
      now: new Date("2026-01-01T00:00:00Z"),
      policy: { ...policy, retentionDays: 1, cleanupGraceDays: 1, compressionMinBytes: 10_000 }
    });
    const third = prepareArtifact({
      launchId: "closed-1",
      path: "third-attachment.txt",
      content: "c".repeat(80),
      resultStatus: "failed",
      now: new Date("2026-01-01T00:00:00Z"),
      policy: { ...policy, retentionDays: 1, cleanupGraceDays: 1, compressionMinBytes: 10_000 }
    });
    const retentionPlan = planArtifactRetention({
      artifacts: [third, first, second],
      closedLaunchIds: ["closed-1"],
      now: new Date("2026-01-04T00:00:00Z")
    });

    const batches = planArtifactDeletionBatches({
      candidates: retentionPlan.candidates,
      maxCount: 2,
      maxBytes: 100,
      intervalMinutes: 7
    });

    expect(batches).toEqual([
      expect.objectContaining({
        index: 0,
        candidateCount: 2,
        totalBytes: 80,
        scheduledAfterMinutes: 0,
        maxCount: 2,
        maxBytes: 100
      }),
      expect.objectContaining({
        index: 1,
        candidateCount: 1,
        totalBytes: 80,
        scheduledAfterMinutes: 7
      })
    ]);
    expect(batches.flatMap((batch) => batch.storageKeys)).toEqual(
      retentionPlan.candidates.map((candidate) => candidate.storageKey)
    );
  });

  it("converts closed-launch retention preview candidates into deterministic redacted dry-run batches", () => {
    const first = prepareArtifact({
      launchId: "closed-token-launch",
      projectId: "project-secret",
      path: "Downloads/allure-results/token-first.txt",
      content: "a".repeat(30),
      resultStatus: "passed",
      now: new Date("2026-01-01T00:00:00Z"),
      policy: { ...policy, retentionDays: 1, cleanupGraceDays: 1, compressionMinBytes: 10_000 }
    });
    const second = prepareArtifact({
      launchId: "closed-token-launch",
      projectId: "project-secret",
      path: "signed-url-token-secret-second.txt",
      content: "b".repeat(50),
      resultStatus: "failed",
      now: new Date("2026-01-01T00:00:00Z"),
      policy: { ...policy, retentionDays: 1, cleanupGraceDays: 1, compressionMinBytes: 10_000 }
    });
    const third = prepareArtifact({
      launchId: "open-token-launch",
      projectId: "project-secret",
      path: "open-secret.txt",
      content: "c".repeat(80),
      resultStatus: "failed",
      now: new Date("2026-01-01T00:00:00Z"),
      policy: { ...policy, retentionDays: 1, cleanupGraceDays: 1, compressionMinBytes: 10_000 }
    });
    const retentionPlan = planArtifactRetention({
      artifacts: [third, second, first],
      closedLaunchIds: ["closed-token-launch"],
      now: new Date("2026-01-04T00:00:00Z")
    });

    const firstPlan = planArtifactRetentionDryRunBatches({
      retentionPreview: retentionPlan,
      maxCount: 1,
      maxBytes: 100,
      intervalMinutes: 3
    });
    const replayPlan = planArtifactRetentionDryRunBatches({
      retentionPreview: {
        ...retentionPlan,
        candidates: [...retentionPlan.candidates].reverse()
      },
      maxCount: 1,
      maxBytes: 100,
      intervalMinutes: 3
    });
    const serialized = JSON.stringify(firstPlan);

    expect(firstPlan).toMatchObject({
      scope: "closed-launches",
      dryRun: true,
      executionMode: "dry-run",
      deletionExecution: false,
      scannedArtifactCount: 3,
      stagedCandidateCount: 2,
      skippedOpenLaunchRecords: 1,
      retainedRecordCount: 0,
      batchCount: 2,
      totalCandidateBytes: 80,
      safety: {
        bounded: true,
        closedLaunchScope: true,
        pathIncluded: false,
        objectTargetIncluded: false,
        rawPayloadIncluded: false,
        blobIncluded: false,
        externalUrlIncluded: false,
        credentialIncluded: false,
        deletionExecution: false
      }
    });
    expect(firstPlan.batches).toEqual([
      expect.objectContaining({
        index: 0,
        candidateCount: 1,
        totalBytes: 50,
        maxCount: 1,
        maxBytes: 100,
        deletionExecution: false,
        batchDigest: expect.any(String)
      }),
      expect.objectContaining({
        index: 1,
        candidateCount: 1,
        totalBytes: 30,
        scheduledAfterMinutes: 3,
        batchDigest: expect.any(String)
      })
    ]);
    expect(firstPlan.batches[0]?.candidateRefs[0]).toEqual(
      expect.objectContaining({
        candidateRef: expect.stringMatching(/^artifact-retention-candidate:[0-9a-f]{24}$/),
        launchRef: expect.stringMatching(/^artifact-retention-launch:[0-9a-f]{24}$/),
        projectRef: expect.stringMatching(/^artifact-retention-project:[0-9a-f]{24}$/),
        safety: expect.objectContaining({
          redactedCandidateRef: true,
          objectTargetIncluded: false,
          deletionExecution: false
        })
      })
    );
    expect(replayPlan.planDigest).toBe(firstPlan.planDigest);
    expect(replayPlan.batches.map((batch) => batch.batchDigest)).toEqual(
      firstPlan.batches.map((batch) => batch.batchDigest)
    );
    expect(serialized).not.toContain("closed-token-launch");
    expect(serialized).not.toContain("open-token-launch");
    expect(serialized).not.toContain("project-secret");
    expect(serialized).not.toContain("Downloads");
    expect(serialized).not.toContain("allure-results");
    expect(serialized).not.toContain("token-first");
    expect(serialized).not.toContain("secret-second");
    expect(serialized).not.toContain("storageKey");
    expect(serialized).not.toContain("signedUrl");
    expect(serialized).not.toContain("deleteObjects");
  });

  it("creates deterministic descriptor-only evidence for attachment preview retention dry-runs", () => {
    const closedPassed = prepareArtifact({
      launchId: "closed-preview-launch",
      projectId: "project-alpha",
      path: "ui/home-screen-attachment.txt",
      content:
        "debug output C:\\Users\\tester\\Downloads\\allure-results\\file.txt https://object.test/blob?X-Amz-Signature=synthetic",
      contentType: "text/plain",
      resultStatus: "passed",
      now: new Date("2026-01-01T00:00:00Z"),
      policy: { ...policy, retentionDays: 1, cleanupGraceDays: 1, compressionMinBytes: 10_000 }
    });
    const closedFailed = prepareArtifact({
      launchId: "closed-preview-launch",
      projectId: "project-alpha",
      path: "ui/failure-log-attachment.log",
      content: "assertion failure with password=synthetic-value",
      contentType: "text/plain",
      resultStatus: "failed",
      now: new Date("2026-01-01T00:00:00Z"),
      policy: { ...policy, retentionDays: 1, cleanupGraceDays: 1, compressionMinBytes: 10_000 }
    });
    const nonAttachment = prepareArtifact({
      launchId: "closed-preview-launch",
      projectId: "project-alpha",
      path: "case-result.json",
      content: "{}",
      contentType: "application/json",
      resultStatus: "failed",
      now: new Date("2026-01-01T00:00:00Z"),
      policy: { ...policy, retentionDays: 1, cleanupGraceDays: 1, compressionMinBytes: 10_000 }
    });
    const openAttachment = prepareArtifact({
      launchId: "open-preview-launch",
      projectId: "project-alpha",
      path: "ui/open-attachment.txt",
      content: "still uploading",
      contentType: "text/plain",
      resultStatus: "failed",
      now: new Date("2026-01-01T00:00:00Z"),
      policy: { ...policy, retentionDays: 1, cleanupGraceDays: 1, compressionMinBytes: 10_000 }
    });

    const firstEvidence = createAttachmentPreviewRetentionDryRunDescriptorEvidence({
      artifacts: [openAttachment, nonAttachment, closedFailed, closedPassed],
      closedLaunchIds: ["closed-preview-launch"],
      now: new Date("2026-01-04T00:00:00Z"),
      maxDescriptors: 1,
      maxPreviewBytes: 64
    });
    const replayEvidence = createAttachmentPreviewRetentionDryRunDescriptorEvidence({
      artifacts: [closedPassed, closedFailed, nonAttachment, openAttachment],
      closedLaunchIds: ["closed-preview-launch"],
      now: new Date("2026-01-04T00:00:00Z"),
      maxDescriptors: 1,
      maxPreviewBytes: 64
    });
    const serialized = JSON.stringify(firstEvidence);

    expect(firstEvidence).toMatchObject({
      schema: "testhistory.attachment-preview-retention-dry-run-descriptor-evidence",
      version: 1,
      scope: "closed-launches",
      artifactKind: "attachment",
      dryRun: true,
      executionMode: "dry-run",
      deletionExecution: false,
      scannedArtifactCount: 4,
      stagedCandidateCount: 2,
      descriptorCount: 1,
      skippedOpenLaunchRecords: 1,
      skippedNonAttachmentRecords: 1,
      retainedRecordCount: 0,
      descriptorLimit: 1,
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
    expect(firstEvidence.evidenceDigest).toBe(replayEvidence.evidenceDigest);
    expect(firstEvidence.descriptors.map((descriptor) => descriptor.descriptorDigest)).toEqual(
      replayEvidence.descriptors.map((descriptor) => descriptor.descriptorDigest)
    );
    expect(firstEvidence.descriptors[0]).toEqual(
      expect.objectContaining({
        descriptorRef: expect.stringMatching(
          /^artifact-preview-retention-descriptor:[0-9a-f]{24}$/
        ),
        artifactRef: expect.stringMatching(/^artifact-retention-artifact:[0-9a-f]{24}$/),
        launchRef: expect.stringMatching(/^artifact-retention-launch:[0-9a-f]{24}$/),
        projectRef: expect.stringMatching(/^artifact-retention-project:[0-9a-f]{24}$/),
        preview: expect.objectContaining({
          maxPreviewBytes: 64,
          bodyType: "redacted-text"
        }),
        safety: expect.objectContaining({
          descriptorOnly: true,
          closedLaunchScope: true,
          storageKeyIncluded: false,
          deletionExecution: false
        })
      })
    );
    expect(serialized).not.toContain("closed-preview-launch");
    expect(serialized).not.toContain("open-preview-launch");
    expect(serialized).not.toContain("project-alpha");
    expect(serialized).not.toContain("home-screen-attachment");
    expect(serialized).not.toContain("failure-log-attachment");
    expect(serialized).not.toContain("C:\\Users");
    expect(serialized).not.toContain("allure-results");
    expect(serialized).not.toContain("object.test");
    expect(serialized).not.toContain("X-Amz-Signature=synthetic");
    expect(serialized).not.toContain("password=synthetic-value");
    expect(serialized).not.toContain("deleteObjects");
    expect(serialized).not.toContain(closedPassed.storageKey);
    expect(serialized).not.toContain(closedFailed.storageKey);
  });

  it("creates bounded descriptor-only schedule descriptors for attachment preview retention dry-runs", () => {
    const firstClosedAttachment = prepareArtifact({
      launchId: "closed-schedule-launch",
      projectId: "project-schedule-secret",
      path: "screens/first-attachment.txt",
      content:
        "first synthetic hostile path D:\\synthetic\\private\\trace.txt token=synthetic-schedule-token",
      contentType: "text/plain",
      resultStatus: "passed",
      now: new Date("2026-01-01T00:00:00Z"),
      policy: { ...policy, retentionDays: 1, cleanupGraceDays: 1, compressionMinBytes: 10_000 }
    });
    const secondClosedAttachment = prepareArtifact({
      launchId: "closed-schedule-launch",
      projectId: "project-schedule-secret",
      path: "screens/second-attachment.log",
      content: "second synthetic hostile URL https://object.test/preview?X-Amz-Signature=synthetic",
      contentType: "text/plain",
      resultStatus: "failed",
      now: new Date("2026-01-01T00:00:00Z"),
      policy: { ...policy, retentionDays: 1, cleanupGraceDays: 1, compressionMinBytes: 10_000 }
    });
    const thirdClosedAttachment = prepareArtifact({
      launchId: "closed-schedule-launch",
      projectId: "project-schedule-secret",
      path: "screens/third-attachment.png",
      content: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01]),
      contentType: "image/png",
      resultStatus: "broken",
      now: new Date("2026-01-01T00:00:00Z"),
      policy: { ...policy, retentionDays: 1, cleanupGraceDays: 1, compressionMinBytes: 10_000 }
    });
    const openAttachment = prepareArtifact({
      launchId: "open-schedule-launch",
      projectId: "project-schedule-secret",
      path: "screens/open-attachment.txt",
      content: "open launch descriptor must not be scheduled",
      contentType: "text/plain",
      resultStatus: "failed",
      now: new Date("2026-01-01T00:00:00Z"),
      policy: { ...policy, retentionDays: 1, cleanupGraceDays: 1, compressionMinBytes: 10_000 }
    });
    const nonAttachment = prepareArtifact({
      launchId: "closed-schedule-launch",
      projectId: "project-schedule-secret",
      path: "result.json",
      content: '{"status":"failed"}',
      contentType: "application/json",
      resultStatus: "failed",
      now: new Date("2026-01-01T00:00:00Z"),
      policy: { ...policy, retentionDays: 1, cleanupGraceDays: 1, compressionMinBytes: 10_000 }
    });

    const firstSchedule = createAttachmentPreviewRetentionDryRunArtifactScheduleDescriptors({
      artifacts: [
        openAttachment,
        thirdClosedAttachment,
        nonAttachment,
        secondClosedAttachment,
        firstClosedAttachment
      ],
      closedLaunchIds: ["closed-schedule-launch"],
      now: new Date("2026-01-04T00:00:00Z"),
      maxDescriptors: 3,
      maxPreviewBytes: 80,
      maxDescriptorsPerSchedule: 2,
      scheduleIntervalMinutes: 11
    });
    const replaySchedule = createAttachmentPreviewRetentionDryRunArtifactScheduleDescriptors({
      artifacts: [
        firstClosedAttachment,
        secondClosedAttachment,
        nonAttachment,
        thirdClosedAttachment,
        openAttachment
      ],
      closedLaunchIds: ["closed-schedule-launch"],
      now: new Date("2026-01-04T00:00:00Z"),
      maxDescriptors: 3,
      maxPreviewBytes: 80,
      maxDescriptorsPerSchedule: 2,
      scheduleIntervalMinutes: 11
    });
    const serialized = JSON.stringify(firstSchedule);

    expect(firstSchedule).toMatchObject({
      schema: "testhistory.attachment-preview-retention-dry-run-artifact-schedule-descriptors",
      version: 1,
      scope: "closed-launches",
      artifactKind: "attachment",
      dryRun: true,
      executionMode: "dry-run",
      mutationAllowed: false,
      scannedArtifactCount: 5,
      stagedCandidateCount: 3,
      descriptorCount: 3,
      scheduleDescriptorCount: 2,
      skippedOpenLaunchRecords: 1,
      skippedNonAttachmentRecords: 1,
      retainedRecordCount: 0,
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
    expect(firstSchedule.scheduleDigest).toBe(replaySchedule.scheduleDigest);
    expect(firstSchedule.schedules.map((schedule) => schedule.scheduleRef)).toEqual(
      replaySchedule.schedules.map((schedule) => schedule.scheduleRef)
    );
    expect(firstSchedule.schedules).toEqual([
      expect.objectContaining({
        index: 0,
        scheduledAfterMinutes: 0,
        descriptorCount: 2,
        maxDescriptors: 2,
        dryRun: true,
        executionMode: "dry-run",
        mutationAllowed: false,
        scheduleRef: expect.stringMatching(/^artifact-preview-retention-schedule:[0-9a-f]{24}$/),
        descriptorRefs: expect.arrayContaining([
          expect.stringMatching(/^artifact-preview-retention-descriptor:[0-9a-f]{24}$/)
        ]),
        descriptorDigests: expect.arrayContaining([expect.stringMatching(/^[0-9a-f]{24}$/)]),
        safety: expect.objectContaining({
          descriptorOnly: true,
          closedLaunchScope: true,
          providerMutationHandleIncluded: false,
          mutationAllowed: false
        })
      }),
      expect.objectContaining({
        index: 1,
        scheduledAfterMinutes: 11,
        descriptorCount: 1,
        maxDescriptors: 2
      })
    ]);
    expect(firstSchedule.schedules.flatMap((schedule) => schedule.descriptorDigests)).toEqual(
      [...firstSchedule.schedules.flatMap((schedule) => schedule.descriptorDigests)].sort()
    );
    expect(serialized).not.toContain("closed-schedule-launch");
    expect(serialized).not.toContain("open-schedule-launch");
    expect(serialized).not.toContain("project-schedule-secret");
    expect(serialized).not.toContain("first-attachment");
    expect(serialized).not.toContain("second-attachment");
    expect(serialized).not.toContain("third-attachment");
    expect(serialized).not.toContain("D:\\synthetic");
    expect(serialized).not.toContain("synthetic-schedule-token");
    expect(serialized).not.toContain("object.test");
    expect(serialized).not.toContain("X-Amz-Signature=synthetic");
    expect(serialized).not.toContain("deleteObjects");
    expect(serialized).not.toContain("deletionExecution");
    expect(serialized).not.toContain(firstClosedAttachment.storageKey);
    expect(serialized).not.toContain(secondClosedAttachment.storageKey);
    expect(serialized).not.toContain(thirdClosedAttachment.storageKey);
  });
});
