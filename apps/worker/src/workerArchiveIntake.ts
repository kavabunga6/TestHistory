import type { IngestionParseJobPayload } from "@testhistory/contracts";
import { maxArchiveIntakeDiagnostics } from "./workerConstants.js";
import { safeAttachmentType } from "./workerAttachmentContent.js";
import { hashIdempotencyParts } from "./workerHash.js";
import { isNonEmptyString, isRecord } from "./workerValueUtils.js";
import type {
  ArchiveIntakeChunkPlan,
  ArchiveIntakeDiagnostic,
  ArchiveIntakeEntryPlan,
  ArchiveIntakeEntryStatus,
  ArchiveIntakeExecutionPlan,
  ArchiveIntakeManifest,
  ArchiveIntakeManifestEntry,
  ArchiveIntakeManifestEntryKind,
  ArchiveManifestIngestionPayload,
  ArchiveParserManifest,
  ArchiveParserManifestEntry
} from "./workerTypes.js";

export function mapArchiveParserManifestToWorkerManifest(
  manifest: ArchiveParserManifest,
  options: { archiveId?: string; chunkSize?: number } = {}
): ArchiveIntakeManifest {
  return {
    format: "allure-archive-manifest",
    ...(options.archiveId !== undefined ? { archiveId: options.archiveId } : {}),
    ...(options.chunkSize !== undefined ? { chunkSize: options.chunkSize } : {}),
    parserDiagnostics: [...(manifest.diagnostics ?? manifest.warnings ?? [])],
    entries: manifest.entries.map((entry) => ({
      path: entry.path,
      kind: mapArchiveParserEntryKind(entry),
      ...(entry.sizeBytes !== undefined ? { sizeBytes: entry.sizeBytes } : {}),
      ...(entry.compressedSizeBytes !== undefined
        ? { compressedBytes: entry.compressedSizeBytes }
        : {})
    }))
  };
}

export function reconcileArchiveParserDiagnostics(
  diagnostics: readonly ArchiveIntakeDiagnostic[],
  parserDiagnostics: readonly string[]
): ArchiveIntakeDiagnostic[] {
  return boundArchiveIntakeDiagnostics([
    ...diagnostics,
    ...summarizeArchiveParserDiagnostics(parserDiagnostics)
  ]);
}

