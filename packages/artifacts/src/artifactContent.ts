import { normalizeArtifactPolicy } from "./policy.js";
import type {
  ArtifactCompression,
  ArtifactCompressionMetadata,
  ArtifactCompressionStrategy,
  ArtifactPolicy,
  ArtifactPreviewEligibility,
  ArtifactPreviewKind,
  ArtifactResultStatus,
  ArtifactRetentionClass
} from "./types.js";

export function detectArtifactContentType(
  path: string,
  declaredContentType?: string
): string | undefined {
  const declared = declaredContentType?.split(";")[0]?.trim().toLowerCase();
  if (declared !== undefined && declared.length > 0) {
    return declared === "application/text" ? "text/plain" : declared;
  }

  const normalizedPath = path.toLowerCase();
  if (normalizedPath.endsWith(".png")) {
    return "image/png";
  }
  if (normalizedPath.endsWith(".jpg") || normalizedPath.endsWith(".jpeg")) {
    return "image/jpeg";
  }
  if (normalizedPath.endsWith(".webp")) {
    return "image/webp";
  }
  if (normalizedPath.endsWith(".xml")) {
    return "application/xml";
  }
  if (normalizedPath.endsWith(".txt") || normalizedPath.endsWith(".log")) {
    return "text/plain";
  }
  if (normalizedPath.endsWith(".json")) {
    return "application/json";
  }
  if (normalizedPath.endsWith(".html") || normalizedPath.endsWith(".htm")) {
    return "text/html";
  }
  if (normalizedPath.endsWith(".har")) {
    return "application/json";
  }

  return undefined;
}

export function chooseArtifactCompressionStrategy(input: {
  contentType?: string;
  originalBytes: number;
  resultStatus?: ArtifactResultStatus;
  policy?: Partial<ArtifactPolicy>;
}): ArtifactCompressionStrategy {
  const policy = normalizeArtifactPolicy(input.policy);
  const contentType = normalizeContentType(input.contentType);
  const resultStatus = normalizeResultStatus(input.resultStatus);
  const retentionClass = classifyArtifactRetentionClass(resultStatus);
  const mimeClass = classifyCompressionMime(contentType);

  if (input.originalBytes < policy.compressionMinBytes) {
    return {
      algorithm: "none",
      shouldAttemptCompression: false,
      reason: "below-threshold",
      retentionClass,
      originalBytes: input.originalBytes,
      thresholdBytes: policy.compressionMinBytes,
      resultStatus,
      mimeClass,
      ...(contentType !== undefined ? { contentType } : {})
    };
  }

  if (mimeClass !== "compressible") {
    return {
      algorithm: "none",
      shouldAttemptCompression: false,
      reason: "unsupported-binary",
      retentionClass,
      originalBytes: input.originalBytes,
      thresholdBytes: policy.compressionMinBytes,
      resultStatus,
      mimeClass,
      ...(contentType !== undefined ? { contentType } : {})
    };
  }

  return {
    algorithm: "gzip",
    shouldAttemptCompression: true,
    reason:
      retentionClass === "failure-diagnostic" || retentionClass === "unknown-diagnostic"
        ? "compressible-diagnostic"
        : "compressible-cost-optimized",
    retentionClass,
    originalBytes: input.originalBytes,
    thresholdBytes: policy.compressionMinBytes,
    resultStatus,
    mimeClass,
    ...(contentType !== undefined ? { contentType } : {})
  };
}

export function evaluateArtifactPreviewEligibility(input: {
  contentType?: string;
  originalBytes: number;
  maxPreviewBytes?: number;
}): ArtifactPreviewEligibility {
  const maxPreviewBytes = normalizePositiveInteger(input.maxPreviewBytes, 1024 * 1024);
  const contentType = normalizeContentType(input.contentType);

  if (contentType === undefined) {
    return {
      eligible: false,
      kind: "none",
      reason: "missing-content-type",
      originalBytes: input.originalBytes,
      maxPreviewBytes
    };
  }

  const kind = classifyPreviewKind(contentType);
  if (kind === "none") {
    return {
      eligible: false,
      kind,
      reason: "unsupported-binary",
      originalBytes: input.originalBytes,
      maxPreviewBytes,
      contentType
    };
  }

  if (input.originalBytes > maxPreviewBytes) {
    return {
      eligible: false,
      kind,
      reason: "too-large",
      originalBytes: input.originalBytes,
      maxPreviewBytes,
      contentType
    };
  }

  return {
    eligible: true,
    kind,
    reason: "eligible",
    originalBytes: input.originalBytes,
    maxPreviewBytes,
    contentType
  };
}

export function createCompressionMetadata(
  algorithm: ArtifactCompression,
  originalBytes: number,
  storedBytes: number
): ArtifactCompressionMetadata {
  return {
    algorithm,
    originalBytes,
    storedBytes,
    ratio: originalBytes === 0 ? 1 : Math.round((storedBytes / originalBytes) * 10000) / 10000,
    savedBytes: Math.max(0, originalBytes - storedBytes)
  };
}

export function normalizeResultStatus(
  status: ArtifactResultStatus | undefined
): ArtifactResultStatus {
  return status === "passed" ||
    status === "failed" ||
    status === "broken" ||
    status === "skipped" ||
    status === "unknown"
    ? status
    : "other";
}

export function normalizeContentType(contentType: string | undefined): string | undefined {
  const normalized = contentType?.split(";")[0]?.trim().toLowerCase();
  return normalized === undefined || normalized.length === 0 ? undefined : normalized;
}

export function normalizePositiveInteger(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : fallback;
}

export function classifyArtifactRetentionClass(
  status: ArtifactResultStatus | undefined
): ArtifactRetentionClass {
  const resultStatus = normalizeResultStatus(status);
  if (resultStatus === "passed") {
    return "passed-short";
  }
  if (resultStatus === "skipped") {
    return "skipped-short";
  }
  if (resultStatus === "failed" || resultStatus === "broken") {
    return "failure-diagnostic";
  }
  return "unknown-diagnostic";
}

function classifyCompressionMime(
  contentType: string | undefined
): ArtifactCompressionStrategy["mimeClass"] {
  if (contentType === undefined) {
    return "unknown";
  }
  if (
    contentType.startsWith("text/") ||
    contentType === "application/json" ||
    contentType === "application/xml" ||
    contentType === "application/javascript" ||
    contentType === "application/x-ndjson" ||
    contentType.endsWith("+json") ||
    contentType.endsWith("+xml") ||
    contentType === "image/svg+xml"
  ) {
    return "compressible";
  }
  return "unsupported-binary";
}

export function classifyPreviewKind(contentType: string): ArtifactPreviewKind {
  if (contentType === "application/json" || contentType.endsWith("+json")) {
    return "json";
  }
  if (contentType === "application/xml" || contentType.endsWith("+xml")) {
    return "xml";
  }
  if (contentType === "text/html") {
    return "html";
  }
  if (contentType.startsWith("text/")) {
    return "text";
  }
  if (
    contentType === "image/png" ||
    contentType === "image/jpeg" ||
    contentType === "image/webp" ||
    contentType === "image/gif" ||
    contentType === "image/svg+xml"
  ) {
    return "image";
  }
  return "none";
}
