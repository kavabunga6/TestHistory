import { ChevronDown, FileText, Image, Paperclip } from "lucide-react";
import { useState, type CSSProperties } from "react";

import { canDownloadAttachment, canPreviewImage } from "../AttachmentImageSource.js";
import type { ResultAttachment, TestResult } from "../m1Workspace.js";
import {
  AttachmentDownloadButton,
  AttachmentPreview as AttachmentInlinePreview,
  AttachmentViewerButton
} from "../AttachmentViewer.js";
import { collectAttachments } from "./LaunchesReferenceModel.js";
export function ResultAttachmentsTab({ result }: { result: TestResult }) {
  const attachments = collectAttachments(result);

  return (
    <div className="launches-reference-result-tab-panel">
      <section>
        <h4>Вложения</h4>
        {attachments.length === 0 ? (
          <p className="launches-reference-muted">Вложений нет.</p>
        ) : (
          <>
            <p className="launches-reference-attachment-context">
              Все файлы результата и его шагов, включая свёрнутые шаги.
            </p>
            <AttachmentList attachments={attachments} />
          </>
        )}
      </section>
    </div>
  );
}

export function AttachmentList({
  attachments,
  compact = false,
  depth = 0
}: {
  attachments: ResultAttachment[];
  compact?: boolean;
  depth?: number;
}) {
  const depthStyle = compact
    ? ({
        "--launches-step-indent": `calc(var(--launches-step-indent-unit, 24px) * ${depth})`
      } as CSSProperties)
    : undefined;
  return (
    <div
      className={`launches-reference-attachments ${compact ? "compact" : ""}`}
      style={depthStyle}
      aria-label={compact ? "Вложения шага" : "Все вложения результата и шагов"}
      role="group"
    >
      {attachments.map((attachment) => (
        <AttachmentRow attachment={attachment} key={`${attachment.source}-${attachment.name}`} />
      ))}
    </div>
  );
}

function AttachmentRow({ attachment }: { attachment: ResultAttachment }) {
  const [isOpen, setIsOpen] = useState(false);
  const hasPreview = hasInlinePreview(attachment);
  const canDownload = canDownloadAttachment(attachment);
  const canOpen = hasPreview || hasRemoteTextPreview(attachment);
  const heading = (
    <>
      <span className="launches-reference-attachment-icon">{getAttachmentRowIcon(attachment)}</span>
      <span className="launches-reference-attachment-name">
        <strong>{attachment.name}</strong>
        <small>
          {attachment.mediaType} {"\u00b7"} {attachment.size}
        </small>
      </span>
      <span className="launches-reference-attachment-tools">
        {canOpen || canDownload ? (
          <span
            className="launches-reference-attachment-actions"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
          >
            {canOpen ? (
              <span title={`Открыть вложение «${attachment.name}»`}>
                <AttachmentViewerButton attachment={attachment} label="Открыть" />
              </span>
            ) : null}
            {canDownload ? (
              <span title={`Скачать вложение «${attachment.name}»`}>
                <AttachmentDownloadButton attachment={attachment} label="Скачать" />
              </span>
            ) : null}
          </span>
        ) : (
          <span className="launches-reference-attachment-unavailable">Просмотр недоступен</span>
        )}
        {hasPreview ? (
          <>
            <span className="launches-reference-attachment-toggle-label">Превью</span>
            <ChevronDown aria-hidden="true" size={16} />
          </>
        ) : null}
      </span>
    </>
  );

  if (!hasPreview) {
    return (
      <div className="launches-reference-attachment">
        <div className="launches-reference-attachment-heading">{heading}</div>
      </div>
    );
  }

  return (
    <details
      className="launches-reference-attachment"
      onToggle={(event) => setIsOpen(event.currentTarget.open)}
    >
      <summary title={`Показать или скрыть превью вложения «${attachment.name}»`}>
        {heading}
      </summary>
      {isOpen ? (
        <div className="launches-reference-attachment-body">
          <AttachmentInlinePreview attachment={attachment} loadRemote />
        </div>
      ) : null}
    </details>
  );
}

function hasInlinePreview(attachment: ResultAttachment): boolean {
  const mediaType = attachment.mediaType.toLowerCase();
  return (
    canPreviewImage(attachment) ||
    (mediaType.startsWith("video/") && attachment.previewUrl !== undefined) ||
    attachment.preview?.body.type === "redacted-text"
  );
}

function hasRemoteTextPreview(attachment: ResultAttachment): boolean {
  const kind = attachment.preview?.kind;
  return Boolean(
    attachment.preview?.artifactId && (kind === "text" || kind === "json" || kind === "xml")
  );
}

function getAttachmentRowIcon(attachment: ResultAttachment) {
  const mediaType = attachment.mediaType.toLowerCase();

  if (mediaType.startsWith("image/") || mediaType.startsWith("video/")) {
    return <Image aria-hidden="true" size={15} />;
  }

  if (mediaType.startsWith("text/") || attachment.preview?.body.type === "redacted-text") {
    return <FileText aria-hidden="true" size={15} />;
  }

  return <Paperclip aria-hidden="true" size={15} />;
}
