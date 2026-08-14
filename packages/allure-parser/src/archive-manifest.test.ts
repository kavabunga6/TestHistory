import { describe, expect, it } from "vitest";
import {
  normalizeAllureArchiveManifest,
  normalizeAllureResultAttempts,
  parseAllureCompatibilityFile,
  parseAllureResultJson
} from "./index.js";
import {
  syntheticArchiveManifestEntries,
  syntheticArchiveDiagnosticReplayFixtures,
  syntheticUnsafeArchiveManifestEntries
} from "./archive-manifest.fixtures.js";

describe("allure parser archive diagnostics", () => {
  describe("synthetic archive diagnostic replay fixture pack", () => {
    for (const fixture of syntheticArchiveDiagnosticReplayFixtures) {
      it(`normalizes ${fixture.name} replay fixture deterministically without unsafe payload leakage`, () => {
        const first = normalizeArchiveDiagnosticReplayFixture(fixture);
        const second = normalizeArchiveDiagnosticReplayFixture(fixture);

        expect(second).toEqual(first);
        expect(first.summary).toEqual(fixture.expected);
        expect(JSON.stringify(first.summary)).toBe(JSON.stringify(fixture.expected));
        expectArchiveReplayIsRedacted(first);
      });
    }

    it("keeps duplicate and retry replay fixture semantics stable", () => {
      const duplicate = normalizeArchiveDiagnosticReplayFixture(
        syntheticArchiveDiagnosticReplayFixtures.find((fixture) => fixture.name === "duplicate")
      );
      const retry = normalizeArchiveDiagnosticReplayFixture(
        syntheticArchiveDiagnosticReplayFixtures.find((fixture) => fixture.name === "retry")
      );

      expect(duplicate.warnings).toEqual([
        "Archive entries at indexes [0, 1] have the same basename; consumers must key by normalized path"
      ]);
      expect(duplicate.attemptGroups.map((group) => group.latest.result.uuid)).toEqual([
        "duplicate-a",
        "duplicate-b"
      ]);

      expect(retry.attemptGroups).toHaveLength(1);
      expect(retry.attemptGroups[0]?.attempts.map((attempt) => attempt.result.uuid)).toEqual([
        "retry-first",
        "retry-second"
      ]);
      expect(retry.attemptGroups[0]?.attempts.map((attempt) => attempt.retry)).toEqual([
        false,
        true
      ]);
      expect(retry.attemptGroups[0]?.latest.result.status).toBe("passed");
      expect(retry.attemptGroups[0]?.latest.statusDetails?.message).toBe(
        "Recovered without leaking Authorization: Bearer ***"
      );
    });

    it("guards materialized fixture parser compatibility without raw archive material leakage", () => {
      const materializedFixture = getSyntheticArchiveDiagnosticReplayFixture("materialized");
      const replay = normalizeArchiveDiagnosticReplayFixture(materializedFixture);

      expect(replay.summary).toEqual(materializedFixture.expected);
      expect(replay.warnings).toEqual([
        "Archive entry at index 3 was ignored because its path is unsafe or malformed"
      ]);
      expect(replay.parseErrors).toHaveLength(1);
      expect(replay.parseErrors[0]).toContain("[redacted-local-path]: Invalid JSON");
      expect(replay.attemptGroups[0]?.latest.result.status).toBe("unknown");
      expect(replay.attemptGroups[0]?.latest.statusDetails?.message).toBe(
        "Materialized replay preserved context without Authorization: Bearer ***"
      );
      expect(replay.attemptGroups[0]?.latest.result.raw.attachments).toEqual([
        {
          name: "materialized diagnostic payload",
          source: "materialized/materialized-attachment.txt",
          type: "text/plain",
          rawPayload: "***",
          body: "***",
          localPath: "***",
          signedUrl: "***"
        }
      ]);
      expectArchiveReplayIsRedacted(replay);
    });

    it("keeps adapter-like materialized variants tolerant while redacting unknown metadata", () => {
      const replay = normalizeArchiveDiagnosticReplayFixture(
        getSyntheticArchiveDiagnosticReplayFixture("adapter-variants")
      );

      expect(replay.summary).toEqual({
        supportedFiles: 3,
        attachmentFiles: 1,
        ignoredFiles: 1,
        warningCount: 1,
        parseErrors: 0,
        attemptGroups: 2,
        latestStatuses: ["passed", "unknown"]
      });
      expect(replay.warnings).toEqual([
        "Archive entry at index 3 was ignored because its filename is not supported"
      ]);

      const playwright = replay.attemptGroups.find(
        (group) => group.identity.value === "archive-diagnostic-adapter-playwright"
      );
      const cypress = replay.attemptGroups.find(
        (group) => group.identity.value === "archive-diagnostic-adapter-cypress"
      );

      expect(playwright?.latest.result.status).toBe("passed");
      expect(playwright?.latest.result.parameters).toEqual([
        { name: "browser", value: "chromium" },
        { name: "apiToken", value: "***", mode: "masked" },
        { name: "session", mode: "hidden" }
      ]);
      expect(playwright?.latest.result.raw.labels).toEqual([
        { name: "framework", value: "playwright" },
        { name: "secret", value: "***" }
      ]);
      expect((playwright?.latest.result.raw as Record<string, unknown>).adapterMetadata).toEqual({
        framework: "playwright",
        retryOf: null,
        signedUrl: "***"
      });
      expect(playwright?.latest.result.raw.attachments).toEqual([
        {
          name: "adapter browser log",
          source: "adapter/browser-attachment.txt",
          type: "text/plain",
          rawPayload: "***"
        }
      ]);

      expect(cypress?.latest.result.status).toBe("unknown");
      expect(cypress?.latest.result.raw.steps?.[0]?.statusDetails?.message).toBe(
        "Adapter hook context at [redacted-local-path] with token=***"
      );
      expect(cypress?.latest.result.raw.steps?.[0]?.attachments).toEqual([
        {
          name: "adapter hook payload",
          source: "adapter/hook-attachment.json",
          type: "application/json",
          content: "***"
        }
      ]);
      expectArchiveReplayIsRedacted(replay);
    });

    it("keeps corrupt partial materialized records bounded and redacted", () => {
      const replay = normalizeArchiveDiagnosticReplayFixture(
        getSyntheticArchiveDiagnosticReplayFixture("corrupt-partial-records")
      );

      expect(replay.summary).toEqual({
        supportedFiles: 4,
        attachmentFiles: 1,
        ignoredFiles: 1,
        warningCount: 1,
        parseErrors: 2,
        attemptGroups: 1,
        latestStatuses: ["failed"]
      });
      expect(replay.parseErrors).toHaveLength(3);
      expect(replay.parseErrors).toEqual([
        "allure-results/replay/partial-missing-result.json: Field `uuid` is required and must be a non-empty string",
        "allure-results/replay/partial-missing-result.json: Field `name` is required and must be a non-empty string",
        expect.stringContaining("[redacted-local-path]: Invalid JSON")
      ]);
      expect(replay.attemptGroups[0]?.latest.statusDetails?.trace).toBe(
        "Synthetic stack included [redacted-local-path] and password=***"
      );
      expectArchiveReplayIsRedacted(replay);
    });

    it("normalizes large chunked descriptor streams deterministically and without raw metadata leakage", () => {
      const fixture = buildLargeChunkedArchiveDescriptorFixture();
      const first = normalizeArchiveDescriptorChunks(fixture.chunks);
      const second = normalizeArchiveDescriptorChunks(fixture.chunks.map((chunk) => [...chunk]));
      const oneShot = normalizeAllureArchiveManifest(fixture.allEntries);

      expect(oneShot.ok).toBe(true);
      if (!oneShot.ok) {
        return;
      }

      expect(second).toEqual(first);
      expect(first.entries).toEqual(oneShot.value.entries);
      expect(first.summary).toEqual({
        chunks: 8,
        totalInputEntries: 136,
        supportedFiles: 92,
        attachmentFiles: 24,
        ignoredFiles: 9,
        warningCount: 26,
        totalUncompressedBytes: oneShot.value.totalUncompressedBytes,
        totalCompressedBytes: oneShot.value.totalCompressedBytes
      });
      expect(first.maxChunkSize).toBe(17);
      expect(first.warnings.at(-1)).toBe(
        "Archive manifest produced 19 additional diagnostics that were omitted"
      );
      expect(countArchiveEntriesByKind(first.entries)).toEqual({
        attachment: 24,
        categories: 1,
        container: 16,
        environment: 1,
        executor: 1,
        history: 1,
        result: 48,
        unsupported: 9
      });
      expect(first.entries[0]).toEqual({
        path: "allure-results/stream/suite-0/case-000-result.json",
        basename: "case-000-result.json",
        kind: "result",
        supported: true,
        ignored: false,
        sizeBytes: 1000,
        compressedSizeBytes: 400
      });
      expect(first.entries[68]).toEqual({
        path: "allure-results/stream/attachments/case-00-attachment.png",
        basename: "case-00-attachment.png",
        kind: "attachment",
        supported: true,
        ignored: false,
        sizeBytes: 10000,
        compressedSizeBytes: 3000
      });
      expect(first.entries[92]).toEqual({
        path: "allure-results/stream/unsupported/notes-00.tmp",
        basename: "notes-00.tmp",
        kind: "unsupported",
        supported: false,
        ignored: true,
        reason: "unsupported allure-results archive entry",
        sizeBytes: 64,
        compressedSizeBytes: 20
      });
      expect(first.entries).toHaveLength(101);
      expect(first.entries.every((entry) => !Object.hasOwn(entry, "payload"))).toBe(true);
      expect(first.entries.every((entry) => !Object.hasOwn(entry, "body"))).toBe(true);
      expect(first.entries.every((entry) => !Object.hasOwn(entry, "content"))).toBe(true);
      expectArchiveDescriptorStreamIsRedacted(first, fixture.sensitiveFragments);
    });
  });

  it("normalizes zipped allure-results archive metadata without reading archive payloads", () => {
    const parsed = normalizeAllureArchiveManifest(syntheticArchiveManifestEntries);

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }

    expect(parsed.value.format).toBe("allure-results-archive-manifest");
    expect(parsed.value.supportedFiles).toBe(5);
    expect(parsed.value.attachmentFiles).toBe(1);
    expect(parsed.value.ignoredFiles).toBe(2);
    expect(parsed.value.totalUncompressedBytes).toBe(1_502_948);
    expect(parsed.value.totalCompressedBytes).toBe(1_100_812);
    expect(parsed.value.entries).toEqual([
      {
        path: "allure-results/0b62f8-result.json",
        basename: "0b62f8-result.json",
        kind: "result",
        supported: true,
        ignored: false,
        sizeBytes: 2048,
        compressedSizeBytes: 512
      },
      {
        path: "allure-results/0b62f8-container.json",
        basename: "0b62f8-container.json",
        kind: "container",
        supported: true,
        ignored: false,
        sizeBytes: 900,
        compressedSizeBytes: 300
      },
      {
        path: "allure-results/environment.properties",
        basename: "environment.properties",
        kind: "environment",
        supported: true,
        ignored: false
      },
      {
        path: "allure-results/history/history-trend.json",
        basename: "history-trend.json",
        kind: "history",
        supported: true,
        ignored: false
      },
      {
        path: "allure-results/91dd11-attachment.png",
        basename: "91dd11-attachment.png",
        kind: "attachment",
        supported: true,
        ignored: false,
        sizeBytes: 1_500_000,
        compressedSizeBytes: 1_100_000
      },
      {
        path: "allure-results/readme.md",
        basename: "readme.md",
        kind: "unsupported",
        supported: false,
        ignored: true,
        reason: "unsupported allure-results archive entry",
        sizeBytes: 120,
        compressedSizeBytes: 80
      },
      {
        path: "allure-results/empty-directory",
        basename: "empty-directory",
        kind: "unsupported",
        supported: false,
        ignored: true,
        reason: "directory"
      }
    ]);
    expect(JSON.stringify(parsed.value)).not.toContain("synthetic-fixture-token");
  });

  it("normalizes nested archive paths and reports duplicate basenames deterministically", () => {
    const parsed = normalizeAllureArchiveManifest([
      {
        path: ".\\allure-results\\suite-a\\same-result.json",
        size: 1.9
      },
      {
        name: "./allure-results/suite-b/same-result.json",
        size: 2
      },
      {
        fileName: "allure-results%2Fhistory%2Fhistory-trend.json"
      },
      {
        path: "./allure-results\\nested\\attachments\\screen-attachment.png"
      }
    ]);

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }

    expect(parsed.value.supportedFiles).toBe(4);
    expect(parsed.value.entries.map((entry) => entry.path)).toEqual([
      "allure-results/suite-a/same-result.json",
      "allure-results/suite-b/same-result.json",
      "allure-results/history/history-trend.json",
      "allure-results/nested/attachments/screen-attachment.png"
    ]);
    expect(parsed.value.entries.map((entry) => entry.basename)).toEqual([
      "same-result.json",
      "same-result.json",
      "history-trend.json",
      "screen-attachment.png"
    ]);
    expect(parsed.warnings).toEqual([
      "Archive entries at indexes [0, 1] have the same basename; consumers must key by normalized path"
    ]);
  });

  it("keeps unsupported and malformed archive diagnostics bounded and redacted", () => {
    const parsed = normalizeAllureArchiveManifest([
      "",
      "C:\\Users\\tester\\Downloads\\secret-result.json",
      "https://object.example.test/archive.zip?token=synthetic-url-token&X-Amz-Signature=synthetic-url-signature",
      {
        path: "allure-results/readme.md",
        payload: "password=synthetic-payload-password"
      },
      {
        name: "allure-results/notes/password=synthetic-name-secret.txt"
      },
      ...Array.from(
        { length: 30 },
        (_, index) => `../outside-${index}-token=synthetic-bad-token-${index}.json`
      )
    ]);

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }

    const diagnostics = JSON.stringify(parsed.warnings);
    expect(parsed.warnings).toHaveLength(26);
    expect(parsed.warnings.at(-1)).toBe(
      "Archive manifest produced 10 additional diagnostics that were omitted"
    );
    expect(diagnostics).not.toContain("C:\\Users\\tester\\Downloads");
    expect(diagnostics).not.toContain("C:/Users/tester/Downloads");
    expect(diagnostics).not.toContain("object.example.test");
    expect(diagnostics).not.toContain("synthetic-url-token");
    expect(diagnostics).not.toContain("synthetic-url-signature");
    expect(diagnostics).not.toContain("synthetic-payload-password");
    expect(diagnostics).not.toContain("synthetic-name-secret");
    expect(diagnostics).not.toContain("synthetic-bad-token");
    expect(parsed.value.entries).toEqual([
      {
        path: "allure-results/readme.md",
        basename: "readme.md",
        kind: "unsupported",
        supported: false,
        ignored: true,
        reason: "unsupported allure-results archive entry"
      },
      {
        path: "allure-results/notes/password=synthetic-name-secret.txt",
        basename: "password=synthetic-name-secret.txt",
        kind: "unsupported",
        supported: false,
        ignored: true,
        reason: "unsupported allure-results archive entry"
      }
    ]);
  });

  it("rejects unsafe archive metadata paths while keeping safe attachment descriptors bounded", () => {
    const parsed = normalizeAllureArchiveManifest(syntheticUnsafeArchiveManifestEntries);

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }

    const serialized = JSON.stringify(parsed.value);
    expect(parsed.warnings).toHaveLength(6);
    expect(parsed.value.entries).toEqual([
      {
        path: "allure-results/safe-attachment.txt",
        basename: "safe-attachment.txt",
        kind: "attachment",
        supported: true,
        ignored: false
      }
    ]);
    expect(serialized).not.toContain("..");
    expect(serialized).not.toContain("C:\\Users\\tester\\Downloads");
    expect(serialized).not.toContain("/tmp/secret-result.json");
    expect(serialized).not.toContain("synthetic-url-token");
    expect(serialized).not.toContain("synthetic-payload-password");
  });

  it("returns per-file diagnostics for malformed supported compatibility files", () => {
    const malformedHistory = parseAllureCompatibilityFile(
      "synthetic-results/history/history.json",
      "{"
    );
    const malformedContainer = parseAllureCompatibilityFile(
      "synthetic-results/container-2-container.json",
      JSON.stringify({
        name: "missing uuid"
      })
    );

    expect(malformedHistory.ok).toBe(false);
    if (!malformedHistory.ok) {
      expect(malformedHistory.errors[0]).toContain("synthetic-results/history/history.json");
      expect(malformedHistory.errors[0]).toContain("Invalid JSON");
    }

    expect(malformedContainer.ok).toBe(false);
    if (!malformedContainer.ok) {
      expect(malformedContainer.errors).toEqual([
        "synthetic-results/container-2-container.json: Field `uuid` is required and must be a non-empty string"
      ]);
    }
  });

  it("redacts local paths and signed URLs from parser diagnostic prefixes", () => {
    const localPath = parseAllureResultJson(
      "{",
      "C:\\Users\\tester\\Downloads\\broken-result.json"
    );
    const signedUrl = parseAllureResultJson(
      "{",
      "https://object.example.test/allure-results/broken-result.json?X-Amz-Signature=synthetic-signed-url-token"
    );

    expect(localPath.ok).toBe(false);
    if (!localPath.ok) {
      expect(localPath.errors[0]).toContain("[redacted-local-path]: Invalid JSON");
      expect(localPath.errors[0]).not.toContain("C:\\Users\\tester\\Downloads");
      expect(localPath.errors[0]).not.toContain("C:/Users/tester/Downloads");
    }

    expect(signedUrl.ok).toBe(false);
    if (!signedUrl.ok) {
      expect(signedUrl.errors[0]).toContain("[redacted-url]: Invalid JSON");
      expect(signedUrl.errors[0]).not.toContain("object.example.test");
      expect(signedUrl.errors[0]).not.toContain("synthetic-signed-url-token");
      expect(signedUrl.errors[0]).not.toContain("X-Amz-Signature");
    }
  });
});

