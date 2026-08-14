import {
  artifactPreviewDescriptorPersistenceVersion,
  maxArtifactPreviewDescriptorPersistenceBytes
} from "./types.js";
import { classifyArtifactRetentionClass, normalizePositiveInteger } from "./artifactContent.js";
import {
  assertArtifactPreviewPersistenceSafe,
  assertArtifactPreviewSerializedBytes,
  readArtifactBoolean,
  readArtifactNumber,
  readArtifactRecord,
  readArtifactString,
  readNonNegativeArtifactInteger,
  readOptionalArtifactString,
  stableArtifactJsonStringify
} from "./artifactPreviewPersistenceUtils.js";
import type {
  ArtifactPreviewDescriptor,
  ArtifactPreviewDescriptorCleanupEligibility,
  ArtifactPreviewDescriptorPersistenceRecord,
  ArtifactPreviewDescriptorReadModel,
  ArtifactPreviewDescriptorRetentionAuditReason,
  ArtifactPreviewDescriptorRetentionClassification,
  ArtifactPreviewDescriptorRetentionPolicyClass,
  ArtifactPreviewFlavor,
  ArtifactPreviewKind,
  ArtifactPreviewSupport,
  ArtifactResultStatus,
  ArtifactRetentionClass
} from "./types.js";

export function createArtifactPreviewDescriptorPersistenceRecord(input: {
  descriptor: ArtifactPreviewDescriptor;
  resultStatus?: ArtifactResultStatus;
  retentionClass?: ArtifactRetentionClass;
  retentionPolicyClass?: ArtifactPreviewDescriptorRetentionPolicyClass;
  retentionHorizonDays?: number;
}): ArtifactPreviewDescriptorPersistenceRecord {
  assertArtifactPreviewPersistenceSafe(input.descriptor);
  const descriptor = normalizeArtifactPreviewDescriptor(input.descriptor);
  const retentionClass =
    input.retentionClass ?? classifyArtifactRetentionClass(input.resultStatus ?? "unknown");

  return {
    schema: "testhistory.artifact-preview-descriptor",
    version: artifactPreviewDescriptorPersistenceVersion,
    retentionClass,
    descriptorRetention: classifyArtifactPreviewDescriptorRetention({
      descriptor,
      retentionClass,
      ...(input.retentionPolicyClass !== undefined
        ? { policyClass: input.retentionPolicyClass }
        : {}),
      ...(input.retentionHorizonDays !== undefined
        ? { retentionHorizonDays: input.retentionHorizonDays }
        : {})
    }),
    descriptor
  };
}

export function serializeArtifactPreviewDescriptor(input: {
  descriptor: ArtifactPreviewDescriptor;
  resultStatus?: ArtifactResultStatus;
  retentionClass?: ArtifactRetentionClass;
  retentionPolicyClass?: ArtifactPreviewDescriptorRetentionPolicyClass;
  retentionHorizonDays?: number;
  maxSerializedBytes?: number;
}): string {
  const maxSerializedBytes = normalizePositiveInteger(
    input.maxSerializedBytes,
    maxArtifactPreviewDescriptorPersistenceBytes
  );
  const record = createArtifactPreviewDescriptorPersistenceRecord(input);
  assertArtifactPreviewPersistenceSafe(record);

  const serialized = stableArtifactJsonStringify(record);
  assertArtifactPreviewSerializedBytes(serialized, maxSerializedBytes);
  return serialized;
}

export function readArtifactPreviewDescriptor(input: {
  serialized: string;
  maxSerializedBytes?: number;
}): ArtifactPreviewDescriptorReadModel {
  const maxSerializedBytes = normalizePositiveInteger(
    input.maxSerializedBytes,
    maxArtifactPreviewDescriptorPersistenceBytes
  );
  assertArtifactPreviewSerializedBytes(input.serialized, maxSerializedBytes);

  let parsed: unknown;
  try {
    parsed = JSON.parse(input.serialized);
  } catch {
    throw new Error("Artifact preview descriptor persistence record is not valid JSON");
  }

  assertArtifactPreviewPersistenceSafe(parsed);
  const record = normalizeArtifactPreviewDescriptorPersistenceRecord(parsed);
  assertArtifactPreviewPersistenceSafe(record);

  const serialized = stableArtifactJsonStringify(record);
  assertArtifactPreviewSerializedBytes(serialized, maxSerializedBytes);
  const descriptorRetention = record.descriptorRetention;
  if (descriptorRetention === undefined) {
    throw new Error("Artifact preview descriptor retention classification is required");
  }
  return {
    schema: record.schema,
    version: record.version,
    retentionClass: record.retentionClass,
    descriptorRetention,
    descriptor: record.descriptor,
    serializedBytes: Buffer.byteLength(serialized, "utf8")
  };
}

