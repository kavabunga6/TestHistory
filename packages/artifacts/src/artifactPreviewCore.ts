import { createHash } from "node:crypto";
import {
  detectArtifactContentType,
  evaluateArtifactPreviewEligibility
} from "./artifactContent.js";
import { restoreArtifactPayload, toArtifactDescriptor } from "./artifactPreparation.js";
import type {
  ArtifactDescriptor,
  ArtifactPreviewDescriptor,
  ArtifactPreviewEligibility,
  ArtifactPreviewFlavor,
  ArtifactPreviewKind,
  PreparedArtifact
} from "./types.js";

const artifactRedactedValue = "[REDACTED]";
const artifactRedactedPath = "[REDACTED_PATH]";
const artifactRedactedUrl = "[REDACTED_URL]";

export function redactArtifactMetadataForLog(value: unknown): unknown {
  return redactArtifactLogValue(value, undefined, 0);
}

export function createArtifactPreviewDescriptor(input: {
  artifact: ArtifactDescriptor | PreparedArtifact;
  content?: Buffer | string;
  maxPreviewBytes?: number;
}): ArtifactPreviewDescriptor {
  const artifact = toArtifactDescriptor(input.artifact);
  const source = resolveArtifactPreviewSource(input.artifact, input.content);
  return createPreviewDescriptor({
    artifact,
    ...(source !== undefined ? { source } : {}),
    ...(input.maxPreviewBytes !== undefined ? { maxPreviewBytes: input.maxPreviewBytes } : {})
  });
}

export function createArtifactPreviewDescriptorFromContent(input: {
  artifactId: string;
  path: string;
  content: Buffer | string;
  contentType?: string;
  maxPreviewBytes?: number;
}): ArtifactPreviewDescriptor {
  const source = Buffer.isBuffer(input.content) ? input.content : Buffer.from(input.content);
  const contentType = detectArtifactContentType(input.path, input.contentType);
  const artifact = {
    id: input.artifactId,
    path: input.path,
    originalBytes: source.byteLength,
    sha256: createHash("sha256").update(source).digest("hex"),
    ...(contentType !== undefined ? { contentType } : {})
  };

  return createPreviewDescriptor({
    artifact,
    source,
    ...(input.maxPreviewBytes !== undefined ? { maxPreviewBytes: input.maxPreviewBytes } : {})
  });
}

function createPreviewDescriptor(input: {
  artifact: Pick<ArtifactDescriptor, "id" | "path" | "originalBytes" | "sha256" | "contentType">;
  source?: Buffer;
  maxPreviewBytes?: number;
}): ArtifactPreviewDescriptor {
  const { artifact } = input;
  const eligibility = evaluateArtifactPreviewEligibility({
    originalBytes: artifact.originalBytes,
    ...(artifact.contentType !== undefined ? { contentType: artifact.contentType } : {}),
    ...(input.maxPreviewBytes !== undefined ? { maxPreviewBytes: input.maxPreviewBytes } : {})
  });
  const flavor = classifyArtifactPreviewFlavor(artifact, eligibility.kind);
  const base = createArtifactPreviewDescriptorBase(artifact, eligibility, flavor);

  if (!eligibility.eligible && eligibility.reason !== "too-large") {
    return {
      ...base,
      support: "unsupported",
      status: "metadata-only",
      reason: eligibility.reason,
      previewBytes: 0,
      body: { type: "metadata-only" },
      safety: createArtifactPreviewSafety(false)
    };
  }

  if (eligibility.kind === "image") {
    return {
      ...base,
      support: "metadata-only",
      status: "metadata-only",
      reason: "image-metadata-only",
      previewBytes: 0,
      body: {
        type: "image-metadata",
        mediaType: eligibility.contentType ?? "application/octet-stream",
        inline: false,
        downloadRequired: true
      },
      safety: createArtifactPreviewSafety(false)
    };
  }

  const source = input.source;
  if (source === undefined) {
    return {
      ...base,
      support: "metadata-only",
      status: "metadata-only",
      reason: "content-unavailable",
      previewBytes: 0,
      body: { type: "metadata-only" },
      safety: createArtifactPreviewSafety(false)
    };
  }

  const decoded = source.toString("utf8");
  const redacted = redactArtifactPreviewText(decoded);
  const bounded = truncateUtf8String(redacted.value, eligibility.maxPreviewBytes);
  const previewBytes = Buffer.byteLength(bounded.value, "utf8");

  return {
    ...base,
    support: "inline",
    status: "ready",
    reason: eligibility.reason,
    previewBytes,
    body: {
      type: "redacted-text",
      encoding: "utf8",
      value: bounded.value,
      lineCount: countPreviewLines(bounded.value),
      truncated: bounded.truncated || previewBytes < Buffer.byteLength(redacted.value, "utf8"),
      redacted: redacted.redacted
    },
    safety: createArtifactPreviewSafety(redacted.redacted)
  };
}