type ArchiveDiagnosticReplayFixtureInput = {
  name: string;
  manifestEntries: unknown[];
  resultFiles: Array<{
    path: string;
    content: string;
  }>;
  expected: {
    supportedFiles: number;
    attachmentFiles: number;
    ignoredFiles: number;
    warningCount: number;
    parseErrors: number;
    attemptGroups: number;
    latestStatuses: string[];
  };
};

function getSyntheticArchiveDiagnosticReplayFixture(
  name: string
): ArchiveDiagnosticReplayFixtureInput {
  const fixture = syntheticArchiveDiagnosticReplayFixtures.find((item) => item.name === name);
  if (fixture === undefined) {
    throw new Error("Synthetic archive diagnostic replay fixture is missing");
  }

  return fixture;
}

function normalizeArchiveDiagnosticReplayFixture(
  fixture: ArchiveDiagnosticReplayFixtureInput | undefined
) {
  if (fixture === undefined) {
    throw new Error("Synthetic archive diagnostic replay fixture is missing");
  }

  const manifest = normalizeAllureArchiveManifest(fixture.manifestEntries);
  if (!manifest.ok) {
    throw new Error(`Synthetic fixture ${fixture.name} manifest did not normalize`);
  }

  const parsedResults = fixture.resultFiles.map((file) => ({
    path: file.path,
    parsed: parseAllureResultJson(file.content, file.path)
  }));
  const validResults = parsedResults.flatMap(({ parsed }) => (parsed.ok ? [parsed.value] : []));
  const attemptGroups = normalizeAllureResultAttempts(validResults);

  return {
    name: fixture.name,
    manifest: manifest.value,
    warnings: manifest.warnings,
    parseErrors: parsedResults.flatMap(({ parsed }) => (parsed.ok ? [] : parsed.errors)),
    attemptGroups,
    summary: {
      supportedFiles: manifest.value.supportedFiles,
      attachmentFiles: manifest.value.attachmentFiles,
      ignoredFiles: manifest.value.ignoredFiles,
      warningCount: manifest.warnings.length,
      parseErrors: parsedResults.filter(({ parsed }) => !parsed.ok).length,
      attemptGroups: attemptGroups.length,
      latestStatuses: attemptGroups.map((group) => group.latest.result.status)
    }
  };
}

