import { ChevronDown, FileText, Image, Paperclip } from "lucide-react";
import type { CSSProperties } from "react";

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
  return (
    <details className="launches-reference-attachment">
      <summary title={`Показать или скрыть превью вложения «${attachment.name}»`}>
        <span className="launches-reference-attachment-icon">
          {getAttachmentRowIcon(attachment)}
        </span>
        <span className="launches-reference-attachment-name">
          <strong>{attachment.name}</strong>
          <small>
            {attachment.mediaType} {"\u00b7"} {attachment.size}
          </small>
        </span>
        <span className="launches-reference-attachment-tools">
          <span
            className="launches-reference-attachment-actions"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
          >
            <span title={`Открыть вложение «${attachment.name}»`}>
              <AttachmentViewerButton attachment={attachment} label="Открыть" />
            </span>
            <span title={`Скачать вложение «${attachment.name}»`}>
              <AttachmentDownloadButton attachment={attachment} label="Скачать" />
            </span>
          </span>
          <span className="launches-reference-attachment-toggle-label">Превью</span>
          <ChevronDown aria-hidden="true" size={16} />
        </span>
      </summary>
      <div className="launches-reference-attachment-body">
        {hasInlinePreview(attachment) ? (
          <AttachmentInlinePreview attachment={attachment} />
        ) : (
          <p className="launches-reference-muted">
            Превью для этого типа файла недоступно — откройте или скачайте вложение.
          </p>
        )}
      </div>
    </details>
  );
}

function hasInlinePreview(attachment: ResultAttachment): boolean {
  const mediaType = attachment.mediaType.toLowerCase();
  const isMedia = mediaType.startsWith("image/") || mediaType.startsWith("video/");

  return isMedia || attachment.preview?.body.type === "redacted-text";
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
