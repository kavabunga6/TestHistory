import { createHash } from "node:crypto";
import { detectArtifactContentType, normalizeArtifactSourcePath } from "@testhistory/artifacts";
import type { UploadFile } from "./uploadTypes.js";

export const maxBrowserTextPreviewBytes = 3 * 1024 * 1024;
const maxLocalInlineImageBytes = 256 * 1024;

export function buildAttachmentFileIndex(files: UploadFile[]): Map<string, UploadFile> {
  const byPath = new Map<string, UploadFile>();
  for (const file of files) {
    const normalized = safeArtifactPath(file.path);
    if (normalized !== undefined) {
      byPath.set(normalized, file);
    }
  }
  return byPath;
}

export function enrichResultAttachmentPreviews<
  T extends { attachments?: unknown[]; raw?: unknown; steps?: unknown[] }
>(result: T, filesByPath: Map<string, UploadFile>, launchId = "local-preview"): T {
  enrichAttachmentList(result.attachments, filesByPath, {
    includeLocalInlineUrl: true,
    includePreview: true,
    launchId
  });
  if (isRecord(result.raw)) {
    enrichAttachmentList(result.raw.attachments, filesByPath, {
      includeLocalInlineUrl: false,
      includePreview: false,
      launchId
    });
    enrichStepAttachmentPreviews(result.raw.steps, filesByPath, {
      includeLocalInlineUrl: false,
      includePreview: false,
      launchId
    });
  }
  enrichStepAttachmentPreviews(result.steps, filesByPath, {
    includeLocalInlineUrl: true,
    includePreview: true,
    launchId
  });
  return result;
}

type AttachmentPreviewOptions = {
  includeLocalInlineUrl: boolean;
  includePreview: boolean;
  launchId: string;
};

function enrichStepAttachmentPreviews(
  steps: unknown,
  filesByPath: Map<string, UploadFile>,
  options: AttachmentPreviewOptions
) {
  if (!Array.isArray(steps)) {
    return;
  }

  for (const step of steps) {
    if (!isRecord(step)) {
      continue;
    }
    enrichAttachmentList(step.attachments, filesByPath, options);
    enrichStepAttachmentPreviews(step.steps, filesByPath, options);
  }
}

function enrichAttachmentList(
  attachments: unknown,
  filesByPath: Map<string, UploadFile>,
  options: AttachmentPreviewOptions
) {
  if (!Array.isArray(attachments)) {
    return;
  }

  for (const attachment of attachments) {
    if (!isRecord(attachment) || typeof attachment.source !== "string") {
      continue;
    }
    const normalizedSource = safeArtifactPath(attachment.source);
    const file = normalizedSource === undefined ? undefined : filesByPath.get(normalizedSource);
    if (file === undefined) {
      continue;
    }

    const contentType =
      typeof attachment.type === "string" ? attachment.type : inferAttachmentContentType(file.path);
    const bytes = Buffer.isBuffer(file.content) ? file.content : Buffer.from(file.content);
    attachment.size = bytes.byteLength;
    if (contentType !== undefined) {
      attachment.type = contentType;
    }
    if (options.includeLocalInlineUrl) {
      const previewUrl = localInlineImageUrl(bytes, contentType);
      if (previewUrl !== undefined) {
        attachment.previewUrl = previewUrl;
      }
    }

    if (!options.includePreview || contentType === undefined) {
      continue;
    }

    if (isSafeTextPreviewContentType(contentType)) {
      attachment.preview = metadataOnlyPreview(file, bytes, contentType, options.launchId);
    } else if (contentType.startsWith("image/")) {
      attachment.preview = metadataOnlyPreview(file, bytes, contentType, options.launchId);
    }
  }
}

export function isSafeTextPreviewContentType(contentType: string): boolean {
  const normalized = contentType.split(";", 1)[0]?.trim().toLowerCase() ?? "";
  return (
    (normalized.startsWith("text/") &&
      normalized !== "text/html" &&
      normalized !== "text/javascript" &&
      normalized !== "text/css") ||
    normalized === "application/json" ||
    normalized.endsWith("+json") ||
    normalized === "application/xml" ||
    normalized.endsWith("+xml")
  );
}

function localInlineImageUrl(bytes: Buffer, contentType: string | undefined): string | undefined {
  if (
    process.env.NODE_ENV !== "development" ||
    process.env.TESTHISTORY_LOCAL_INLINE_ATTACHMENTS === "false" ||
    !contentType?.startsWith("image/") ||
    bytes.byteLength > maxLocalInlineImageBytes
  ) {
    return undefined;
  }

  return `data:${contentType};base64,${bytes.toString("base64")}`;
}

function metadataOnlyPreview(
  file: UploadFile,
  bytes: Buffer,
  contentType: string,
  launchId: string
) {
  const isImage = contentType.startsWith("image/");
  const kind = previewKind(contentType);
  return {
    id: digest(`attachment-preview:${file.path}`),
    artifactId: artifactIdForFile(launchId, file.path, bytes),
    kind,
    flavor: isImage
      ? ("image" as const)
      : contentType.includes("log") || file.path.toLowerCase().endsWith(".log")
        ? ("log" as const)
        : kind,
    support: "metadata-only" as const,
    status: "metadata-only" as const,
    reason: "content-unavailable" as const,
    originalBytes: bytes.byteLength,
    previewBytes: 0,
    maxPreviewBytes: maxBrowserTextPreviewBytes,
    contentType,
    sha256: digest(bytes),
    safety: {
      descriptorVersion: 1 as const,
      bounded: true as const,
      pathIncluded: false as const,
      storageKeyIncluded: false as const,
      rawPayloadIncluded: false as const,
      blobIncluded: false as const,
      signedUrlIncluded: false as const,
      redactionApplied: false
    },
    body: { type: "metadata-only" as const }
  };
}

function artifactIdForFile(launchId: string, path: string, bytes: Buffer): string {
  const normalizedPath = safeArtifactPath(path) ?? path;
  return digest(`${launchId}:${normalizedPath}:${digest(bytes)}`);
}

function previewKind(contentType: string): "image" | "text" | "json" | "xml" {
  const normalized = contentType.split(";", 1)[0]?.trim().toLowerCase() ?? "";
  if (normalized === "application/json" || normalized.endsWith("+json")) return "json";
  if (normalized === "application/xml" || normalized.endsWith("+xml")) return "xml";
  return normalized.startsWith("image/") ? "image" : "text";
}

function safeArtifactPath(path: string): string | undefined {
  try {
    return normalizeArtifactSourcePath(path);
  } catch {
    return undefined;
  }
}

function inferAttachmentContentType(path: string): string | undefined {
  return detectArtifactContentType(path);
}

function digest(content: string | Buffer): string {
  return createHash("sha256").update(content).digest("hex");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}
