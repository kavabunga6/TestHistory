import { Download, Eye, FileText, Image, Paperclip, PlaySquare, X } from "lucide-react";
import { useEffect, useId, useState } from "react";
import type { ReactNode } from "react";

import { useModalDialog } from "./AppDialogs.js";
import { getJson } from "./apiHttp.js";
import type { ResultAttachment } from "./m1Workspace.js";

const text = {
  closeViewer:
    "\u0417\u0430\u043a\u0440\u044b\u0442\u044c \u043f\u0440\u043e\u0441\u043c\u043e\u0442\u0440 \u0432\u043b\u043e\u0436\u0435\u043d\u0438\u044f",
  download: "\u0421\u043a\u0430\u0447\u0430\u0442\u044c",
  downloadAttachment:
    "\u0421\u043a\u0430\u0447\u0430\u0442\u044c \u0432\u043b\u043e\u0436\u0435\u043d\u0438\u0435",
  filePreviewUnavailable:
    "\u041f\u0440\u0435\u0434\u043f\u0440\u043e\u0441\u043c\u043e\u0442\u0440 \u0444\u0430\u0439\u043b\u0430 \u043d\u0435\u0434\u043e\u0441\u0442\u0443\u043f\u0435\u043d",
  filePreviewUnavailableText:
    "\u0414\u043b\u044f \u044d\u0442\u043e\u0433\u043e \u0442\u0438\u043f\u0430 \u0444\u0430\u0439\u043b\u0430 \u043f\u043e\u043a\u0430\u0437\u044b\u0432\u0430\u0435\u043c \u0442\u043e\u043b\u044c\u043a\u043e \u0431\u0435\u0437\u043e\u043f\u0430\u0441\u043d\u044b\u0435 \u043c\u0435\u0442\u0430\u0434\u0430\u043d\u043d\u044b\u0435.",
  fileTooLarge:
    "\u0424\u0430\u0439\u043b \u0441\u043b\u0438\u0448\u043a\u043e\u043c \u0431\u043e\u043b\u044c\u0448\u043e\u0439 \u0434\u043b\u044f \u043f\u0440\u043e\u0441\u043c\u043e\u0442\u0440\u0430 \u0432 \u0431\u0440\u0430\u0443\u0437\u0435\u0440\u0435",
  imageNoInline:
    "\u0418\u0437\u043e\u0431\u0440\u0430\u0436\u0435\u043d\u0438\u0435 \u0441\u043e\u0445\u0440\u0430\u043d\u0435\u043d\u043e \u0431\u0435\u0437 inline-\u043f\u0440\u0435\u0432\u044c\u044e",
  imagePreviewUnavailable:
    "\u041f\u0440\u0435\u0434\u043f\u0440\u043e\u0441\u043c\u043e\u0442\u0440 \u0438\u0437\u043e\u0431\u0440\u0430\u0436\u0435\u043d\u0438\u044f \u043d\u0435\u0434\u043e\u0441\u0442\u0443\u043f\u0435\u043d",
  imagePreviewUnavailableText:
    "\u0424\u0430\u0439\u043b \u0441\u043e\u0445\u0440\u0430\u043d\u0435\u043d \u043a\u0430\u043a \u0432\u043b\u043e\u0436\u0435\u043d\u0438\u0435, \u043d\u043e \u0431\u0435\u0437\u043e\u043f\u0430\u0441\u043d\u043e\u0435 \u043f\u0440\u0435\u0432\u044c\u044e \u043d\u0435 \u0431\u044b\u043b\u043e \u043c\u0430\u0442\u0435\u0440\u0438\u0430\u043b\u0438\u0437\u043e\u0432\u0430\u043d\u043e.",
  notSaved: "\u043d\u0435 \u0441\u043e\u0445\u0440\u0430\u043d\u0435\u043d\u043e",
  open: "\u041e\u0442\u043a\u0440\u044b\u0442\u044c",
  openAttachment:
    "\u041e\u0442\u043a\u0440\u044b\u0442\u044c \u0432\u043b\u043e\u0436\u0435\u043d\u0438\u0435",
  openPreview:
    "\u041e\u0442\u043a\u0440\u044b\u0442\u044c \u043f\u0440\u0435\u0434\u043f\u0440\u043e\u0441\u043c\u043e\u0442\u0440 \u0432\u043b\u043e\u0436\u0435\u043d\u0438\u044f",
  saved: "\u0441\u043e\u0445\u0440\u0430\u043d\u0435\u043d\u043e",
  source: "\u0418\u0441\u0442\u043e\u0447\u043d\u0438\u043a",
  storage: "\u0425\u0440\u0430\u043d\u0435\u043d\u0438\u0435",
  videoNoInline:
    "\u0412\u0438\u0434\u0435\u043e \u0441\u043e\u0445\u0440\u0430\u043d\u0435\u043d\u043e \u0431\u0435\u0437 inline-\u043f\u0440\u0435\u0432\u044c\u044e",
  videoPreviewUnavailable:
    "\u041f\u0440\u0435\u0434\u043f\u0440\u043e\u0441\u043c\u043e\u0442\u0440 \u0432\u0438\u0434\u0435\u043e \u043d\u0435\u0434\u043e\u0441\u0442\u0443\u043f\u0435\u043d",
  videoPreviewUnavailableText:
    "\u0412\u0438\u0434\u0435\u043e \u0441\u043e\u0445\u0440\u0430\u043d\u0435\u043d\u043e \u043a\u0430\u043a \u0432\u043b\u043e\u0436\u0435\u043d\u0438\u0435, \u043d\u043e \u0431\u0435\u0437\u043e\u043f\u0430\u0441\u043d\u043e\u0435 \u043f\u0440\u0435\u0432\u044c\u044e \u043d\u0435 \u0431\u044b\u043b\u043e \u043c\u0430\u0442\u0435\u0440\u0438\u0430\u043b\u0438\u0437\u043e\u0432\u0430\u043d\u043e."
};

