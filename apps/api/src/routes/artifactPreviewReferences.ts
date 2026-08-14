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
  if (artifact === undefined) return attachment;

  const contentType = detectArtifactContentType(
    artifact.path,
    attachment.type ?? artifact.contentType
  );
  if (contentType === undefined || !isSafeTextPreviewContentType(contentType)) return attachment;

  return {
    ...attachment,
    type: contentType,
    preview: createArtifactPreviewDescriptor({
      artifact: { ...artifact, contentType },
      maxPreviewBytes: maxBrowserTextPreviewBytes
    })
  };
}

function safePath(path: string): string | undefined {
  try {
    return normalizeArtifactSourcePath(path);
  } catch {
    return undefined;
  }
}
