import type {
  AllureArchiveManifest,
  AllureArchiveManifestEntry,
  AllureArchiveManifestEntryKind,
  AllureCompatibilityFile,
  ParseResult
} from "./types.js";

const maxArchiveManifestDiagnostics = 25;

export function normalizeAllureArchiveManifest(
  entries: unknown
): ParseResult<AllureArchiveManifest> {
  if (!Array.isArray(entries)) {
    return {
      ok: false,
      errors: ["Allure archive manifest must be an array of entry metadata"],
      warnings: []
    };
  }

  const diagnostics: string[] = [];
  const normalizedEntriesWithIndexes = entries.flatMap(
    (
      entry,
      index
    ): Array<AllureArchiveManifestEntry & { inputIndex: number; duplicateKey: string }> => {
      const entryPath = normalizeArchiveEntryPath(getArchiveEntryPath(entry));
      if (entryPath === undefined) {
        diagnostics.push(
          `Archive entry at index ${index} was ignored because its path is unsafe or malformed`
        );
        return [];
      }

      const basename = entryPath.split("/").at(-1) ?? entryPath;
      const sizeBytes = normalizeByteCount(getArchiveEntrySize(entry, "uncompressed"));
      const compressedSizeBytes = normalizeByteCount(getArchiveEntrySize(entry, "compressed"));
      const compatibilityKind = getAllureCompatibilityKind(entryPath);
      const attachment = compatibilityKind === undefined && isAllureAttachmentEntryPath(entryPath);
      const directory = isArchiveDirectoryEntry(entry, entryPath);
      const supported = compatibilityKind !== undefined || attachment;
      const ignored = directory || !supported;
      const kind: AllureArchiveManifestEntryKind =
        compatibilityKind ?? (attachment ? "attachment" : "unsupported");

      if (!directory && !supported) {
        diagnostics.push(
          `Archive entry at index ${index} was ignored because its filename is not supported`
        );
      }

      return [
        {
          inputIndex: index,
          duplicateKey: basename.toLowerCase(),
          path: entryPath,
          basename,
          kind,
          supported,
          ignored,
          ...(ignored
            ? { reason: directory ? "directory" : "unsupported allure-results archive entry" }
            : {}),
          ...(sizeBytes !== undefined ? { sizeBytes } : {}),
          ...(compressedSizeBytes !== undefined ? { compressedSizeBytes } : {})
        }
      ];
    }
  );
  const duplicateBasenameDiagnostics = getDuplicateArchiveBasenameDiagnostics(
    normalizedEntriesWithIndexes
  );
  const normalizedEntries = normalizedEntriesWithIndexes.map(
    ({ inputIndex: _inputIndex, duplicateKey: _duplicateKey, ...entry }) => entry
  );

  return {
    ok: true,
    value: {
      format: "allure-results-archive-manifest",
      entries: normalizedEntries,
      supportedFiles: normalizedEntries.filter((entry) => entry.supported && !entry.ignored).length,
      attachmentFiles: normalizedEntries.filter(
        (entry) => entry.kind === "attachment" && !entry.ignored
      ).length,
      ignoredFiles: normalizedEntries.filter((entry) => entry.ignored).length,
      totalUncompressedBytes: normalizedEntries.reduce(
        (sum, entry) => sum + (entry.ignored ? 0 : (entry.sizeBytes ?? 0)),
        0
      ),
      totalCompressedBytes: normalizedEntries.reduce(
        (sum, entry) => sum + (entry.ignored ? 0 : (entry.compressedSizeBytes ?? 0)),
        0
      )
    },
    warnings: boundArchiveManifestDiagnostics([...duplicateBasenameDiagnostics, ...diagnostics])
  };
}

