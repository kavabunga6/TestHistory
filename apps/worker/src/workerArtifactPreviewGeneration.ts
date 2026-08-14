import {
  createArtifactPreviewDescriptor,
  type ArtifactPreviewDescriptor,
  type ArtifactDescriptor
} from "@testhistory/artifacts";
import type { IngestionParseJobPayload } from "@testhistory/contracts";
import { safeAttachmentType } from "./workerAttachmentContent.js";
import { normalizeArchiveProcessingError } from "./workerArchiveIntake.js";
import { hashIdempotencyParts } from "./workerHash.js";
import { isNonEmptyString, isRecord } from "./workerValueUtils.js";
import type {
  ArtifactPreviewDescriptorStoreAdapter,
  ArtifactPreviewGenerationDiagnostic,
  ArtifactPreviewGenerationPlan,
  ArtifactPreviewGenerationRecord,
  ArtifactPreviewGenerationSource
} from "./workerTypes.js";

export function buildArtifactPreviewGenerationPlan(
  payload: IngestionParseJobPayload,
  at: string,
  sources: readonly ArtifactPreviewGenerationSource[]
): ArtifactPreviewGenerationPlan {
  const records: ArtifactPreviewGenerationRecord[] = [];
  const descriptors: ArtifactPreviewDescriptor[] = [];
  const diagnostics: ArtifactPreviewGenerationDiagnostic[] = [];
  const seenArtifacts = new Set<string>();

  for (const source of orderArtifactPreviewSources(sources)) {
    const artifactId = source.artifact.id;
    const artifactRef = buildArtifactPreviewArtifactRef(source.artifact);

    if (seenArtifacts.has(artifactRef)) {
      diagnostics.push({
        code: "duplicate-artifact",
        severity: "warn",
        retryable: false,
        artifactRef,
        message: "Duplicate artifact preview source was ignored by retry-safe upsert planning."
      });
      continue;
    }
    seenArtifacts.add(artifactRef);

    const processingError = normalizeArchiveProcessingError(source.processingError);
    if (processingError !== undefined) {
      const descriptorRef = `preview:${hashIdempotencyParts([
        "artifact-preview-error",
        artifactRef,
        processingError.code,
        processingError.retryable ? "retryable" : "terminal"
      ])}`;
      const status = processingError.retryable ? "retryable-error" : "terminal-error";
      records.push({
        artifactId,
        descriptorRef,
        status,
        support: "none",
        reason: "preview-generation-error",
        contentType: safeArtifactPreviewContentType(source.artifact.contentType),
        originalBytes: normalizePreviewBytes(source.artifact.originalBytes),
        previewBytes: 0,
        maxPreviewBytes: normalizePreviewMaxBytes(source.maxPreviewBytes),
        derivedPreviewIncluded: false,
        retryable: processingError.retryable,
        safety: createArtifactPreviewGenerationSafety(false)
      });
      diagnostics.push({
        code: "preview-generation-error",
        severity: processingError.retryable ? "warn" : "error",
        retryable: processingError.retryable,
        artifactRef,
        descriptorRef,
        message: processingError.retryable
          ? "Artifact preview source has a retryable synthetic processing error."
          : "Artifact preview source has a terminal synthetic processing error."
      });
      continue;
    }

    const descriptor = createArtifactPreviewDescriptor({
      artifact: source.artifact,
      ...(source.content !== undefined ? { content: source.content } : {}),
      ...(source.maxPreviewBytes !== undefined ? { maxPreviewBytes: source.maxPreviewBytes } : {})
    });
    descriptors.push(descriptor);
    records.push({
      artifactId,
      descriptorRef: `preview:${descriptor.id}`,
      status:
        descriptor.status === "ready"
          ? "ready"
          : descriptor.support === "unsupported"
            ? "unsupported"
            : "metadata-only",
      support: descriptor.support,
      reason: descriptor.reason,
      contentType: safeArtifactPreviewContentType(descriptor.contentType),
      originalBytes: descriptor.originalBytes,
      previewBytes: descriptor.previewBytes,
      maxPreviewBytes: descriptor.maxPreviewBytes,
      derivedPreviewIncluded: descriptor.support === "inline",
      retryable: false,
      safety: {
        bounded: true,
        pathIncluded: false,
        storageKeyIncluded: false,
        rawPayloadIncluded: false,
        blobIncluded: false,
        signedUrlIncluded: false,
        redactionApplied: descriptor.safety.redactionApplied
      }
    });
  }

  const summary = buildArtifactPreviewGenerationSummary(payload, sources, records, descriptors);

  return {
    boundary: "wip-artifact-preview-worker",
    consistency: "retry-safe-idempotent-preview-upsert",
    transitions: [
      { state: "preview_sources_received", at },
      { state: "preview_descriptors_built", at },
      { state: "preview_upserts_planned", at }
    ],
    records,
    descriptors: orderArtifactPreviewDescriptors(descriptors),
    diagnostics,
    summary
  };
}

