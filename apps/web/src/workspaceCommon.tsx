import React from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, Clock3, XCircle } from "lucide-react";

import type { ResultStatus } from "./m1Workspace.js";
import { statusLabels } from "./workspaceRouting.js";

export type ReadinessState = "ready" | "bounded";

export function EmptyState({ title, copy }: { title: string; copy: string }) {
  return (
    <div className="empty-state">
      <strong>{title}</strong>
      <span>{copy}</span>
    </div>
  );
}

export function ReadOnlyAction({
  icon,
  label,
  title = "Действие доступно через API или границу worker; эта панель показывает только безопасную диагностику."
}: {
  icon?: React.ReactNode;
  label: string;
  title?: string;
}) {
  return (
    <span className="readonly-action" title={title}>
      {icon}
      {label}
      <small>только чтение</small>
    </span>
  );
}

export function ListReadinessPanel({
  rendered,
  scope,
  states,
  total
}: {
  rendered: number;
  scope: string;
  states: {
    filter: ReadinessState;
    pagination: ReadinessState;
    search: ReadinessState;
    sort: ReadinessState;
  };
  total: number;
}) {
  return (
    <section className="list-readiness" aria-label={`${scope}: серверные элементы списка`}>
      <div>
        <span className="eyebrow">Состояние списка</span>
        <strong>
          {formatListCount(rendered)} показано из {formatListCount(total)}
        </strong>
      </div>
      <div className="list-control-status" aria-label={`${scope}: готовность поиска и фильтров`}>
        <ReadinessPill label="Поиск" state={states.search} />
        <ReadinessPill label="Фильтры" state={states.filter} />
        <ReadinessPill label="Сортировка" state={states.sort} />
        <ReadinessPill label="Пагинация" state={states.pagination} />
      </div>
    </section>
  );
}

export function ReadinessPill({ label, state }: { label: string; state: ReadinessState }) {
  return (
    <span className={state === "ready" ? "ready-pill" : "readonly-action"}>
      {label} {state === "ready" ? "Готово" : "только чтение"}
    </span>
  );
}

export function ListWindowFooter({ rendered, total }: { rendered: number; total: number }) {
  if (rendered >= total) {
    return null;
  }

  return (
    <div className="list-window-footer">
      <span>
        Показано {formatListCount(rendered)} из {formatListCount(total)} записей.
      </span>
      <ReadOnlyAction icon={<ChevronDown size={16} />} label="Следующая страница через API" />
    </div>
  );
}

export function formatListCount(value: number): string {
  return value.toLocaleString("ru-RU");
}

export function formatBytes(value: number): string {
  if (value < 1024) {
    return `${value} B`;
  }

  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }

  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

export function StatusBadge({ status }: { status: ResultStatus }) {
  return <span className={`status ${status}`}>{statusLabels[status]}</span>;
}

export function StatusIcon({ status }: { status: ResultStatus }) {
  if (status === "muted") {
    return <Clock3 className="icon skipped" size={17} />;
  }
  if (status === "passed") {
    return <CheckCircle2 className="icon passed" size={17} />;
  }
  if (status === "failed") {
    return <XCircle className="icon failed" size={17} />;
  }
  if (status === "broken") {
    return <AlertTriangle className="icon broken" size={17} />;
  }
  return <Clock3 className="icon skipped" size={17} />;
}

export function HistoryDots({ history }: { history: ResultStatus[] }) {
  return (
    <span className="history-dots">
      {history.map((status, index) => (
        <i className={status} key={`${status}-${index}`} />
      ))}
    </span>
  );
}

export function ProjectionStateMessage({
  copy,
  icon,
  title
}: {
  copy: string;
  icon: React.ReactNode;
  title: string;
}) {
  return (
    <div className="projection-state-message">
      {icon}
      <span>
        <strong>{title}</strong>
        <small>{copy}</small>
      </span>
    </div>
  );
}
