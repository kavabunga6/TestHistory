import { KeyRound, Plus, RefreshCw, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import {
  createOidcProvider,
  discoverOidcProvider,
  loadEnterpriseAccess,
  rotateScimToken,
  toggleOidcProvider,
  type EnterpriseAccessRead,
  type EnterpriseRole,
  type OidcProviderInput
} from "../enterpriseAccessApi.js";
import { Badge } from "./ProjectSettingsReferenceCommon.js";

const roleLabels: Record<EnterpriseRole, string> = {
  owner: "Владелец",
  maintainer: "Администратор проекта",
  editor: "Редактор",
  viewer: "Наблюдатель",
  ci: "CI"
};

const emptyProvider: OidcProviderInput = {
  name: "",
  issuer: "",
  clientId: "",
  clientSecretEnvVar: "TESTHISTORY_OIDC_CLIENT_SECRET",
  defaultRole: "viewer"
};

export function EnterpriseAccessPanel({
  canEdit,
  projectId
}: {
  canEdit: boolean;
  projectId: string;
}) {
  const [read, setRead] = useState<EnterpriseAccessRead>();
  const [draft, setDraft] = useState<OidcProviderInput>(emptyProvider);
  const [formOpen, setFormOpen] = useState(false);
  const [message, setMessage] = useState("Загружаем enterprise-доступ…");
  const [scimRole, setScimRole] = useState<EnterpriseRole>("viewer");
  const [scimSecret, setScimSecret] = useState<string>();

  const reload = async () => {
    try {
      const value = await loadEnterpriseAccess(projectId);
      setRead(value);
      setScimRole(value.scimProvisioning?.defaultRole ?? "viewer");
      setMessage("Enterprise-доступ загружен");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Enterprise API недоступен");
    }
  };

  useEffect(() => {
    void reload();
  }, [projectId]);

  const addProvider = async () => {
    try {
      await createOidcProvider(projectId, draft);
      setDraft(emptyProvider);
      setFormOpen(false);
      setMessage("OIDC-провайдер добавлен");
      await reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось добавить OIDC-провайдер");
    }
  };

  const rotateToken = async () => {
    try {
      const receipt = await rotateScimToken(projectId, scimRole);
      setScimSecret(receipt.secret);
      setMessage("SCIM-токен создан и показан один раз");
      await reload();
    } catch (error) {
      setScimSecret(undefined);
      setMessage(error instanceof Error ? error.message : "Не удалось создать SCIM-токен");
    }
  };

  return (
    <section className="project-settings__panel project-settings__enterprise-panel">
      <div className="project-settings__panel-row">
        <div className="project-settings__panel-title">
          <ShieldCheck aria-hidden="true" size={18} />
          <h2>SSO и автопровижининг</h2>
        </div>
        {canEdit ? (
          <button
            className="project-settings__button"
            type="button"
            onClick={() => setFormOpen((value) => !value)}
          >
            <Plus aria-hidden="true" size={16} />
            <span>OIDC</span>
          </button>
        ) : null}
      </div>

      {formOpen ? (
        <div className="project-settings__enterprise-form">
          <label>
            <span>Название</span>
            <input
              value={draft.name}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
            />
          </label>
          <label>
            <span>Issuer HTTPS</span>
            <input
              placeholder="https://idp.example/tenant"
              value={draft.issuer}
              onChange={(event) => setDraft({ ...draft, issuer: event.target.value })}
            />
          </label>
          <label>
            <span>Client ID</span>
            <input
              value={draft.clientId}
              onChange={(event) => setDraft({ ...draft, clientId: event.target.value })}
            />
          </label>
          <label>
            <span>Переменная секрета</span>
            <input
              value={draft.clientSecretEnvVar}
              onChange={(event) => setDraft({ ...draft, clientSecretEnvVar: event.target.value })}
            />
          </label>
          <label>
            <span>Роль по умолчанию</span>
            <RoleSelect
              value={draft.defaultRole}
              onChange={(value) => setDraft({ ...draft, defaultRole: value })}
            />
          </label>
          <button
            className="project-settings__button project-settings__button--primary"
            disabled={!draft.name.trim() || !draft.issuer.trim() || !draft.clientId.trim()}
            type="button"
            onClick={() => void addProvider()}
          >
            Сохранить
          </button>
        </div>
      ) : null}

      <div className="project-settings__enterprise-grid">
        <div className="project-settings__enterprise-column">
          <h3>Провайдеры OIDC</h3>
          {(read?.oidcProviders ?? []).map((provider) => (
            <article className="project-settings__enterprise-card" key={provider.id}>
              <div>
                <strong>{provider.name}</strong>
                <span>{provider.issuer}</span>
                <small>
                  {provider.clientId} · {provider.clientSecretEnvVar}
                </small>
              </div>
              <Badge tone={provider.enabled ? "green" : "gray"}>
                {provider.enabled ? "активен" : "выключен"}
              </Badge>
              <button
                className="project-settings__icon-button"
                title="Проверить OIDC discovery"
                type="button"
                onClick={() =>
                  void discoverOidcProvider(projectId, provider.id)
                    .then(() => setMessage("OIDC discovery подтверждён"))
                    .catch((error: unknown) =>
                      setMessage(error instanceof Error ? error.message : "Discovery недоступен")
                    )
                }
              >
                <RefreshCw aria-hidden="true" size={15} />
              </button>
              {canEdit ? (
                <button
                  className="project-settings__button"
                  type="button"
                  onClick={() =>
                    void toggleOidcProvider(projectId, provider.id, !provider.enabled).then(reload)
                  }
                >
                  {provider.enabled ? "Выключить" : "Включить"}
                </button>
              ) : null}
            </article>
          ))}
          {(read?.oidcProviders?.length ?? 0) === 0 ? (
            <p className="project-settings__enterprise-empty">OIDC-провайдеры не настроены.</p>
          ) : null}
        </div>

        <div className="project-settings__enterprise-column">
          <h3>SCIM 2.0</h3>
          <article className="project-settings__enterprise-card project-settings__enterprise-card--scim">
            <KeyRound aria-hidden="true" size={20} />
            <div>
              <strong>
                {read?.scimProvisioning?.enabled ? "Провижининг включён" : "Токен не создан"}
              </strong>
              <span>
                {read?.scimProvisioning?.tokenPrefix ??
                  "SCIM endpoint появится после создания токена"}
              </span>
              <small>Пользователей из SCIM: {read?.scimUsers ?? 0}</small>
            </div>
            <div className="project-settings__enterprise-actions">
              <RoleSelect disabled={!canEdit} value={scimRole} onChange={setScimRole} />
              {canEdit ? (
                <button
                  className="project-settings__button"
                  type="button"
                  onClick={() => void rotateToken()}
                >
                  {read?.scimProvisioning ? "Ротировать" : "Создать токен"}
                </button>
              ) : null}
            </div>
          </article>
          {scimSecret !== undefined ? (
            <code className="project-settings__enterprise-secret">{scimSecret}</code>
          ) : null}
        </div>
      </div>
      <p className="project-settings__enterprise-message">{message}</p>
    </section>
  );
}

function RoleSelect({
  disabled = false,
  onChange,
  value
}: {
  disabled?: boolean;
  onChange: (value: EnterpriseRole) => void;
  value: EnterpriseRole;
}) {
  return (
    <select
      disabled={disabled}
      value={value}
      onChange={(event) => onChange(event.target.value as EnterpriseRole)}
    >
      {Object.entries(roleLabels).map(([role, label]) => (
        <option key={role} value={role}>
          {label}
        </option>
      ))}
    </select>
  );
}
