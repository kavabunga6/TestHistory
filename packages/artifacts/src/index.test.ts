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
  it("classifies allure files", () => {
    expect(classifyArtifact("abc-result.json")).toBe("allure-result");
    expect(classifyArtifact("abc-container.json")).toBe("allure-container");
    expect(classifyArtifact("executor.json")).toBe("executor");
    expect(classifyArtifact("environment.properties")).toBe("environment");
    expect(classifyArtifact("abc-attachment.png")).toBe("attachment");
    expect(classifyArtifact("features/checkout.feature")).toBe("scenario");
    expect(classifyArtifact("fixtures/setup-browser.json")).toBe("fixture");
  });

  it("detects content types for common Allure attachments", () => {
    expect(detectArtifactContentType("hierarchy-attachment.xml")).toBe("application/xml");
    expect(detectArtifactContentType("failure-screenshot-attachment.png")).toBe("image/png");
    expect(detectArtifactContentType("logcat-attachment.txt", "application/text")).toBe(
      "text/plain"
    );
    expect(detectArtifactContentType("network-trace.har")).toBe("application/json");
  });

  it("rejects path traversal before creating artifact metadata", () => {
    expect(() => normalizeArtifactSourcePath("../screenshots/login-attachment.png")).toThrow(
      /relative path segments/
    );
    expect(() => normalizeArtifactSourcePath("screenshots/%2e%2e/login-attachment.png")).toThrow(
      /relative path segments/
    );
    expect(() =>
      normalizeArtifactSourcePath("screenshots/%252e%252e/login-attachment.png")
    ).toThrow(/relative path segments/);
    expect(() => normalizeArtifactSourcePath("screenshots/%2F/login-attachment.png")).toThrow(
      /encoded separators/
    );
    expect(() => normalizeArtifactSourcePath("C:\\Users\\tester\\allure-results\\x.txt")).toThrow(
      /relative/
    );
    expect(() =>
      normalizeArtifactSourcePath("https://object-store.test/bucket/x.txt?X-Amz-Signature=abcdef")
    ).toThrow(/URL/);
  });

  it("creates safe storage keys without embedding source paths", () => {
    const artifact = prepareArtifact({
      launchId: "launch-1",
      path: "screenshots/login-attachment.png",
      content: "image",
      policy
    });

    expect(artifact.storageKey).toBe(artifact.storage.key);
    expect(artifact.contentType).toBe("image/png");
    expect(artifact.path).toBe("screenshots/login-attachment.png");
    expect(artifact.storageKey).toMatch(/^launch-1\/attachment\/[a-f0-9]{64}$/);
    expect(artifact.storageKey).not.toContain("screenshots");
  });

  it("round-trips branded artifact storage keys", () => {
    const storageKey = createArtifactStorageKey({
      launchId: "launch-1",
      kind: "allure-result",
      artifactId: "a".repeat(64)
    });

    expect(isArtifactStorageKey(storageKey)).toBe(true);
    expect(parseArtifactStorageKey(storageKey)).toEqual({
      launchId: "launch-1",
      kind: "allure-result",
      artifactId: "a".repeat(64),
      storageKey
    });
  });

  it("rejects unsafe artifact storage key segments", () => {
    expect(() =>
      createArtifactStorageKey({
        launchId: "../launch-1",
        kind: "attachment",
        artifactId: "a".repeat(64)
      })
    ).toThrow(/launchId/);
    expect(() => parseArtifactStorageKey("launch-1/attachment/../escape")).toThrow(
      /launchId\/kind\/artifactId/
    );
    expect(isArtifactStorageKey("launch-1/%2F/a")).toBe(false);
  });

  it("compresses large artifacts and restores payload", () => {
    const artifact = prepareArtifact({
      launchId: "launch-1",
      path: "big-attachment.txt",
      content: "x".repeat(2048),
      policy: { ...policy, compressionMinBytes: 10 }
    });

    expect(artifact.compression).toBe("gzip");
    expect(artifact.compressionMetadata.savedBytes).toBeGreaterThan(0);
    expect(artifact.storage).toEqual(
      expect.objectContaining({
        backend: "s3-compatible",
        accessTier: "frequent",
        diskIsolation: "separate-from-db",
        kubernetesVolume: "csi"
      })
    );
    expect(restoreArtifactPayload(artifact).toString()).toBe("x".repeat(2048));
  });

  it("plans compression by mime, size, and result status", () => {
    expect(
      chooseArtifactCompressionStrategy({
        contentType: "application/json",
        originalBytes: 4096,
        resultStatus: "failed",
        policy
      })
    ).toEqual(
      expect.objectContaining({
        algorithm: "gzip",
        shouldAttemptCompression: true,
        reason: "compressible-diagnostic",
        retentionClass: "failure-diagnostic",
        mimeClass: "compressible"
      })
    );

    expect(
      chooseArtifactCompressionStrategy({
        contentType: "text/plain",
        originalBytes: 4096,
        resultStatus: "passed",
        policy
      })
    ).toEqual(
      expect.objectContaining({
        algorithm: "gzip",
        reason: "compressible-cost-optimized",
        retentionClass: "passed-short"
      })
    );

    expect(
      chooseArtifactCompressionStrategy({
        contentType: "application/json",
        originalBytes: 32,
        resultStatus: "failed",
        policy
      })
    ).toEqual(
      expect.objectContaining({
        algorithm: "none",
        shouldAttemptCompression: false,
        reason: "below-threshold"
      })
    );
  });

  it("does not compress or preview unsupported binary payloads", () => {
    const plan = chooseArtifactCompressionStrategy({
      contentType: "application/octet-stream",
      originalBytes: 10 * 1024 * 1024,
      resultStatus: "failed",
      policy
    });
    const preview = evaluateArtifactPreviewEligibility({
      contentType: "application/octet-stream",
      originalBytes: 4096
    });
    const artifact = prepareArtifact({
      launchId: "launch-1",
      path: "heapdump-attachment.bin",
      content: Buffer.alloc(2048, 1),
      contentType: "application/octet-stream",
      resultStatus: "failed",
      policy: { ...policy, compressionMinBytes: 10 }
    });

    expect(plan).toEqual(
      expect.objectContaining({
        algorithm: "none",
        shouldAttemptCompression: false,
        reason: "unsupported-binary",
        mimeClass: "unsupported-binary"
      })
    );
    expect(preview).toEqual(
      expect.objectContaining({
        eligible: false,
        kind: "none",
        reason: "unsupported-binary"
      })
    );
    expect(artifact.compression).toBe("none");
  });

  it("keeps unsupported previews in metadata-only mode", () => {
    expect(
      evaluateArtifactPreviewEligibility({
        contentType: "application/pdf",
        originalBytes: 4096
      })
    ).toEqual(
      expect.objectContaining({
        eligible: false,
        kind: "none",
        reason: "unsupported-binary"
      })
    );
  });

  it("keeps large previewable text out of inline previews", () => {
    expect(
      evaluateArtifactPreviewEligibility({
        contentType: "text/plain",
        originalBytes: 2 * 1024 * 1024,
        maxPreviewBytes: 1024 * 1024
      })
    ).toEqual(
      expect.objectContaining({
        eligible: false,
        kind: "text",
        reason: "too-large"
      })
    );
  });

  it("creates bounded stable text preview descriptors without source metadata", () => {
    const artifact = prepareArtifact({
      launchId: "launch-1",
      path: "first-attachment.txt",
      content: "line one\nline two\nline three",
      contentType: "text/plain",
      policy
    });

    const first = createArtifactPreviewDescriptor({
      artifact,
      maxPreviewBytes: 14
    });
    const second = createArtifactPreviewDescriptor({
      artifact,
      maxPreviewBytes: 14
    });
    const serialized = JSON.stringify(first);

    expect(first).toEqual(second);
    expect(first).toEqual(
      expect.objectContaining({
        id: expect.stringMatching(/^[a-f0-9]{32}$/),
        artifactId: artifact.id,
        kind: "text",
        flavor: "text",
        support: "inline",
        status: "ready",
        reason: "too-large",
        originalBytes: artifact.originalBytes,
        previewBytes: 14,
        maxPreviewBytes: 14,
        sha256: artifact.sha256,
        safety: {
          descriptorVersion: 1,
          bounded: true,
          pathIncluded: false,
          storageKeyIncluded: false,
          rawPayloadIncluded: false,
          blobIncluded: false,
          signedUrlIncluded: false,
          redactionApplied: false
        }
      })
    );
    expect(first.body).toEqual({
      type: "redacted-text",
      encoding: "utf8",
      value: "line one\nline ",
      lineCount: 2,
      truncated: true,
      redacted: false
    });
    expect(serialized).not.toContain("first-attachment.txt");
    expect(serialized).not.toContain(artifact.storageKey);
    expect(serialized).not.toContain("line three");
  });

  it("redacts log preview descriptors before bounding output", () => {
    const logContent = [
      "authorization: Bearer synthetic-token",
      "token=synthetic-token",
      "file=C:\\Users\\tester\\allure-results\\secret-attachment.txt",
      "url=https://object-store.test/bucket/key?X-Amz-Signature=abcdef",
      "tail=".concat("x".repeat(100))
    ].join("\n");
    const artifact = prepareArtifact({
      launchId: "launch-1",
      path: "execution-attachment.log",
      content: logContent,
      contentType: "text/plain",
      policy: { ...policy, compressionMinBytes: 10 }
    });

    const preview = createArtifactPreviewDescriptor({
      artifact,
      maxPreviewBytes: 180
    });
    const serialized = JSON.stringify(preview);

    expect(preview.flavor).toBe("log");
    expect(preview.status).toBe("ready");
    expect(preview.previewBytes).toBeLessThanOrEqual(180);
    expect(preview.body).toEqual(
      expect.objectContaining({
        type: "redacted-text",
        redacted: true,
        truncated: true
      })
    );
    expect(serialized).toContain("[REDACTED]");
    expect(serialized).toContain("[REDACTED_PATH]");
    expect(serialized).toContain("[REDACTED_URL]");
    expect(serialized).not.toContain("synthetic-token");
    expect(serialized).not.toContain("C:\\Users");
    expect(serialized).not.toContain("secret-attachment.txt");
    expect(serialized).not.toContain("X-Amz-Signature");
    expect(serialized).not.toContain(artifact.storageKey);
    expect(serialized).not.toContain("execution-attachment.log");
  });

  it("keeps image preview descriptors metadata-only without payload or storage leakage", () => {
    const imageBytes = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d
    ]);
    const artifact = prepareArtifact({
      launchId: "launch-1",
      path: "screenshot-attachment.png",
      content: imageBytes,
      contentType: "image/png",
      policy
    });

    const preview = createArtifactPreviewDescriptor({
      artifact,
      maxPreviewBytes: 1024
    });
    const serialized = JSON.stringify(preview);

    expect(preview).toEqual(
      expect.objectContaining({
        kind: "image",
        flavor: "image",
        support: "metadata-only",
        status: "metadata-only",
        reason: "image-metadata-only",
        previewBytes: 0,
        body: {
          type: "image-metadata",
          mediaType: "image/png",
          inline: false,
          downloadRequired: true
        }
      })
    );
    expect(serialized).not.toContain("screenshot-attachment.png");
    expect(serialized).not.toContain(artifact.storageKey);
    expect(serialized).not.toContain(imageBytes.toString("base64"));
  });

  it("returns stable unsupported binary preview descriptors without payload leakage", () => {
    const artifact = prepareArtifact({
      launchId: "launch-1",
      path: "heapdump-attachment.bin",
      content: Buffer.from("synthetic unsupported binary payload"),
      contentType: "application/octet-stream",
      policy
    });

    const preview = createArtifactPreviewDescriptor({
      artifact,
      maxPreviewBytes: 1024
    });
    const repeated = createArtifactPreviewDescriptor({
      artifact,
      maxPreviewBytes: 1024
    });
    const serialized = JSON.stringify(preview);

    expect(preview).toEqual(repeated);
    expect(preview).toEqual(
      expect.objectContaining({
        kind: "none",
        flavor: "unsupported-binary",
        support: "unsupported",
        status: "metadata-only",
        reason: "unsupported-binary",
        previewBytes: 0,
        body: { type: "metadata-only" },
        safety: {
          descriptorVersion: 1,
          bounded: true,
          pathIncluded: false,
          storageKeyIncluded: false,
          rawPayloadIncluded: false,
          blobIncluded: false,
          signedUrlIncluded: false,
          redactionApplied: false
        }
      })
    );
    expect(serialized).not.toContain("heapdump-attachment.bin");
    expect(serialized).not.toContain("synthetic unsupported binary payload");
    expect(serialized).not.toContain(artifact.storageKey);
  });

  it("uses explicit contract-safe preview states without raw blob or path fields", () => {
    const ready = createArtifactPreviewDescriptor({
      artifact: prepareArtifact({
        launchId: "launch-1",
        path: "contract-ready-attachment.json",
        content: '{"status":"ok"}',
        contentType: "application/json",
        policy
      }),
      maxPreviewBytes: 1024
    });
    const image = createArtifactPreviewDescriptor({
      artifact: prepareArtifact({
        launchId: "launch-1",
        path: "contract-image-attachment.png",
        content: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
        contentType: "image/png",
        policy
      }),
      maxPreviewBytes: 1024
    });
    const unsupported = createArtifactPreviewDescriptor({
      artifact: prepareArtifact({
        launchId: "launch-1",
        path: "contract-unsupported-attachment.bin",
        content: Buffer.from("synthetic binary"),
        contentType: "application/octet-stream",
        policy
      }),
      maxPreviewBytes: 1024
    });
    const unknown = createArtifactPreviewDescriptor({
      artifact: prepareArtifact({
        launchId: "launch-1",
        path: "contract-unknown-attachment",
        content: "synthetic without declared content type",
        policy
      }),
      maxPreviewBytes: 1024
    });
    const descriptorOnlyArtifact = toArtifactDescriptor(
      prepareArtifact({
        launchId: "launch-1",
        path: "contract-unavailable-attachment.txt",
        content: "not available at read time",
        contentType: "text/plain",
        policy
      })
    );
    const unavailable = createArtifactPreviewDescriptor({
      artifact: descriptorOnlyArtifact,
      maxPreviewBytes: 1024
    });

    expect(ready).toEqual(
      expect.objectContaining({
        support: "inline",
        status: "ready",
        kind: "json",
        flavor: "json",
        reason: "eligible",
        body: expect.objectContaining({ type: "redacted-text" })
      })
    );
    expect(image).toEqual(
      expect.objectContaining({
        support: "metadata-only",
        status: "metadata-only",
        kind: "image",
        flavor: "image",
        reason: "image-metadata-only",
        body: expect.objectContaining({ type: "image-metadata", inline: false })
      })
    );
    expect(unsupported).toEqual(
      expect.objectContaining({
        support: "unsupported",
        status: "metadata-only",
        kind: "none",
        flavor: "unsupported-binary",
        reason: "unsupported-binary",
        body: { type: "metadata-only" }
      })
    );
    expect(unknown).toEqual(
      expect.objectContaining({
        support: "unsupported",
        status: "metadata-only",
        kind: "none",
        flavor: "unknown",
        reason: "missing-content-type",
        body: { type: "metadata-only" }
      })
    );
    expect(unavailable).toEqual(
      expect.objectContaining({
        support: "metadata-only",
        status: "metadata-only",
        kind: "text",
        flavor: "text",
        reason: "content-unavailable",
        body: { type: "metadata-only" }
      })
    );

    for (const preview of [ready, image, unsupported, unknown, unavailable]) {
      expect(preview.safety).toEqual(
        expect.objectContaining({
          pathIncluded: false,
          storageKeyIncluded: false,
          rawPayloadIncluded: false,
          blobIncluded: false,
          signedUrlIncluded: false
        })
      );
      expect(collectForbiddenPreviewFields(preview)).toEqual([]);
    }
  });
});
