import { ChevronRight, KeyRound, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

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
  type ProjectApiToken,
  type ProjectArtifactRetention,
  type ProjectSettingsAccess,
  type ProjectSettings
} from "../projectSettings.js";
import { useModalDialog } from "../AppDialogs.js";

import "./ProjectSettingsReferenceScreen.css";

import { AccessTab } from "./ProjectSettingsAccessTab.js";
import { FieldsTab } from "./ProjectSettingsFieldsTab.js";
import { IntegrationsTab } from "./ProjectSettingsIntegrationsTab.js";
import { RetentionTab } from "./ProjectSettingsRetentionTab.js";
import { TokensTab } from "./ProjectSettingsTokensTab.js";
import { VisibilityTab } from "./ProjectSettingsVisibilityTab.js";
import {
  SettingsAccessState,
  SettingsErrorState,
  SummaryMetric
} from "./ProjectSettingsReferenceCommon.js";
import {
  defaultTokenDraft,
  parseSettingsTab,
  tabs,
  type ApiStatus,
  type SettingsTab,
  type TokenDraft
} from "./ProjectSettingsReferenceModel.js";

type ProjectSettingsReferenceScreenProps = {
  onOpenTab?: ((tab: string) => void) | undefined;
  projectId?: string | undefined;
  routeTab?: string | undefined;
  settings?: ProjectSettings;
};

export function ProjectSettingsReferenceScreen(props: ProjectSettingsReferenceScreenProps) {
  return <ProjectSettingsProjectScreen key={props.projectId ?? "default"} {...props} />;
}