function classifyArtifactPreviewFlavor(
  artifact: Pick<ArtifactDescriptor, "contentType" | "path">,
  kind: ArtifactPreviewKind
): ArtifactPreviewFlavor {
  if (kind === "none") {
    return artifact.contentType === undefined ? "unknown" : "unsupported-binary";
  }
  if (artifact.contentType === "text/plain" && artifact.path.toLowerCase().endsWith(".log")) {
    return "log";
  }
  return kind;
}

function createArtifactPreviewDescriptorBase(
  artifact: Pick<ArtifactDescriptor, "id" | "originalBytes" | "sha256" | "contentType">,
  eligibility: ArtifactPreviewEligibility,
  flavor: ArtifactPreviewFlavor
): Omit<
  ArtifactPreviewDescriptor,
  "support" | "status" | "reason" | "previewBytes" | "body" | "safety"
> {
  return {
    id: createHash("sha256")
      .update(
        [
          "artifact-preview-v1",
          artifact.id,
          artifact.sha256,
          eligibility.kind,
          flavor,
          eligibility.maxPreviewBytes
        ].join("|")
      )
      .digest("hex")
      .slice(0, 32),
    artifactId: artifact.id,
    kind: eligibility.kind,
    flavor,
    originalBytes: artifact.originalBytes,
    maxPreviewBytes: eligibility.maxPreviewBytes,
    ...(eligibility.contentType !== undefined ? { contentType: eligibility.contentType } : {}),
    sha256: artifact.sha256
  };
}

function createArtifactPreviewSafety(
  redactionApplied: boolean
): ArtifactPreviewDescriptor["safety"] {
  return {
    descriptorVersion: 1,
    bounded: true,
    pathIncluded: false,
    storageKeyIncluded: false,
    rawPayloadIncluded: false,
    blobIncluded: false,
    signedUrlIncluded: false,
    redactionApplied
  };
}

function resolveArtifactPreviewSource(
  artifact: ArtifactDescriptor | PreparedArtifact,
  content: Buffer | string | undefined
): Buffer | undefined {
  if (content !== undefined) {
    return Buffer.isBuffer(content) ? content : Buffer.from(content);
  }

  const candidate = artifact as Partial<PreparedArtifact>;
  if (Buffer.isBuffer(candidate.payload)) {
    return restoreArtifactPayload(candidate as PreparedArtifact);
  }

  return undefined;
}

function truncateUtf8String(
  value: string,
  maxBytes: number
): { value: string; truncated: boolean } {
  let bytes = 0;
  let truncated = false;
  let output = "";

  for (const character of value) {
    const nextBytes = Buffer.byteLength(character, "utf8");
    if (bytes + nextBytes > maxBytes) {
      truncated = true;
      break;
    }
    bytes += nextBytes;
    output += character;
  }

  return { value: output, truncated };
}

function countPreviewLines(value: string): number {
  return value.length === 0 ? 0 : value.split(/\r\n|\r|\n/).length;
}