export function classifyArtifactPreviewDescriptorRetention(input: {
  descriptor: ArtifactPreviewDescriptor;
  resultStatus?: ArtifactResultStatus;
  retentionClass?: ArtifactRetentionClass;
  policyClass?: ArtifactPreviewDescriptorRetentionPolicyClass;
  retentionHorizonDays?: number;
}): ArtifactPreviewDescriptorRetentionClassification {
  assertArtifactPreviewPersistenceSafe(input.descriptor);
  normalizeArtifactPreviewDescriptor(input.descriptor);
  const retentionClass =
    input.retentionClass ?? classifyArtifactRetentionClass(input.resultStatus ?? "unknown");
  if (!isArtifactRetentionClass(retentionClass)) {
    throw new Error("Artifact preview descriptor retention class is unsupported");
  }

  const policyClass =
    input.policyClass ?? classifyArtifactPreviewRetentionPolicyClass(retentionClass);
  assertArtifactPreviewRetentionPolicyClassAllowed(policyClass, retentionClass);

  const bounds = getArtifactPreviewRetentionHorizonBounds(policyClass);
  const retentionHorizonDays = normalizeArtifactPreviewRetentionHorizonDays(
    input.retentionHorizonDays,
    bounds.defaultDays,
    bounds.minDays,
    bounds.maxDays
  );
  const cleanupEligibility = createArtifactPreviewCleanupEligibility(policyClass);

  return {
    policyClass,
    retentionClass,
    cleanupEligibility,
    auditReason: createArtifactPreviewRetentionAuditReason(policyClass),
    retentionHorizonDays,
    horizon: {
      unit: "days",
      minDays: bounds.minDays,
      maxDays: bounds.maxDays
    },
    safety: createArtifactPreviewDescriptorRetentionSafety()
  };
}

export function normalizeArtifactPreviewDescriptorPersistenceRecord(
  value: unknown
): ArtifactPreviewDescriptorPersistenceRecord {
  const record = readArtifactRecord(value, "Artifact preview descriptor persistence record");
  const schema = readArtifactString(record.schema, "Artifact preview descriptor schema");
  const version = readArtifactNumber(record.version, "Artifact preview descriptor version");
  const retentionClass = readArtifactString(
    record.retentionClass,
    "Artifact preview descriptor retention class"
  );

  if (schema !== "testhistory.artifact-preview-descriptor") {
    throw new Error("Artifact preview descriptor persistence record has unsupported schema");
  }
  if (version !== artifactPreviewDescriptorPersistenceVersion) {
    throw new Error("Artifact preview descriptor persistence record has unsupported version");
  }
  if (!isArtifactRetentionClass(retentionClass)) {
    throw new Error("Artifact preview descriptor persistence record has invalid retention class");
  }
  const descriptor = normalizeArtifactPreviewDescriptor(record.descriptor);

  return {
    schema,
    version,
    retentionClass,
    descriptorRetention: normalizeArtifactPreviewDescriptorRetentionClassification(
      record.descriptorRetention,
      descriptor,
      retentionClass
    ),
    descriptor
  };
}