export function buildArchiveIntakeExecutionPlan(
  payload: IngestionParseJobPayload,
  manifest: ArchiveIntakeManifest,
  at: string
): ArchiveIntakeExecutionPlan {
  const archiveRef = buildArchiveRef(payload, manifest);
  const chunkSize = normalizeArchiveChunkSize(manifest.chunkSize);
  const diagnostics: ArchiveIntakeDiagnostic[] = [];
  const entryPlans: ArchiveIntakeEntryPlan[] = [];
  const seenEntryRefs = new Set<string>();

  for (const entry of orderArchiveManifestEntries(manifest.entries)) {
    const path = typeof entry.path === "string" ? entry.path : "";
    const pathHash = hashIdempotencyParts(["archive-entry-path", path]);
    const entryRef = `entry:${pathHash}`;
    const extension = getArchiveEntryExtension(path);

    if (!isSafeArchiveEntryPath(path)) {
      entryPlans.push({
        entryRef,
        pathHash,
        extension,
        kind: "unsupported",
        status: "rejected",
        sizeBytes: normalizeArchiveEntryBytes(entry.sizeBytes),
        compressedBytes: normalizeArchiveEntryBytes(entry.compressedBytes),
        contentType: normalizeArchiveEntryContentType(entry.contentType),
        digestAvailable: isNonEmptyString(entry.sha256),
        reason: "unsafe-entry-path"
      });
      diagnostics.push({
        code: "unsafe-entry-path",
        severity: "error",
        retryable: false,
        entryRef,
        message: "Archive entry path was rejected before processing."
      });
      continue;
    }

    if (seenEntryRefs.has(entryRef)) {
      diagnostics.push({
        code: "duplicate-entry",
        severity: "warn",
        retryable: false,
        entryRef,
        message: "Duplicate archive entry was ignored by retry-safe upsert planning."
      });
      continue;
    }
    seenEntryRefs.add(entryRef);

    const kind = classifyArchiveManifestEntry(entry);
    const processingError = normalizeArchiveProcessingError(entry.processingError);
    const unsupported = kind === "unsupported" || kind === "directory";
    const status: ArchiveIntakeEntryStatus =
      processingError === undefined
        ? unsupported
          ? "skipped"
          : "planned"
        : processingError.retryable
          ? "retryable-error"
          : "terminal-error";
    const reason =
      processingError?.code ??
      (unsupported ? (kind === "directory" ? "directory-entry" : "unsupported-entry") : undefined);

    const plan: ArchiveIntakeEntryPlan = {
      entryRef,
      pathHash,
      extension,
      kind,
      status,
      sizeBytes: normalizeArchiveEntryBytes(entry.sizeBytes),
      compressedBytes: normalizeArchiveEntryBytes(entry.compressedBytes),
      contentType: normalizeArchiveEntryContentType(entry.contentType),
      digestAvailable: isNonEmptyString(entry.sha256),
      ...(reason !== undefined ? { reason } : {})
    };

    entryPlans.push(plan);

    if (unsupported) {
      diagnostics.push({
        code: "unsupported-entry",
        severity: "info",
        retryable: false,
        entryRef,
        message: "Archive entry is not needed for the current ingestion boundary."
      });
    }

    if (processingError !== undefined) {
      diagnostics.push({
        code: "entry-processing-error",
        severity: processingError.retryable ? "warn" : "error",
        retryable: processingError.retryable,
        entryRef,
        message: processingError.retryable
          ? "Archive entry has a retryable synthetic processing error."
          : "Archive entry has a terminal synthetic processing error."
      });
    }
  }

  const processableEntries = entryPlans.filter(
    (entry) => entry.status === "planned" || entry.status === "retryable-error"
  );
  const chunks = chunkArchiveEntryPlans(processableEntries, chunkSize, archiveRef);
  const chunkByEntryRef = new Map<string, ArchiveIntakeChunkPlan>();
  for (const chunk of chunks) {
    for (const entry of processableEntries.slice(
      chunk.index * chunkSize,
      chunk.index * chunkSize + chunk.entryCount
    )) {
      chunkByEntryRef.set(entry.entryRef, chunk);
    }
  }

  const entries = entryPlans.map((entry) => {
    const chunk = chunkByEntryRef.get(entry.entryRef);
    if (chunk === undefined) {
      return entry;
    }

    return {
      ...entry,
      chunkRef: chunk.chunkRef
    };
  });
  const chunkDiagnostics = diagnostics.map((diagnostic) => {
    if (diagnostic.entryRef === undefined) {
      return diagnostic;
    }

    const chunk = chunkByEntryRef.get(diagnostic.entryRef);
    return chunk === undefined ? diagnostic : { ...diagnostic, chunkRef: chunk.chunkRef };
  });
  const reconciledDiagnostics = reconcileArchiveParserDiagnostics(
    chunkDiagnostics,
    manifest.parserDiagnostics ?? []
  );
  const summary = buildArchiveIntakeMetadataSummary(payload, archiveRef, manifest, entries, chunks);

  return {
    boundary: "wip-archive-manifest-worker-no-unzip",
    consistency: "retry-safe-idempotent-entry-plan",
    transitions: [
      { state: "archive_manifest_received", at },
      { state: "archive_entries_classified", at },
      { state: "archive_chunks_planned", at }
    ],
    chunks,
    entries,
    diagnostics: reconciledDiagnostics,
    summary
  };
}

export function getArchiveIntakeManifest(
  payload: IngestionParseJobPayload
): ArchiveIntakeManifest | undefined {
  const candidate = (payload as ArchiveManifestIngestionPayload).archiveManifest;
  if (
    candidate === undefined ||
    candidate.format !== "allure-archive-manifest" ||
    !Array.isArray(candidate.entries)
  ) {
    return undefined;
  }

  return candidate;
}