function redactArtifactPreviewText(value: string): { value: string; redacted: boolean } {
  let redacted = value
    .replace(
      /(["'])(authorization|cookie|token|access_token|password|passwd|pwd|secret|signature|x-amz-signature)\1\s*:\s*(["'])[^"']+\3/gi,
      (_match, quote: string, key: string, valueQuote: string) =>
        `${quote}${key}${quote}:${valueQuote}${artifactRedactedValue}${valueQuote}`
    )
    .replace(
      /https?:\/\/[^\s"'<>]+[?&][^\s"'<>]*(?:x-amz-signature|x-amz-credential|signature|sig|token|access_token|secret)=[^\s"'<>]*/gi,
      artifactRedactedUrl
    )
    .replace(/[A-Za-z]:[\\/][^\s"'<>]+/g, artifactRedactedPath)
    .replace(/\\\\[^\s\\]+\\[^\s"'<>]+/g, artifactRedactedPath)
    .replace(/\/(?:Users|home|tmp|var|private|mnt|Volumes)\/[^\s"'<>]+/g, artifactRedactedPath)
    .replace(/\b(authorization|cookie)\s*[:=]\s*[^\r\n]+/gi, `$1: ${artifactRedactedValue}`)
    .replace(
      /\b(token|access_token|password|passwd|pwd|secret|signature|x-amz-signature)\s*[:=]\s*[^\s,;&]+/gi,
      `$1=${artifactRedactedValue}`
    );

  redacted = redacted.replace(
    /[?&](x-amz-signature|x-amz-credential|signature|sig|token|access_token|secret)=[^\s"'<>]+/gi,
    (_match, key: string) => `?${key}=${artifactRedactedValue}`
  );

  return { value: redacted, redacted: redacted !== value };
}

function redactArtifactLogValue(value: unknown, key: string | undefined, depth: number): unknown {
  if (depth > 8) {
    return artifactRedactedValue;
  }
  if (
    value === undefined ||
    value === null ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (Buffer.isBuffer(value)) {
    return `[REDACTED_BUFFER:${value.byteLength}]`;
  }
  if (typeof value === "string") {
    if (isSensitiveArtifactLogKey(key)) {
      return artifactRedactedValue;
    }
    return redactArtifactLogString(value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactArtifactLogValue(item, key, depth + 1));
  }
  if (typeof value === "object") {
    const redacted: Record<string, unknown> = {};
    for (const [entryKey, entryValue] of Object.entries(value)) {
      redacted[entryKey] = isSensitiveArtifactLogKey(entryKey)
        ? artifactRedactedValue
        : redactArtifactLogValue(entryValue, entryKey, depth + 1);
    }
    return redacted;
  }

  return artifactRedactedValue;
}

function isSensitiveArtifactLogKey(key: string | undefined): boolean {
  if (key === undefined) {
    return false;
  }

  return /(^|[._-])(authorization|body|cookie|content|credentials?|hidden|masked|password|passwd|payload|pwd|raw|secret|signature|signed[-_]?url|token)([._-]|$)/i.test(
    key
  );
}

function redactArtifactLogString(value: string): string {
  if (containsSignedUrl(value)) {
    return artifactRedactedUrl;
  }
  if (containsLocalPath(value)) {
    return artifactRedactedPath;
  }
  return value;
}

function containsSignedUrl(value: string): boolean {
  if (!/https?:\/\//i.test(value)) {
    return false;
  }

  try {
    const url = new URL(value);
    return Array.from(url.searchParams.keys()).some((key) =>
      /^(x-amz-signature|x-amz-credential|signature|sig|token|access_token|secret)$/i.test(key)
    );
  } catch {
    return /[?&](x-amz-signature|x-amz-credential|signature|sig|token|access_token|secret)=/i.test(
      value
    );
  }
}

function containsLocalPath(value: string): boolean {
  return (
    /(^|\s)[A-Za-z]:[\\/][^\s]+/.test(value) ||
    /(^|\s)\\\\[^\s\\]+\\[^\s]+/.test(value) ||
    /(^|\s)\/(?:Users|home|tmp|var|private|mnt|Volumes)\//.test(value)
  );
}
