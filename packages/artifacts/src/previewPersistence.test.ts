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
  type ArtifactObjectStorePort,
  type ArtifactPolicy
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
  it("persists preview descriptors as deterministic versioned read models", () => {
    const artifact = prepareArtifact({
      launchId: "launch-1",
      path: "persisted-attachment.json",
      content: '{"status":"failed","token":"synthetic-token"}',
      contentType: "application/json",
      resultStatus: "failed",
      policy
    });
    const descriptor = createArtifactPreviewDescriptor({
      artifact,
      maxPreviewBytes: 1024
    });

    const first = serializeArtifactPreviewDescriptor({
      descriptor,
      resultStatus: "failed"
    });
    const second = serializeArtifactPreviewDescriptor({
      descriptor,
      resultStatus: "failed"
    });
    const readModel = readArtifactPreviewDescriptor({ serialized: first });
    const record = createArtifactPreviewDescriptorPersistenceRecord({
      descriptor: readModel.descriptor,
      retentionClass: readModel.retentionClass
    });

    expect(first).toBe(second);
    expect(JSON.parse(first)).toEqual({
      descriptor: readModel.descriptor,
      descriptorRetention: readModel.descriptorRetention,
      retentionClass: "failure-diagnostic",
      schema: "testhistory.artifact-preview-descriptor",
      version: 1
    });
    expect(record).toEqual({
      descriptor: readModel.descriptor,
      descriptorRetention: readModel.descriptorRetention,
      retentionClass: "failure-diagnostic",
      schema: "testhistory.artifact-preview-descriptor",
      version: 1
    });
    expect(readModel.serializedBytes).toBe(Buffer.byteLength(first, "utf8"));
    expect(readModel.serializedBytes).toBeLessThanOrEqual(
      maxArtifactPreviewDescriptorPersistenceBytes
    );
    expect(first).not.toContain("persisted-attachment.json");
    expect(first).not.toContain(artifact.storageKey);
    expect(first).not.toContain("synthetic-token");
    expect(first).not.toContain('"storageKey":');
    expect(first).not.toContain('"signedUrl":');
    expect(first).not.toContain("object-store");
  });

  it("classifies preview descriptor retention with bounded cleanup-safe policies", () => {
    const passedDescriptor = createArtifactPreviewDescriptor({
      artifact: prepareArtifact({
        launchId: "launch-1",
        path: "passed-preview.txt",
        content: "ok",
        contentType: "text/plain",
        resultStatus: "passed",
        policy
      }),
      maxPreviewBytes: 1024
    });
    const failedDescriptor = createArtifactPreviewDescriptor({
      artifact: prepareArtifact({
        launchId: "launch-1",
        path: "failed-preview.log",
        content: "failure without raw storage links",
        contentType: "text/plain",
        resultStatus: "failed",
        policy
      }),
      maxPreviewBytes: 1024
    });

    const shortLived = classifyArtifactPreviewDescriptorRetention({
      descriptor: passedDescriptor,
      resultStatus: "passed"
    });
    const evidence = classifyArtifactPreviewDescriptorRetention({
      descriptor: failedDescriptor,
      resultStatus: "failed"
    });
    const placeholderHold = classifyArtifactPreviewDescriptorRetention({
      descriptor: failedDescriptor,
      retentionClass: "failure-diagnostic",
      policyClass: "legal-hold-placeholder",
      retentionHorizonDays: 3650
    });

    expect(shortLived).toMatchObject({
      policyClass: "short-lived-preview",
      retentionClass: "passed-short",
      cleanupEligibility: {
        eligible: true,
        reason: "preview-retention-horizon-applies"
      },
      auditReason: "short-lived-preview-descriptor",
      retentionHorizonDays: 7,
      horizon: { unit: "days", minDays: 1, maxDays: 30 }
    });
    expect(evidence).toMatchObject({
      policyClass: "evidence-retained",
      retentionClass: "failure-diagnostic",
      cleanupEligibility: {
        eligible: true,
        reason: "evidence-retention-horizon-applies"
      },
      auditReason: "evidence-preview-descriptor",
      retentionHorizonDays: 90,
      horizon: { unit: "days", minDays: 7, maxDays: 365 }
    });
    expect(placeholderHold).toMatchObject({
      policyClass: "legal-hold-placeholder",
      cleanupEligibility: {
        eligible: false,
        reason: "legal-hold-placeholder-requires-explicit-release"
      },
      auditReason: "legal-hold-placeholder-descriptor",
      retentionHorizonDays: 3650,
      horizon: { unit: "days", minDays: 1, maxDays: 3650 }
    });
    for (const classification of [shortLived, evidence, placeholderHold]) {
      expect(classification.safety).toEqual({
        bounded: true,
        pathIncluded: false,
        storageKeyIncluded: false,
        rawPayloadIncluded: false,
        blobIncluded: false,
        signedUrlIncluded: false
      });
      expect(collectForbiddenPreviewFields(classification)).toEqual([]);
    }
  });

  it("rejects unsafe or inconsistent preview retention classification input", () => {
    const descriptor = createArtifactPreviewDescriptor({
      artifact: prepareArtifact({
        launchId: "launch-1",
        path: "retention-rejection.txt",
        content: "safe",
        contentType: "text/plain",
        policy
      }),
      maxPreviewBytes: 1024
    });

    expect(() =>
      classifyArtifactPreviewDescriptorRetention({
        descriptor,
        resultStatus: "passed",
        retentionHorizonDays: 31
      })
    ).toThrow(/between 1 and 30 days/);
    expect(() =>
      classifyArtifactPreviewDescriptorRetention({
        descriptor,
        retentionClass: "passed-short",
        policyClass: "evidence-retained"
      })
    ).toThrow(/inconsistent/);
    expect(() =>
      classifyArtifactPreviewDescriptorRetention({
        descriptor: {
          ...descriptor,
          body: {
            ...descriptor.body,
            value: "authorization: Bearer synthetic-token"
          }
        } as typeof descriptor,
        resultStatus: "failed"
      })
    ).toThrow(/unsafe data/);
  });

  it("normalizes persisted preview descriptors and drops harmless unknown fields", () => {
    const descriptor = createArtifactPreviewDescriptor({
      artifact: prepareArtifact({
        launchId: "launch-1",
        path: "normalize-attachment.txt",
        content: "hello",
        contentType: "text/plain",
        policy
      }),
      maxPreviewBytes: 1024
    });
    const serialized = JSON.stringify({
      version: 1,
      schema: "testhistory.artifact-preview-descriptor",
      unknown: "dropped",
      retentionClass: "passed-short",
      descriptor: {
        ...descriptor,
        unknown: "dropped",
        body: {
          ...descriptor.body,
          unknown: "dropped"
        }
      }
    });

    const readModel = readArtifactPreviewDescriptor({ serialized });
    const canonical = serializeArtifactPreviewDescriptor({
      descriptor: readModel.descriptor,
      retentionClass: readModel.retentionClass
    });

    expect(readModel.retentionClass).toBe("passed-short");
    expect(JSON.stringify(readModel)).not.toContain("dropped");
    expect(canonical).not.toContain("unknown");
    expect(readArtifactPreviewDescriptor({ serialized: canonical }).descriptor).toEqual(
      readModel.descriptor
    );
  });

  it("reads legacy preview descriptor records by deriving descriptor retention", () => {
    const descriptor = createArtifactPreviewDescriptor({
      artifact: prepareArtifact({
        launchId: "launch-1",
        path: "legacy-preview.txt",
        content: "legacy",
        contentType: "text/plain",
        resultStatus: "skipped",
        policy
      }),
      maxPreviewBytes: 1024
    });
    const serialized = JSON.stringify({
      schema: "testhistory.artifact-preview-descriptor",
      version: 1,
      retentionClass: "skipped-short",
      descriptor
    });

    const readModel = readArtifactPreviewDescriptor({ serialized });
    const canonical = serializeArtifactPreviewDescriptor({
      descriptor: readModel.descriptor,
      retentionClass: readModel.retentionClass
    });

    expect(readModel.descriptorRetention).toMatchObject({
      policyClass: "short-lived-preview",
      retentionClass: "skipped-short",
      cleanupEligibility: {
        eligible: true,
        reason: "preview-retention-horizon-applies"
      },
      retentionHorizonDays: 7
    });
    expect(JSON.parse(canonical).descriptorRetention).toEqual(readModel.descriptorRetention);
  });

  it("rejects oversized persisted preview descriptors", () => {
    const descriptor = createArtifactPreviewDescriptor({
      artifact: prepareArtifact({
        launchId: "launch-1",
        path: "oversized-preview-attachment.txt",
        content: "x".repeat(4096),
        contentType: "text/plain",
        policy
      }),
      maxPreviewBytes: 4096
    });

    expect(() =>
      serializeArtifactPreviewDescriptor({
        descriptor,
        resultStatus: "failed",
        maxSerializedBytes: 512
      })
    ).toThrow(/exceeds 512 bytes/);
    expect(() =>
      readArtifactPreviewDescriptor({
        serialized: JSON.stringify({ value: "x".repeat(1024) }),
        maxSerializedBytes: 64
      })
    ).toThrow(/exceeds 64 bytes/);
  });

  it("rejects unsafe preview persistence fields and values", () => {
    const descriptor = createArtifactPreviewDescriptor({
      artifact: prepareArtifact({
        launchId: "launch-1",
        path: "unsafe-persistence-attachment.txt",
        content: "safe",
        contentType: "text/plain",
        policy
      }),
      maxPreviewBytes: 1024
    });

    expect(() =>
      serializeArtifactPreviewDescriptor({
        descriptor: {
          ...descriptor,
          path: "C:\\Users\\tester\\allure-results\\secret-attachment.txt"
        } as typeof descriptor,
        resultStatus: "failed"
      })
    ).toThrow(/unsafe fields/);
    expect(() =>
      serializeArtifactPreviewDescriptor({
        descriptor: {
          ...descriptor,
          storageKey: "launch-1/attachment/".concat("a".repeat(64))
        } as typeof descriptor,
        resultStatus: "failed"
      })
    ).toThrow(/unsafe fields/);
    expect(() =>
      readArtifactPreviewDescriptor({
        serialized: JSON.stringify({
          schema: "testhistory.artifact-preview-descriptor",
          version: 1,
          retentionClass: "failure-diagnostic",
          descriptor,
          signedUrl: "https://example.test/object?X-Amz-Signature=secret"
        })
      })
    ).toThrow(/unsafe fields/);
    expect(() =>
      readArtifactPreviewDescriptor({
        serialized: JSON.stringify({
          schema: "testhistory.artifact-preview-descriptor",
          version: 1,
          retentionClass: "failure-diagnostic",
          descriptor: {
            ...descriptor,
            body: {
              ...descriptor.body,
              value: "authorization: Bearer synthetic-token"
            }
          }
        })
      })
    ).toThrow(/unsafe data/);
    expect(() =>
      readArtifactPreviewDescriptor({
        serialized: JSON.stringify({
          schema: "testhistory.artifact-preview-descriptor",
          version: 1,
          retentionClass: "failure-diagnostic",
          descriptor,
          descriptorRetention: {
            policyClass: "unknown-policy",
            retentionClass: "failure-diagnostic",
            cleanupEligibility: {
              eligible: true,
              reason: "evidence-retention-horizon-applies"
            },
            auditReason: "evidence-preview-descriptor",
            retentionHorizonDays: 90,
            horizon: { unit: "days", minDays: 7, maxDays: 365 },
            safety: {
              bounded: true,
              pathIncluded: false,
              storageKeyIncluded: false,
              rawPayloadIncluded: false,
              blobIncluded: false,
              signedUrlIncluded: false
            }
          }
        })
      })
    ).toThrow(/policy class is unsupported/);
  });

  it("keeps payload uncompressed when gzip would not save bytes", () => {
    const artifact = prepareArtifact({
      launchId: "launch-1",
      path: "tiny-attachment.txt",
      content: "abc",
      policy: { ...policy, compressionMinBytes: 1 }
    });

    expect(artifact.compression).toBe("none");
    expect(artifact.compressionMetadata.savedBytes).toBe(0);
  });

  it("rejects missing source content with a non-leaking error", () => {
    expect(() =>
      (
        prepareArtifact as unknown as (input: {
          launchId: string;
          path: string;
          policy: ArtifactPolicy;
        }) => unknown
      )({
        launchId: "launch-1",
        path: "missing-attachment.txt",
        policy
      })
    ).toThrow(/content is required/);
  });

  it("bounds large artifact and metadata fields without echoing local paths", () => {
    expect(() =>
      prepareArtifact({
        launchId: "launch-1",
        path: "oversized-attachment.txt",
        content: "x".repeat(65),
        policy: { ...policy, chunkBytes: 1, maxArtifactBytes: 64 }
      })
    ).toThrow("Artifact exceeds max artifact size of 64 bytes");

    expect(() =>
      prepareArtifact({
        launchId: "launch-1",
        path: `${"a".repeat(129)}.txt`,
        content: "synthetic",
        policy
      })
    ).toThrow(/segment exceeds 128 bytes/);

    expect(() =>
      prepareArtifact({
        launchId: "launch-1",
        path: "metadata-attachment.txt",
        content: "synthetic",
        contentType: `text/plain-${"x".repeat(256)}`,
        policy
      })
    ).toThrow(/content type exceeds 255 bytes/);
  });

  it("detects duplicate checksums without serializing source paths", () => {
    const first = prepareArtifact({
      launchId: "launch-1",
      path: "first-attachment.txt",
      content: "same synthetic body",
      policy
    });
    const second = prepareArtifact({
      launchId: "launch-1",
      path: "nested/second-attachment.txt",
      content: "same synthetic body",
      policy
    });

    const duplicates = findDuplicateArtifactChecksums([first, second]);
    const serialized = JSON.stringify(duplicates);

    expect(duplicates).toEqual([
      {
        sha256: first.sha256,
        artifactIds: [first.id, second.id],
        storageKeys: [first.storageKey, second.storageKey],
        count: 2
      }
    ]);
    expect(serialized).not.toContain("first-attachment.txt");
    expect(serialized).not.toContain("second-attachment.txt");
    expect(serialized).not.toContain("same synthetic body");
  });

  it("serializes prepared artifact metadata without raw payload content", () => {
    const artifact = prepareArtifact({
      launchId: "launch-1",
      path: "raw-attachment.txt",
      content: "raw synthetic attachment content",
      policy
    });

    const serializedPrepared = JSON.stringify(artifact);
    const serializedDescriptor = JSON.stringify(toArtifactDescriptor(artifact));

    expect(serializedPrepared).toBe(serializedDescriptor);
    expect(serializedPrepared).not.toContain("payload");
    expect(serializedPrepared).not.toContain("raw synthetic attachment content");
  });

  it("redacts sensitive metadata before log serialization", () => {
    const redacted = redactArtifactMetadataForLog({
      path: "C:\\Users\\tester\\allure-results\\secret-attachment.txt",
      signedUrl: "https://object-store.test/bucket/key?X-Amz-Signature=abcdef",
      masked: "hidden-value",
      nested: {
        token: "token-value",
        content: Buffer.from("raw synthetic attachment content")
      },
      safe: "launch-1/attachment/key"
    });
    const serialized = JSON.stringify(redacted);

    expect(redacted).toEqual({
      path: "[REDACTED_PATH]",
      signedUrl: "[REDACTED]",
      masked: "[REDACTED]",
      nested: {
        token: "[REDACTED]",
        content: "[REDACTED]"
      },
      safe: "launch-1/attachment/key"
    });
    expect(serialized).not.toContain("C:\\Users");
    expect(serialized).not.toContain("X-Amz-Signature");
    expect(serialized).not.toContain("hidden-value");
    expect(serialized).not.toContain("raw synthetic attachment content");
  });
});