function mapArchiveParserEntryKind(
  entry: ArchiveParserManifestEntry
): ArchiveIntakeManifestEntryKind {
  if (entry.ignored === true && entry.reason === "directory") {
    return "directory";
  }

  switch (entry.kind) {
    case "result":
    case "container":
    case "attachment":
    case "unsupported":
      return entry.kind;
    case "environment":
    case "executor":
    case "categories":
    case "history":
      return "metadata";
    default:
      return "unsupported";
  }
}

function summarizeArchiveParserDiagnostics(
  parserDiagnostics: readonly string[]
): ArchiveIntakeDiagnostic[] {
  const uniqueDiagnostics = [...new Set(parserDiagnostics.filter(isNonEmptyString))];
  const counts = new Map<ArchiveParserDiagnosticClass, number>();

  for (const diagnostic of uniqueDiagnostics) {
    const diagnosticClass = classifyArchiveParserDiagnostic(diagnostic);
    counts.set(diagnosticClass, (counts.get(diagnosticClass) ?? 0) + 1);
  }

  return archiveParserDiagnosticClassOrder.flatMap((diagnosticClass) => {
    const count = counts.get(diagnosticClass) ?? 0;
    if (count === 0) {
      return [];
    }

    return [buildArchiveParserDiagnosticSummary(diagnosticClass, count)];
  });
}

type ArchiveParserDiagnosticClass =
  | "duplicate-basename"
  | "unsafe-or-malformed-path"
  | "unsupported-entry"
  | "omitted-diagnostics"
  | "other";

const archiveParserDiagnosticClassOrder: readonly ArchiveParserDiagnosticClass[] = [
  "duplicate-basename",
  "unsafe-or-malformed-path",
  "unsupported-entry",
  "omitted-diagnostics",
  "other"
];

function classifyArchiveParserDiagnostic(diagnostic: string): ArchiveParserDiagnosticClass {
  const normalized = diagnostic.toLowerCase();
  if (normalized.includes("same basename")) {
    return "duplicate-basename";
  }
  if (normalized.includes("unsafe") || normalized.includes("malformed")) {
    return "unsafe-or-malformed-path";
  }
  if (normalized.includes("unsupported") || normalized.includes("not supported")) {
    return "unsupported-entry";
  }
  if (normalized.includes("additional diagnostics") && normalized.includes("omitted")) {
    return "omitted-diagnostics";
  }

  return "other";
}

function buildArchiveParserDiagnosticSummary(
  diagnosticClass: ArchiveParserDiagnosticClass,
  count: number
): ArchiveIntakeDiagnostic {
  switch (diagnosticClass) {
    case "duplicate-basename":
      return {
        code: "duplicate-entry",
        severity: "warn",
        retryable: false,
        message: buildArchiveParserSummaryMessage(
          count,
          "duplicate basename diagnostic",
          "worker keys entries by normalized path hash"
        )
      };
    case "unsafe-or-malformed-path":
      return {
        code: "unsafe-entry-path",
        severity: "error",
        retryable: false,
        message: buildArchiveParserSummaryMessage(
          count,
          "malformed or unsafe path diagnostic",
          "unsafe entries were ignored before worker planning"
        )
      };
    case "unsupported-entry":
      return {
        code: "unsupported-entry",
        severity: "warn",
        retryable: false,
        message: buildArchiveParserSummaryMessage(
          count,
          "unsupported entry diagnostic",
          "unsupported entries remain metadata-only status diagnostics"
        )
      };
    case "omitted-diagnostics":
      return {
        code: "diagnostic-limit-reached",
        severity: "warn",
        retryable: false,
        message: buildArchiveParserSummaryMessage(
          count,
          "parser diagnostic limit notice",
          "additional parser diagnostics were already omitted upstream"
        )
      };
    case "other":
      return {
        code: "parser-diagnostic",
        severity: "info",
        retryable: false,
        message: buildArchiveParserSummaryMessage(
          count,
          "parser diagnostic",
          "parser diagnostics were summarized without raw entry payloads"
        )
      };
  }
}

function buildArchiveParserSummaryMessage(count: number, noun: string, detail: string): string {
  const suffix = count === 1 ? noun : `${noun}s`;
  return `Parser reported ${count} ${suffix}; ${detail}.`;
}