function buildLargeChunkedArchiveDescriptorFixture(): {
  allEntries: unknown[];
  chunks: unknown[][];
  sensitiveFragments: string[];
} {
  const credentialParamName = ["tok", "en"].join("");
  const signatureParamName = ["X-Amz", "Signature"].join("-");
  const presignedLocatorField = ["signed", "Url"].join("");
  const syntheticLocalRoot = ["Z:", "synthetic-local", "stream"].join("\\");
  const storageScheme = `${["stor", "age"].join("")}://synthetic-bucket/stream`;
  const objectStoreBaseUrl = "https://object.invalid/stream";
  const rawArchivePayload = "raw streamed archive payload";
  const rawAttachmentPayload = "raw streamed attachment payload";
  const resultEntries = Array.from({ length: 48 }, (_, index) => ({
    path: `allure-results/stream/suite-${index % 6}/case-${index
      .toString()
      .padStart(3, "0")}-result.json`,
    size: 1000 + index,
    compressedSize: 400 + index,
    payload: `${rawArchivePayload} ${credentialParamName}=synthetic-stream-token-${index}`,
    localPath: [syntheticLocalRoot, `case-${index}-result.json`].join("\\")
  }));
  const containerEntries = Array.from({ length: 16 }, (_, index) => ({
    path: `allure-results/stream/containers/case-${index
      .toString()
      .padStart(2, "0")}-container.json`,
    size: 500 + index,
    compressedSizeBytes: 200 + index,
    sourceStorageRef: `${storageScheme}/container-${index}.json`
  }));
  const compatibilityMetadataEntries = [
    {
      path: "allure-results/environment.properties",
      size: 90,
      compressedSize: 30,
      body: `${rawArchivePayload} ${credentialParamName}=synthetic-stream-env-token`
    },
    {
      path: "allure-results/executor.json",
      size: 120,
      compressedSize: 42,
      [presignedLocatorField]: `${objectStoreBaseUrl}/executor.json?${signatureParamName}=synthetic-stream-executor-signature`
    },
    {
      path: "allure-results/categories.json",
      size: 160,
      compressedSize: 55,
      content: `${rawArchivePayload} password=synthetic-stream-categories-password`
    },
    {
      path: "allure-results/history/history-trend.json",
      size: 220,
      compressedSize: 70,
      sourceStorageRef: `${storageScheme}/history-trend.json`
    }
  ];
  const attachmentEntries = Array.from({ length: 24 }, (_, index) => ({
    path: `allure-results/stream/attachments/case-${index
      .toString()
      .padStart(2, "0")}-attachment.png`,
    size: 10_000 + index,
    compressedSize: 3000 + index,
    content: `${rawAttachmentPayload} ${credentialParamName}=synthetic-stream-attachment-token-${index}`,
    [presignedLocatorField]: `${objectStoreBaseUrl}/case-${index}.png?${signatureParamName}=synthetic-stream-attachment-signature-${index}`
  }));
  const unsupportedEntries = Array.from({ length: 9 }, (_, index) => ({
    path: `allure-results/stream/unsupported/notes-${index.toString().padStart(2, "0")}.tmp`,
    size: 64 + index,
    compressedSize: 20 + index,
    body: `${rawArchivePayload} ${credentialParamName}=synthetic-stream-unsupported-token-${index}`
  }));
  const unsafeEntries = Array.from({ length: 35 }, (_, index) => {
    if (index % 3 === 0) {
      return [syntheticLocalRoot, `unsafe-${index}-result.json`].join("\\");
    }
    if (index % 3 === 1) {
      return `${storageScheme}/unsafe-${index}-result.json`;
    }

    return `${objectStoreBaseUrl}/unsafe-${index}.zip?${signatureParamName}=synthetic-stream-unsafe-signature-${index}`;
  });
  const allEntries = [
    ...resultEntries,
    ...containerEntries,
    ...compatibilityMetadataEntries,
    ...attachmentEntries,
    ...unsupportedEntries,
    ...unsafeEntries
  ];

  return {
    allEntries,
    chunks: chunkArchiveEntries(allEntries, 17),
    sensitiveFragments: [
      syntheticLocalRoot,
      syntheticLocalRoot.replaceAll("\\", "/"),
      storageScheme,
      objectStoreBaseUrl,
      rawArchivePayload,
      rawAttachmentPayload,
      "synthetic-stream-token",
      "synthetic-stream-env-token",
      "synthetic-stream-executor-signature",
      "synthetic-stream-categories-password",
      "synthetic-stream-attachment-token",
      "synthetic-stream-attachment-signature",
      "synthetic-stream-unsupported-token",
      "synthetic-stream-unsafe-signature",
      signatureParamName
    ]
  };
}