export function AttachmentViewerButton({
  attachment,
  className,
  compact = false,
  label = text.open
}: {
  attachment: ResultAttachment;
  className?: string;
  compact?: boolean;
  label?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        aria-label={`${text.openAttachment} ${attachment.name}`}
        className={className}
        type="button"
        onClick={() => setIsOpen(true)}
      >
        <Eye aria-hidden="true" size={compact ? 14 : 15} />
        {compact ? null : <span>{label}</span>}
      </button>
      {isOpen ? (
        <AttachmentViewerDialog attachment={attachment} onClose={() => setIsOpen(false)} />
      ) : null}
    </>
  );
}

export function AttachmentDownloadButton({
  attachment,
  className,
  compact = false,
  label = text.download
}: {
  attachment: ResultAttachment;
  className?: string;
  compact?: boolean;
  label?: string;
}) {
  return (
    <button
      aria-label={`${text.downloadAttachment} ${attachment.name}`}
      className={className}
      type="button"
      onClick={() => downloadAttachment(attachment)}
    >
      <Download aria-hidden="true" size={compact ? 14 : 15} />
      {compact ? null : <span>{label}</span>}
    </button>
  );
}

export function AttachmentPreview({
  attachment,
  className
}: {
  attachment: ResultAttachment;
  className?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const mediaType = attachment.mediaType.toLowerCase();
  const isImage = mediaType.startsWith("image/");
  const isVideo = mediaType.startsWith("video/");

  if (!isImage && !isVideo && attachment.preview?.body.type !== "redacted-text") {
    return null;
  }

  const canOpenMedia = (isImage || isVideo) && attachment.previewUrl !== undefined;

  return (
    <>
      <button
        aria-label={`${text.openPreview} ${attachment.name}`}
        className={`attachment-inline-preview ${className ?? ""}`}
        type="button"
        disabled={!canOpenMedia}
        onClick={() => {
          if (canOpenMedia) {
            setIsOpen(true);
          }
        }}
      >
        {isImage && attachment.previewUrl !== undefined ? (
          <img alt={attachment.name} src={attachment.previewUrl} />
        ) : null}
        {isVideo && attachment.previewUrl !== undefined ? (
          <video muted preload="metadata" src={attachment.previewUrl} />
        ) : null}
        {isImage && attachment.previewUrl === undefined ? <span>{text.imageNoInline}</span> : null}
        {isVideo && attachment.previewUrl === undefined ? <span>{text.videoNoInline}</span> : null}
        {attachment.preview?.body.type === "redacted-text" && !isImage && !isVideo ? (
          <pre>{attachment.preview.body.value}</pre>
        ) : null}
      </button>
      {isOpen ? (
        <AttachmentViewerDialog attachment={attachment} onClose={() => setIsOpen(false)} />
      ) : null}
    </>
  );
}

export function AttachmentViewerDialog({
  attachment,
  onClose
}: {
  attachment: ResultAttachment;
  onClose: () => void;
}) {
  const titleId = useId();
  const dialogRef = useModalDialog<HTMLDivElement>(onClose);
  const isTextPreview = isTextPreviewAttachment(attachment);

  return (
    <div
      className="attachment-viewer"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        ref={dialogRef}
        aria-labelledby={titleId}
        aria-modal="true"
        className={`attachment-viewer__dialog${isTextPreview ? " attachment-viewer__dialog--text" : ""}`}
        role="dialog"
        tabIndex={-1}
      >
        <header className="attachment-viewer__header">
          <div className="attachment-viewer__title">
            {getAttachmentIcon(attachment)}
            <div>
              <h3 id={titleId}>{attachment.name}</h3>
              <p>
                {attachment.mediaType} {"\u00b7"} {attachment.size}
              </p>
            </div>
          </div>
          <div className="attachment-viewer__actions">
            <AttachmentDownloadButton attachment={attachment} label={text.download} />
            <button aria-label={text.closeViewer} type="button" onClick={onClose}>
              <X aria-hidden="true" size={17} />
            </button>
          </div>
        </header>
        <div className="attachment-viewer__body">
          <AttachmentViewerContent attachment={attachment} />
        </div>
      </div>
    </div>
  );
}

export function AttachmentViewerContent({ attachment }: { attachment: ResultAttachment }) {
  const mediaType = attachment.mediaType.toLowerCase();

  if (mediaType.startsWith("image/")) {
    return attachment.previewUrl !== undefined ? (
      <img alt={attachment.name} className="attachment-viewer__media" src={attachment.previewUrl} />
    ) : (
      <ViewerUnavailable
        title={text.imagePreviewUnavailable}
        text={text.imagePreviewUnavailableText}
      />
    );
  }

  if (mediaType.startsWith("video/")) {
    return attachment.previewUrl !== undefined ? (
      <video
        className="attachment-viewer__media"
        controls
        preload="metadata"
        src={attachment.previewUrl}
      />
    ) : (
      <ViewerUnavailable
        title={text.videoPreviewUnavailable}
        text={text.videoPreviewUnavailableText}
      />
    );
  }

  if (attachment.preview?.body.type === "redacted-text") {
    return <TextPreviewContent body={attachment.preview.body} preview={attachment.preview} />;
  }

  if (isTextPreviewAttachment(attachment) && attachment.preview !== undefined) {
    return <RemoteTextPreview preview={attachment.preview} />;
  }

  return (
    <ViewerUnavailable title={text.filePreviewUnavailable} text={text.filePreviewUnavailableText}>
      <dl className="attachment-viewer__metadata">
        <div>
          <dt>{text.source}</dt>
          <dd>{attachment.source}</dd>
        </div>
        <div>
          <dt>{text.storage}</dt>
          <dd>{attachment.retained ? text.saved : text.notSaved}</dd>
        </div>
        {attachment.preview !== undefined ? (
          <div>
            <dt>SHA-256</dt>
            <dd>{attachment.preview.sha256}</dd>
          </div>
        ) : null}
      </dl>
    </ViewerUnavailable>
  );
}

function RemoteTextPreview({ preview }: { preview: NonNullable<ResultAttachment["preview"]> }) {
  const [loadedPreview, setLoadedPreview] = useState<
    NonNullable<ResultAttachment["preview"]> | undefined
  >();
  const [failed, setFailed] = useState(false);
  const tooLarge = preview.originalBytes > preview.maxPreviewBytes;

  useEffect(() => {
    const controller = new AbortController();
    setLoadedPreview(undefined);
    setFailed(false);
    if (tooLarge) return () => controller.abort();
    void getJson<NonNullable<ResultAttachment["preview"]>>(
      `/api/v1/artifacts/${encodeURIComponent(preview.artifactId)}/preview`,
      { signal: controller.signal }
    )
      .then((value) => {
        if (!controller.signal.aborted) setLoadedPreview(value);
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });
    return () => controller.abort();
  }, [preview.artifactId, tooLarge]);

  if (tooLarge) {
    return (
      <ViewerUnavailable
        title={text.fileTooLarge}
        text={`\u041c\u043e\u0436\u043d\u043e \u043f\u0440\u043e\u0441\u043c\u0430\u0442\u0440\u0438\u0432\u0430\u0442\u044c \u0444\u0430\u0439\u043b\u044b \u0440\u0430\u0437\u043c\u0435\u0440\u043e\u043c \u0434\u043e ${formatPreviewBytes(preview.maxPreviewBytes)}. \u0421\u043a\u0430\u0447\u0430\u0439\u0442\u0435 \u0444\u0430\u0439\u043b, \u0447\u0442\u043e\u0431\u044b \u043e\u0442\u043a\u0440\u044b\u0442\u044c \u0435\u0433\u043e \u043b\u043e\u043a\u0430\u043b\u044c\u043d\u043e.`}
      />
    );
  }

  if (loadedPreview?.body.type === "redacted-text") {
    return <TextPreviewContent body={loadedPreview.body} preview={loadedPreview} />;
  }

  return (
    <div className="attachment-viewer__text-state" role={failed ? "alert" : "status"}>
      <FileText aria-hidden="true" size={24} />
      <strong>{failed ? "Не удалось загрузить предпросмотр" : "Загружаем предпросмотр…"}</strong>
      <span>
        {failed
          ? "Файл можно скачать и проверить локально."
          : "Будет загружен только ограниченный безопасный фрагмент."}
      </span>
    </div>
  );
}

function TextPreviewContent({
  body,
  preview
}: {
  body: Extract<NonNullable<ResultAttachment["preview"]>["body"], { type: "redacted-text" }>;
  preview: NonNullable<ResultAttachment["preview"]>;
}) {
  return (
    <div className="attachment-viewer__text-preview">
      <div className="attachment-viewer__text-meta">
        <span>{previewKindLabel(preview.kind)}</span>
        <span>{body.lineCount} строк</span>
        {body.redacted ? <span>Секреты скрыты</span> : null}
        {body.truncated ? (
          <span>Показаны первые {formatPreviewBytes(preview.previewBytes)}</span>
        ) : null}
      </div>
      <pre className="attachment-viewer__text">{body.value}</pre>
    </div>
  );
}

function isTextPreviewAttachment(attachment: ResultAttachment): boolean {
  const kind = attachment.preview?.kind;
  return kind === "text" || kind === "json" || kind === "xml";
}

function previewKindLabel(kind: NonNullable<ResultAttachment["preview"]>["kind"]): string {
  if (kind === "json") return "JSON";
  if (kind === "xml") return "XML";
  return "Текст";
}

function formatPreviewBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes >= 1024 * 1024) {
    const mebibytes = bytes / (1024 * 1024);
    return `${Number.isInteger(mebibytes) ? mebibytes : mebibytes.toFixed(1)} МБ`;
  }
  return `${Math.ceil(bytes / 1024)} КБ`;
}