function normalizeArtifactPreviewDescriptorRetentionClassification(
  value: unknown,
  descriptor: ArtifactPreviewDescriptor,
  retentionClass: ArtifactRetentionClass
): ArtifactPreviewDescriptorRetentionClassification {
  if (value === undefined) {
    return classifyArtifactPreviewDescriptorRetention({ descriptor, retentionClass });
  }

  const classification = readArtifactRecord(
    value,
    "Artifact preview descriptor retention classification"
  );
  const policyClass = readArtifactPreviewRetentionPolicyClass(classification.policyClass);
  const classificationRetentionClass = readArtifactString(
    classification.retentionClass,
    "Artifact preview descriptor retention class"
  );
  const cleanupEligibility = normalizeArtifactPreviewCleanupEligibility(
    classification.cleanupEligibility
  );
  const auditReason = readArtifactPreviewRetentionAuditReason(classification.auditReason);
  const retentionHorizonDays = readNonNegativeArtifactInteger(
    classification.retentionHorizonDays,
    "Artifact preview descriptor retention horizon days"
  );
  const horizon = normalizeArtifactPreviewRetentionHorizon(classification.horizon);
  const safety = normalizeArtifactPreviewDescriptorRetentionSafety(classification.safety);

  if (classificationRetentionClass !== retentionClass) {
    throw new Error("Artifact preview descriptor retention classification is inconsistent");
  }
  const expected = classifyArtifactPreviewDescriptorRetention({
    descriptor,
    retentionClass,
    policyClass,
    retentionHorizonDays
  });

  if (
    cleanupEligibility.eligible !== expected.cleanupEligibility.eligible ||
    cleanupEligibility.reason !== expected.cleanupEligibility.reason ||
    auditReason !== expected.auditReason ||
    horizon.unit !== expected.horizon.unit ||
    horizon.minDays !== expected.horizon.minDays ||
    horizon.maxDays !== expected.horizon.maxDays ||
    safety.bounded !== expected.safety.bounded ||
    safety.pathIncluded !== expected.safety.pathIncluded ||
    safety.storageKeyIncluded !== expected.safety.storageKeyIncluded ||
    safety.rawPayloadIncluded !== expected.safety.rawPayloadIncluded ||
    safety.blobIncluded !== expected.safety.blobIncluded ||
    safety.signedUrlIncluded !== expected.safety.signedUrlIncluded
  ) {
    throw new Error("Artifact preview descriptor retention classification is inconsistent");
  }

  return expected;
}

export function normalizeArtifactPreviewDescriptor(value: unknown): ArtifactPreviewDescriptor {
  const descriptor = readArtifactRecord(value, "Artifact preview descriptor");
  const contentType = readOptionalArtifactString(
    descriptor.contentType,
    "Artifact preview descriptor content type"
  );
  const body = normalizeArtifactPreviewBody(descriptor.body);

  const normalized: ArtifactPreviewDescriptor = {
    id: readArtifactString(descriptor.id, "Artifact preview descriptor id"),
    artifactId: readArtifactString(
      descriptor.artifactId,
      "Artifact preview descriptor artifact id"
    ),
    kind: readArtifactPreviewKind(descriptor.kind),
    flavor: readArtifactPreviewFlavor(descriptor.flavor),
    support: readArtifactPreviewSupport(descriptor.support),
    status: readArtifactPreviewStatus(descriptor.status),
    reason: readArtifactPreviewReason(descriptor.reason),
    originalBytes: readNonNegativeArtifactInteger(
      descriptor.originalBytes,
      "Artifact preview descriptor original bytes"
    ),
    previewBytes: readNonNegativeArtifactInteger(
      descriptor.previewBytes,
      "Artifact preview descriptor preview bytes"
    ),
    maxPreviewBytes: readNonNegativeArtifactInteger(
      descriptor.maxPreviewBytes,
      "Artifact preview descriptor max preview bytes"
    ),
    ...(contentType !== undefined ? { contentType } : {}),
    sha256: readArtifactString(descriptor.sha256, "Artifact preview descriptor checksum"),
    body,
    safety: normalizeArtifactPreviewSafety(descriptor.safety)
  };

  if (normalized.previewBytes > normalized.maxPreviewBytes) {
    throw new Error("Artifact preview descriptor exceeds preview byte bounds");
  }
  if (
    normalized.body.type === "redacted-text" &&
    Buffer.byteLength(normalized.body.value, "utf8") !== normalized.previewBytes
  ) {
    throw new Error("Artifact preview descriptor preview byte count is inconsistent");
  }
  if (normalized.body.type !== "redacted-text" && normalized.previewBytes !== 0) {
    throw new Error("Artifact preview descriptor metadata-only preview must not contain bytes");
  }

  return normalized;
}