function chunkArchiveEntries(entries: unknown[], chunkSize: number): unknown[][] {
  const chunks: unknown[][] = [];
  for (let index = 0; index < entries.length; index += chunkSize) {
    chunks.push(entries.slice(index, index + chunkSize));
  }

  return chunks;
}

function normalizeArchiveDescriptorChunks(chunks: unknown[][]) {
  const allEntries = chunks.flatMap((chunk) => chunk);
  const manifest = normalizeAllureArchiveManifest(allEntries);
  if (!manifest.ok) {
    throw new Error("Synthetic chunked archive descriptor manifest did not normalize");
  }

  return {
    summary: {
      chunks: chunks.length,
      totalInputEntries: allEntries.length,
      supportedFiles: manifest.value.supportedFiles,
      attachmentFiles: manifest.value.attachmentFiles,
      ignoredFiles: manifest.value.ignoredFiles,
      warningCount: manifest.warnings.length,
      totalUncompressedBytes: manifest.value.totalUncompressedBytes,
      totalCompressedBytes: manifest.value.totalCompressedBytes
    },
    maxChunkSize: Math.max(...chunks.map((chunk) => chunk.length)),
    entries: manifest.value.entries,
    warnings: manifest.warnings
  };
}

function countArchiveEntriesByKind(
  entries: Array<{
    kind: string;
  }>
): Record<string, number> {
  return entries.reduce<Record<string, number>>((acc, entry) => {
    acc[entry.kind] = (acc[entry.kind] ?? 0) + 1;
    return acc;
  }, {});
}

