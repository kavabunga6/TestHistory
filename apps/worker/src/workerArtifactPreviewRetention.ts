import {
  classifyArtifactPreviewDescriptorRetention,
  type ArtifactPreviewDescriptor,
  type ArtifactPreviewDescriptorRetentionClassification
} from "@testhistory/artifacts";
import { maxArtifactPreviewRetentionDiagnostics } from "./workerConstants.js";
import { hashIdempotencyParts } from "./workerHash.js";
import { isNonEmptyString } from "./workerValueUtils.js";
import type {
  ArtifactPreviewRetentionCleanupCandidate,
  ArtifactPreviewRetentionDescriptorSource,
  ArtifactPreviewRetentionDiagnostic,
  ArtifactPreviewRetentionEligibilityPlan,
  ArtifactPreviewRetentionEligibilityRecord,
  ArtifactPreviewRetentionEligibilityStatus
} from "./workerTypes.js";

export function buildArtifactPreviewRetentionEligibilityPlan(input: {
  sources: readonly ArtifactPreviewRetentionDescriptorSource[];
  at: string;
}): ArtifactPreviewRetentionEligibilityPlan {
  const evaluatedAt = normalizePreviewRetentionTimestamp(input.at, new Date().toISOString());
  const records: ArtifactPreviewRetentionEligibilityRecord[] = [];
  const cleanupEligibleDescriptors: ArtifactPreviewRetentionCleanupCandidate[] = [];
  const diagnostics: ArtifactPreviewRetentionDiagnostic[] = [];
  const seenDescriptors = new Set<string>();
  let omittedDiagnosticCount = 0;
  let invalidDescriptorCount = 0;
  let duplicateDescriptorCount = 0;

  for (const source of orderArtifactPreviewRetentionSources(input.sources)) {
    const descriptorRef = buildArtifactPreviewRetentionDescriptorRef(source.descriptor);

    if (seenDescriptors.has(descriptorRef)) {
      duplicateDescriptorCount += 1;
      omittedDiagnosticCount += appendArtifactPreviewRetentionDiagnostic(diagnostics, {
        code: "duplicate-descriptor",
        severity: "warn",
        retryable: false,
        descriptorRef,
        message: "Duplicate preview descriptor retention input was ignored by replay-safe planning."
      });
      continue;
    }
    seenDescriptors.add(descriptorRef);

    try {
      const classification = classifyArtifactPreviewDescriptorRetention({
        descriptor: source.descriptor,
        ...(source.resultStatus !== undefined ? { resultStatus: source.resultStatus } : {}),
        ...(source.retentionClass !== undefined ? { retentionClass: source.retentionClass } : {}),
        ...(source.policyClass !== undefined ? { policyClass: source.policyClass } : {}),
        ...(source.retentionHorizonDays !== undefined
          ? { retentionHorizonDays: source.retentionHorizonDays }
          : {})
      });
      const observedAt = normalizePreviewRetentionTimestamp(source.observedAt, evaluatedAt);
      const record = buildArtifactPreviewRetentionEligibilityRecord({
        descriptor: source.descriptor,
        classification,
        descriptorRef,
        observedAt,
        evaluatedAt
      });

      records.push(record);
      if (record.status === "eligible" && record.cleanupEligibleAt !== null) {
        cleanupEligibleDescriptors.push({
          descriptorRef: record.descriptorRef,
          artifactRef: record.artifactRef,
          retentionClass: record.retentionClass,
          policyClass: record.policyClass,
          auditReason: record.auditReason,
          cleanupEligibleAt: record.cleanupEligibleAt,
          reason: record.cleanupEligibilityReason
        });
      }
    } catch {
      invalidDescriptorCount += 1;
      omittedDiagnosticCount += appendArtifactPreviewRetentionDiagnostic(diagnostics, {
        code: "invalid-descriptor-retention",
        severity: "error",
        retryable: false,
        descriptorRef,
        message: "Preview descriptor retention input was rejected before cleanup projection."
      });
    }
  }

  const orderedRecords = orderArtifactPreviewRetentionRecords(records);
  const orderedCandidates = orderArtifactPreviewRetentionCleanupCandidates(
    cleanupEligibleDescriptors
  );
  const projectionDigest = buildArtifactPreviewRetentionProjectionDigest(
    orderedRecords,
    orderedCandidates
  );
  const summary = buildArtifactPreviewRetentionSummary({
    sources: input.sources,
    records: orderedRecords,
    cleanupEligibleDescriptors: orderedCandidates,
    invalidDescriptorCount,
    duplicateDescriptorCount,
    omittedDiagnosticCount,
    projectionDigest
  });

  return {
    boundary: "worker-local-preview-retention-eligibility",
    consistency: "retry-safe-idempotent-retention-projection",
    transitions: [
      { state: "preview_retention_inputs_received", at: evaluatedAt },
      { state: "preview_descriptor_retention_classified", at: evaluatedAt },
      { state: "preview_cleanup_eligibility_projected", at: evaluatedAt }
    ],
    records: orderedRecords,
    cleanupEligibleDescriptors: orderedCandidates,
    diagnostics,
    summary
  };
}