function normalizeArtifactPreviewBody(value: unknown): ArtifactPreviewDescriptor["body"] {
  const body = readArtifactRecord(value, "Artifact preview descriptor body");
  const type = readArtifactString(body.type, "Artifact preview descriptor body type");

  if (type === "redacted-text") {
    const encoding = readArtifactString(body.encoding, "Artifact preview descriptor text encoding");
    if (encoding !== "utf8") {
      throw new Error("Artifact preview descriptor text encoding is unsupported");
    }
    return {
      type,
      encoding,
      value: readArtifactString(body.value, "Artifact preview descriptor text value"),
      lineCount: readNonNegativeArtifactInteger(
        body.lineCount,
        "Artifact preview descriptor line count"
      ),
      truncated: readArtifactBoolean(body.truncated, "Artifact preview descriptor truncated flag"),
      redacted: readArtifactBoolean(body.redacted, "Artifact preview descriptor redacted flag")
    };
  }

  if (type === "image-metadata") {
    const mediaType = readArtifactString(
      body.mediaType,
      "Artifact preview descriptor image media type"
    );
    if (
      readArtifactBoolean(body.inline, "Artifact preview descriptor image inline flag") !== false ||
      readArtifactBoolean(
        body.downloadRequired,
        "Artifact preview descriptor image download flag"
      ) !== true
    ) {
      throw new Error("Artifact preview descriptor image body must be metadata-only");
    }
    return {
      type,
      mediaType,
      inline: false,
      downloadRequired: true
    };
  }

  if (type === "metadata-only") {
    return { type };
  }

  throw new Error("Artifact preview descriptor body type is unsupported");
}

function normalizeArtifactPreviewSafety(value: unknown): ArtifactPreviewDescriptor["safety"] {
  const safety = readArtifactRecord(value, "Artifact preview descriptor safety");
  const descriptorVersion = readArtifactNumber(
    safety.descriptorVersion,
    "Artifact preview descriptor safety version"
  );

  if (descriptorVersion !== artifactPreviewDescriptorPersistenceVersion) {
    throw new Error("Artifact preview descriptor safety version is unsupported");
  }
  if (readArtifactBoolean(safety.bounded, "Artifact preview descriptor bounded flag") !== true) {
    throw new Error("Artifact preview descriptor must be bounded");
  }
  if (
    readArtifactBoolean(safety.pathIncluded, "Artifact preview descriptor path flag") !== false ||
    readArtifactBoolean(
      safety.storageKeyIncluded,
      "Artifact preview descriptor storage key flag"
    ) !== false ||
    readArtifactBoolean(
      safety.rawPayloadIncluded,
      "Artifact preview descriptor raw payload flag"
    ) !== false ||
    readArtifactBoolean(safety.blobIncluded, "Artifact preview descriptor blob flag") !== false ||
    readArtifactBoolean(safety.signedUrlIncluded, "Artifact preview descriptor signed URL flag") !==
      false
  ) {
    throw new Error("Artifact preview descriptor includes unsafe artifact material");
  }

  return {
    descriptorVersion,
    bounded: true,
    pathIncluded: false,
    storageKeyIncluded: false,
    rawPayloadIncluded: false,
    blobIncluded: false,
    signedUrlIncluded: false,
    redactionApplied: readArtifactBoolean(
      safety.redactionApplied,
      "Artifact preview descriptor redaction flag"
    )
  };
}

function readArtifactPreviewKind(value: unknown): ArtifactPreviewKind {
  const kind = readArtifactString(value, "Artifact preview descriptor kind");
  if (
    kind === "none" ||
    kind === "text" ||
    kind === "json" ||
    kind === "xml" ||
    kind === "html" ||
    kind === "image"
  ) {
    return kind;
  }
  throw new Error("Artifact preview descriptor kind is unsupported");
}

function readArtifactPreviewFlavor(value: unknown): ArtifactPreviewFlavor {
  const flavor = readArtifactString(value, "Artifact preview descriptor flavor");
  if (
    flavor === "text" ||
    flavor === "log" ||
    flavor === "json" ||
    flavor === "xml" ||
    flavor === "html" ||
    flavor === "image" ||
    flavor === "unsupported-binary" ||
    flavor === "unknown"
  ) {
    return flavor;
  }
  throw new Error("Artifact preview descriptor flavor is unsupported");
}

