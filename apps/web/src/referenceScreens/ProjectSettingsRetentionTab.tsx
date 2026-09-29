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

  const updateRetentionPolicy = (
    id: string,
    patch: Partial<ProjectSettings["retentionPolicies"][number]>
  ) => {
    setRetention((current) => ({
      ...current,
      retentionPolicies: current.retentionPolicies.map((policy) =>
        policy.id === id ? { ...policy, ...patch } : policy
      )
    }));
  };

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
        <div className="project-settings__settings-list-row" role="listitem">
          <label className="project-settings__checkbox-line" htmlFor="artifact-compress-text">
            <input
              id="artifact-compress-text"
              checked={retention.compressRetainedTextArtifacts}
              disabled={!canEdit}
              type="checkbox"
              onChange={(event) =>
                setRetention((current) => ({
                  ...current,
                  compressRetainedTextArtifacts: event.target.checked
                }))
              }
            />
            <span>Сжимать сохраненные текстовые артефакты</span>
          </label>
          <Badge tone={retention.compressRetainedTextArtifacts ? "green" : "gray"}>
            {retention.compressRetainedTextArtifacts ? "Включено" : "Выключено"}
          </Badge>
        </div>
        <div className="project-settings__settings-list-row" role="listitem">
          <label className="project-settings__checkbox-line" htmlFor="artifact-delete-binary">
            <input
              id="artifact-delete-binary"
              checked={retention.deleteBinaryArtifactsAfterRetention}
              disabled={!canEdit}
              type="checkbox"
              onChange={(event) =>
                setRetention((current) => ({
                  ...current,
                  deleteBinaryArtifactsAfterRetention: event.target.checked
                }))
              }
            />
            <span>Удалять бинарные артефакты после срока хранения</span>
          </label>
          <Badge tone={retention.deleteBinaryArtifactsAfterRetention ? "green" : "gray"}>
            {retention.deleteBinaryArtifactsAfterRetention ? "Включено" : "Выключено"}
          </Badge>
        </div>
      </div>
      <div className="project-settings__section-title">Сроки по типам артефактов</div>
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
            <span role="cell">
              {canEdit ? (
                <input
                  aria-label={`${policy.artifact}: пройден, дней`}
                  min={0}
                  max={3650}
                  type="number"
                  value={policy.passedDays}
                  onChange={(event) =>
                    updateRetentionPolicy(policy.id, { passedDays: Number(event.target.value) })
                  }
                />
              ) : (
                `${policy.passedDays} дней`
              )}
            </span>
            <span role="cell">
              {canEdit ? (
                <input
                  aria-label={`${policy.artifact}: провален, дней`}
                  min={0}
                  max={3650}
                  type="number"
                  value={policy.failedDays}
                  onChange={(event) =>
                    updateRetentionPolicy(policy.id, { failedDays: Number(event.target.value) })
                  }
                />
              ) : (
                `${policy.failedDays} дней`
              )}
            </span>
            <span role="cell">
              {canEdit ? (
                <input
                  aria-label={`${policy.artifact}: карантин, дней`}
                  min={0}
                  max={3650}
                  type="number"
                  value={policy.quarantinedDays}
                  onChange={(event) =>
                    updateRetentionPolicy(policy.id, {
                      quarantinedDays: Number(event.target.value)
                    })
                  }
                />
              ) : (
                `${policy.quarantinedDays} дней`
              )}
            </span>
            <span role="cell">
              {canEdit ? (
                <input
                  aria-label={`${policy.artifact}: лимит, MB`}
                  min={1}
                  max={102400}
                  type="number"
                  value={policy.maxSizeMb}
                  onChange={(event) =>
                    updateRetentionPolicy(policy.id, { maxSizeMb: Number(event.target.value) })
                  }
                />
              ) : (
                `${policy.maxSizeMb} MB`
              )}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
