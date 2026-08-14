import { BarChart3, Pencil, Plus, Trash2, X } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";

import type { TestResult } from "../m1Workspace.js";

import "./DashboardReferenceScreen.css";

import {
  buildDonutGradient,
  emptyGroupRows,
  evaluateWidget,
  formatPercent,
  metricDescription,
  metricLabel
} from "./DashboardReferenceAnalytics.js";
import type {
  SavedDashboardWidget,
  WidgetDraft,
  WidgetEvaluation,
  WidgetGroup,
  WidgetKind,
  WidgetTypeOption
} from "./DashboardReferenceModel.js";
import { emptyDraft, statusLabels, widgetTypes } from "./DashboardReferenceModel.js";
import { loadSavedDashboardWidgets, saveDashboardWidgets } from "./DashboardReferenceStorage.js";
export function DashboardReferenceScreen({ results = [] }: { results?: TestResult[] } = {}) {
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [selectedWidgetKind, setSelectedWidgetKind] = useState<WidgetKind | null>(null);
  const [draft, setDraft] = useState<WidgetDraft>(emptyDraft);
  const [editingWidgetId, setEditingWidgetId] = useState<string | null>(null);
  const [widgetPendingDelete, setWidgetPendingDelete] = useState<SavedDashboardWidget | null>(null);
  const [savedWidgets, setSavedWidgets] =
    useState<SavedDashboardWidget[]>(loadSavedDashboardWidgets);

  const selectedWidgetType = useMemo(
    () => widgetTypes.find((type) => type.id === selectedWidgetKind) ?? null,
    [selectedWidgetKind]
  );

  useEffect(() => {
    saveDashboardWidgets(savedWidgets);
  }, [savedWidgets]);

  const openComposer = () => {
    setDraft(emptyDraft);
    setEditingWidgetId(null);
    setSelectedWidgetKind(null);
    setIsComposerOpen(true);
  };

  const openEditor = (widget: SavedDashboardWidget) => {
    setDraft({
      entity: widget.entity,
      groupBy: widget.groupBy,
      metric: widget.metric,
      period: widget.period,
      thql: widget.thql,
      title: widget.title
    });
    setEditingWidgetId(widget.id);
    setSelectedWidgetKind(widget.kind);
    setIsComposerOpen(true);
  };

  const closeComposer = () => {
    setEditingWidgetId(null);
    setIsComposerOpen(false);
    setSelectedWidgetKind(null);
  };

  const selectWidgetType = (type: WidgetTypeOption) => {
    setSelectedWidgetKind(type.id);
    setDraft((current) => ({
      ...current,
      metric: metricLabel(type.defaultMetric),
      title: type.title,
      thql: type.thqlTemplate
    }));
  };

  const saveWidget = () => {
    if (!selectedWidgetType) {
      return;
    }

    const title = draft.title.trim();
    const thql = draft.thql.trim();

    if (title.length === 0 || thql.length === 0) {
      return;
    }

    const widget: SavedDashboardWidget = {
      ...draft,
      id: editingWidgetId ?? `dashboard-widget-${Date.now()}`,
      kind: selectedWidgetType.id,
      title,
      thql
    };

    setSavedWidgets((current) =>
      editingWidgetId
        ? current.map((item) => (item.id === editingWidgetId ? widget : item))
        : [...current, widget]
    );
    closeComposer();
  };

  const deleteWidget = (widgetId: string) => {
    const widget = savedWidgets.find((item) => item.id === widgetId);
    if (!widget) {
      return;
    }
    setWidgetPendingDelete(widget);
  };

  const cancelWidgetDelete = () => {
    setWidgetPendingDelete(null);
  };

  const confirmWidgetDelete = () => {
    if (!widgetPendingDelete) {
      return;
    }
    setSavedWidgets((current) => current.filter((widget) => widget.id !== widgetPendingDelete.id));
    setWidgetPendingDelete(null);
  };

  return (
    <main className="dashboard-reference-screen" aria-label="Дашборды">
      <div className="dashboard-reference-crumbs">
        <strong>TestHistory</strong>
        <span>/</span>
        <span>Дашборды</span>
      </div>

      <section className="dashboard-reference-frame" aria-labelledby="dashboard-reference-title">
        <header className="dashboard-reference-head">
          <div>
            <h1 id="dashboard-reference-title">Дашборды</h1>
            <p>Рабочая область аналитики: виджеты считаются по текущим результатам и THQL.</p>
          </div>
          <button
            className="dashboard-reference-primary-button"
            onClick={openComposer}
            type="button"
          >
            <Plus aria-hidden="true" size={17} />
            Добавить виджет
          </button>
        </header>

        {savedWidgets.length > 0 ? (
          <DashboardWidgetGrid
            onDelete={deleteWidget}
            onEdit={openEditor}
            results={results}
            widgets={savedWidgets}
          />
        ) : (
          <section className="dashboard-reference-empty-state" aria-label="Пустой дашборд">
            <div className="dashboard-reference-empty-icon">
              <BarChart3 aria-hidden="true" size={36} />
            </div>
            <h2>Виджетов пока нет</h2>
            <p>
              Здесь появятся графики и таблицы на THQL: по статусам, тегам, кастомным полям,
              дефектам, ретраям, карантину и истории запусков.
            </p>
            <button
              className="dashboard-reference-secondary-button"
              onClick={openComposer}
              type="button"
            >
              <Plus aria-hidden="true" size={16} />
              Добавить первый виджет
            </button>
          </section>
        )}
      </section>

      {isComposerOpen ? (
        <DashboardWidgetComposerDialog
          draft={draft}
          isEditing={editingWidgetId !== null}
          onBack={() => setSelectedWidgetKind(null)}
          onClose={closeComposer}
          onDraftChange={setDraft}
          onSave={saveWidget}
          onSelect={selectWidgetType}
          selectedWidgetType={selectedWidgetType}
        />
      ) : null}

      {widgetPendingDelete ? (
        <DashboardDeleteWidgetDialog
          onCancel={cancelWidgetDelete}
          onConfirm={confirmWidgetDelete}
          widget={widgetPendingDelete}
        />
      ) : null}
    </main>
  );
}