function readArtifactPreviewSupport(value: unknown): ArtifactPreviewSupport {
  const support = readArtifactString(value, "Artifact preview descriptor support");
  if (support === "inline" || support === "metadata-only" || support === "unsupported") {
    return support;
  }
  throw new Error("Artifact preview descriptor support is unsupported");
}

function readArtifactPreviewStatus(value: unknown): ArtifactPreviewDescriptor["status"] {
  const status = readArtifactString(value, "Artifact preview descriptor status");
  if (status === "ready" || status === "metadata-only") {
    return status;
  }
  throw new Error("Artifact preview descriptor status is unsupported");
}

function readArtifactPreviewReason(value: unknown): ArtifactPreviewDescriptor["reason"] {
  const reason = readArtifactString(value, "Artifact preview descriptor reason");
  if (
    reason === "eligible" ||
    reason === "too-large" ||
    reason === "unsupported-binary" ||
    reason === "missing-content-type" ||
    reason === "content-unavailable" ||
    reason === "image-metadata-only"
  ) {
    return reason;
  }
  throw new Error("Artifact preview descriptor reason is unsupported");
}

function isArtifactRetentionClass(value: string): value is ArtifactRetentionClass {
  return (
    value === "passed-short" ||
    value === "skipped-short" ||
    value === "failure-diagnostic" ||
    value === "unknown-diagnostic"
  );
}

function classifyArtifactPreviewRetentionPolicyClass(
  retentionClass: ArtifactRetentionClass
): ArtifactPreviewDescriptorRetentionPolicyClass {
  return retentionClass === "passed-short" || retentionClass === "skipped-short"
    ? "short-lived-preview"
    : "evidence-retained";
}

function readArtifactPreviewRetentionPolicyClass(
  value: unknown
): ArtifactPreviewDescriptorRetentionPolicyClass {
  const policyClass = readArtifactString(
    value,
    "Artifact preview descriptor retention policy class"
  );
  if (
    policyClass === "short-lived-preview" ||
    policyClass === "evidence-retained" ||
    policyClass === "legal-hold-placeholder"
  ) {
    return policyClass;
  }
  throw new Error("Artifact preview descriptor retention policy class is unsupported");
}

function assertArtifactPreviewRetentionPolicyClassAllowed(
  policyClass: ArtifactPreviewDescriptorRetentionPolicyClass,
  retentionClass: ArtifactRetentionClass
): void {
  if (policyClass === "legal-hold-placeholder") {
    return;
  }
  const expected = classifyArtifactPreviewRetentionPolicyClass(retentionClass);
  if (policyClass !== expected) {
    throw new Error("Artifact preview descriptor retention policy class is inconsistent");
  }
}

function getArtifactPreviewRetentionHorizonBounds(
  policyClass: ArtifactPreviewDescriptorRetentionPolicyClass
): { defaultDays: number; minDays: number; maxDays: number } {
  if (policyClass === "short-lived-preview") {
    return { defaultDays: 7, minDays: 1, maxDays: 30 };
  }
  if (policyClass === "evidence-retained") {
    return { defaultDays: 90, minDays: 7, maxDays: 365 };
  }
  return { defaultDays: 3650, minDays: 1, maxDays: 3650 };
}

function normalizeArtifactPreviewRetentionHorizonDays(
  value: number | undefined,
  defaultDays: number,
  minDays: number,
  maxDays: number
): number {
  if (value === undefined) {
    return defaultDays;
  }
  if (!Number.isInteger(value) || value < minDays || value > maxDays) {
    throw new Error(
      `Artifact preview descriptor retention horizon must be between ${minDays} and ${maxDays} days`
    );
  }
  return value;
}

function createArtifactPreviewCleanupEligibility(
  policyClass: ArtifactPreviewDescriptorRetentionPolicyClass
): ArtifactPreviewDescriptorCleanupEligibility {
  if (policyClass === "legal-hold-placeholder") {
    return {
      eligible: false,
      reason: "legal-hold-placeholder-requires-explicit-release"
    };
  }
  if (policyClass === "evidence-retained") {
    return {
      eligible: true,
      reason: "evidence-retention-horizon-applies"
    };
  }
  return {
    eligible: true,
    reason: "preview-retention-horizon-applies"
  };
}