function boundArchiveIntakeDiagnostics(
  diagnostics: readonly ArchiveIntakeDiagnostic[]
): ArchiveIntakeDiagnostic[] {
  const uniqueDiagnostics: ArchiveIntakeDiagnostic[] = [];
  const seenDiagnostics = new Set<string>();

  for (const diagnostic of diagnostics) {
    const key = archiveIntakeDiagnosticKey(diagnostic);
    if (seenDiagnostics.has(key)) {
      continue;
    }

    seenDiagnostics.add(key);
    uniqueDiagnostics.push(diagnostic);
  }

  if (uniqueDiagnostics.length <= maxArchiveIntakeDiagnostics) {
    return uniqueDiagnostics;
  }

  return [
    ...uniqueDiagnostics.slice(0, maxArchiveIntakeDiagnostics - 1),
    {
      code: "diagnostic-limit-reached",
      severity: "warn",
      retryable: false,
      message: "Additional archive intake diagnostics were omitted by the worker."
    }
  ];
}

function archiveIntakeDiagnosticKey(diagnostic: ArchiveIntakeDiagnostic): string {
  return [
    diagnostic.code,
    diagnostic.severity,
    diagnostic.retryable ? "retryable" : "terminal",
    diagnostic.entryRef ?? "archive",
    diagnostic.chunkRef ?? "no-chunk",
    diagnostic.message
  ].join("|");
}

function buildArchiveIntakeMetadataSummary(
  payload: IngestionParseJobPayload,
  archiveRef: string,
  manifest: ArchiveIntakeManifest,
  entries: readonly ArchiveIntakeEntryPlan[],
  chunks: readonly ArchiveIntakeChunkPlan[]
): ArchiveIntakeExecutionPlan["summary"] {
  const plannedEntries = entries.filter((entry) => entry.status === "planned");
  const retryableErrorEntries = entries.filter((entry) => entry.status === "retryable-error");
  const rejectedEntryCount = entries.filter((entry) => entry.status === "rejected").length;
  const unsupportedEntryCount = entries.filter((entry) => entry.status === "skipped").length;
  const totalSizeBytes = sumArchiveEntryBytes(entries, "sizeBytes");
  const totalCompressedBytes = sumArchiveEntryBytes(entries, "compressedBytes");
  const idempotencyDigest = hashIdempotencyParts([
    "archive-intake-plan",
    payload.projectId,
    payload.launchId,
    archiveRef,
    ...entries.map((entry) =>
      [
        entry.entryRef,
        entry.kind,
        entry.status,
        entry.sizeBytes ?? "unknown",
        entry.compressedBytes ?? "unknown",
        entry.digestAvailable ? "digest" : "no-digest"
      ].join(":")
    ),
    ...chunks.map((chunk) => chunk.chunkRef)
  ]);

  return {
    boundary: "wip-archive-manifest-worker-no-unzip",
    projectId: payload.projectId,
    launchId: payload.launchId,
    archiveRef,
    sourceFormat: payload.source.format,
    entryCount: manifest.entries.length,
    plannedEntryCount: plannedEntries.length + retryableErrorEntries.length,
    chunkCount: chunks.length,
    rejectedEntryCount,
    unsupportedEntryCount,
    retryableEntryErrorCount: retryableErrorEntries.length,
    totalSizeBytes,
    totalCompressedBytes,
    idempotencyDigest,
    plannedOperations: ["archive.manifest.read", "archive.entries.plan"] as const
  };
}

function buildArchiveRef(
  payload: IngestionParseJobPayload,
  manifest: ArchiveIntakeManifest
): string {
  return `archive:${hashIdempotencyParts([
    "archive-ref",
    payload.projectId,
    payload.launchId,
    manifest.archiveId ?? payload.idempotencyKey ?? payload.source.uri
  ])}`;
}

function orderArchiveManifestEntries(
  entries: readonly ArchiveIntakeManifestEntry[]
): ArchiveIntakeManifestEntry[] {
  return [...entries].sort((left, right) => {
    const leftPath = typeof left.path === "string" ? left.path : "";
    const rightPath = typeof right.path === "string" ? right.path : "";
    const byPath = leftPath.localeCompare(rightPath);
    if (byPath !== 0) {
      return byPath;
    }

    return String(left.sha256 ?? "").localeCompare(String(right.sha256 ?? ""));
  });
}