export function createInMemoryArtifactPreviewDescriptorStoreAdapter(
  initialDescriptors: readonly ArtifactPreviewDescriptor[] = []
): ArtifactPreviewDescriptorStoreAdapter {
  const descriptorsByArtifactId = new Map<string, ArtifactPreviewDescriptor>();
  for (const descriptor of initialDescriptors) {
    descriptorsByArtifactId.set(descriptor.artifactId, cloneArtifactPreviewDescriptor(descriptor));
  }

  return {
    kind: "in-memory-preview-descriptor-wip",
    applyDescriptors({ descriptors, generationDigest, at }) {
      let upsertedDescriptorCount = 0;
      let updatedDescriptorCount = 0;
      let unchangedDescriptorCount = 0;

      for (const descriptor of orderArtifactPreviewDescriptors(descriptors)) {
        const nextDescriptor = cloneArtifactPreviewDescriptor(descriptor);
        const currentDescriptor = descriptorsByArtifactId.get(nextDescriptor.artifactId);
        if (currentDescriptor === undefined) {
          upsertedDescriptorCount += 1;
          descriptorsByArtifactId.set(nextDescriptor.artifactId, nextDescriptor);
          continue;
        }

        if (areArtifactPreviewDescriptorsEqual(currentDescriptor, nextDescriptor)) {
          unchangedDescriptorCount += 1;
          continue;
        }

        updatedDescriptorCount += 1;
        descriptorsByArtifactId.set(nextDescriptor.artifactId, nextDescriptor);
      }

      return {
        adapterKind: "in-memory-preview-descriptor-wip",
        boundary: "wip-preview-descriptor-store",
        consistency: "retry-safe-upsert",
        generationDigest,
        appliedAt: at,
        idempotencyKeyHash: hashIdempotencyParts([
          "artifact.preview.apply",
          generationDigest,
          ...orderArtifactPreviewDescriptors(descriptors).map((descriptor) => descriptor.id)
        ]),
        receivedDescriptorCount: descriptors.length,
        upsertedDescriptorCount,
        updatedDescriptorCount,
        unchangedDescriptorCount,
        totalDescriptorCount: descriptorsByArtifactId.size
      };
    },
    snapshot() {
      return orderArtifactPreviewDescriptors([...descriptorsByArtifactId.values()]).map(
        cloneArtifactPreviewDescriptor
      );
    }
  };
}

export function listArtifactPreviewSourcesFromPayload(
  payload: IngestionParseJobPayload
): readonly ArtifactPreviewGenerationSource[] {
  const candidate = (
    payload as IngestionParseJobPayload & {
      artifactPreviews?: { sources?: unknown };
    }
  ).artifactPreviews;
  if (!isRecord(candidate) || !Array.isArray(candidate.sources)) {
    return [];
  }

  return candidate.sources.filter(isArtifactPreviewGenerationSource);
}

function isArtifactPreviewGenerationSource(
  value: unknown
): value is ArtifactPreviewGenerationSource {
  if (!isRecord(value) || !isRecord(value.artifact)) {
    return false;
  }

  return (
    isNonEmptyString(value.artifact.id) &&
    isNonEmptyString(value.artifact.launchId) &&
    isNonEmptyString(value.artifact.path) &&
    typeof value.artifact.originalBytes === "number" &&
    typeof value.artifact.storedBytes === "number" &&
    isNonEmptyString(value.artifact.sha256) &&
    isNonEmptyString(value.artifact.storageKey) &&
    isNonEmptyString(value.artifact.expiresAt) &&
    typeof value.artifact.compression === "string" &&
    isRecord(value.artifact.compressionMetadata) &&
    isRecord(value.artifact.storage) &&
    isRecord(value.artifact.retention) &&
    isRecord(value.artifact.cleanup) &&
    isRecord(value.artifact.upload)
  );
}