function expectArchiveDescriptorStreamIsRedacted(
  replay: ReturnType<typeof normalizeArchiveDescriptorChunks>,
  forbiddenFragments: string[]
) {
  const serialized = JSON.stringify(replay);

  expect(serialized).not.toMatch(/\b[A-Z]:[\\/]/);
  for (const fragment of forbiddenFragments) {
    expect(serialized).not.toContain(fragment);
  }
}

function expectArchiveReplayIsRedacted(
  replay: ReturnType<typeof normalizeArchiveDiagnosticReplayFixture>
) {
  const serialized = JSON.stringify(replay);
  const forbiddenFragments = [
    "Z:\\synthetic",
    "Z:/synthetic",
    "storage://synthetic-bucket",
    "object.invalid",
    "../synthetic-denied",
    "Authorization: Bearer synthetic",
    "Cookie: synthetic",
    "raw archive payload",
    "raw archive body",
    "raw archive attachment",
    "raw attachment body",
    "raw payload token",
    "raw body secret",
    "raw hook content",
    "raw missing field payload",
    "synthetic-denied-signature",
    "synthetic-partial-token",
    "synthetic-retry-token",
    "synthetic-materialized-manifest-token",
    "synthetic-materialized-manifest-secret",
    "synthetic-materialized-attachment-token",
    "synthetic-materialized-raw-payload-token",
    "synthetic-materialized-body-secret",
    "synthetic-materialized-bearer",
    "synthetic-materialized-signature",
    "synthetic-materialized-body-bytes",
    "synthetic-adapter-manifest-token",
    "synthetic-adapter-attachment-token",
    "synthetic-adapter-parameter-token",
    "synthetic-adapter-session",
    "synthetic-adapter-label-secret",
    "synthetic-adapter-signed-url",
    "synthetic-adapter-raw-payload-token",
    "synthetic-adapter-cookie",
    "synthetic-adapter-hook-token",
    "synthetic-adapter-hook-attachment-token",
    "synthetic-corrupt-partial-manifest-token",
    "synthetic-corrupt-partial-password",
    "synthetic-corrupt-partial-missing-token",
    "X-Amz-Signature",
    "/tmp/synthetic"
  ];

  expect(serialized).not.toMatch(/\b[A-Z]:[\\/]/);
  for (const fragment of forbiddenFragments) {
    expect(serialized).not.toContain(fragment);
  }
}