function createArtifactPreviewRetentionAuditReason(
  policyClass: ArtifactPreviewDescriptorRetentionPolicyClass
): ArtifactPreviewDescriptorRetentionAuditReason {
  if (policyClass === "legal-hold-placeholder") {
    return "legal-hold-placeholder-descriptor";
  }
  if (policyClass === "evidence-retained") {
    return "evidence-preview-descriptor";
  }
  return "short-lived-preview-descriptor";
}

function normalizeArtifactPreviewCleanupEligibility(
  value: unknown
): ArtifactPreviewDescriptorCleanupEligibility {
  const eligibility = readArtifactRecord(value, "Artifact preview descriptor cleanup eligibility");
  const reason = readArtifactString(
    eligibility.reason,
    "Artifact preview descriptor cleanup eligibility reason"
  );

  if (
    reason !== "preview-retention-horizon-applies" &&
    reason !== "evidence-retention-horizon-applies" &&
    reason !== "legal-hold-placeholder-requires-explicit-release"
  ) {
    throw new Error("Artifact preview descriptor cleanup eligibility reason is unsupported");
  }

  return {
    eligible: readArtifactBoolean(
      eligibility.eligible,
      "Artifact preview descriptor cleanup eligibility flag"
    ),
    reason
  };
}

function readArtifactPreviewRetentionAuditReason(
  value: unknown
): ArtifactPreviewDescriptorRetentionAuditReason {
  const reason = readArtifactString(value, "Artifact preview descriptor retention audit reason");
  if (
    reason === "short-lived-preview-descriptor" ||
    reason === "evidence-preview-descriptor" ||
    reason === "legal-hold-placeholder-descriptor"
  ) {
    return reason;
  }
  throw new Error("Artifact preview descriptor retention audit reason is unsupported");
}

function normalizeArtifactPreviewRetentionHorizon(
  value: unknown
): ArtifactPreviewDescriptorRetentionClassification["horizon"] {
  const horizon = readArtifactRecord(value, "Artifact preview descriptor retention horizon");
  const unit = readArtifactString(horizon.unit, "Artifact preview descriptor horizon unit");
  if (unit !== "days") {
    throw new Error("Artifact preview descriptor retention horizon unit is unsupported");
  }
  return {
    unit,
    minDays: readNonNegativeArtifactInteger(
      horizon.minDays,
      "Artifact preview descriptor retention horizon minimum days"
    ),
    maxDays: readNonNegativeArtifactInteger(
      horizon.maxDays,
      "Artifact preview descriptor retention horizon maximum days"
    )
  };
}

function createArtifactPreviewDescriptorRetentionSafety(): ArtifactPreviewDescriptorRetentionClassification["safety"] {
  return {
    bounded: true,
    pathIncluded: false,
    storageKeyIncluded: false,
    rawPayloadIncluded: false,
    blobIncluded: false,
    signedUrlIncluded: false
  };
}

function normalizeArtifactPreviewDescriptorRetentionSafety(
  value: unknown
): ArtifactPreviewDescriptorRetentionClassification["safety"] {
  const safety = readArtifactRecord(value, "Artifact preview descriptor retention safety");
  if (
    readArtifactBoolean(safety.bounded, "Artifact preview descriptor retention bounded flag") !==
      true ||
    readArtifactBoolean(safety.pathIncluded, "Artifact preview descriptor retention path flag") !==
      false ||
    readArtifactBoolean(
      safety.storageKeyIncluded,
      "Artifact preview descriptor retention storage key flag"
    ) !== false ||
    readArtifactBoolean(
      safety.rawPayloadIncluded,
      "Artifact preview descriptor retention raw payload flag"
    ) !== false ||
    readArtifactBoolean(safety.blobIncluded, "Artifact preview descriptor retention blob flag") !==
      false ||
    readArtifactBoolean(
      safety.signedUrlIncluded,
      "Artifact preview descriptor retention signed URL flag"
    ) !== false
  ) {
    throw new Error(
      "Artifact preview descriptor retention classification includes unsafe material"
    );
  }

  return createArtifactPreviewDescriptorRetentionSafety();
}