function DashboardDialogShell({
  children,
  className = "",
  describedBy,
  labelledBy,
  onClose
}: {
  children: ReactNode;
  className?: string;
  describedBy?: string;
  labelledBy: string;
  onClose: () => void;
}) {
  const dialogRef = useDashboardDialog(onClose);

  return (
    <div
      className="dashboard-reference-modal-layer"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) {
          onClose();
        }
      }}
      role="presentation"
    >
      <section
        aria-describedby={describedBy}
        aria-labelledby={labelledBy}
        aria-modal="true"
        className={`dashboard-reference-modal ${className}`.trim()}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        {children}
      </section>
    </div>
  );
}

function useDashboardDialog(onClose: () => void) {
  const dialogRef = useRef<HTMLElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const dialog = dialogRef.current;
    const returnFocusTo =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusTimer = window.setTimeout(() => {
      const initialFocus = dialog?.querySelector<HTMLElement>("[data-dialog-initial-focus]");
      (initialFocus ?? dialog)?.focus();
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeRef.current();
        return;
      }

      if (event.key !== "Tab" || !dialog) {
        return;
      }

      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
        )
      ).filter((element) => element.getAttribute("aria-hidden") !== "true");

      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }

      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousBodyOverflow;
      returnFocusTo?.focus();
    };
  }, []);

  return dialogRef;
}

function DashboardWidgetComposerDialog({
  draft,
  isEditing,
  onBack,
  onClose,
  onDraftChange,
  onSave,
  onSelect,
  selectedWidgetType
}: {
  draft: WidgetDraft;
  isEditing: boolean;
  onBack: () => void;
  onClose: () => void;
  onDraftChange: (draft: WidgetDraft) => void;
  onSave: () => void;
  onSelect: (type: WidgetTypeOption) => void;
  selectedWidgetType: WidgetTypeOption | null;
}) {
  const eyebrow = isEditing ? "Редактирование" : selectedWidgetType ? "Шаг 2 из 2" : "Шаг 1 из 2";
  const title = isEditing
    ? "Редактировать виджет"
    : selectedWidgetType
      ? "Настроить виджет"
      : "Выберите тип виджета";

  return (
    <DashboardDialogShell labelledBy="dashboard-reference-composer-title" onClose={onClose}>
      <header className="dashboard-reference-modal-head">
        <div>
          <span>{eyebrow}</span>
          <h2 id="dashboard-reference-composer-title">{title}</h2>
        </div>
        <button aria-label="Закрыть диалог виджета" onClick={onClose} type="button">
          <X aria-hidden="true" size={18} />
        </button>
      </header>

      {selectedWidgetType ? (
        <WidgetThqlForm
          draft={draft}
          isEditing={isEditing}
          onBack={onBack}
          onCancel={onClose}
          onDraftChange={onDraftChange}
          onSave={onSave}
          selectedWidgetType={selectedWidgetType}
        />
      ) : (
        <>
          <div className="dashboard-reference-modal-body dashboard-reference-picker-body">
            <WidgetTypePicker onSelect={onSelect} />
          </div>
          <footer className="dashboard-reference-modal-footer">
            <button
              className="dashboard-reference-secondary-button"
              onClick={onClose}
              type="button"
            >
              Отмена
            </button>
          </footer>
        </>
      )}
    </DashboardDialogShell>
  );
}