function buildArtifactPreviewGenerationSummary(
  payload: IngestionParseJobPayload,
  sources: readonly ArtifactPreviewGenerationSource[],
  records: readonly ArtifactPreviewGenerationRecord[],
  descriptors: readonly ArtifactPreviewDescriptor[]
): ArtifactPreviewGenerationPlan["summary"] {
  const readyCount = records.filter((record) => record.status === "ready").length;
  const metadataOnlyCount = records.filter((record) => record.status === "metadata-only").length;
  const unsupportedCount = records.filter((record) => record.status === "unsupported").length;
  const retryableErrorCount = records.filter(
    (record) => record.status === "retryable-error"
  ).length;
  const terminalErrorCount = records.filter((record) => record.status === "terminal-error").length;
  const inlinePreviewBytes = records.reduce(
    (total, record) => total + (record.derivedPreviewIncluded ? record.previewBytes : 0),
    0
  );
  const generationDigest = hashIdempotencyParts([
    "artifact-preview-generation",
    payload.projectId,
    payload.launchId,
    ...records.map((record) =>
      [
        record.artifactId,
        record.descriptorRef,
        record.status,
        record.support,
        record.previewBytes,
        record.maxPreviewBytes,
        record.retryable ? "retryable" : "terminal-or-ready"
      ].join(":")
    ),
    ...orderArtifactPreviewDescriptors(descriptors).map((descriptor) => descriptor.id)
  ]);

  return {
    projectId: payload.projectId,
    launchId: payload.launchId,
    sourceArtifactCount: sources.length,
    descriptorCount: descriptors.length,
    readyCount,
    metadataOnlyCount,
    unsupportedCount,
    retryableErrorCount,
    terminalErrorCount,
    inlinePreviewBytes,
    generationDigest,
    plannedOperations: ["artifact.preview.generate", "artifact.preview.upsert"] as const
  };
}

function orderArtifactPreviewSources(
  sources: readonly ArtifactPreviewGenerationSource[]
): ArtifactPreviewGenerationSource[] {
  return [...sources].sort((left, right) => {
    const byArtifactId = left.artifact.id.localeCompare(right.artifact.id);
    if (byArtifactId !== 0) {
      return byArtifactId;
    }

    const byDigest = left.artifact.sha256.localeCompare(right.artifact.sha256);
    if (byDigest !== 0) {
      return byDigest;
    }

    const byPreviewLimit =
      normalizePreviewMaxBytes(left.maxPreviewBytes) -
      normalizePreviewMaxBytes(right.maxPreviewBytes);
    if (byPreviewLimit !== 0) {
      return byPreviewLimit;
    }

    return String(left.processingError?.code ?? "").localeCompare(
      String(right.processingError?.code ?? "")
    );
  });
}

function orderArtifactPreviewDescriptors(
  descriptors: readonly ArtifactPreviewDescriptor[]
): ArtifactPreviewDescriptor[] {
  return [...descriptors].sort((left, right) => {
    const byArtifactId = left.artifactId.localeCompare(right.artifactId);
    if (byArtifactId !== 0) {
      return byArtifactId;
    }

    return left.id.localeCompare(right.id);
  });
}

function buildArtifactPreviewArtifactRef(artifact: ArtifactDescriptor): string {
  return `artifact:${hashIdempotencyParts([
    artifact.projectId ?? "no-project",
    artifact.launchId,
    artifact.id,
    artifact.sha256
  ])}`;
}

function createArtifactPreviewGenerationSafety(
  redactionApplied: boolean
): ArtifactPreviewGenerationRecord["safety"] {
  return {
    bounded: true,
    pathIncluded: false,
    storageKeyIncluded: false,
    rawPayloadIncluded: false,
    blobIncluded: false,
    signedUrlIncluded: false,
    redactionApplied
  };
}

function safeArtifactPreviewContentType(value: string | undefined): string | null {
  return value === undefined ? null : safeAttachmentType(value);
}

function normalizePreviewBytes(value: number): number {
  if (!Number.isFinite(value) || value < 0) {
    return 0;
  }

  return Math.floor(value);
}

function normalizePreviewMaxBytes(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 16 * 1024;
  }

  return Math.min(128 * 1024, Math.max(1, Math.floor(value)));
}

function cloneArtifactPreviewDescriptor(
  descriptor: ArtifactPreviewDescriptor
): ArtifactPreviewDescriptor {
  return JSON.parse(JSON.stringify(descriptor)) as ArtifactPreviewDescriptor;
}

function areArtifactPreviewDescriptorsEqual(
  left: ArtifactPreviewDescriptor,
  right: ArtifactPreviewDescriptor
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