function getAllureCompatibilityKind(path: string): AllureCompatibilityFile["kind"] | undefined {
  const normalizedPath = path.replaceAll("\\", "/");
  const basename = normalizedPath.split("/").at(-1)?.toLowerCase() ?? normalizedPath.toLowerCase();

  if (basename.endsWith("-result.json")) {
    return "result";
  }
  if (basename.endsWith("-container.json")) {
    return "container";
  }
  if (basename === "environment.properties") {
    return "environment";
  }
  if (basename === "executor.json") {
    return "executor";
  }
  if (basename === "categories.json") {
    return "categories";
  }

  const lowerPath = normalizedPath.toLowerCase();
  if (
    (lowerPath.startsWith("history/") || lowerPath.includes("/history/")) &&
    basename.endsWith(".json")
  ) {
    return "history";
  }

  return undefined;
}

function isAllureAttachmentEntryPath(path: string): boolean {
  const basename = path.split("/").at(-1)?.toLowerCase() ?? path.toLowerCase();
  return basename.includes("-attachment.") || path.toLowerCase().includes("/attachments/");
}

function getArchiveEntryPath(entry: unknown): unknown {
  if (typeof entry === "string") {
    return entry;
  }

  if (!isRecord(entry)) {
    return undefined;
  }

  return entry.path ?? entry.name ?? entry.fileName;
}

function getArchiveEntrySize(entry: unknown, mode: "uncompressed" | "compressed"): unknown {
  if (!isRecord(entry)) {
    return undefined;
  }

  return mode === "compressed"
    ? (entry.compressedSizeBytes ?? entry.compressedSize)
    : (entry.sizeBytes ?? entry.uncompressedSize ?? entry.size);
}

function normalizeArchiveEntryPath(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const decoded = decodeUriComponentSafe(value.trim());
  if (decoded === undefined) {
    return undefined;
  }

  let normalized = decoded.replaceAll("\\", "/");
  while (normalized.startsWith("./")) {
    normalized = normalized.slice(2);
  }

  if (
    normalized.length === 0 ||
    normalized.includes("\0") ||
    normalized.includes("://") ||
    normalized.startsWith("/") ||
    normalized.includes(":")
  ) {
    return undefined;
  }

  const segments = normalized.split("/");
  if (segments.some((segment) => segment.length === 0 || segment === "." || segment === "..")) {
    return undefined;
  }

  return normalized;
}

function getDuplicateArchiveBasenameDiagnostics(
  entries: Array<AllureArchiveManifestEntry & { inputIndex: number; duplicateKey: string }>
): string[] {
  const entriesByBasename = new Map<
    string,
    Array<AllureArchiveManifestEntry & { inputIndex: number }>
  >();

  entries
    .filter((entry) => !entry.ignored)
    .forEach((entry) => {
      const duplicates = entriesByBasename.get(entry.duplicateKey) ?? [];
      duplicates.push(entry);
      entriesByBasename.set(entry.duplicateKey, duplicates);
    });

  return [...entriesByBasename.values()]
    .filter((duplicates) => duplicates.length > 1)
    .sort(
      (left, right) =>
        (left.at(0)?.inputIndex ?? Number.MAX_SAFE_INTEGER) -
        (right.at(0)?.inputIndex ?? Number.MAX_SAFE_INTEGER)
    )
    .map((duplicates) => {
      const indexes = duplicates.map((entry) => entry.inputIndex).join(", ");
      return `Archive entries at indexes [${indexes}] have the same basename; consumers must key by normalized path`;
    });
}

function boundArchiveManifestDiagnostics(diagnostics: string[]): string[] {
  if (diagnostics.length <= maxArchiveManifestDiagnostics) {
    return diagnostics;
  }

  const omittedDiagnostics = diagnostics.length - maxArchiveManifestDiagnostics;
  return [
    ...diagnostics.slice(0, maxArchiveManifestDiagnostics),
    `Archive manifest produced ${omittedDiagnostics} additional diagnostics that were omitted`
  ];
}

function decodeUriComponentSafe(value: string): string | undefined {
  try {
    return decodeURIComponent(value);
  } catch {
    return undefined;
  }
}

function isArchiveDirectoryEntry(entry: unknown, path: string): boolean {
  if (path.endsWith("/")) {
    return true;
  }

  if (!isRecord(entry)) {
    return false;
  }

  return entry.directory === true || entry.isDirectory === true;
}

function normalizeByteCount(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return undefined;
  }

  return Math.floor(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
