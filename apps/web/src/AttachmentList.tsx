import {
  AlertTriangle,
  Download,
  FileJson,
  FileText,
  Image,
  Paperclip,
  SlidersHorizontal
} from "lucide-react";

import type { ApiState } from "./api.js";
import type { ArtifactPreviewDescriptor, TestResult } from "./m1Workspace.js";
import { EmptyState, formatBytes, ReadOnlyAction } from "./workspaceCommon.js";
import { AttachmentPreviewRetentionPanel } from "./AttachmentPanels.js";
import {
  AttachmentDownloadButton,
  AttachmentPreview,
  AttachmentViewerButton
} from "./AttachmentViewer.js";
export function AttachmentList({
  apiState,
  attachments
}: {
  apiState: ApiState;
  attachments: NonNullable<TestResult["attachments"]>;
}) {
  return (
    <section className="detail-section">
      <div className="attachment-section-title">
        <div>
          <h3>Вложения</h3>
          <p>Дескрипторы превью ограничены и не содержат исходные данные или пути хранения.</p>
        </div>
        <ReadOnlyAction icon={<Download size={16} />} label="Доступ к артефактам требует аудит" />
      </div>
      <AttachmentPreviewRetentionPanel apiState={apiState} context="Вложения" compact />
      {attachments.length === 0 ? (
        <EmptyState
          title="Вложения не сохранены"
          copy="Этот результат не загрузил скриншоты, логи, трассы или другие сохраняемые файлы."
        />
      ) : (
        <div className="attachment-list">
          {attachments.map((attachment) => (
            <AttachmentPreviewCard
              attachment={attachment}
              key={`${attachment.source}-${attachment.name}`}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function AttachmentPreviewCard({
  attachment
}: {
  attachment: NonNullable<TestResult["attachments"]>[number];
}) {
  const preview = attachment.preview;
  const previewLabel =
    preview === undefined ? "Метаданные превью недоступны" : getPreviewLabel(preview);

  return (
    <article className={`attachment-card ${preview?.support ?? "metadata-only"}`}>
      {getPreviewIcon(preview)}
      <div className="attachment-card-body">
        <div className="attachment-card-heading">
          <div>
            <strong>{attachment.name}</strong>
            <span>
              {attachment.mediaType} / {attachment.size} /{" "}
              {attachment.retained ? "сохранено" : "кандидат на очистку"}
            </span>
          </div>
          <span className="ready-pill">{previewLabel}</span>
        </div>
        <AttachmentPreviewDescriptor preview={preview} />
        <AttachmentPreview attachment={attachment} />
        <div className="attachment-card-actions">
          <AttachmentViewerButton attachment={attachment} label="Открыть" />
          <AttachmentDownloadButton attachment={attachment} label="Скачать" />
          <ReadOnlyAction icon={<SlidersHorizontal size={16} />} label="Метаданные хранения" />
        </div>
      </div>
    </article>
  );
}

function AttachmentPreviewDescriptor({
  preview
}: {
  preview: ArtifactPreviewDescriptor | undefined;
}) {
  if (preview === undefined) {
    return (
      <div className="attachment-preview metadata-only">
        <strong>Только метаданные</strong>
        <p>Дескриптор превью для этого артефакта еще не материализован.</p>
      </div>
    );
  }

  const metadata = [
    `поддержка: ${formatPreviewSupport(preview.support)}`,
    `оригинал: ${formatBytes(preview.originalBytes)}`,
    `превью: ${formatBytes(preview.previewBytes)}`,
    `лимит: ${formatBytes(preview.maxPreviewBytes)}`
  ];

  return (
    <div className={`attachment-preview ${preview.support}`}>
      <div className="attachment-preview-meta" aria-label="Дескриптор превью вложения">
        {metadata.map((item) => (
          <span key={item}>{item}</span>
        ))}
        <span>{preview.reason}</span>
        <span>{preview.safety.redactionApplied ? "редакция применена" : "редакция не нужна"}</span>
      </div>
      {preview.body.type === "redacted-text" ? (
        <pre className="attachment-preview-text">{preview.body.value}</pre>
      ) : preview.body.type === "image-metadata" ? (
        <div className="attachment-preview-image">
          <Image size={32} />
          <div>
            <strong>Только метаданные изображения</strong>
            <span>{preview.body.mediaType}: превью требует контролируемого скачивания.</span>
          </div>
        </div>
      ) : (
        <div className="attachment-preview-unavailable">
          <strong>
            {preview.support === "unsupported" ? "Превью не поддерживается" : "Контент недоступен"}
          </strong>
          <span>В панели отображаются только безопасные метаданные дескриптора.</span>
        </div>
      )}
      <div className="attachment-preview-safety">
        <span>ограниченный дескриптор</span>
        <span>без исходных данных</span>
        <span>без пути хранения</span>
        <span>без подписанной ссылки</span>
      </div>
    </div>
  );
}

function getPreviewIcon(preview: ArtifactPreviewDescriptor | undefined) {
  if (preview?.kind === "image") {
    return <Image size={17} />;
  }

  if (preview?.kind === "json" || preview?.kind === "xml") {
    return <FileJson size={17} />;
  }

  if (preview?.kind === "text" || preview?.kind === "html") {
    return <FileText size={17} />;
  }

  if (preview?.support === "unsupported") {
    return <AlertTriangle size={17} />;
  }

  return <Paperclip size={17} />;
}

function getPreviewLabel(preview: ArtifactPreviewDescriptor): string {
  if (preview.support === "inline") {
    return `${preview.flavor} превью готово`;
  }

  if (preview.support === "unsupported") {
    return "превью не поддерживается";
  }

  return preview.kind === "image" ? "метаданные изображения" : "только метаданные";
}

function formatPreviewSupport(support: ArtifactPreviewDescriptor["support"]): string {
  const labels: Record<ArtifactPreviewDescriptor["support"], string> = {
    inline: "встроенное превью",
    "metadata-only": "только метаданные",
    unsupported: "не поддерживается"
  };

  return labels[support];
}