function DashboardDeleteWidgetDialog({
  onCancel,
  onConfirm,
  widget
}: {
  onCancel: () => void;
  onConfirm: () => void;
  widget: SavedDashboardWidget;
}) {
  return (
    <DashboardDialogShell
      className="dashboard-reference-delete-dialog"
      describedBy="dashboard-reference-delete-description"
      labelledBy="dashboard-reference-delete-title"
      onClose={onCancel}
    >
      <header className="dashboard-reference-modal-head">
        <div>
          <span>Подтверждение</span>
          <h2 id="dashboard-reference-delete-title">Удалить виджет</h2>
        </div>
        <button aria-label="Закрыть диалог удаления виджета" onClick={onCancel} type="button">
          <X aria-hidden="true" size={18} />
        </button>
      </header>
      <div className="dashboard-reference-modal-body dashboard-reference-delete-body">
        <strong>{widget.title}</strong>
        <p id="dashboard-reference-delete-description">
          Виджет будет убран с дашборда. Данные результатов и настройки проекта не изменятся.
        </p>
      </div>
      <footer className="dashboard-reference-modal-footer">
        <button
          className="dashboard-reference-secondary-button"
          data-dialog-initial-focus="true"
          onClick={onCancel}
          type="button"
        >
          Отмена
        </button>
        <button className="dashboard-reference-danger-button" onClick={onConfirm} type="button">
          <Trash2 aria-hidden="true" size={15} />
          Удалить
        </button>
      </footer>
    </DashboardDialogShell>
  );
}

function DashboardWidgetGrid({
  onDelete,
  onEdit,
  results,
  widgets
}: {
  onDelete: (widgetId: string) => void;
  onEdit: (widget: SavedDashboardWidget) => void;
  results: TestResult[];
  widgets: SavedDashboardWidget[];
}) {
  return (
    <section className="dashboard-reference-widget-grid" aria-label="Виджеты дашборда">
      {widgets.map((widget) => (
        <DashboardWidgetCard
          key={widget.id}
          onDelete={() => onDelete(widget.id)}
          onEdit={() => onEdit(widget)}
          results={results}
          widget={widget}
        />
      ))}
    </section>
  );
}

function DashboardWidgetCard({
  onDelete,
  onEdit,
  results,
  widget
}: {
  onDelete: () => void;
  onEdit: () => void;
  results: TestResult[];
  widget: SavedDashboardWidget;
}) {
  const type = widgetTypes.find((item) => item.id === widget.kind) ?? widgetTypes[0]!;
  const Icon = type.icon;
  const evaluation = evaluateWidget(widget, results);

  return (
    <article className={`dashboard-reference-widget-card is-${widget.kind}`}>
      <header>
        <span className="dashboard-reference-widget-icon">
          <Icon aria-hidden="true" size={18} />
        </span>
        <div>
          <strong>{widget.title}</strong>
          <small>
            {type.title} · {evaluation.filteredResults.length} результатов
          </small>
        </div>
        <div className="dashboard-reference-widget-actions">
          <button
            aria-label={`Редактировать виджет ${widget.title}`}
            onClick={onEdit}
            type="button"
          >
            <Pencil aria-hidden="true" size={15} />
          </button>
          <button aria-label={`Удалить виджет ${widget.title}`} onClick={onDelete} type="button">
            <Trash2 aria-hidden="true" focusable="false" size={15} strokeWidth={2.2} />
          </button>
        </div>
      </header>

      <WidgetVisualization evaluation={evaluation} kind={widget.kind} />

      <details className="dashboard-reference-widget-details">
        <summary>THQL и параметры</summary>
        <dl>
          <div>
            <dt>Сущность</dt>
            <dd>{widget.entity}</dd>
          </div>
          <div>
            <dt>Метрика</dt>
            <dd>{widget.metric}</dd>
          </div>
          <div>
            <dt>Группировка</dt>
            <dd>{widget.groupBy}</dd>
          </div>
          <div>
            <dt>Период</dt>
            <dd>{widget.period}</dd>
          </div>
        </dl>
        <code>{widget.thql}</code>
      </details>
    </article>
  );
}

