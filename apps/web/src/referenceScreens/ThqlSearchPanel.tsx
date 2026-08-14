import { Check, EyeOff, MoreHorizontal, Plus, Search, Settings2, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import "./ThqlSearchPanel.css";

import { validateDashboardQuery } from "../analyticsQuery.js";
import { demoProjectSettings, getProjectSettingsAccess } from "../projectSettings.js";
import {
  createThqlFilterInApi,
  deleteThqlFilterFromApi,
  loadThqlFiltersFromApi
} from "../thqlSavedFiltersApi.js";
import {
  deleteThqlFilter,
  getAvailableThqlFilters,
  getVisibleThqlFilters,
  isDefaultThqlFilter,
  loadThqlFilterVisibility,
  saveThqlFilter,
  saveThqlFilterVisibility,
  thqlScopeLabels,
  type ThqlFilterEntity,
  type ThqlFilterScope,
  type ThqlSavedFilter
} from "../thqlSavedFilters.js";

const visibleFilterLimit = 6;
const thqlEntitySearchLabels: Record<ThqlFilterEntity, string> = {
  defects: "THQL поиск дефектов",
  launchResults: "THQL поиск результатов запуска",
  launches: "THQL поиск запусков",
  testCases: "THQL поиск тест-кейсов"
};

export function ThqlSearchPanel({
  actorId,
  activeFilterId,
  entity,
  onActiveFilterChange,
  onQueryChange,
  projectId,
  query
}: {
  actorId: string;
  activeFilterId?: string | undefined;
  entity: ThqlFilterEntity;
  onActiveFilterChange: (id: string | undefined) => void;
  onQueryChange: (query: string) => void;
  projectId: string;
  query: string;
}) {
  const [revision, setRevision] = useState(0);
  const [overflowOpen, setOverflowOpen] = useState(false);
  const [serverFilters, setServerFilters] = useState<ThqlSavedFilter[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    let mounted = true;
    loadThqlFiltersFromApi({ actorId, entity, projectId })
      .then((items) => {
        if (mounted) {
          setServerFilters(items);
        }
      })
      .catch(() => {
        if (mounted) {
          setServerFilters([]);
        }
      });
    return () => {
      mounted = false;
    };
  }, [actorId, entity, projectId, revision]);

  const allFilters = useMemo(
    () => getAvailableThqlFilters({ actorId, entity, filters: serverFilters, projectId }),
    [actorId, entity, projectId, revision, serverFilters]
  );
  const visibleFilters = useMemo(
    () => getVisibleThqlFilters({ actorId, filters: allFilters }),
    [actorId, allFilters, revision]
  );
  const { overflowFilters, pinnedFilters } = splitVisibleThqlFilters(
    visibleFilters,
    activeFilterId
  );
  const validation = validateDashboardQuery(query);
  const showValidation = query.trim().length > 0 && isLikelyThql(query);

  const applyFilter = (filter: ThqlSavedFilter) => {
    if (activeFilterId === filter.id) {
      onQueryChange("");
      onActiveFilterChange(undefined);
      setOverflowOpen(false);
      return;
    }

    onQueryChange(filter.query);
    onActiveFilterChange(filter.id);
    setOverflowOpen(false);
  };

  return (
    <section className="thql-search" aria-label="THQL поиск">
      <label className="thql-search__field">
        <Search aria-hidden="true" size={16} />
        <input
          aria-label={thqlEntitySearchLabels[entity]}
          placeholder='THQL: status in ["failed", "broken"] and tag = "checkout"'
          type="search"
          value={query}
          onChange={(event) => {
            onQueryChange(event.target.value);
            onActiveFilterChange(undefined);
          }}
        />
      </label>

      <div className="thql-search__filters" aria-label="Доступные фильтры">
        {pinnedFilters.map((filter) => (
          <button
            aria-label={`${filter.name}. ${thqlScopeLabels[filter.scope]}`}
            className={`thql-search__chip thql-search__chip--${filter.scope} ${
              activeFilterId === filter.id ? "active" : ""
            }`}
            key={filter.id}
            title={`${thqlScopeLabels[filter.scope]}: ${filter.description}`}
            type="button"
            onClick={() => applyFilter(filter)}
          >
            <span>{filter.name}</span>
          </button>
        ))}
        <div className="thql-search__filter-actions">
          {overflowFilters.length > 0 ? (
            <div className="thql-search__overflow">
              <button
                aria-expanded={overflowOpen}
                aria-label="Показать остальные фильтры"
                className="thql-search__icon-button"
                type="button"
                onClick={() => setOverflowOpen((open) => !open)}
              >
                <MoreHorizontal aria-hidden="true" size={18} />
              </button>
              {overflowOpen ? (
                <div className="thql-search__menu" role="menu">
                  {overflowFilters.map((filter) => (
                    <button
                      className={`thql-search__menu-item thql-search__menu-item--${filter.scope} ${
                        activeFilterId === filter.id ? "active" : ""
                      }`}
                      key={filter.id}
                      role="menuitem"
                      title={thqlScopeLabels[filter.scope]}
                      type="button"
                      onClick={() => applyFilter(filter)}
                    >
                      <span>{filter.name}</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
          <button
            aria-label="Управление фильтрами"
            className="thql-search__manage"
            title="Фильтры"
            type="button"
            onClick={() => setSettingsOpen(true)}
          >
            <Settings2 aria-hidden="true" size={15} />
          </button>
        </div>
      </div>

      {showValidation ? (
        <div className={`thql-search__validation ${validation.ok ? "ok" : "error"}`} role="status">
          {validation.ok ? (
            <>
              <Check aria-hidden="true" size={14} />
              <span>THQL запрос корректен</span>
            </>
          ) : (
            <>
              <EyeOff aria-hidden="true" size={14} />
              <span>{validation.error}</span>
            </>
          )}
        </div>
      ) : null}

      {settingsOpen ? (
        <ThqlFilterSettingsDialog
          actorId={actorId}
          entity={entity}
          filters={allFilters}
          projectId={projectId}
          query={query}
          onClose={() => setSettingsOpen(false)}
          onChanged={() => setRevision((value) => value + 1)}
        />
      ) : null}
    </section>
  );
}

function ThqlFilterSettingsDialog({
  actorId,
  entity,
  filters,
  onChanged,
  onClose,
  projectId,
  query
}: {
  actorId: string;
  entity: ThqlFilterEntity;
  filters: ThqlSavedFilter[];
  onChanged: () => void;
  onClose: () => void;
  projectId: string;
  query: string;
}) {
  const [hiddenIds, setHiddenIds] = useState(loadThqlFilterVisibility(actorId).hiddenFilterIds);
  const [newFilterName, setNewFilterName] = useState("");
  const [newFilterQuery, setNewFilterQuery] = useState(query);
  const allowedScopes = getAllowedThqlFilterScopes(actorId);
  const [newFilterScope, setNewFilterScope] = useState<ThqlFilterScope>(
    allowedScopes[0] ?? "personal"
  );
  const dialogRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const previouslyFocusedElement =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }

      if (event.key !== "Tab" || dialogRef.current === null) {
        return;
      }

      const focusableElements = getFocusableDialogElements(dialogRef.current);
      const firstElement = focusableElements[0];
      const lastElement = focusableElements.at(-1);
      if (firstElement === undefined || lastElement === undefined) {
        event.preventDefault();
        return;
      }

      const activeElement = document.activeElement;
      if (
        event.shiftKey &&
        (activeElement === firstElement || !dialogRef.current.contains(activeElement))
      ) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previouslyFocusedElement?.focus();
    };
  }, []);

  const toggleHidden = (id: string) => {
    setHiddenIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    );
  };
  const saveVisibility = () => {
    saveThqlFilterVisibility(actorId, { hiddenFilterIds: hiddenIds });
    onChanged();
    onClose();
  };
  const saveCurrentFilter = () => {
    const name = newFilterName.trim();
    const filterQuery = newFilterQuery.trim();
    if (name.length === 0 || filterQuery.length === 0) {
      return;
    }
    void createThqlFilterInApi({
      actorId,
      entity,
      name,
      projectId,
      query: filterQuery,
      scope: newFilterScope
    })
      .catch(() =>
        saveThqlFilter(actorId, {
          entity,
          id: `${newFilterScope}-${Date.now()}`,
          name,
          projectId,
          query: filterQuery,
          scope: newFilterScope
        })
      )
      .finally(() => {
        onChanged();
        setNewFilterName("");
        setNewFilterQuery("");
      });
  };
  const deleteFilter = (filter: ThqlSavedFilter) => {
    void deleteThqlFilterFromApi({ actorId, filter, projectId })
      .catch(() => deleteThqlFilter(actorId, filter.id))
      .finally(onChanged);
  };

  return (
    <div className="thql-dialog-backdrop" role="presentation">
      <section
        aria-describedby="thql-filter-dialog-description"
        aria-labelledby="thql-filter-dialog-title"
        aria-modal="true"
        className="thql-dialog"
        ref={dialogRef}
        role="dialog"
      >
        <header>
          <div className="thql-dialog__heading">
            <h2 id="thql-filter-dialog-title">Фильтры THQL</h2>
            <p id="thql-filter-dialog-description">
              Настройте видимые пресеты или сохраните текущий запрос.
            </p>
          </div>
          <button
            aria-label="Закрыть настройки фильтров"
            className="thql-dialog__close"
            ref={closeButtonRef}
            title="Закрыть"
            type="button"
            onClick={onClose}
          >
            <X aria-hidden="true" size={18} strokeWidth={2.2} />
          </button>
        </header>
        <div className="thql-dialog__body">
          <section className="thql-dialog__section" aria-labelledby="thql-visible-filters-title">
            <div className="thql-dialog__section-heading">
              <h3 id="thql-visible-filters-title">Показывать под поиском</h3>
              <span>Выбранные фильтры будут доступны рядом со строкой поиска.</span>
            </div>
            <div className="thql-dialog__filter-list">
              {filters.map((filter) => (
                <div className="thql-dialog__filter-row" key={filter.id}>
                  <label>
                    <input
                      aria-label={`Показывать фильтр ${filter.name}`}
                      checked={!hiddenIds.includes(filter.id)}
                      type="checkbox"
                      onChange={() => toggleHidden(filter.id)}
                    />
                    <span className="thql-dialog__filter-main">
                      <strong>{filter.name}</strong>
                      <small title={filter.query}>{filter.query}</small>
                    </span>
                  </label>
                  <span className={`thql-dialog__scope thql-dialog__scope--${filter.scope}`}>
                    {thqlScopeLabels[filter.scope]}
                  </span>
                  {canDeleteFilter(filter, actorId) ? (
                    <button
                      aria-label={`Удалить фильтр ${filter.name}`}
                      className="thql-dialog__delete-filter"
                      type="button"
                      onClick={(event) => {
                        event.preventDefault();
                        deleteFilter(filter);
                      }}
                    >
                      <Trash2 aria-hidden="true" size={16} strokeWidth={2.2} />
                    </button>
                  ) : (
                    <span className="thql-dialog__delete-spacer" aria-hidden="true" />
                  )}
                </div>
              ))}
              {filters.length === 0 ? (
                <p className="thql-dialog__empty">Сохранённых фильтров пока нет.</p>
              ) : null}
            </div>
          </section>
          <section className="thql-dialog__section" aria-labelledby="thql-create-filter-title">
            <div className="thql-dialog__section-heading">
              <h3 id="thql-create-filter-title">Создать фильтр</h3>
              <span>Сохраните запрос с доступным для вас уровнем видимости.</span>
            </div>
            <div className="thql-dialog__create-filter">
              <label>
                <span>Название</span>
                <input
                  aria-label="Название THQL фильтра"
                  placeholder="Например: Мои checkout падения"
                  value={newFilterName}
                  onChange={(event) => setNewFilterName(event.target.value)}
                />
              </label>
              <label>
                <span>Уровень</span>
                <select
                  aria-label="Уровень видимости THQL фильтра"
                  value={newFilterScope}
                  onChange={(event) => setNewFilterScope(event.target.value as ThqlFilterScope)}
                >
                  {allowedScopes.map((scope) => (
                    <option key={scope} value={scope}>
                      {thqlScopeLabels[scope]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="thql-dialog__query-field">
                <span>THQL запрос</span>
                <input
                  aria-label="THQL запрос фильтра"
                  placeholder='status in ["failed", "broken"]'
                  value={newFilterQuery}
                  onChange={(event) => setNewFilterQuery(event.target.value)}
                />
              </label>
              <button
                className="thql-dialog__save-filter"
                disabled={newFilterName.trim().length === 0 || newFilterQuery.trim().length === 0}
                type="button"
                onClick={saveCurrentFilter}
              >
                <Plus aria-hidden="true" size={15} />
                <span>Сохранить</span>
              </button>
            </div>
          </section>
        </div>
        <footer>
          <button type="button" onClick={onClose}>
            Отмена
          </button>
          <button className="primary" type="button" onClick={saveVisibility}>
            Применить
          </button>
        </footer>
      </section>
    </div>
  );
}

function getFocusableDialogElements(dialog: HTMLElement): HTMLElement[] {
  return Array.from(
    dialog.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
    )
  ).filter((element) => element.getAttribute("aria-hidden") !== "true");
}

export function getAllowedThqlFilterScopes(actorId: string): ThqlFilterScope[] {
  const scopes: ThqlFilterScope[] = ["personal"];
  const isAdmin = readCurrentUserRole() === "admin";
  const projectAccess = getProjectSettingsAccess(demoProjectSettings, actorId);
  if (isAdmin || projectAccess.canWriteSettings) {
    scopes.push("project");
  }
  if (isAdmin) {
    scopes.push("global");
  }
  return scopes;
}

function canDeleteFilter(filter: ThqlSavedFilter, actorId: string) {
  if (isDefaultThqlFilter(filter.id)) {
    return false;
  }
  if (filter.scope === "personal") {
    return filter.ownerId === actorId;
  }
  return getAllowedThqlFilterScopes(actorId).includes(filter.scope);
}

function readCurrentUserRole(): string | undefined {
  try {
    return globalThis.localStorage?.getItem("testhistory.userRole") ?? undefined;
  } catch {
    return undefined;
  }
}

function isLikelyThql(query: string): boolean {
  return /(?:=|!=|~=|>=|<=|>|<|\bin\b|\band\b|\bor\b|\bnot\b|\[|\])/i.test(query);
}

export function splitVisibleThqlFilters(
  filters: ThqlSavedFilter[],
  activeFilterId: string | undefined
) {
  const activeFilter =
    activeFilterId === undefined
      ? undefined
      : filters.find((filter) => filter.id === activeFilterId);
  const activeFilterIndex =
    activeFilter === undefined ? -1 : filters.findIndex((filter) => filter.id === activeFilter.id);
  if (activeFilter === undefined || activeFilterIndex < visibleFilterLimit) {
    return {
      overflowFilters: filters.slice(visibleFilterLimit),
      pinnedFilters: filters.slice(0, visibleFilterLimit)
    };
  }

  const otherFilters = filters.filter((filter) => filter.id !== activeFilter.id);
  return {
    overflowFilters: otherFilters.slice(visibleFilterLimit - 1),
    pinnedFilters: [activeFilter, ...otherFilters.slice(0, visibleFilterLimit - 1)]
  };
}
