import { BarChart3, Plus, RefreshCw, Trash2, X } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";

import type { LaunchListItem, TestResult } from "../m1Workspace.js";

import "./DashboardReferenceScreen.css";
import "./DashboardReferenceWidgets.css";
import "./DashboardReferenceDialogs.css";
import "./DashboardReferenceResponsive.css";

import { metricLabel } from "./DashboardReferenceVisuals.js";
import type {
  SavedDashboardWidget,
  WidgetDraft,
  WidgetKind,
  WidgetTypeOption
} from "./DashboardReferenceModel.js";
import { emptyDraft, widgetTypes } from "./DashboardReferenceModel.js";
import { formatResultCount } from "./DashboardReferenceFormatting.js";
import { widgetUnavailableReason } from "./DashboardReferenceQuery.js";
import { loadSavedDashboardWidgets, saveDashboardWidgets } from "./DashboardReferenceStorage.js";
import { DashboardWidgetGrid } from "./DashboardReferenceWidgets.js";
import { useDashboardAggregate } from "./useDashboardAggregate.js";

export function DashboardReferenceScreen({
  launchItems = [],
  onOpenResult,
  storageScope
}: {
  launchItems?: LaunchListItem[];
  results?: TestResult[];
  onOpenResult?: ((id: string, launchId: string) => void) | undefined;
  storageScope?: string | undefined;
} = {}) {
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [selectedWidgetKind, setSelectedWidgetKind] = useState<WidgetKind | null>(null);
  const [draft, setDraft] = useState<WidgetDraft>(emptyDraft);
  const [editingWidgetId, setEditingWidgetId] = useState<string | null>(null);
  const [widgetPendingDelete, setWidgetPendingDelete] = useState<SavedDashboardWidget | null>(null);
  const [savedWidgets, setSavedWidgets] = useState<SavedDashboardWidget[]>(() =>
    loadSavedDashboardWidgets(storageScope)
  );
  const [selectedLaunchId, setSelectedLaunchId] = useState<string | undefined>();
  const selectedLaunch =
    launchItems.find((launch) => launch.id === selectedLaunchId) ?? launchItems[0];
  const { state: dataState, retry: retryDataLoad } = useDashboardAggregate(
    selectedLaunch?.id,
    savedWidgets
  );

  const selectedWidgetType = useMemo(
    () => widgetTypes.find((type) => type.id === selectedWidgetKind) ?? null,
    [selectedWidgetKind]
  );

  useEffect(() => {
    saveDashboardWidgets(savedWidgets, storageScope);
  }, [savedWidgets, storageScope]);

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

    if (
      title.length === 0 ||
      thql.length === 0 ||
      widgetUnavailableReason({ ...draft, kind: selectedWidgetType.id })
    ) {
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
            <p>Виджеты по результатам выбранного запуска.</p>
          </div>
          <div className="dashboard-reference-head-actions">
            <label className="dashboard-reference-launch-picker">
              <span>Запуск</span>
              <select
                disabled={launchItems.length === 0}
                onChange={(event) => setSelectedLaunchId(event.target.value)}
                value={selectedLaunch?.id ?? ""}
              >
                {launchItems.length === 0 ? <option value="">Нет запусков</option> : null}
                {launchItems.map((launch) => (
                  <option key={launch.id} value={launch.id}>
                    {launch.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="dashboard-reference-primary-button"
              onClick={openComposer}
              type="button"
            >
              <Plus aria-hidden="true" size={17} />
              Добавить виджет
            </button>
          </div>
        </header>

        {savedWidgets.length > 0 ? (
          <DashboardDataContent
            dataState={dataState}
            launchName={selectedLaunch?.name}
            onRetry={retryDataLoad}
            onDelete={deleteWidget}
            onEdit={openEditor}
            onOpenResult={onOpenResult}
            widgets={savedWidgets}
          />
        ) : (
          <section className="dashboard-reference-empty-state" aria-label="Пустой дашборд">
            <div className="dashboard-reference-empty-icon">
              <BarChart3 aria-hidden="true" size={36} />
            </div>
            <h2>Виджетов пока нет</h2>
            <p>Добавьте показатели по результатам выбранного запуска.</p>
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

function DashboardDataContent({
  dataState,
  launchName,
  onRetry,
  onDelete,
  onEdit,
  onOpenResult,
  widgets
}: {
  dataState: ReturnType<typeof useDashboardAggregate>["state"];
  launchName?: string | undefined;
  onRetry: () => void;
  onDelete: (widgetId: string) => void;
  onEdit: (widget: SavedDashboardWidget) => void;
  onOpenResult?: ((id: string, launchId: string) => void) | undefined;
  widgets: SavedDashboardWidget[];
}) {
  if (dataState.status === "empty") {
    return (
      <div className="dashboard-reference-data-state" role="status">
        <strong>Пока нет запусков с результатами</strong>
        <span>После загрузки запуска виджеты покажут его показатели.</span>
      </div>
    );
  }

  if (dataState.status === "loading") {
    return (
      <>
        <div aria-live="polite" className="dashboard-reference-data-state" role="status">
          <strong>Расчёт показателей запуска</strong>
          <span>Собираем данные для виджетов по всем результатам…</span>
        </div>
        <section className="dashboard-reference-widget-grid" aria-label="Загрузка виджетов">
          {widgets.map((widget) => (
            <article className="dashboard-reference-widget-card is-loading" key={widget.id}>
              <header>
                <div>
                  <strong>{widget.title}</strong>
                  <small>THQL · ожидание данных</small>
                </div>
              </header>
              <span className="dashboard-reference-widget-placeholder" aria-hidden="true" />
            </article>
          ))}
        </section>
      </>
    );
  }

  if (dataState.status === "error") {
    return (
      <div className="dashboard-reference-data-state is-error" role="alert">
        <strong>Не удалось рассчитать показатели запуска</strong>
        <span>Проверьте доступность сервера и повторите запрос.</span>
        <button className="dashboard-reference-secondary-button" onClick={onRetry} type="button">
          Повторить загрузку
        </button>
      </div>
    );
  }

  const { aggregate } = dataState;
  return (
    <>
      <div className="dashboard-reference-data-summary">
        <strong>{launchName ?? "Выбранный запуск"}</strong>
        <span>{formatResultCount(aggregate.totalResults)} · весь запуск</span>
        <button aria-label="Обновить данные дашборда" onClick={onRetry} type="button">
          <RefreshCw aria-hidden="true" size={14} />
          Обновить
        </button>
      </div>
      <DashboardWidgetGrid
        aggregate={aggregate}
        onDelete={onDelete}
        onEdit={onEdit}
        onOpenResult={onOpenResult}
        widgets={widgets}
      />
    </>
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

function WidgetTypePicker({ onSelect }: { onSelect: (type: WidgetTypeOption) => void }) {
  return (
    <div className="dashboard-reference-type-grid" aria-label="Типы виджетов">
      {widgetTypes
        .filter((type) => type.id !== "line")
        .map((type) => {
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
  const queryError = widgetUnavailableReason({ ...draft, kind: selectedWidgetType.id });
  const canSave = draft.title.trim().length > 0 && draft.thql.trim().length > 0 && !queryError;
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
                {draft.entity !== "Результаты тестов" ? (
                  <option disabled>{draft.entity}</option>
                ) : null}
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
                {draft.metric === "Количество ретраев" ? (
                  <option disabled>Количество ретраев</option>
                ) : null}
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
              <span>Область данных</span>
              <input aria-readonly="true" readOnly type="text" value="Весь выбранный запуск" />
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
        <span
          className="dashboard-reference-form-hint"
          id="dashboard-reference-form-hint"
          role="status"
        >
          {queryError ?? (canSave ? "" : "Заполните название и THQL")}
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
