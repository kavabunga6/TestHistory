import { findDuplicateArtifactChecksums, type ArtifactDescriptor } from "@testhistory/artifacts";
import type {
  ArtifactChecksumDuplicateReadModel,
  ArtifactDescriptorReadModel
} from "@testhistory/contracts";

export function serializeArtifactDescriptor(
  artifact: ArtifactDescriptor
): ArtifactDescriptorReadModel {
  return {
    id: artifact.id,
    launchId: artifact.launchId,
    ...(artifact.projectId !== undefined ? { projectId: artifact.projectId } : {}),
    path: artifact.path,
    kind: artifact.kind,
    ...(artifact.contentType !== undefined ? { contentType: artifact.contentType } : {}),
    originalBytes: artifact.originalBytes,
    storedBytes: artifact.storedBytes,
    sha256: artifact.sha256,
    compression: artifact.compression,
    compressionMetadata: artifact.compressionMetadata,
    expiresAt: artifact.expiresAt,
    retention: artifact.retention,
    cleanup: artifact.cleanup,
    upload: artifact.upload,
    createdAt: artifact.createdAt
  };
}

export function serializeArtifactChecksumDuplicates(
  artifacts: readonly ArtifactDescriptor[],
  relevantArtifactIds?: ReadonlySet<string>
): ArtifactChecksumDuplicateReadModel[] {
  return findDuplicateArtifactChecksums(artifacts)
    .filter(
      (duplicate) =>
        relevantArtifactIds === undefined ||
        duplicate.artifactIds.some((artifactId) => relevantArtifactIds.has(artifactId))
    )
    .map(({ sha256, artifactIds, count }) => ({ sha256, artifactIds, count }));
}
