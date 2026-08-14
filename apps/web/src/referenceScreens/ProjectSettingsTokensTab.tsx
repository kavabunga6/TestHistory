import { Copy, KeyRound, Plus, Trash2 } from "lucide-react";

import type { PersonalApiToken } from "../auth.js";
import type { ProjectApiToken, ProjectSettingsAccess } from "../projectSettings.js";
import { Badge, formatSettingsDate, PanelTitle } from "./ProjectSettingsReferenceCommon.js";

export function TokensTab({
  access,
  createdSecret,
  disabled,
  onCreatePersonal,
  onCopySecret,
  onOpenCreate,
  onPersonalTokenNameChange,
  onRevokePersonal,
  onRevoke,
  personalTokenName,
  personalTokenSecret,
  personalTokens,
  tokens
}: {
  access: ProjectSettingsAccess;
  createdSecret: string | undefined;
  disabled: boolean;
  personalTokenName: string;
  personalTokenSecret: string | undefined;
  personalTokens: PersonalApiToken[];
  tokens: ProjectApiToken[];
  onCopySecret: (secret: string) => void;
  onCreatePersonal: () => void;
  onOpenCreate: () => void;
  onPersonalTokenNameChange: (value: string) => void;
  onRevokePersonal: (id: string) => void;
  onRevoke: (id: string) => void;
}) {
  return (
    <>
      <section className="project-settings__panel">
        <div className="project-settings__panel-row">
          <PanelTitle icon={<KeyRound size={18} />} title="Личные токены" />
          <div className="project-settings__inline-form">
            <input
              aria-label="Название личного токена"
              value={personalTokenName}
              onChange={(event) => onPersonalTokenNameChange(event.target.value)}
            />
            <button
              className="project-settings__button project-settings__button--primary"
              type="button"
              onClick={onCreatePersonal}
            >
              <Plus aria-hidden="true" size={16} />
              <span>Создать</span>
            </button>
          </div>
        </div>

        {personalTokenSecret ? (
          <div className="project-settings__secret" role="status">
            <strong>Личный токен создан</strong>
            <code>{personalTokenSecret}</code>
            <button
              className="project-settings__button"
              type="button"
              onClick={() => onCopySecret(personalTokenSecret)}
            >
              <Copy aria-hidden="true" size={16} />
              <span>Копировать</span>
            </button>
          </div>
        ) : null}

        <div
          className="project-settings__table project-settings__table--personal-tokens"
          role="table"
        >
          <div className="project-settings__table-head" role="row">
            <span role="columnheader">Токен</span>
            <span role="columnheader">Права</span>
            <span role="columnheader">Создан</span>
            <span role="columnheader">Использован</span>
            <span role="columnheader">Статус</span>
            <span role="columnheader">Действия</span>
          </div>
          {personalTokens.length === 0 ? (
            <div className="project-settings__empty-row" role="row">
              <span role="cell">Личных токенов пока нет</span>
            </div>
          ) : null}
          {personalTokens.map((token) => (
            <div className="project-settings__table-row" key={token.id} role="row">
              <span className="project-settings__member" role="cell">
                <strong>{token.name}</strong>
                <small>{token.prefix}...</small>
              </span>
              <span className="project-settings__scope-list" role="cell">
                {token.scopes.map((scope) => (
                  <Badge key={scope}>{scope}</Badge>
                ))}
              </span>
              <span role="cell">{formatSettingsDate(token.createdAt)}</span>
              <span role="cell">{formatSettingsDate(token.lastUsedAt)}</span>
              <span role="cell">
                <Badge tone={token.status === "active" ? "green" : "red"}>
                  {token.status === "active" ? "активен" : "отозван"}
                </Badge>
              </span>
              <span className="project-settings__actions" role="cell">
                <button
                  aria-label={`Отозвать личный токен ${token.name}`}
                  className="project-settings__icon-button danger"
                  disabled={token.status !== "active"}
                  title="Отозвать личный токен"
                  type="button"
                  onClick={() => onRevokePersonal(token.id)}
                >
                  <Trash2 aria-hidden="true" size={15} />
                </button>
              </span>
            </div>
          ))}
        </div>
      </section>

      {access.canManageTokens ? (
        <section className="project-settings__panel">
          <div className="project-settings__panel-row">
            <PanelTitle icon={<KeyRound size={18} />} title="API токены проекта" />
            <button
              className="project-settings__button project-settings__button--primary"
              disabled={disabled}
              type="button"
              onClick={onOpenCreate}
            >
              <Plus aria-hidden="true" size={16} />
              <span>Создать</span>
            </button>
          </div>

          {createdSecret ? (
            <div className="project-settings__secret" role="status">
              <strong>Токен создан</strong>
              <code>{createdSecret}</code>
            </div>
          ) : null}

          <div className="project-settings__table project-settings__table--tokens" role="table">
            <div className="project-settings__table-head" role="row">
              <span role="columnheader">Токен</span>
              <span role="columnheader">Владелец</span>
              <span role="columnheader">Права</span>
              <span role="columnheader">Использован</span>
              <span role="columnheader">Действует</span>
              <span role="columnheader">Действия</span>
            </div>
            {tokens.length === 0 ? (
              <div className="project-settings__empty-row" role="row">
                <span role="cell">Токены проекта ещё не созданы</span>
              </div>
            ) : null}
            {tokens.map((token) => (
              <div className="project-settings__table-row" key={token.id} role="row">
                <span className="project-settings__member" role="cell">
                  <strong>{token.name}</strong>
                  <small>{token.prefix}...</small>
                </span>
                <span role="cell">{token.owner}</span>
                <span className="project-settings__scope-list" role="cell">
                  {token.scopes.slice(0, 3).map((scope) => (
                    <Badge key={scope}>{scope}</Badge>
                  ))}
                  {token.scopes.length > 3 ? <Badge>+{token.scopes.length - 3}</Badge> : null}
                </span>
                <span role="cell">{formatSettingsDate(token.lastUsedAt)}</span>
                <span role="cell">
                  <Badge tone={token.status === "active" ? "green" : "red"}>
                    {token.status === "active"
                      ? formatSettingsDate(token.expiresAt, "без срока")
                      : "отозван"}
                  </Badge>
                </span>
                <span className="project-settings__actions" role="cell">
                  <button
                    aria-label={`Отозвать токен ${token.name}`}
                    className="project-settings__icon-button danger"
                    disabled={disabled || token.status !== "active"}
                    title="Отозвать токен"
                    type="button"
                    onClick={() => onRevoke(token.id)}
                  >
                    <Trash2 aria-hidden="true" size={15} />
                  </button>
                </span>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
}
