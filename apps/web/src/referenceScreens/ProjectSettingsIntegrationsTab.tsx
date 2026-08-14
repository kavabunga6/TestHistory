import { Link2, Pencil, Plus, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";

import { ConfirmDeleteDialog, useModalDialog } from "../AppDialogs.js";
import type { IntegrationLinkProvider, ProjectSettings } from "../projectSettings.js";
import { Badge, PanelTitle, SwitchControl } from "./ProjectSettingsReferenceCommon.js";
import {
  getProviderLinkTemplate,
  patchProviderLinkTemplate
} from "./ProjectSettingsReferenceModel.js";

export function IntegrationsTab({
  canEdit,
  onSave,
  settings
}: {
  canEdit: boolean;
  settings: ProjectSettings;
  onSave: (settings: ProjectSettings) => void;
}) {
  const [providers, setProviders] = useState(settings.integrationProviders);
  const [editingProvider, setEditingProvider] = useState<IntegrationLinkProvider | undefined>();
  const [deletingProvider, setDeletingProvider] = useState<IntegrationLinkProvider | undefined>();
  useEffect(() => {
    setProviders(settings.integrationProviders);
    setEditingProvider(undefined);
    setDeletingProvider(undefined);
  }, [settings.integrationProviders]);

  const persistProviders = (nextProviders: IntegrationLinkProvider[]) => {
    setProviders(nextProviders);
    onSave({ ...settings, integrationProviders: nextProviders });
  };
  const addProvider = () => {
    const id = `provider-${Date.now()}`;
    setEditingProvider({
      baseUrl: "https://www.jira.ru/browse/",
      enabled: true,
      encodeSuffix: true,
      id,
      name: "Jira",
      preset: "jira",
      previewValue: "ANDROID-123",
      source: { kind: "label", matchMode: "first", name: "JIRA_ISSUE" },
      suffixTemplate: "{value}"
    });
  };
  const deleteProvider = (id: string) => {
    const nextProviders = providers.filter((provider) => provider.id !== id);
    persistProviders(nextProviders);
  };
  const saveProvider = (provider: IntegrationLinkProvider) => {
    const exists = providers.some((item) => item.id === provider.id);
    const nextProviders = exists
      ? providers.map((item) => (item.id === provider.id ? provider : item))
      : [...providers, provider];
    persistProviders(nextProviders);
    setEditingProvider(undefined);
  };
  const toggleProvider = (provider: IntegrationLinkProvider) => {
    const nextProviders = providers.map((item) =>
      item.id === provider.id ? { ...item, enabled: !item.enabled } : item
    );
    persistProviders(nextProviders);
  };

  return (
    <section className="project-settings__panel">
      <div className="project-settings__panel-row">
        <PanelTitle icon={<Link2 size={18} />} title="Провайдеры ссылок" />
        {canEdit ? (
          <div className="project-settings__actions">
            <button className="project-settings__button" type="button" onClick={addProvider}>
              <Plus aria-hidden="true" size={16} />
              <span>Добавить</span>
            </button>
          </div>
        ) : null}
      </div>
      <div className="project-settings__integration-example">
        <span>В Allure отчете:</span>
        <code>label JIRA_ISSUE = ANDROID-123</code>
        <span>В интеграции:</span>
        <code>https://www.jira.ru/browse/{"{value}"}</code>
      </div>
      <div
        className={`project-settings__integrations-table ${
          canEdit ? "" : "project-settings__integrations-table--readonly"
        }`}
        role="table"
      >
        <div className="project-settings__integrations-table-head" role="row">
          <span role="columnheader">Название</span>
          <span role="columnheader">Лейбл в Allure</span>
          <span role="columnheader">Шаблон ссылки</span>
          <span role="columnheader">Статус</span>
          {canEdit ? <span role="columnheader">Действия</span> : null}
        </div>
        {providers.length === 0 ? (
          <div className="project-settings__empty-row" role="row">
            <span role="cell">Провайдеры ссылок ещё не настроены</span>
          </div>
        ) : null}
        {providers.map((provider) => (
          <div className="project-settings__integrations-table-row" key={provider.id} role="row">
            <div className="project-settings__provider-row-main">
              <strong>{provider.name}</strong>
            </div>
            <div className="project-settings__provider-row-value">
              <code>{provider.source.name || "JIRA_ISSUE"}</code>
            </div>
            <div className="project-settings__provider-row-template">
              <code>{getProviderLinkTemplate(provider)}</code>
            </div>
            <div className="project-settings__provider-row-check">
              {canEdit ? (
                <SwitchControl
                  checked={provider.enabled}
                  label={provider.enabled ? "Активна" : "Выключена"}
                  onChange={() => toggleProvider(provider)}
                />
              ) : (
                <Badge tone={provider.enabled ? "green" : "gray"}>
                  {provider.enabled ? "Активна" : "Выключена"}
                </Badge>
              )}
            </div>
            {canEdit ? (
              <div className="project-settings__provider-row-actions">
                <button
                  aria-label={`Редактировать интеграцию ${provider.name}`}
                  className="project-settings__icon-button"
                  title="Редактировать интеграцию"
                  type="button"
                  onClick={() => setEditingProvider({ ...provider })}
                >
                  <Pencil aria-hidden="true" size={15} />
                </button>
                <button
                  aria-label={`Удалить интеграцию ${provider.name}`}
                  className="project-settings__icon-button danger"
                  title="Удалить интеграцию"
                  type="button"
                  onClick={() => setDeletingProvider(provider)}
                >
                  <Trash2 aria-hidden="true" size={15} />
                </button>
              </div>
            ) : null}
          </div>
        ))}
      </div>
      {editingProvider !== undefined ? (
        <ProviderDialog
          provider={editingProvider}
          onChange={(patch) => setEditingProvider({ ...editingProvider, ...patch })}
          onClose={() => setEditingProvider(undefined)}
          onSave={() => saveProvider(editingProvider)}
        />
      ) : null}
      <ConfirmDeleteDialog
        request={
          deletingProvider === undefined
            ? undefined
            : {
                body: `Провайдер «${deletingProvider.name}» будет удалён из настроек проекта.`,
                confirmLabel: "Удалить",
                title: "Удалить интеграцию?",
                onConfirm: () => deleteProvider(deletingProvider.id)
              }
        }
        onCancel={() => setDeletingProvider(undefined)}
        onConfirm={() => {
          if (deletingProvider !== undefined) {
            deleteProvider(deletingProvider.id);
            setDeletingProvider(undefined);
          }
        }}
      />
    </section>
  );
}

function ProviderDialog({
  onChange,
  onClose,
  onSave,
  provider
}: {
  onChange: (patch: Partial<IntegrationLinkProvider>) => void;
  onClose: () => void;
  onSave: () => void;
  provider: IntegrationLinkProvider;
}) {
  const dialogRef = useModalDialog<HTMLElement>(onClose);

  return (
    <div className="project-settings__dialog-backdrop" role="presentation">
      <section
        ref={dialogRef}
        aria-labelledby="provider-dialog-title"
        aria-modal="true"
        className="project-settings__dialog"
        role="dialog"
        tabIndex={-1}
      >
        <header>
          <h2 id="provider-dialog-title">Редактирование интеграции</h2>
          <button
            aria-label="Закрыть редактирование интеграции"
            className="project-settings__icon-button"
            type="button"
            onClick={onClose}
          >
            <X aria-hidden="true" size={18} />
          </button>
        </header>
        <div className="project-settings__dialog-body">
          <label>
            <span>Название</span>
            <input
              value={provider.name}
              onChange={(event) => onChange({ name: event.target.value })}
            />
          </label>
          <label>
            <span>Лейбл в Allure</span>
            <input
              value={provider.source.name ?? ""}
              onChange={(event) =>
                onChange({
                  source: {
                    ...provider.source,
                    kind: "label",
                    matchMode: "first",
                    name: event.target.value
                  }
                })
              }
            />
            <small>
              Например: JIRA_ISSUE. В allure-results кладем label JIRA_ISSUE = ANDROID-123.
            </small>
          </label>
          <label>
            <span>Шаблон ссылки</span>
            <input
              value={getProviderLinkTemplate(provider)}
              onChange={(event) => onChange(patchProviderLinkTemplate(event.target.value))}
            />
            <small>Например: https://www.jira.ru/browse/{"{value}"}</small>
          </label>
          <label>
            <span>Пример значения</span>
            <input
              value={provider.previewValue}
              onChange={(event) => onChange({ previewValue: event.target.value })}
            />
          </label>
          <div className="project-settings__dialog-check-row">
            <SwitchControl
              checked={provider.enabled}
              label="Интеграция включена"
              onChange={() => onChange({ enabled: !provider.enabled })}
            />
          </div>
        </div>
        <footer>
          <button className="project-settings__button" type="button" onClick={onClose}>
            <span>Отмена</span>
          </button>
          <button
            className="project-settings__button project-settings__button--primary"
            type="button"
            onClick={onSave}
          >
            <span>Сохранить</span>
          </button>
        </footer>
      </section>
    </div>
  );
}
