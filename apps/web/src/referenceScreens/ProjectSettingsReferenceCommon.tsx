import type { ReactNode } from "react";
import { ShieldCheck } from "lucide-react";

import type { ProjectSettingsAccess } from "../projectSettings.js";

export function SummaryMetric({ label, value }: { label: string; value: string }) {
  return (
    <span className="project-settings__summary-item">
      <strong>{value}</strong>
      <span>{label}</span>
    </span>
  );
}

export function formatSettingsDate(value: string | undefined, empty = "не использовался") {
  if (value === undefined || value.trim() === "") {
    return empty;
  }
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(date);
}

export function SettingsErrorState({ message }: { message: string }) {
  return (
    <section className="project-settings__panel project-settings__error-state" role="alert">
      <PanelTitle icon={<ShieldCheck size={18} />} title="API настроек недоступен" />
      <p>{message}</p>
    </section>
  );
}

export function SettingsAccessState({ access }: { access: ProjectSettingsAccess }) {
  const message =
    access.state === "read-only"
      ? "Ваш доступ к настройкам проекта открыт только на чтение. Создание и отзыв API токенов доступны владельцам проекта."
      : "Ваш аккаунт не входит в роли, которым разрешен доступ к настройкам проекта.";

  return (
    <section
      className={`project-settings__panel project-settings__access-state project-settings__access-state--${access.state}`}
      role={access.state === "denied" ? "alert" : "status"}
    >
      <PanelTitle icon={<ShieldCheck size={18} />} title="Доступ к настройкам" />
      <p>{message}</p>
    </section>
  );
}

export function SwitchControl({
  checked,
  label,
  onChange
}: {
  checked: boolean;
  label: string;
  onChange: () => void;
}) {
  return (
    <button
      aria-checked={checked}
      className="project-settings__switch"
      role="switch"
      type="button"
      onClick={onChange}
    >
      <span className="project-settings__switch-track" aria-hidden="true">
        <span />
      </span>
      <span>{label}</span>
    </button>
  );
}

export function PanelTitle({ icon, title }: { icon: ReactNode; title: string }) {
  return (
    <div className="project-settings__panel-title">
      {icon}
      <h2>{title}</h2>
    </div>
  );
}

export function Badge({
  children,
  tone = "blue"
}: {
  children: ReactNode;
  tone?: "amber" | "blue" | "gray" | "green" | "red";
}) {
  return (
    <span className={`project-settings__badge project-settings__badge--${tone}`}>{children}</span>
  );
}
