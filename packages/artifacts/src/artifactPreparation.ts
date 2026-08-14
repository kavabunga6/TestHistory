import { createHash } from "node:crypto";
import { gzipSync, gunzipSync } from "node:zlib";
import { classifyArtifact, createArtifactStorageKey } from "./artifactKeys.js";
import {
  chooseArtifactCompressionStrategy,
  createCompressionMetadata,
  detectArtifactContentType,
  normalizeResultStatus
} from "./artifactContent.js";
import { defaultArtifactPolicy, normalizeArtifactPolicy } from "./policy.js";
import type {
  ArtifactChecksumDuplicate,
  ArtifactCleanupMetadata,
  ArtifactDescriptor,
  ArtifactPolicy,
  PreparedArtifact
} from "./types.js";

const maxArtifactPathBytes = 512;
const maxArtifactPathSegmentBytes = 128;
const maxArtifactContentTypeBytes = 255;

export function prepareArtifact(input: {
  launchId: string;
  projectId?: string;
  path: string;
  content: Buffer | string;
  contentType?: string;
  resultStatus?: ArtifactDescriptor["upload"]["resultStatus"];
  now?: Date;
  policy?: ArtifactPolicy;
}): PreparedArtifact {
  const now = input.now ?? new Date();
  const policy = normalizeArtifactPolicy(input.policy ?? defaultArtifactPolicy());
  const artifactPath = normalizeArtifactSourcePath(input.path);
  assertArtifactSourceContent(input.content);
  const raw = Buffer.isBuffer(input.content) ? input.content : Buffer.from(input.content);
  assertArtifactWithinPolicy(raw.byteLength, policy);
  const contentType = detectArtifactContentType(artifactPath, input.contentType);
  assertArtifactContentTypeWithinMetadataLimit(contentType);
  const compressionStrategy = chooseArtifactCompressionStrategy({
    originalBytes: raw.byteLength,
    policy,
    ...(input.resultStatus !== undefined ? { resultStatus: input.resultStatus } : {}),
    ...(contentType !== undefined ? { contentType } : {})
  });
  const compressed = compressionStrategy.shouldAttemptCompression ? gzipSync(raw) : undefined;
  const shouldCompress = compressed !== undefined && compressed.byteLength < raw.byteLength;
  const payload = shouldCompress ? compressed : raw;
  const sha256 = createHash("sha256").update(raw).digest("hex");
  const id = createHash("sha256")
    .update(`${input.launchId}:${artifactPath}:${sha256}`)
    .digest("hex");
  const expiresAt = new Date(now.getTime() + policy.retentionDays * 24 * 60 * 60 * 1000);
  const cleanupEligibleAt = new Date(
    expiresAt.getTime() + policy.cleanupGraceDays * 24 * 60 * 60 * 1000
  );
  const kind = classifyArtifact(artifactPath);
  const compression = shouldCompress ? "gzip" : "none";
  const storageKey = createArtifactStorageKey({ launchId: input.launchId, kind, artifactId: id });

  const artifact: PreparedArtifact = {
    id,
    launchId: input.launchId,
    ...(input.projectId !== undefined ? { projectId: input.projectId } : {}),
    path: artifactPath,
    kind,
    ...(contentType !== undefined ? { contentType } : {}),
    originalBytes: raw.byteLength,
    storedBytes: payload.byteLength,
    sha256,
    compression,
    compressionMetadata: createCompressionMetadata(compression, raw.byteLength, payload.byteLength),
    storage: {
      backend: "s3-compatible",
      accessTier: "frequent",
      diskIsolation: "separate-from-db",
      kubernetesVolume: "csi",
      key: storageKey
    },
    storageKey,
    expiresAt: expiresAt.toISOString(),
    retention: {
      days: policy.retentionDays,
      expiresAt: expiresAt.toISOString(),
      cleanupEligibleAt: cleanupEligibleAt.toISOString()
    },
    cleanup: evaluateArtifactCleanup(expiresAt.toISOString(), now),
    upload: {
      source: policy.metadataSource,
      resultStatus: normalizeResultStatus(input.resultStatus)
    },
    createdAt: now.toISOString(),
    payload
  };

  Object.defineProperty(artifact, "toJSON", {
    value: () => toArtifactDescriptor(artifact),
    enumerable: false
  });

  return artifact;
}

export function normalizeArtifactSourcePath(path: string): string {
  if (typeof path !== "string") {
    throw new Error("Artifact source path is required");
  }

  const trimmedPath = path.trim();
  if (trimmedPath.length === 0) {
    throw new Error("Artifact source path is required");
  }
  if (trimmedPath.includes("\0")) {
    throw new Error("Artifact source path cannot contain NUL bytes");
  }
  if (isUrlLikeArtifactPath(trimmedPath)) {
    throw new Error("Artifact source path must not be a URL");
  }
  if (isAbsoluteArtifactPath(trimmedPath)) {
    throw new Error("Artifact source path must be relative");
  }

  const normalizedPath = trimmedPath.replace(/\\/g, "/").replace(/\/+/g, "/");
  const segments = normalizedPath.split("/");
  if (segments.length === 0) {
    throw new Error("Artifact source path is required");
  }

  for (const segment of segments) {
    const decodedSegment = safeDecodeUriComponent(segment);
    if (
      segment.length === 0 ||
      decodedSegment.length === 0 ||
      decodedSegment === "." ||
      decodedSegment === ".."
    ) {
      throw new Error("Artifact source path cannot contain relative path segments");
    }
    if (decodedSegment.includes("/") || decodedSegment.includes("\\")) {
      throw new Error("Artifact source path segment cannot contain encoded separators");
    }
    if (Buffer.byteLength(segment, "utf8") > maxArtifactPathSegmentBytes) {
      throw new Error(`Artifact source path segment exceeds ${maxArtifactPathSegmentBytes} bytes`);
    }
  }

  if (Buffer.byteLength(normalizedPath, "utf8") > maxArtifactPathBytes) {
    throw new Error(`Artifact source path exceeds ${maxArtifactPathBytes} bytes`);
  }

  return normalizedPath;
}

