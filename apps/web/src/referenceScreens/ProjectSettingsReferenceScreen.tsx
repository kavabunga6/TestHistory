import { Database, Eye, KeyRound, Plus, SlidersHorizontal, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import {
  createPersonalToken,
  loadPersonalTokens,
  revokePersonalToken,
  type PersonalApiToken
} from "../auth.js";
import {
  createProjectSettingsApiToken,
  demoProjectSettings,
  getProjectSettingsAccess,
  loadProjectSettingsFromApi,
  revokeProjectSettingsApiToken,
  saveProjectAccessSettings,
  saveProjectArtifactSettings,
  tokenScopeLabels,
  type ApiTokenScope,
  type CustomFieldMapping,
  type ProjectApiToken,
  type ProjectArtifactRetention,
  type ProjectSettingsAccess,
  type ProjectSettings
} from "../projectSettings.js";
import { useModalDialog } from "../AppDialogs.js";

import "./ProjectSettingsReferenceScreen.css";

import { AccessTab } from "./ProjectSettingsAccessTab.js";
import { IntegrationsTab } from "./ProjectSettingsIntegrationsTab.js";
import { TokensTab } from "./ProjectSettingsTokensTab.js";
import {
  Badge,
  PanelTitle,
  SettingsAccessState,
  SettingsErrorState,
  SummaryMetric
} from "./ProjectSettingsReferenceCommon.js";
import {
  defaultTokenDraft,
  parseSettingsTab,
  tabs,
  visibilityLabels,
  type ApiStatus,
  type SettingsTab,
  type TokenDraft
} from "./ProjectSettingsReferenceModel.js";

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

export function ProjectSettingsReferenceScreen({
  onOpenTab,
  routeTab,
  settings = demoProjectSettings
}: {
  onOpenTab?: ((tab: string) => void) | undefined;
  routeTab?: string | undefined;
  settings?: ProjectSettings;
}) {
  const [activeTab, setActiveTab] = useState<SettingsTab>(parseSettingsTab(routeTab));
  const [effectiveSettings, setEffectiveSettings] = useState<ProjectSettings>(settings);
  const [apiTokens, setApiTokens] = useState<ProjectApiToken[]>(settings.apiTokens);
  const [apiStatus, setApiStatus] = useState<ApiStatus>("loading");
  const [apiMessage, setApiMessage] = useState("Загружаем настройки доступа");
  const [tokenDialogOpen, setTokenDialogOpen] = useState(false);
  const [tokenDraft, setTokenDraft] = useState<TokenDraft>(defaultTokenDraft);
  const [createdSecret, setCreatedSecret] = useState<string | undefined>();
  const [personalTokens, setPersonalTokens] = useState<PersonalApiToken[]>([]);
  const [personalTokenName, setPersonalTokenName] = useState("Локальная консоль");
  const [personalTokenSecret, setPersonalTokenSecret] = useState<string | undefined>();

  useEffect(() => {
    let active = true;
    setApiStatus("loading");
    void loadProjectSettingsFromApi()
      .then((loadedSettings) => {
        if (!active) {
          return;
        }
        setEffectiveSettings(loadedSettings);
        setApiTokens(loadedSettings.apiTokens);
        setTokenDraft((draft) => ({
          ...draft,
          owner: loadedSettings.members[0]?.name ?? draft.owner
        }));
        setApiStatus("ready");
        setApiMessage("Настройки загружены из API");
      })
      .catch((error) => {
        if (!active) {
          return;
        }
        setApiTokens([]);
        setCreatedSecret(undefined);
        setApiStatus("error");
        setApiMessage(error instanceof Error ? error.message : "API настроек недоступен");
      });

    return () => {
      active = false;
    };
  }, [settings]);

  useEffect(() => {
    let active = true;
    void loadPersonalTokens()
      .then((items) => {
        if (active) {
          setPersonalTokens(items);
        }
      })
      .catch(() => {
        if (active) {
          setPersonalTokens([]);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  const activeMembers = useMemo(
    () => effectiveSettings.members.filter((member) => member.status === "active"),
    [effectiveSettings.members]
  );
  const activeTokenCount = apiTokens.filter((token) => token.status === "active").length;
  const enabledProviderCount = effectiveSettings.integrationProviders.filter(
    (provider) => provider.enabled
  ).length;
  const settingsAccess = useMemo(
    () => getProjectSettingsAccess(effectiveSettings),
    [effectiveSettings]
  );
  const visibleTabs = useMemo(
    () => tabs.filter((tab) => isSettingsTabVisible(tab.id, settingsAccess)),
    [settingsAccess]
  );
  const visibleActiveTab = visibleTabs.some((tab) => tab.id === activeTab)
    ? activeTab
    : (visibleTabs[0]?.id ?? "tokens");
  useEffect(() => {
    const routedTab = parseSettingsTab(routeTab);
    setActiveTab(routedTab);
  }, [routeTab]);
  useEffect(() => {
    setTokenDialogOpen(false);
  }, [activeTab]);
  useEffect(() => {
    if (!visibleTabs.some((tab) => tab.id === activeTab)) {
      const fallback = visibleTabs[0]?.id ?? "tokens";
      setActiveTab(fallback);
      onOpenTab?.(fallback);
    }
  }, [activeTab, onOpenTab, visibleTabs]);

  const createOwnToken = async () => {
    try {
      const created = await createPersonalToken({
        name: personalTokenName.trim() || "Личный токен",
        scopes: ["profile:read", "tokens:read", "tokens:write"]
      });
      setPersonalTokens((items) => [created.token, ...items]);
      setPersonalTokenSecret(created.secret);
      setApiMessage("Личный токен создан");
    } catch (error) {
      setPersonalTokenSecret(undefined);
      setApiMessage(error instanceof Error ? error.message : "API личных токенов недоступен");
    }
  };
  const revokeOwnToken = async (id: string) => {
    try {
      const revoked = await revokePersonalToken(id);
      setPersonalTokens((items) => items.map((token) => (token.id === id ? revoked : token)));
      setApiMessage("Личный токен отозван");
    } catch (error) {
      setApiMessage(
        error instanceof Error ? error.message : "API отзыва личного токена недоступен"
      );
    }
  };
  const copyTokenSecret = async (secret: string) => {
    try {
      await globalThis.navigator?.clipboard?.writeText(secret);
      setApiMessage("Токен скопирован");
    } catch {
      setApiMessage("Не удалось скопировать токен автоматически");
    }
  };
  const createToken = async () => {
    if (tokenDraft.scopes.length === 0 || !settingsAccess.canManageTokens) {
      return;
    }

    try {
      const created = await createProjectSettingsApiToken({
        expiresAt: tokenDraft.expiresAt,
        name: tokenDraft.name.trim() || "Новый API токен",
        ownerSubject: tokenDraft.owner,
        projectId: effectiveSettings.project.id,
        scopes: tokenDraft.scopes
      });
      setApiTokens((items) => [created.token, ...items]);
      setCreatedSecret(created.secret);
      setApiStatus("ready");
      setApiMessage("Токен создан через API");
      setTokenDialogOpen(false);
    } catch (error) {
      setCreatedSecret(undefined);
      setApiStatus("error");
      setApiMessage(error instanceof Error ? error.message : "API токенов недоступен");
    }
  };
  const revokeToken = async (id: string) => {
    try {
      const revoked = await revokeProjectSettingsApiToken(effectiveSettings.project.id, id);
      setApiTokens((items) => items.map((token) => (token.id === id ? revoked : token)));
      setApiStatus("ready");
      setApiMessage("Токен отозван через API");
    } catch (error) {
      setApiStatus("error");
      setApiMessage(error instanceof Error ? error.message : "API отзыва токена недоступен");
    }
  };

  const saveAccessSettings = async (nextSettings: ProjectSettings, message: string) => {
    if (!settingsAccess.canWriteSettings) {
      return;
    }

    try {
      const saved = await saveProjectAccessSettings(nextSettings);
      setEffectiveSettings(saved);
      setApiTokens(saved.apiTokens);
      setApiStatus("ready");
      setApiMessage(message);
    } catch (error) {
      setApiStatus("error");
      setApiMessage(error instanceof Error ? error.message : "API сохранения настроек недоступен");
    }
  };

  const saveArtifacts = async (retention: ProjectArtifactRetention) => {
    if (!settingsAccess.canWriteSettings) {
      return;
    }

    try {
      const saved = await saveProjectArtifactSettings(effectiveSettings.project.id, retention);
      setEffectiveSettings((current) => ({
        ...current,
        artifactRetention: saved,
        retentionPolicies: saved.retentionPolicies
      }));
      setApiStatus("ready");
      setApiMessage("Настройки хранения сохранены");
    } catch (error) {
      setApiStatus("error");
      setApiMessage(error instanceof Error ? error.message : "API сохранения хранения недоступен");
    }
  };

  return (
    <main className="project-settings" aria-label="Настройки проекта">
      <section className="project-settings__workspace" aria-labelledby="project-settings-title">
        <header className="project-settings__header">
          <div>
            <span className="project-settings__eyebrow">{effectiveSettings.project.key}</span>
            <h1 id="project-settings-title">Настройки проекта</h1>
            <p>{effectiveSettings.project.name}</p>
          </div>
          <div className="project-settings__summary" aria-label="Сводка настроек">
            <span
              className={`project-settings__api-status project-settings__api-status--${apiStatus}`}
              title={apiMessage}
            >
              {apiStatus === "ready" ? "API" : apiStatus === "loading" ? "..." : "Ошибка"}
            </span>
            <SummaryMetric label="Участники" value={String(activeMembers.length)} />
            <SummaryMetric label="Токены" value={String(activeTokenCount)} />
            <SummaryMetric label="Интеграции" value={String(enabledProviderCount)} />
          </div>
        </header>

        <nav className="project-settings__tabs" aria-label="Разделы настроек">
          {visibleTabs.map((tab) => {
            const Icon = tab.icon;

            return (
              <button
                aria-pressed={visibleActiveTab === tab.id}
                className={visibleActiveTab === tab.id ? "active" : ""}
                key={tab.id}
                type="button"
                onClick={() => {
                  setActiveTab(tab.id);
                  onOpenTab?.(tab.id);
                }}
              >
                <Icon aria-hidden="true" size={16} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>

        {apiStatus === "error" ? <SettingsErrorState message={apiMessage} /> : null}
        {settingsAccess.state !== "write" ? <SettingsAccessState access={settingsAccess} /> : null}
        {visibleActiveTab === "access" ? (
          <AccessTab
            canEdit={settingsAccess.canWriteSettings}
            enterpriseReady={apiStatus === "ready"}
            settings={effectiveSettings}
            onSave={(nextSettings) =>
              void saveAccessSettings(nextSettings, "Настройки участников сохранены")
            }
          />
        ) : null}
        {visibleActiveTab === "tokens" ? (
          <TokensTab
            createdSecret={createdSecret}
            access={settingsAccess}
            disabled={apiStatus !== "ready" || !settingsAccess.canManageTokens}
            personalTokenName={personalTokenName}
            personalTokenSecret={personalTokenSecret}
            personalTokens={personalTokens}
            tokens={apiTokens}
            onCopySecret={(secret) => void copyTokenSecret(secret)}
            onCreatePersonal={() => void createOwnToken()}
            onOpenCreate={() => {
              if (!settingsAccess.canManageTokens) {
                return;
              }
              setCreatedSecret(undefined);
              setTokenDialogOpen(true);
            }}
            onRevokePersonal={(id) => void revokeOwnToken(id)}
            onRevoke={(id) => void revokeToken(id)}
            onPersonalTokenNameChange={setPersonalTokenName}
          />
        ) : null}
        {visibleActiveTab === "visibility" ? (
          <VisibilityTab
            canEdit={settingsAccess.canWriteSettings}
            settings={effectiveSettings}
            onSave={(nextSettings) =>
              void saveAccessSettings(nextSettings, "Настройки видимости сохранены")
            }
          />
        ) : null}
        {visibleActiveTab === "integrations" ? (
          <IntegrationsTab
            canEdit={settingsAccess.canWriteSettings}
            settings={effectiveSettings}
            onSave={(nextSettings) => void saveAccessSettings(nextSettings, "Интеграции сохранены")}
          />
        ) : null}
        {visibleActiveTab === "retention" ? (
          <RetentionTab
            canEdit={settingsAccess.canWriteSettings}
            settings={effectiveSettings}
            onSave={(retention) => void saveArtifacts(retention)}
          />
        ) : null}
        {visibleActiveTab === "fields" ? (
          <FieldsTab
            canEdit={settingsAccess.canWriteSettings}
            settings={effectiveSettings}
            onSave={(nextSettings) =>
              void saveAccessSettings(nextSettings, "Маппинг полей сохранен")
            }
          />
        ) : null}
      </section>

      {tokenDialogOpen && settingsAccess.canManageTokens ? (
        <TokenDialog
          draft={tokenDraft}
          members={effectiveSettings.members.map((member) => member.name)}
          onChange={setTokenDraft}
          onClose={() => setTokenDialogOpen(false)}
          onCreate={() => void createToken()}
        />
      ) : null}
    </main>
  );
}

function isSettingsTabVisible(tab: SettingsTab, access: ProjectSettingsAccess): boolean {
  if (tab === "tokens") {
    return true;
  }
  if (access.canWriteSettings) {
    return true;
  }
  if (access.canReadSettings) {
    return (
      tab === "access" || tab === "visibility" || tab === "integrations" || tab === "retention"
    );
  }
  return false;
}

function VisibilityTab({
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

  return (
    <section className="project-settings__panel">
      <div className="project-settings__panel-row">
        <PanelTitle icon={<Eye size={18} />} title="Видимость данных" />
        {canEdit ? (
          <button
            className="project-settings__button project-settings__button--primary"
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

function RetentionTab({
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
          <span role="columnheader">Пройден</span>
          <span role="columnheader">Провален</span>
          <span role="columnheader">Карантин</span>
          <span role="columnheader">Лимит</span>
        </div>
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

function FieldsTab({
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

function TokenDialog({
  draft,
  members,
  onChange,
  onClose,
  onCreate
}: {
  draft: TokenDraft;
  members: string[];
  onChange: (draft: TokenDraft) => void;
  onClose: () => void;
  onCreate: () => void;
}) {
  const scopeEntries = Object.entries(tokenScopeLabels) as Array<[ApiTokenScope, string]>;
  const dialogRef = useModalDialog<HTMLElement>(onClose);

  return (
    <div className="project-settings__dialog-backdrop" role="presentation">
      <section
        ref={dialogRef}
        className="project-settings__dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="token-dialog-title"
        tabIndex={-1}
      >
        <header>
          <h2 id="token-dialog-title">Создание API токена</h2>
          <button
            aria-label="Закрыть создание API токена"
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
              value={draft.name}
              onChange={(event) => onChange({ ...draft, name: event.target.value })}
            />
          </label>
          <label>
            <span>Владелец</span>
            <select
              value={draft.owner}
              onChange={(event) => onChange({ ...draft, owner: event.target.value })}
            >
              {members.map((member) => (
                <option key={member}>{member}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Срок действия</span>
            <select
              value={draft.expiresAt}
              onChange={(event) => onChange({ ...draft, expiresAt: event.target.value })}
            >
              <option>через 30 дней</option>
              <option>через 90 дней</option>
              <option>через 180 дней</option>
            </select>
          </label>

          <div className="project-settings__scope-grid">
            {scopeEntries.map(([scope, label]) => (
              <label key={scope}>
                <input
                  checked={draft.scopes.includes(scope)}
                  type="checkbox"
                  onChange={(event) => {
                    const scopes = event.target.checked
                      ? [...draft.scopes, scope]
                      : draft.scopes.filter((item) => item !== scope);
                    onChange({ ...draft, scopes });
                  }}
                />
                <span>{label}</span>
              </label>
            ))}
          </div>
        </div>

        <footer>
          <button className="project-settings__button" type="button" onClick={onClose}>
            <span>Отмена</span>
          </button>
          <button
            className="project-settings__button project-settings__button--primary"
            disabled={draft.scopes.length === 0}
            title={draft.scopes.length === 0 ? "Выберите хотя бы одно право доступа" : undefined}
            type="button"
            onClick={onCreate}
          >
            <KeyRound aria-hidden="true" size={16} />
            <span>Создать</span>
          </button>
        </footer>
      </section>
    </div>
  );
}
