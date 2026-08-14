import type { ArtifactMetadataSource, ArtifactPolicy } from "./types.js";

export function defaultArtifactPolicy(env: NodeJS.ProcessEnv = process.env): ArtifactPolicy {
  return normalizeArtifactPolicy({
    compressionMinBytes: readPositiveInt(env.ARTIFACT_COMPRESSION_MIN_BYTES, 1024),
    retentionDays: readPositiveInt(env.ARTIFACT_RETENTION_DAYS, 14),
    maxUploadConcurrency: readPositiveInt(env.UPLOAD_MAX_CONCURRENCY, 8),
    chunkBytes: readPositiveInt(env.UPLOAD_CHUNK_BYTES, 8 * 1024 * 1024),
    maxArtifactBytes: readPositiveInt(env.ARTIFACT_MAX_BYTES, 512 * 1024 * 1024),
    maxUploadSessionBytes: readPositiveInt(env.UPLOAD_SESSION_MAX_BYTES, 1024 * 1024 * 1024),
    maxUploadChunks: readPositiveInt(env.UPLOAD_MAX_CHUNKS, 10_000),
    uploadSessionTtlMinutes: readPositiveInt(env.UPLOAD_SESSION_TTL_MINUTES, 60),
    cleanupGraceDays: readPositiveInt(env.ARTIFACT_CLEANUP_GRACE_DAYS, 7),
    cleanupBatchSize: readPositiveInt(env.ARTIFACT_CLEANUP_BATCH_SIZE, 1000),
    cleanupBatchIntervalMinutes: readPositiveInt(env.ARTIFACT_CLEANUP_BATCH_INTERVAL_MINUTES, 5),
    metadataSource: readMetadataSource(env.UPLOAD_METADATA_SOURCE, "result")
  });
}

export function normalizeArtifactPolicy(input: Partial<ArtifactPolicy> = {}): ArtifactPolicy {
  const chunkBytes = normalizePositiveInteger(input.chunkBytes, 8 * 1024 * 1024);
  const maxArtifactBytes = Math.max(
    normalizePositiveInteger(input.maxArtifactBytes, 512 * 1024 * 1024),
    chunkBytes
  );

  return {
    compressionMinBytes: normalizePositiveInteger(input.compressionMinBytes, 1024),
    retentionDays: normalizePositiveInteger(input.retentionDays, 14),
    maxUploadConcurrency: normalizePositiveInteger(input.maxUploadConcurrency, 8),
    chunkBytes,
    maxArtifactBytes,
    maxUploadSessionBytes: Math.max(
      normalizePositiveInteger(input.maxUploadSessionBytes, 1024 * 1024 * 1024),
      maxArtifactBytes
    ),
    maxUploadChunks: normalizePositiveInteger(input.maxUploadChunks, 10_000),
    uploadSessionTtlMinutes: normalizePositiveInteger(input.uploadSessionTtlMinutes, 60),
    cleanupGraceDays: normalizePositiveInteger(input.cleanupGraceDays, 7),
    cleanupBatchSize: normalizePositiveInteger(input.cleanupBatchSize, 1000),
    cleanupBatchIntervalMinutes: normalizePositiveInteger(input.cleanupBatchIntervalMinutes, 5),
    metadataSource: input.metadataSource === "test-case" ? "test-case" : "result"
  };
}

function readPositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function readMetadataSource(
  value: string | undefined,
  fallback: ArtifactMetadataSource
): ArtifactMetadataSource {
  return value === "test-case" || value === "result" ? value : fallback;
}

function normalizePositiveInteger(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : fallback;
}