export function orderArtifactPreviewRetentionSources(
  sources: readonly ArtifactPreviewRetentionDescriptorSource[]
): ArtifactPreviewRetentionDescriptorSource[] {
  return [...sources].sort((left, right) => {
    const leftRef = buildArtifactPreviewRetentionDescriptorRef(left.descriptor);
    const rightRef = buildArtifactPreviewRetentionDescriptorRef(right.descriptor);
    if (leftRef !== rightRef) {
      return leftRef.localeCompare(rightRef);
    }

    return normalizePreviewRetentionTimestamp(left.observedAt, "").localeCompare(
      normalizePreviewRetentionTimestamp(right.observedAt, "")
    );
  });
}

export function buildArtifactPreviewRetentionDescriptorRef(
  descriptor: ArtifactPreviewDescriptor
): string {
  return `preview-retention:${hashIdempotencyParts([
    descriptor?.id ?? "missing-descriptor-id",
    descriptor?.artifactId ?? "missing-artifact-id",
    descriptor?.sha256 ?? "missing-sha256"
  ])}`;
}

function buildArtifactPreviewRetentionArtifactRef(descriptor: ArtifactPreviewDescriptor): string {
  return `artifact:${hashIdempotencyParts([
    descriptor.artifactId,
    descriptor.sha256,
    String(descriptor.originalBytes),
    String(descriptor.previewBytes)
  ])}`;
}

export function normalizePreviewRetentionTimestamp(
  value: string | undefined,
  fallback: string
): string {
  if (!isNonEmptyString(value)) {
    return fallback;
  }

  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return fallback;
  }

  return new Date(timestamp).toISOString();
}

function buildArtifactPreviewRetentionEligibilityRecord(input: {
  descriptor: ArtifactPreviewDescriptor;
  classification: ArtifactPreviewDescriptorRetentionClassification;
  descriptorRef: string;
  observedAt: string;
  evaluatedAt: string;
}): ArtifactPreviewRetentionEligibilityRecord {
  const cleanupEligibleAt =
    input.classification.cleanupEligibility.eligible &&
    input.classification.policyClass !== "legal-hold-placeholder"
      ? new Date(
          Date.parse(input.observedAt) +
            input.classification.retentionHorizonDays * 24 * 60 * 60 * 1000
        ).toISOString()
      : null;
  const isEligible =
    cleanupEligibleAt !== null && Date.parse(cleanupEligibleAt) <= Date.parse(input.evaluatedAt);
  const legalHoldPlaceholder = input.classification.policyClass === "legal-hold-placeholder";
  const evidencePreserved = input.classification.policyClass === "evidence-retained" && !isEligible;
  const status: ArtifactPreviewRetentionEligibilityStatus = legalHoldPlaceholder
    ? "preserved"
    : isEligible
      ? "eligible"
      : "retained";

  return {
    descriptorRef: input.descriptorRef,
    artifactRef: buildArtifactPreviewRetentionArtifactRef(input.descriptor),
    status,
    retentionClass: input.classification.retentionClass,
    policyClass: input.classification.policyClass,
    auditReason: input.classification.auditReason,
    cleanupEligibilityReason: input.classification.cleanupEligibility.reason,
    observedAt: input.observedAt,
    cleanupEligibleAt,
    retentionHorizonDays: input.classification.retentionHorizonDays,
    evidencePreserved,
    legalHoldPlaceholder,
    safety: input.classification.safety
  };
}

