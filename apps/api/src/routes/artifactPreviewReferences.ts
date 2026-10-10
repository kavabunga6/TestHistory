import {
  createArtifactPreviewDescriptor,
  detectArtifactContentType,
  normalizeArtifactSourcePath,
  type ArtifactDescriptor,
  type ArtifactPreviewDescriptor
} from "@testhistory/artifacts";

import {
  isSafeTextPreviewContentType,
  maxBrowserTextPreviewBytes
} from "./uploadAttachmentPreviews.js";

type Attachment = {
  source: string;
  type?: string;
  preview?: ArtifactPreviewDescriptor;
  previewUrl?: string;
};

type Step = {
  attachments?: Attachment[];
  steps?: Step[];
};

export function addArtifactPreviewReferences<
  T extends { attachments: Attachment[]; steps: Step[] }
>(details: T, artifacts: ArtifactDescriptor[]): T {
  const artifactsByPath = new Map(artifacts.map((artifact) => [artifact.path, artifact]));
  return {
    ...details,
    attachments: details.attachments.map((attachment) =>
      addAttachmentPreviewReference(attachment, artifactsByPath)
    ),
    steps: details.steps.map((step) => addStepPreviewReferences(step, artifactsByPath))
  };
}

function addStepPreviewReferences(
  step: Step,
  artifactsByPath: Map<string, ArtifactDescriptor>
): Step {
  return {
    ...step,
    ...(step.attachments !== undefined
      ? {
          attachments: step.attachments.map((attachment) =>
            addAttachmentPreviewReference(attachment, artifactsByPath)
          )
        }
      : {}),
    ...(step.steps !== undefined
      ? { steps: step.steps.map((child) => addStepPreviewReferences(child, artifactsByPath)) }
      : {})
  };
}

function addAttachmentPreviewReference(
  attachment: Attachment,
  artifactsByPath: Map<string, ArtifactDescriptor>
): Attachment {
  const normalizedSource = safePath(attachment.source);
  const artifact =
    normalizedSource === undefined ? undefined : artifactsByPath.get(normalizedSource);
  if (artifact === undefined) return withoutUntrustedPreview(attachment);
  if (isSvgPath(artifact.path)) return withoutUntrustedPreview(attachment);

  const contentType = detectArtifactContentType(
    artifact.path,
    attachment.type ?? artifact.contentType
  );
  if (contentType === undefined) return withoutUntrustedPreview(attachment);
  if (
    !isSafeTextPreviewContentType(contentType) &&
    !isSafeImagePreviewContentType(artifact.path, contentType, artifact.contentType)
  ) {
    return withoutUntrustedPreview(attachment);
  }

  return {
    ...withoutUntrustedPreview(attachment),
    type: contentType,
    preview: createArtifactPreviewDescriptor({
      artifact: { ...artifact, contentType },
      maxPreviewBytes: maxBrowserTextPreviewBytes
    })
  };
}

const safeImageContentTypes = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

function isSafeImagePreviewContentType(
  path: string,
  contentType: string,
  storedContentType: string | undefined
): boolean {
  if (!safeImageContentTypes.has(contentType)) return false;
  const pathContentType = detectArtifactContentType(path);
  if (pathContentType !== undefined && pathContentType !== contentType) return false;
  return (
    storedContentType === undefined ||
    safeImageContentTypes.has(detectArtifactContentType(path, storedContentType) ?? "")
  );
}

function isSvgPath(path: string): boolean {
  const normalizedPath = path.toLowerCase();
  return normalizedPath.endsWith(".svg") || normalizedPath.endsWith(".svgz");
}

function withoutUntrustedPreview(attachment: Attachment): Attachment {
  if (attachment.preview === undefined && attachment.previewUrl === undefined) {
    return attachment;
  }
  const safeAttachment = { ...attachment };
  delete safeAttachment.preview;
  delete safeAttachment.previewUrl;
  return safeAttachment;
}

function safePath(path: string): string | undefined {
  try {
    return normalizeArtifactSourcePath(path);
  } catch {
    return undefined;
  }
}