function WidgetVisualization({
  evaluation,
  kind
}: {
  evaluation: WidgetEvaluation;
  kind: WidgetKind;
}) {
  if (kind === "metric") {
    return <MetricWidget evaluation={evaluation} />;
  }
  if (kind === "bar") {
    return <BarWidget groups={evaluation.groups} />;
  }
  if (kind === "donut") {
    return <DonutWidget groups={evaluation.groups} total={evaluation.filteredResults.length} />;
  }
  if (kind === "line") {
    return <LineWidget series={evaluation.series} />;
  }
  return <TableWidget rows={evaluation.tableRows} />;
}

function MetricWidget({ evaluation }: { evaluation: WidgetEvaluation }) {
  return (
    <div className="dashboard-reference-metric-widget">
      <strong>{evaluation.value}</strong>
      <span>{metricDescription(evaluation)}</span>
      <div className="dashboard-reference-metric-strip">
        <span className="is-passed">Успешность {formatPercent(evaluation.passedRate)}</span>
        <span>Среднее {evaluation.averageDuration}</span>
        <span>Ретраи {evaluation.retryCount}</span>
      </div>
    </div>
  );
}

function BarWidget({ groups }: { groups: WidgetGroup[] }) {
  const visibleGroups = groups.length > 0 ? groups : emptyGroupRows();

  return (
    <div className="dashboard-reference-bar-widget">
      {visibleGroups.map((group) => (
        <div className="dashboard-reference-bar-row" key={group.key}>
          <span>{group.label}</span>
          <div>
            <i
              className={group.status ? `is-${group.status}` : undefined}
              style={{ width: `${Math.max(group.percent, group.value > 0 ? 3 : 0)}%` }}
            />
          </div>
          <strong>{group.value}</strong>
        </div>
      ))}
    </div>
  );
}

function DonutWidget({ groups, total }: { groups: WidgetGroup[]; total: number }) {
  const segments = groups.length > 0 ? groups : emptyGroupRows();
  const gradient = buildDonutGradient(segments);

  return (
    <div className="dashboard-reference-donut-widget">
      <div className="dashboard-reference-donut" style={{ background: gradient }}>
        <strong>{total}</strong>
        <span>всего</span>
      </div>
      <div className="dashboard-reference-donut-legend">
        {segments.map((group) => (
          <span key={group.key}>
            <i className={group.status ? `is-${group.status}` : undefined} />
            {group.label} {group.value}
          </span>
        ))}
      </div>
    </div>
  );
}