function ViewerUnavailable({
  children,
  text: copy,
  title
}: {
  children?: ReactNode;
  text: string;
  title: string;
}) {
  return (
    <div className="attachment-viewer__empty">
      <Paperclip aria-hidden="true" size={28} />
      <strong>{title}</strong>
      <span>{copy}</span>
      {children}
    </div>
  );
}

function getAttachmentIcon(attachment: ResultAttachment) {
  const mediaType = attachment.mediaType.toLowerCase();

  if (mediaType.startsWith("image/")) {
    return <Image aria-hidden="true" size={18} />;
  }

  if (mediaType.startsWith("video/")) {
    return <PlaySquare aria-hidden="true" size={18} />;
  }

  if (mediaType.startsWith("text/") || isTextPreviewAttachment(attachment)) {
    return <FileText aria-hidden="true" size={18} />;
  }

  return <Paperclip aria-hidden="true" size={18} />;
}

function downloadAttachment(attachment: ResultAttachment) {
  const body = getAttachmentDownloadBody(attachment);
  const blob = new Blob([body], { type: attachment.mediaType || "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = safeDownloadName(attachment.name);
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function getAttachmentDownloadBody(attachment: ResultAttachment): BlobPart {
  if (attachment.previewUrl?.startsWith("data:") === true) {
    return dataUrlToArrayBuffer(attachment.previewUrl);
  }

  if (attachment.preview?.body.type === "redacted-text") {
    return attachment.preview.body.value;
  }

  return JSON.stringify(
    {
      name: attachment.name,
      mediaType: attachment.mediaType,
      size: attachment.size,
      source: attachment.source,
      retained: attachment.retained,
      preview: attachment.preview ?? null
    },
    null,
    2
  );
}

function dataUrlToArrayBuffer(dataUrl: string): ArrayBuffer {
  const [, encoded = ""] = dataUrl.split(",", 2);
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

function safeDownloadName(name: string): string {
  const sanitized = name.replace(/[\\/:*?"<>|]+/g, "-").trim();
  return sanitized.length > 0 ? sanitized : "attachment";
}
