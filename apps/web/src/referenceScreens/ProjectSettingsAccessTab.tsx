import { Info, Pencil, Plus, Users, X } from "lucide-react";
import { useEffect, useState } from "react";

import { useModalDialog } from "../AppDialogs.js";
import {
  roleLabels,
  type ProjectMember,
  type ProjectMemberStatus,
  type ProjectRole,
  type ProjectSettings
} from "../projectSettings.js";
import { Badge } from "./ProjectSettingsReferenceCommon.js";
import { memberSourceLabels } from "./ProjectSettingsReferenceModel.js";
import { EnterpriseAccessPanel } from "./ProjectSettingsEnterpriseAccess.js";

export function AccessTab({
  canEdit,
  enterpriseReady,
  onSave,
  settings
}: {
  canEdit: boolean;
  enterpriseReady: boolean;
  settings: ProjectSettings;
  onSave: (settings: ProjectSettings) => void;
}) {
  const [draftMembers, setDraftMembers] = useState(settings.members);
  const [memberDialog, setMemberDialog] = useState<MemberDialogState | undefined>();
  const [matrixDialogOpen, setMatrixDialogOpen] = useState(false);
  const memberDialogRef = useModalDialog<HTMLElement>(
    () => setMemberDialog(undefined),
    memberDialog !== undefined
  );
  useEffect(() => {
    setDraftMembers(settings.members);
    setMemberDialog(undefined);
  }, [settings.members]);

  const updateMemberDraft = (patch: Partial<ProjectMember>) => {
    setMemberDialog((dialog) =>
      dialog === undefined ? undefined : { ...dialog, member: { ...dialog.member, ...patch } }
    );
  };
  const addMember = () => {
    const id = `member-${Date.now()}`;
    setMemberDialog({
      mode: "create",
      member: {
        email: "",
        id,
        lastActive: "нет данных",
        name: "",
        role: "viewer",
        source: "manual",
        status: "invited",
        subject: ""
      }
    });
  };
  const editMember = (member: ProjectMember) => {
    setMemberDialog({ mode: "edit", member: { ...member } });
  };
  const saveMember = () => {
    if (memberDialog === undefined) {
      return;
    }

    const normalizedMember = normalizeMemberDraft(memberDialog.member);
    const nextMembers =
      memberDialog.mode === "create"
        ? [...draftMembers, normalizedMember]
        : draftMembers.map((member) =>
            member.id === normalizedMember.id ? normalizedMember : member
          );

    setDraftMembers(nextMembers);
    onSave({ ...settings, members: nextMembers });
    setMemberDialog(undefined);
  };
  const permissions = [
    "Просмотр запусков",
    "Загрузка результатов",
    "Управление дефектами",
    "Управление карантином",
    "Настройки проекта",
    "API токены"
  ];
  const roleMatrix = [
    { role: "owner", values: ["✓", "✓", "✓", "✓", "✓", "✓"] },
    { role: "maintainer", values: ["✓", "✓", "✓", "✓", "чтение", ""] },
    { role: "editor", values: ["✓", "✓", "✓", "✓", "", ""] },
    { role: "viewer", values: ["✓", "", "", "", "", ""] },
    { role: "ci", values: ["✓", "✓", "", "", "", ""] }
  ] as const;

  return (
    <div className="project-settings__grid project-settings__grid--access">
      <section className="project-settings__panel">
        <div className="project-settings__panel-row">
          <div className="project-settings__panel-title project-settings__panel-title--inline">
            <Users aria-hidden="true" size={18} />
            <h2>Участники проекта</h2>
            <button
              aria-label="Показать матрицу прав"
              className="project-settings__icon-button"
              title="Показать матрицу прав"
              type="button"
              onClick={() => setMatrixDialogOpen(true)}
            >
              <Info aria-hidden="true" size={16} />
            </button>
          </div>
          {canEdit ? (
            <div className="project-settings__actions">
              <button className="project-settings__button" type="button" onClick={addMember}>
                <Plus aria-hidden="true" size={16} />
                <span>Добавить</span>
              </button>
            </div>
          ) : null}
        </div>

        <div className="project-settings__member-list" role="list">
          {draftMembers.map((member) => (
            <article className="project-settings__member-card" key={member.id} role="listitem">
              <div className="project-settings__member-avatar" aria-hidden="true">
                {member.name.slice(0, 2).toUpperCase()}
              </div>
              <div className="project-settings__member-card-main">
                <strong>{member.name}</strong>
                <span>{member.email}</span>
                <div className="project-settings__member-meta">
                  <Badge>{roleLabels[member.role]}</Badge>
                  <Badge tone={member.status === "active" ? "green" : "gray"}>
                    {member.status === "active"
                      ? "активен"
                      : member.status === "invited"
                        ? "приглашен"
                        : "отключен"}
                  </Badge>
                  <small>{memberSourceLabels[member.source]}</small>
                  <small>{member.lastActive}</small>
                </div>
              </div>
              {canEdit ? (
                <button
                  aria-label={`Редактировать участника ${member.name}`}
                  className="project-settings__icon-button"
                  title="Редактировать участника"
                  type="button"
                  onClick={() => editMember(member)}
                >
                  <Pencil aria-hidden="true" size={15} />
                </button>
              ) : null}
            </article>
          ))}
        </div>
      </section>

      {enterpriseReady ? (
        <EnterpriseAccessPanel canEdit={canEdit} projectId={settings.project.id} />
      ) : null}

      {matrixDialogOpen ? (
        <RoleMatrixDialog
          permissions={permissions}
          roleMatrix={roleMatrix}
          onClose={() => setMatrixDialogOpen(false)}
        />
      ) : null}

      {memberDialog !== undefined ? (
        <div className="project-settings__dialog-backdrop" role="presentation">
          <section
            ref={memberDialogRef}
            aria-labelledby="member-dialog-title"
            aria-modal="true"
            className="project-settings__dialog"
            role="dialog"
            tabIndex={-1}
          >
            <header>
              <h2 id="member-dialog-title">
                {memberDialog.mode === "create"
                  ? "Добавление участника"
                  : "Редактирование участника"}
              </h2>
              <button
                aria-label="Закрыть редактирование участника"
                className="project-settings__icon-button"
                type="button"
                onClick={() => setMemberDialog(undefined)}
              >
                <X aria-hidden="true" size={18} />
              </button>
            </header>
            <div className="project-settings__dialog-body">
              <label>
                <span>Имя</span>
                <input
                  value={memberDialog.member.name}
                  onChange={(event) => updateMemberDraft({ name: event.target.value })}
                />
              </label>
              <label>
                <span>Email</span>
                <input
                  value={memberDialog.member.email}
                  onChange={(event) =>
                    updateMemberDraft({ email: event.target.value, subject: event.target.value })
                  }
                />
              </label>
              <label>
                <span>Роль</span>
                <select
                  value={memberDialog.member.role}
                  onChange={(event) =>
                    updateMemberDraft({ role: event.target.value as ProjectRole })
                  }
                >
                  {Object.entries(roleLabels).map(([role, label]) => (
                    <option key={role} value={role}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Статус</span>
                <select
                  value={memberDialog.member.status}
                  onChange={(event) =>
                    updateMemberDraft({
                      status: event.target.value as ProjectMemberStatus
                    })
                  }
                >
                  <option value="active">Активен</option>
                  <option value="invited">Приглашен</option>
                  <option value="disabled">Отключен</option>
                </select>
              </label>
            </div>
            <footer>
              <button
                className="project-settings__button"
                type="button"
                onClick={() => setMemberDialog(undefined)}
              >
                <span>Отмена</span>
              </button>
              <button
                className="project-settings__button project-settings__button--primary"
                disabled={!canSaveMember(memberDialog.member)}
                title={canSaveMember(memberDialog.member) ? undefined : "Укажите email участника"}
                type="button"
                onClick={saveMember}
              >
                <span>Сохранить</span>
              </button>
            </footer>
          </section>
        </div>
      ) : null}
    </div>
  );
}

type MemberDialogState = {
  member: ProjectMember;
  mode: "create" | "edit";
};

function canSaveMember(member: ProjectMember): boolean {
  return member.email.trim().length > 0;
}

function normalizeMemberDraft(member: ProjectMember): ProjectMember {
  const email = member.email.trim();
  const name = member.name.trim() || email;

  return {
    ...member,
    email,
    name,
    subject: (member.subject ?? email).trim() || email
  };
}

function RoleMatrixDialog({
  onClose,
  permissions,
  roleMatrix
}: {
  onClose: () => void;
  permissions: string[];
  roleMatrix: ReadonlyArray<{
    role: ProjectRole;
    values: readonly string[];
  }>;
}) {
  const dialogRef = useModalDialog<HTMLElement>(onClose);

  return (
    <div className="project-settings__dialog-backdrop" role="presentation">
      <section
        ref={dialogRef}
        aria-labelledby="role-matrix-dialog-title"
        aria-modal="true"
        className="project-settings__dialog project-settings__dialog--wide"
        role="dialog"
        tabIndex={-1}
      >
        <header>
          <h2 id="role-matrix-dialog-title">Матрица прав</h2>
          <button
            aria-label="Закрыть матрицу прав"
            className="project-settings__icon-button"
            type="button"
            onClick={onClose}
          >
            <X aria-hidden="true" size={18} />
          </button>
        </header>
        <div className="project-settings__matrix" role="table">
          <div className="project-settings__matrix-head" role="row">
            <span role="columnheader">Роль</span>
            {permissions.map((permission) => (
              <span key={permission} role="columnheader">
                {permission}
              </span>
            ))}
          </div>
          {roleMatrix.map((row) => (
            <div className="project-settings__matrix-row" key={row.role} role="row">
              <strong role="cell">{roleLabels[row.role]}</strong>
              {row.values.map((value, index) => (
                <span className={value ? "allowed" : ""} key={`${row.role}-${index}`} role="cell">
                  {value || "—"}
                </span>
              ))}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