function appendArtifactPreviewRetentionDiagnostic(
  diagnostics: ArtifactPreviewRetentionDiagnostic[],
  diagnostic: ArtifactPreviewRetentionDiagnostic
): number {
  if (diagnostics.length < maxArtifactPreviewRetentionDiagnostics) {
    diagnostics.push({
      ...diagnostic,
      message: diagnostic.message.slice(0, 160)
    });
    return 0;
  }

  if (
    diagnostics.length === maxArtifactPreviewRetentionDiagnostics &&
    diagnostics.every((entry) => entry.code !== "diagnostic-limit-reached")
  ) {
    diagnostics.push({
      code: "diagnostic-limit-reached",
      severity: "warn",
      retryable: false,
      message: "Additional preview descriptor retention diagnostics were omitted."
    });
  }

  return 1;
}

function orderArtifactPreviewRetentionRecords(
  records: readonly ArtifactPreviewRetentionEligibilityRecord[]
): ArtifactPreviewRetentionEligibilityRecord[] {
  return [...records].sort((left, right) => left.descriptorRef.localeCompare(right.descriptorRef));
}

export function orderArtifactPreviewRetentionCleanupCandidates(
  candidates: readonly ArtifactPreviewRetentionCleanupCandidate[]
): ArtifactPreviewRetentionCleanupCandidate[] {
  return [...candidates].sort((left, right) =>
    left.descriptorRef.localeCompare(right.descriptorRef)
  );
}

function buildArtifactPreviewRetentionProjectionDigest(
  records: readonly ArtifactPreviewRetentionEligibilityRecord[],
  cleanupEligibleDescriptors: readonly ArtifactPreviewRetentionCleanupCandidate[]
): string {
  return hashIdempotencyParts([
    "artifact.preview.retention.projection",
    ...records.flatMap((record) => [
      record.descriptorRef,
      record.artifactRef,
      record.status,
      record.retentionClass,
      record.policyClass,
      record.cleanupEligibleAt ?? "no-cleanup-eligible-at"
    ]),
    ...cleanupEligibleDescriptors.map((candidate) => candidate.descriptorRef)
  ]);
}

function buildArtifactPreviewRetentionSummary(input: {
  sources: readonly ArtifactPreviewRetentionDescriptorSource[];
  records: readonly ArtifactPreviewRetentionEligibilityRecord[];
  cleanupEligibleDescriptors: readonly ArtifactPreviewRetentionCleanupCandidate[];
  invalidDescriptorCount: number;
  duplicateDescriptorCount: number;
  omittedDiagnosticCount: number;
  projectionDigest: string;
}): ArtifactPreviewRetentionEligibilityPlan["summary"] {
  const evidenceDescriptorCount = input.records.filter(
    (record) => record.policyClass === "evidence-retained"
  ).length;
  const legalHoldPlaceholderCount = input.records.filter(
    (record) => record.legalHoldPlaceholder
  ).length;
  const retainedDescriptorCount = input.records.filter(
    (record) => record.status === "retained" || record.status === "preserved"
  ).length;

  return {
    sourceDescriptorCount: input.sources.length,
    classifiedDescriptorCount: input.records.length,
    cleanupEligibleDescriptorCount: input.cleanupEligibleDescriptors.length,
    retainedDescriptorCount,
    evidenceDescriptorCount,
    legalHoldPlaceholderCount,
    invalidDescriptorCount: input.invalidDescriptorCount,
    duplicateDescriptorCount: input.duplicateDescriptorCount,
    omittedDiagnosticCount: input.omittedDiagnosticCount,
    projectionDigest: input.projectionDigest,
    plannedOperations: [
      "artifact.preview.retention.classify",
      "artifact.preview.cleanup.project"
    ] as const
  };
}