export function toArtifactDescriptor(
  artifact: ArtifactDescriptor | PreparedArtifact
): ArtifactDescriptor {
  const candidate = artifact as ArtifactDescriptor & Partial<PreparedArtifact>;
  const {
    id,
    launchId,
    projectId,
    path,
    kind,
    contentType,
    originalBytes,
    storedBytes,
    sha256,
    compression,
    compressionMetadata,
    storage,
    storageKey,
    expiresAt,
    retention,
    cleanup,
    upload,
    createdAt
  } = candidate;

  return {
    id,
    launchId,
    ...(projectId !== undefined ? { projectId } : {}),
    path,
    kind,
    ...(contentType !== undefined ? { contentType } : {}),
    originalBytes,
    storedBytes,
    sha256,
    compression,
    compressionMetadata,
    storage,
    storageKey,
    expiresAt,
    retention,
    cleanup,
    upload,
    createdAt
  };
}

export function findDuplicateArtifactChecksums(
  artifacts: readonly ArtifactDescriptor[]
): ArtifactChecksumDuplicate[] {
  const byChecksum = new Map<string, ArtifactDescriptor[]>();

  for (const artifact of artifacts) {
    const existing = byChecksum.get(artifact.sha256) ?? [];
    existing.push(artifact);
    byChecksum.set(artifact.sha256, existing);
  }

  return Array.from(byChecksum.entries())
    .filter(([, artifactsWithChecksum]) => artifactsWithChecksum.length > 1)
    .map(([sha256, artifactsWithChecksum]) => ({
      sha256,
      artifactIds: artifactsWithChecksum.map((artifact) => artifact.id),
      storageKeys: artifactsWithChecksum.map((artifact) => artifact.storageKey),
      count: artifactsWithChecksum.length
    }));
}

export function assertUniqueArtifactChecksums(artifacts: readonly ArtifactDescriptor[]): void {
  const duplicates = findDuplicateArtifactChecksums(artifacts);
  if (duplicates.length > 0) {
    throw new Error(`Duplicate artifact checksums detected: ${duplicates.length}`);
  }
}

export function restoreArtifactPayload(artifact: PreparedArtifact): Buffer {
  return artifact.compression === "gzip" ? gunzipSync(artifact.payload) : artifact.payload;
}

export function evaluateArtifactCleanup(
  expiresAt: string,
  now: Date = new Date()
): ArtifactCleanupMetadata {
  const expiresAtMs = Date.parse(expiresAt);
  const isExpired = Number.isFinite(expiresAtMs) && expiresAtMs <= now.getTime();

  return {
    status: isExpired ? "eligible" : "retained",
    reason: isExpired ? "retention-expired" : "retention-active",
    evaluatedAt: now.toISOString()
  };
}

export function assertArtifactWithinPolicy(
  bytes: number,
  policy: ArtifactPolicy,
  _path = "artifact"
): void {
  if (!Number.isInteger(bytes) || bytes < 0) {
    throw new Error("Artifact has invalid byte length");
  }

  if (bytes > policy.maxArtifactBytes) {
    throw new Error(`Artifact exceeds max artifact size of ${policy.maxArtifactBytes} bytes`);
  }
}

function assertArtifactSourceContent(content: unknown): asserts content is Buffer | string {
  if (content === undefined || content === null) {
    throw new Error("Artifact source content is required");
  }
  if (!Buffer.isBuffer(content) && typeof content !== "string") {
    throw new Error("Artifact source content must be a Buffer or string");
  }
}

function assertArtifactContentTypeWithinMetadataLimit(contentType: string | undefined): void {
  if (
    contentType !== undefined &&
    Buffer.byteLength(contentType, "utf8") > maxArtifactContentTypeBytes
  ) {
    throw new Error(`Artifact content type exceeds ${maxArtifactContentTypeBytes} bytes`);
  }
}

function isUrlLikeArtifactPath(path: string): boolean {
  return /^[A-Za-z][A-Za-z0-9+.-]*:\/\//.test(path) || /^data:/i.test(path);
}

function isAbsoluteArtifactPath(path: string): boolean {
  return (
    path.startsWith("/") ||
    path.startsWith("\\") ||
    /^[A-Za-z]:[\\/]/.test(path) ||
    path.startsWith("//") ||
    path.startsWith("\\\\")
  );
}

function safeDecodeUriComponent(value: string): string {
  let decoded = value;
  try {
    for (let index = 0; index < 3; index += 1) {
      const next = decodeURIComponent(decoded);
      if (next === decoded) {
        break;
      }
      decoded = next;
    }
  } catch {
    return decoded;
  }
  return decoded;
}
