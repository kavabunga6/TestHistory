import { Database } from "lucide-react";
import { useEffect, useState } from "react";

import type { ProjectArtifactRetention, ProjectSettings } from "../projectSettings.js";
import { Badge, PanelTitle } from "./ProjectSettingsReferenceCommon.js";

export function RetentionTab({
  canEdit,
  onSave,
  settings
}: {
  canEdit: boolean;
  settings: ProjectSettings;
  onSave: (retention: ProjectArtifactRetention) => void;
}) {
  const [retention, setRetention] = useState<ProjectArtifactRetention>({
    ...settings.artifactRetention,
    retentionPolicies:
      settings.artifactRetention.retentionPolicies.length > 0
        ? settings.artifactRetention.retentionPolicies
        : settings.retentionPolicies
  });
  useEffect(() => {
    setRetention({
      ...settings.artifactRetention,
      retentionPolicies:
        settings.artifactRetention.retentionPolicies.length > 0
          ? settings.artifactRetention.retentionPolicies
          : settings.retentionPolicies
    });
  }, [settings.artifactRetention, settings.retentionPolicies]);
  const savedRetention = {
    ...settings.artifactRetention,
    retentionPolicies:
      settings.artifactRetention.retentionPolicies.length > 0
        ? settings.artifactRetention.retentionPolicies
        : settings.retentionPolicies
  };
  const hasChanges = JSON.stringify(retention) !== JSON.stringify(savedRetention);

  return (
    <section className="project-settings__panel">
      <div className="project-settings__panel-row">
        <PanelTitle icon={<Database size={18} />} title="Хранение артефактов" />
        {canEdit ? (
          <button
            className="project-settings__button project-settings__button--primary"
            disabled={!hasChanges}
            type="button"
            onClick={() => onSave(retention)}
          >
            <span>Сохранить</span>
          </button>
        ) : null}
      </div>
      <div className="project-settings__section-title">Общие правила очистки</div>
      <p className="project-settings__retention-note">
        Срок и отсрочка ниже записываются для новых вложений. Уже загруженные вложения сохраняют
        сроки, заданные при загрузке.
      </p>
      <div className="project-settings__settings-list" role="list">
        <div className="project-settings__settings-list-row" role="listitem">
          <label htmlFor="artifact-retention-days">Хранить вложения, дней</label>
          {canEdit ? (
            <input
              id="artifact-retention-days"
              min={1}
              max={3650}
              type="number"
              value={retention.attachmentRetentionDays}
              onChange={(event) =>
                setRetention((current) => ({
                  ...current,
                  attachmentRetentionDays: Number(event.target.value)
                }))
              }
            />
          ) : (
            <strong>{retention.attachmentRetentionDays}</strong>
          )}
        </div>
        <div className="project-settings__settings-list-row" role="listitem">
          <label htmlFor="artifact-cleanup-grace-days">Отсрочка очистки, дней</label>
          {canEdit ? (
            <input
              id="artifact-cleanup-grace-days"
              min={0}
              max={365}
              type="number"
              value={retention.cleanupGraceDays}
              onChange={(event) =>
                setRetention((current) => ({
                  ...current,
                  cleanupGraceDays: Number(event.target.value)
                }))
              }
            />
          ) : (
            <strong>{retention.cleanupGraceDays}</strong>
          )}
        </div>
      </div>
      <div className="project-settings__section-title">Дополнительные параметры</div>
      <p className="project-settings__retention-note project-settings__retention-note--inactive">
        Сервер пока не применяет сохранённые значения сжатия и удаления бинарных артефактов.
      </p>
      <div className="project-settings__settings-list" role="list">
        <div className="project-settings__settings-list-row" role="listitem">
          <span className="project-settings__inactive-setting">
            Сжимать сохранённые текстовые артефакты
          </span>
          <Badge tone="gray">
            Сохранено: {retention.compressRetainedTextArtifacts ? "да" : "нет"}
          </Badge>
        </div>
        <div className="project-settings__settings-list-row" role="listitem">
          <span className="project-settings__inactive-setting">
            Удалять бинарные артефакты после срока хранения
          </span>
          <Badge tone="gray">
            Сохранено: {retention.deleteBinaryArtifactsAfterRetention ? "да" : "нет"}
          </Badge>
        </div>
      </div>
      <div className="project-settings__section-title">Сроки по типам артефактов</div>
      <p className="project-settings__retention-note project-settings__retention-note--inactive">
        Сроки по типам и статусам и лимиты размера пока не применяются. Для новых вложений действует
        общий срок выше.
      </p>
      <div
        className="project-settings__table project-settings__table--retention"
        role="table"
        aria-label="Сроки хранения по типам артефактов"
      >
        <div className="project-settings__table-head" role="row">
          <span role="columnheader">Тип</span>
          <span role="columnheader">Пройден, дн.</span>
          <span role="columnheader">Провален, дн.</span>
          <span role="columnheader">Карантин, дн.</span>
          <span role="columnheader">Лимит, МБ</span>
        </div>
        {retention.retentionPolicies.length === 0 ? (
          <div className="project-settings__empty-row" role="row">
            <span role="cell">Правила хранения по типам артефактов пока не заданы.</span>
          </div>
        ) : null}
        {retention.retentionPolicies.map((policy) => (
          <div className="project-settings__table-row" key={policy.id} role="row">
            <strong role="cell">{policy.artifact}</strong>
            <span role="cell">{policy.passedDays} дней</span>
            <span role="cell">{policy.failedDays} дней</span>
            <span role="cell">{policy.quarantinedDays} дней</span>
            <span role="cell">{policy.maxSizeMb} MB</span>
          </div>
        ))}
      </div>
    </section>
  );
}
