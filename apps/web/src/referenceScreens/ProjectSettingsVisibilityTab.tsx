import { Eye } from "lucide-react";
import { useEffect, useState } from "react";

import type { ProjectSettings } from "../projectSettings.js";
import { Badge, PanelTitle } from "./ProjectSettingsReferenceCommon.js";
import { visibilityLabels } from "./ProjectSettingsReferenceModel.js";

const visibilityPolicyCopy: Record<string, { description: string; label: string }> = {
  "redact-sensitive": {
    description:
      "Пароли, токены, подписанные URL, ссылки на хранилище и локальные пути скрываются.",
    label: "Маскирование чувствительных данных"
  },
  "history-compare": {
    description: "История сравнений доступна участникам проекта и сервисным токенам проекта.",
    label: "История и сравнение результатов"
  },
  "raw-payloads": {
    description: "Исходные данные скрыты в интерфейсе проекта и публичных API-ответах.",
    label: "Изоляция исходных данных"
  }
};

export function VisibilityTab({
  canEdit,
  onSave,
  settings
}: {
  canEdit: boolean;
  settings: ProjectSettings;
  onSave: (settings: ProjectSettings) => void;
}) {
  const [draft, setDraft] = useState({
    project: settings.project,
    visibilityPolicies: settings.visibilityPolicies
  });
  useEffect(() => {
    setDraft({ project: settings.project, visibilityPolicies: settings.visibilityPolicies });
  }, [settings.project, settings.visibilityPolicies]);
  const hasChanges =
    draft.project.visibility !== settings.project.visibility ||
    JSON.stringify(draft.visibilityPolicies) !== JSON.stringify(settings.visibilityPolicies);

  return (
    <section className="project-settings__panel">
      <div className="project-settings__panel-row">
        <PanelTitle icon={<Eye size={18} />} title="Видимость данных" />
        {canEdit ? (
          <button
            className="project-settings__button project-settings__button--primary"
            disabled={!hasChanges}
            type="button"
            onClick={() =>
              onSave({
                ...settings,
                project: draft.project,
                visibilityPolicies: draft.visibilityPolicies
              })
            }
          >
            <span>Сохранить</span>
          </button>
        ) : null}
      </div>
      <div className="project-settings__form-row">
        <label>
          <span>Видимость проекта</span>
          {canEdit ? (
            <select
              value={draft.project.visibility}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  project: {
                    ...current.project,
                    visibility: event.target.value as ProjectSettings["project"]["visibility"]
                  }
                }))
              }
            >
              {Object.entries(visibilityLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          ) : (
            <strong>{visibilityLabels[draft.project.visibility]}</strong>
          )}
        </label>
      </div>
      <div className="project-settings__policy-list">
        {draft.visibilityPolicies.map((policy) => (
          <article className="project-settings__policy" key={policy.id}>
            <div>
              <strong>{visibilityPolicyCopy[policy.id]?.label ?? policy.label}</strong>
              <span>{visibilityPolicyCopy[policy.id]?.description ?? policy.description}</span>
            </div>
            {canEdit ? (
              <select
                value={policy.mode}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    visibilityPolicies: current.visibilityPolicies.map((item) =>
                      item.id === policy.id
                        ? {
                            ...item,
                            mode: event.target.value as typeof policy.mode
                          }
                        : item
                    )
                  }))
                }
              >
                <option value="enabled">Включено</option>
                <option value="limited">Ограничено</option>
                <option value="blocked">Закрыто</option>
              </select>
            ) : (
              <Badge
                tone={
                  policy.mode === "enabled" ? "green" : policy.mode === "limited" ? "amber" : "red"
                }
              >
                {policy.mode === "enabled"
                  ? "Включено"
                  : policy.mode === "limited"
                    ? "Ограничено"
                    : "Закрыто"}
              </Badge>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