function chunkArchiveEntryPlans(
  entries: readonly ArchiveIntakeEntryPlan[],
  chunkSize: number,
  archiveRef: string
): ArchiveIntakeChunkPlan[] {
  const chunks: ArchiveIntakeChunkPlan[] = [];
  for (let index = 0; index < entries.length; index += chunkSize) {
    const chunkEntries = entries.slice(index, index + chunkSize);
    const chunkRef = `chunk:${hashIdempotencyParts([
      archiveRef,
      String(chunks.length),
      ...chunkEntries.map((entry) => entry.entryRef)
    ])}`;
    const retryableEntryErrorCount = chunkEntries.filter(
      (entry) => entry.status === "retryable-error"
    ).length;

    chunks.push({
      chunkRef,
      index: chunks.length,
      entryCount: chunkEntries.length,
      totalSizeBytes: sumArchiveEntryBytes(chunkEntries, "sizeBytes"),
      totalCompressedBytes: sumArchiveEntryBytes(chunkEntries, "compressedBytes"),
      status: retryableEntryErrorCount > 0 ? "retryable-error" : "planned",
      retryableEntryErrorCount
    });
  }

  return chunks;
}

function classifyArchiveManifestEntry(
  entry: ArchiveIntakeManifestEntry
): ArchiveIntakeManifestEntryKind {
  if (entry.kind !== undefined) {
    return entry.kind;
  }

  const path = entry.path.toLowerCase();
  if (path.endsWith("/")) {
    return "directory";
  }
  if (path.endsWith("-result.json")) {
    return "result";
  }
  if (path.endsWith("-container.json")) {
    return "container";
  }
  if (
    path.endsWith("executor.json") ||
    path.endsWith("environment.properties") ||
    path.endsWith("categories.json")
  ) {
    return "metadata";
  }
  if (/\.(apng|avif|bmp|gif|html|jpeg|jpg|json|log|png|svg|txt|webm|xml|zip)$/i.test(path)) {
    return "attachment";
  }

  return "unsupported";
}

export function normalizeArchiveProcessingError(
  value: ArchiveIntakeManifestEntry["processingError"]
): { code: string; retryable: boolean } | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  return {
    code: isNonEmptyString(value.code) ? sanitizeArchiveReason(value.code) : "entry-error",
    retryable: value.retryable !== false
  };
}

function sanitizeArchiveReason(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, "-");
  if (/(credential|password|secret|token)/.test(normalized)) {
    return "entry-error";
  }

  return normalized.length > 0 ? normalized.slice(0, 80) : "entry-error";
}

function normalizeArchiveChunkSize(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 100;
  }

  return Math.min(500, Math.max(1, Math.floor(value)));
}

function normalizeArchiveEntryBytes(value: number | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return null;
  }

  return Math.floor(value);
}

function normalizeArchiveEntryContentType(value: string | undefined): string | null {
  if (!isNonEmptyString(value)) {
    return null;
  }

  return safeAttachmentType(value);
}

function getArchiveEntryExtension(path: string): string {
  const fileName = path.split("/").pop() ?? "";
  const dotIndex = fileName.lastIndexOf(".");
  if (dotIndex <= 0 || dotIndex === fileName.length - 1) {
    return "none";
  }

  return fileName
    .slice(dotIndex + 1)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 16);
}

function sumArchiveEntryBytes(
  entries: readonly ArchiveIntakeEntryPlan[],
  key: "sizeBytes" | "compressedBytes"
): number {
  return entries.reduce((total, entry) => total + (entry[key] ?? 0), 0);
}

function isSafeArchiveEntryPath(path: string): boolean {
  if (!isNonEmptyString(path) || path.includes("\0") || path.includes("://")) {
    return false;
  }
  if (/^[a-z]:[\\/]/i.test(path) || path.startsWith("\\\\") || path.startsWith("/")) {
    return false;
  }

  const normalized = path.replace(/\\/g, "/");
  return normalized
    .split("/")
    .every((segment) => segment !== "" && segment !== "." && segment !== "..");
}