function ProjectSettingsProjectScreen({
  onOpenTab,
  projectId,
  routeTab,
  settings = demoProjectSettings
}: ProjectSettingsReferenceScreenProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>(parseSettingsTab(routeTab));
  const [effectiveSettings, setEffectiveSettings] = useState<ProjectSettings>(settings);
  const [settingsLoaded, setSettingsLoaded] = useState(projectId === undefined);
  const [apiTokens, setApiTokens] = useState<ProjectApiToken[]>(settings.apiTokens);
  const [apiStatus, setApiStatus] = useState<ApiStatus>("loading");
  const [apiMessage, setApiMessage] = useState("Загружаем настройки доступа");
  const [reloadKey, setReloadKey] = useState(0);
  const [tokenDialogOpen, setTokenDialogOpen] = useState(false);
  const [tokenDraft, setTokenDraft] = useState<TokenDraft>(defaultTokenDraft);
  const [createdSecret, setCreatedSecret] = useState<string | undefined>();
  const [personalTokens, setPersonalTokens] = useState<PersonalApiToken[]>([]);
  const [personalTokenName, setPersonalTokenName] = useState("Локальная консоль");
  const [personalTokenSecret, setPersonalTokenSecret] = useState<string | undefined>();
  const activeTabRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let active = true;
    setApiStatus("loading");
    void loadProjectSettingsFromApi(projectId)
      .then((loadedSettings) => {
        if (!active) {
          return;
        }
        if (projectId !== undefined && loadedSettings.project.id !== projectId) {
          setApiStatus("error");
          setApiMessage("Сервер вернул настройки другого проекта. Обновите страницу.");
          return;
        }
        setEffectiveSettings(loadedSettings);
        setSettingsLoaded(true);
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
        setApiMessage(
          error instanceof Error && error.message.startsWith("Нет доступных проектов")
            ? error.message
            : "Не удалось получить настройки проекта. Обновите страницу и попробуйте снова."
        );
      });

    return () => {
      active = false;
    };
  }, [projectId, reloadKey, settings]);

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
  const settingsMatchProject =
    projectId === undefined || effectiveSettings.project.id === projectId;
  const visibleTabs = useMemo(
    () =>
      settingsMatchProject
        ? tabs.filter((tab) => isSettingsTabVisible(tab.id, settingsAccess))
        : [],
    [settingsAccess, settingsMatchProject]
  );
  const visibleActiveTab = visibleTabs.some((tab) => tab.id === activeTab)
    ? activeTab
    : (visibleTabs[0]?.id ?? "tokens");
  useEffect(() => {
    const tab = activeTabRef.current;
    const tabs = tab?.parentElement;
    if (!tab || !tabs) {
      return;
    }
    const revealActiveTab = () => {
      if (tabs.scrollWidth <= tabs.clientWidth) {
        return;
      }
      const tabBounds = tab.getBoundingClientRect();
      const tabsBounds = tabs.getBoundingClientRect();
      const inset = 12;
      if (tabBounds.left < tabsBounds.left + inset) {
        tabs.scrollLeft += tabBounds.left - tabsBounds.left - inset;
      } else if (tabBounds.right > tabsBounds.right - inset) {
        tabs.scrollLeft += tabBounds.right - tabsBounds.right + inset;
      }
    };
    revealActiveTab();
    if (typeof ResizeObserver === "undefined") {
      return;
    }
    const observer = new ResizeObserver(revealActiveTab);
    observer.observe(tabs);
    for (const button of Array.from(tabs.querySelectorAll("button"))) {
      observer.observe(button);
    }
    return () => observer.disconnect();
  }, [apiStatus, visibleActiveTab]);
  useEffect(() => {
    const routedTab = parseSettingsTab(routeTab);
    setActiveTab(routedTab);
  }, [routeTab]);
  useEffect(() => {
    setTokenDialogOpen(false);
  }, [activeTab]);
  useEffect(() => {
    if (!settingsMatchProject) return;
    if (!visibleTabs.some((tab) => tab.id === activeTab)) {
      const fallback = visibleTabs[0]?.id ?? "tokens";
      setActiveTab(fallback);
      onOpenTab?.(fallback);
    }
  }, [activeTab, onOpenTab, settingsMatchProject, visibleTabs]);

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

  if (!settingsMatchProject || !settingsLoaded) {
    return (
      <main className="project-settings" aria-label="Настройки проекта">
        <section className="project-settings__workspace" aria-labelledby="project-settings-title">
          <header className="project-settings__header">
            <div>
              <h1 id="project-settings-title">Настройки проекта</h1>
              <p>{apiStatus === "error" ? "Настройки недоступны" : "Загружаем проект…"}</p>
            </div>
          </header>
          {apiStatus === "error" ? (
            <SettingsErrorState
              message={apiMessage}
              onRetry={() => setReloadKey((key) => key + 1)}
            />
          ) : (
            <p role="status">Загружаем настройки выбранного проекта…</p>
          )}
        </section>
      </main>
    );
  }

  return (
    <main className="project-settings" aria-label="Настройки проекта">
      <section className="project-settings__workspace" aria-labelledby="project-settings-title">
        <header className="project-settings__header">
          <div>
            <nav className="project-settings__breadcrumb" aria-label="Путь к настройкам проекта">
              <a href="#projects">Проекты</a>
              <ChevronRight aria-hidden="true" size={14} />
              <span title={effectiveSettings.project.name}>{effectiveSettings.project.name}</span>
              <ChevronRight aria-hidden="true" size={14} />
              <strong>Настройки</strong>
            </nav>
            <h1 id="project-settings-title">Настройки проекта</h1>
            <p>Доступ, интеграции и правила хранения данных</p>
          </div>
          <div className="project-settings__summary" aria-label="Сводка настроек">
            {apiStatus !== "ready" ? (
              <span
                className={`project-settings__api-status project-settings__api-status--${apiStatus}`}
                title={apiMessage}
              >
                {apiStatus === "loading" ? "..." : "Ошибка"}
              </span>
            ) : null}
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
                ref={visibleActiveTab === tab.id ? activeTabRef : undefined}
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
        <label className="project-settings__mobile-tab-picker">
          <span>Раздел настроек</span>
          <select
            value={visibleActiveTab}
            onChange={(event) => {
              const nextTab = event.target.value as SettingsTab;
              setActiveTab(nextTab);
              onOpenTab?.(nextTab);
            }}
          >
            {visibleTabs.map((tab) => (
              <option key={tab.id} value={tab.id}>
                {tab.label}
              </option>
            ))}
          </select>
        </label>

        {apiStatus === "error" ? (
          <SettingsErrorState message={apiMessage} onRetry={() => setReloadKey((key) => key + 1)} />
        ) : null}
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