function LineWidget({ series }: { series: WidgetGroup[] }) {
  const values = series.length > 0 ? series : emptyGroupRows();
  const maxValue = Math.max(...values.map((item) => item.value), 1);
  const points = values
    .map((item, index) => {
      const x = values.length === 1 ? 50 : (index / (values.length - 1)) * 100;
      const y = 88 - (item.value / maxValue) * 74;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <div className="dashboard-reference-line-widget">
      <svg aria-hidden="true" preserveAspectRatio="none" viewBox="0 0 100 100">
        <polyline points={points} />
        {values.map((item, index) => {
          const x = values.length === 1 ? 50 : (index / (values.length - 1)) * 100;
          const y = 88 - (item.value / maxValue) * 74;
          return <circle cx={x} cy={y} key={item.key} r="2.8" />;
        })}
      </svg>
      <div>
        {values.map((item) => (
          <span key={item.key}>
            <small>{item.label}</small>
            <strong>{item.value}</strong>
          </span>
        ))}
      </div>
    </div>
  );
}

function TableWidget({ rows }: { rows: TestResult[] }) {
  return (
    <div className="dashboard-reference-table-widget">
      <table>
        <thead>
          <tr>
            <th>Статус</th>
            <th>Тест</th>
            <th>Длит.</th>
          </tr>
        </thead>
        <tbody>
          {(rows.length > 0 ? rows : []).map((result) => (
            <tr key={result.id}>
              <td>
                <span className={`dashboard-reference-status is-${result.status}`}>
                  {statusLabels[result.status]}
                </span>
              </td>
              <td>{result.name}</td>
              <td>{result.duration}</td>
            </tr>
          ))}
          {rows.length === 0 ? (
            <tr>
              <td colSpan={3}>Нет результатов по THQL</td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

function WidgetTypePicker({ onSelect }: { onSelect: (type: WidgetTypeOption) => void }) {
  return (
    <div className="dashboard-reference-type-grid" aria-label="Типы виджетов">
      {widgetTypes.map((type) => {
        const Icon = type.icon;

        return (
          <button
            className="dashboard-reference-type-card"
            data-dialog-initial-focus={type === widgetTypes[0] ? "true" : undefined}
            key={type.id}
            onClick={() => onSelect(type)}
            type="button"
          >
            <span>
              <Icon aria-hidden="true" size={22} />
            </span>
            <strong>{type.title}</strong>
            <small>{type.description}</small>
          </button>
        );
      })}
    </div>
  );
}

function WidgetThqlForm({
  draft,
  isEditing,
  onBack,
  onCancel,
  onDraftChange,
  onSave,
  selectedWidgetType
}: {
  draft: WidgetDraft;
  isEditing: boolean;
  onBack: () => void;
  onCancel: () => void;
  onDraftChange: (draft: WidgetDraft) => void;
  onSave: () => void;
  selectedWidgetType: WidgetTypeOption;
}) {
  const Icon = selectedWidgetType.icon;
  const canSave = draft.title.trim().length > 0 && draft.thql.trim().length > 0;
  const titleInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    titleInputRef.current?.focus();
    titleInputRef.current?.select();
  }, [selectedWidgetType.id]);

  const updateDraft = (patch: Partial<WidgetDraft>) => {
    onDraftChange({ ...draft, ...patch });
  };

  return (
    <form
      className="dashboard-reference-composer"
      onSubmit={(event) => {
        event.preventDefault();
        onSave();
      }}
    >
      <div className="dashboard-reference-modal-body dashboard-reference-composer-grid">
        <aside className="dashboard-reference-selected-type">
          <span>
            <Icon aria-hidden="true" size={24} />
          </span>
          <strong>{selectedWidgetType.title}</strong>
          <p>{selectedWidgetType.description}</p>
        </aside>

        <div className="dashboard-reference-form">
          <label className="dashboard-reference-field">
            <span>Название</span>
            <input
              data-dialog-initial-focus="true"
              onChange={(event) => updateDraft({ title: event.target.value })}
              placeholder="Например: Падения по компонентам"
              ref={titleInputRef}
              type="text"
              value={draft.title}
            />
          </label>

          <div className="dashboard-reference-form-row">
            <label className="dashboard-reference-field">
              <span>Сущность</span>
              <select
                onChange={(event) => updateDraft({ entity: event.target.value })}
                value={draft.entity}
              >
                <option>Результаты тестов</option>
                <option>Запуски</option>
                <option>Тест-кейсы</option>
                <option>Дефекты</option>
              </select>
            </label>

            <label className="dashboard-reference-field">
              <span>Метрика</span>
              <select
                onChange={(event) => updateDraft({ metric: event.target.value })}
                value={draft.metric}
              >
                <option>Количество</option>
                <option>Доля успешных</option>
                <option>Средняя длительность</option>
                <option>Количество ретраев</option>
              </select>
            </label>
          </div>

          <div className="dashboard-reference-form-row">
            <label className="dashboard-reference-field">
              <span>Группировка</span>
              <input
                onChange={(event) => updateDraft({ groupBy: event.target.value })}
                placeholder="status, tag, owner, custom.Priority"
                type="text"
                value={draft.groupBy}
              />
            </label>

            <label className="dashboard-reference-field">
              <span>Период</span>
              <input
                onChange={(event) => updateDraft({ period: event.target.value })}
                placeholder="Например: последние 14 дней"
                type="text"
                value={draft.period}
              />
            </label>
          </div>

          <label className="dashboard-reference-field dashboard-reference-field--thql">
            <span>THQL</span>
            <textarea
              onChange={(event) => updateDraft({ thql: event.target.value })}
              spellCheck={false}
              value={draft.thql}
            />
          </label>
        </div>
      </div>

      <footer className="dashboard-reference-modal-footer dashboard-reference-composer-footer">
        <button className="dashboard-reference-secondary-button" onClick={onBack} type="button">
          Назад к типам
        </button>
        <span className="dashboard-reference-form-hint" id="dashboard-reference-form-hint">
          {canSave ? "" : "Заполните название и THQL"}
        </span>
        <div className="dashboard-reference-footer-actions">
          <button className="dashboard-reference-secondary-button" onClick={onCancel} type="button">
            Отмена
          </button>
          <button
            aria-describedby="dashboard-reference-form-hint"
            className="dashboard-reference-primary-button"
            disabled={!canSave}
            type="submit"
          >
            {isEditing ? "Сохранить изменения" : "Сохранить виджет"}
          </button>
        </div>
      </footer>
    </form>
  );
}
