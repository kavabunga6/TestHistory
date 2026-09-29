import { Plus, SlidersHorizontal, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

import type { CustomFieldMapping, ProjectSettings } from "../projectSettings.js";
import { PanelTitle } from "./ProjectSettingsReferenceCommon.js";

export function FieldsTab({
  canEdit,
  onSave,
  settings
}: {
  canEdit: boolean;
  settings: ProjectSettings;
  onSave: (settings: ProjectSettings) => void;
}) {
  const [mappings, setMappings] = useState(settings.customFieldMappings);
  useEffect(() => {
    setMappings(settings.customFieldMappings);
  }, [settings.customFieldMappings]);
  const hasChanges = JSON.stringify(mappings) !== JSON.stringify(settings.customFieldMappings);

  const updateMapping = (id: string, patch: Partial<CustomFieldMapping>) => {
    setMappings((items) => items.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  };
  const addMapping = () => {
    setMappings((items) => [
      ...items,
      {
        fallback: "",
        field: "custom_field",
        id: `field-${Date.now()}`,
        required: false,
        source: "label:custom"
      }
    ]);
  };

  return (
    <section className="project-settings__panel">
      <div className="project-settings__panel-row">
        <PanelTitle icon={<SlidersHorizontal size={18} />} title="Маппинг кастомных полей" />
        {canEdit ? (
          <div className="project-settings__actions">
            <button className="project-settings__button" type="button" onClick={addMapping}>
              <Plus aria-hidden="true" size={16} />
              <span>Добавить</span>
            </button>
            <button
              className="project-settings__button project-settings__button--primary"
              disabled={!hasChanges}
              type="button"
              onClick={() => onSave({ ...settings, customFieldMappings: mappings })}
            >
              <span>Сохранить</span>
            </button>
          </div>
        ) : null}
      </div>
      <div className="project-settings__table project-settings__table--fields" role="table">
        <div className="project-settings__table-head" role="row">
          <span role="columnheader">Поле</span>
          <span role="columnheader">Источник</span>
          <span role="columnheader">Значение по умолчанию</span>
          <span role="columnheader">Обязательное</span>
          {canEdit ? <span role="columnheader">Действия</span> : null}
        </div>
        {mappings.length === 0 ? (
          <div className="project-settings__empty-row" role="row">
            <span role="cell">
              {canEdit
                ? "Нет сопоставлений. Добавьте поле, чтобы сохранить данные из результата теста."
                : "Сопоставления полей пока не настроены."}
            </span>
          </div>
        ) : null}
        {mappings.map((mapping) => (
          <div className="project-settings__table-row" key={mapping.id} role="row">
            <span role="cell">
              {canEdit ? (
                <input
                  aria-label="Название поля"
                  value={mapping.field}
                  onChange={(event) => updateMapping(mapping.id, { field: event.target.value })}
                />
              ) : (
                <strong>{mapping.field}</strong>
              )}
            </span>
            <span role="cell">
              {canEdit ? (
                <input
                  aria-label="Источник поля"
                  value={mapping.source}
                  onChange={(event) => updateMapping(mapping.id, { source: event.target.value })}
                />
              ) : (
                mapping.source
              )}
            </span>
            <span role="cell">
              {canEdit ? (
                <input
                  aria-label="Значение поля по умолчанию"
                  value={mapping.fallback}
                  onChange={(event) => updateMapping(mapping.id, { fallback: event.target.value })}
                />
              ) : (
                mapping.fallback
              )}
            </span>
            <span role="cell">
              {canEdit ? (
                <label className="project-settings__checkbox-line">
                  <input
                    checked={mapping.required}
                    type="checkbox"
                    onChange={(event) =>
                      updateMapping(mapping.id, { required: event.target.checked })
                    }
                  />
                  <span>Да</span>
                </label>
              ) : mapping.required ? (
                "Да"
              ) : (
                "Нет"
              )}
            </span>
            {canEdit ? (
              <span className="project-settings__actions" role="cell">
                <button
                  aria-label={`Удалить маппинг ${mapping.field}`}
                  className="project-settings__icon-button danger"
                  title="Удалить маппинг"
                  type="button"
                  onClick={() =>
                    setMappings((items) => items.filter((item) => item.id !== mapping.id))
                  }
                >
                  <Trash2 aria-hidden="true" size={15} />
                </button>
              </span>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}
