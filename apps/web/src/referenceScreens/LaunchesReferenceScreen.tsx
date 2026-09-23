import { ChevronRight, RefreshCw, Trash2 } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import type { LaunchListItem, LaunchResultPage, ResultStatus, TestResult } from "../m1Workspace.js";
import type { IntegrationLinkProvider } from "../projectSettingsTypes.js";
import { formatLaunchId } from "./LaunchesReferenceFormatters.js";
import {
  filterLaunchItems,
  filterResults,
  findLaunchIdForResult,
  findMostUsefulLaunchResult,
  getLaunchResults,
  getLaunchTotal,
  getPartialStateMessage,
  hasLoadingScope,
  launchStateLabels,
  launchTabs,
  matchesStatusFilter,
  parseLaunchMetadata,
  parseLaunchTab,
  type LaunchesReferenceLoadingScope,
  type LaunchesReferencePartialState,
  type LaunchTab
} from "./LaunchesReferenceModel.js";

import { ReferenceRouteState } from "./LaunchesReferenceRouteState.js";
import { LaunchComparisonScreen, type LaunchComparisonSession } from "./LaunchComparisonCard.js";
import {
  ChartsTab,
  ErrorsTab,
  LaunchProgressBar,
  OverviewTab,
  ResultsTab
} from "./LaunchesReferenceTabs.js";
import { ThqlSearchPanel } from "./ThqlSearchPanel.js";

import "./LaunchesReferenceScreen.css";
import "./LaunchesReferenceOverview.css";
import "./LaunchesResultPagination.css";
import "./LaunchesNavigation.css";

type LaunchView = "list" | "detail";
const rememberedResultListLimit = 32;

function rememberResultListValue<T>(values: Map<string, T>, key: string, value: T) {
  values.delete(key);
  values.set(key, value);
  if (values.size > rememberedResultListLimit) {
    const oldestKey = values.keys().next().value;
    if (oldestKey !== undefined) {
      values.delete(oldestKey);
    }
  }
}

export type { LaunchTab, ResultReportTab } from "./LaunchesReferenceModel.js";

export function LaunchesReferenceScreen({
  integrationProviders = [],
  launchDetailLoading = false,
  launchItems,
  launchListLoading = false,
  launchListPartial,
  loadingScope,
  onOpenLaunch,
  onOpenLaunchList,
  onOpenResult,
  onOpenResultTab,
  onOpenTab,
  onRefresh,
  onResultPageIndexChange,
  onResultPageSizeChange,
  onResultQueryChange,
  onResultStatusFilterChange,
  onSelectResult,
  projectId = "ws",
  routeLaunchId,
  routeLaunchTab,
  routeQuery,
  routeResultId,
  routeResultTab,
  resultLoading = false,
  resultPage,
  resultPageIndex = 0,
  resultPageSize = 25,
  resultQuery,
  resultStatusFilter,
  results,
  selectedResultDetail,
  selectedResultId,
  onDeleteLaunch,
  onToggleMuteResult,
  onUnlinkResultDefect
}: {
  integrationProviders?: IntegrationLinkProvider[] | undefined;
  launchDetailLoading?: boolean | undefined;
  launchDetailPartial?: LaunchesReferencePartialState | undefined;
  launchItems: LaunchListItem[];
  launchListLoading?: boolean | undefined;
  launchListPartial?: LaunchesReferencePartialState | undefined;
  loadingScope?: LaunchesReferenceLoadingScope | LaunchesReferenceLoadingScope[] | undefined;
  onDeleteLaunch?: ((id: string) => void) | undefined;
  onOpenLaunch?: ((id: string) => void) | undefined;
  onOpenLaunchList?: (() => void) | undefined;
  onOpenResult?: ((id: string) => void) | undefined;
  onOpenResultTab?: ((tab: string) => void) | undefined;
  onOpenTab?: ((tab: string) => void) | undefined;
  onRefresh?: (() => void) | undefined;
  onResultPageIndexChange?: ((index: number) => void) | undefined;
  onResultPageSizeChange?: ((size: number) => void) | undefined;
  onResultQueryChange?: ((query: string) => void) | undefined;
  onResultStatusFilterChange?: ((status: ResultStatus | undefined) => void) | undefined;
  onSelectResult?: ((id: string) => void) | undefined;
  onToggleMuteResult?: ((id: string) => void) | undefined;
  onUnlinkResultDefect?: ((resultId: string, defectId: string) => void) | undefined;
  projectId?: string | undefined;
  routeLaunchId?: string | undefined;
  routeLaunchTab?: string | undefined;
  routeQuery?: string | undefined;
  routeResultId?: string | undefined;
  routeResultTab?: string | undefined;
  resultLoading?: boolean | undefined;
  resultPage?: LaunchResultPage | undefined;
  resultPageIndex?: number | undefined;
  resultPageSize?: number | undefined;
  resultQuery?: string | undefined;
  resultStatusFilter?: ResultStatus | undefined;
  resultPartial?: LaunchesReferencePartialState | undefined;
  results: TestResult[];
  selectedResultDetail?: TestResult | undefined;
  selectedResultId?: string | undefined;
}) {
  const [activeTab, setActiveTab] = useState<LaunchTab>(
    routeResultId !== undefined ? "results" : parseLaunchTab(routeLaunchTab)
  );
  const [query, setQuery] = useState(routeQuery ?? "");
  const [launchQuery, setLaunchQuery] = useState("");
  const [activeLaunchFilterId, setActiveLaunchFilterId] = useState<string | undefined>();
  const [activeResultFilterId, setActiveResultFilterId] = useState<string | undefined>();
  const [statusFilter, setStatusFilter] = useState<ResultStatus | undefined>();
  const [comparisonSessions, setComparisonSessions] = useState<
    Record<string, LaunchComparisonSession>
  >({});
  const [selectedLaunchId, setSelectedLaunchId] = useState(
    routeLaunchId ?? launchItems[0]?.id ?? ""
  );
  const [localSelectedResultId, setLocalSelectedResultId] = useState(selectedResultId ?? "");
  const [view, setView] = useState<LaunchView>(routeLaunchId !== undefined ? "detail" : "list");
  const launchTabsRef = useRef<HTMLElement | null>(null);
  const tabBodyRef = useRef<HTMLDivElement | null>(null);
  const resultListPositionsRef = useRef(new Map<string, number>());
  const resultListSelectionsRef = useRef(new Map<string, string>());
  const effectiveSelectedResultId = selectedResultId ?? localSelectedResultId;
  const selectedResultLaunchId = useMemo(
    () =>
      findLaunchIdForResult(results, effectiveSelectedResultId) ??
      (selectedResultDetail?.id === effectiveSelectedResultId
        ? selectedResultDetail.launchId
        : undefined),
    [effectiveSelectedResultId, results, selectedResultDetail]
  );

  const effectiveSelectedLaunchId = routeLaunchId ?? selectedLaunchId;
  const selectedLaunch =
    routeLaunchId === undefined
      ? (launchItems.find((item) => item.id === effectiveSelectedLaunchId) ??
        launchItems.find((item) => item.id === selectedResultLaunchId) ??
        launchItems[0])
      : launchItems.find((item) => item.id === routeLaunchId);
  const launchResults = selectedLaunch ? getLaunchResults(results, selectedLaunch) : [];
  const filteredResults = useMemo(
    () =>
      resultPage === undefined ? filterResults(launchResults, query, statusFilter) : launchResults,
    [launchResults, query, resultPage, statusFilter]
  );
  const filteredLaunchItems = useMemo(
    () => filterLaunchItems(launchItems, launchQuery),
    [launchItems, launchQuery]
  );
  const resultListNavigationKey = JSON.stringify([
    selectedLaunch?.id,
    resultPageIndex,
    resultPageSize,
    query.trim(),
    statusFilter
  ]);
  const rememberedSelectionId = resultListSelectionsRef.current.get(resultListNavigationKey);
  const requestedSelectedResultId =
    routeResultId ??
    (rememberedSelectionId !== undefined &&
    launchResults.some((result) => result.id === rememberedSelectionId)
      ? rememberedSelectionId
      : effectiveSelectedResultId);
  const detailedSelectedResult =
    selectedResultDetail?.id === requestedSelectedResultId &&
    selectedResultDetail.launchId === selectedLaunch?.id
      ? selectedResultDetail
      : undefined;
  const selectedResult =
    detailedSelectedResult ??
    launchResults.find((result) => result.id === requestedSelectedResultId) ??
    (routeResultId === undefined
      ? (findMostUsefulLaunchResult(launchResults) ?? launchResults[0])
      : undefined);
  const isLaunchListLoading = launchListLoading || hasLoadingScope(loadingScope, "launch-list");
  const isLaunchDetailLoading =
    launchDetailLoading || hasLoadingScope(loadingScope, "launch-detail");
  const isResultLoading = resultLoading || hasLoadingScope(loadingScope, "result");
  const rememberCurrentResultListPosition = () => {
    const list = tabBodyRef.current?.querySelector<HTMLElement>(".launches-reference-result-table");
    if (list !== undefined && list !== null) {
      rememberResultListValue(
        resultListPositionsRef.current,
        resultListNavigationKey,
        list.scrollTop
      );
    }
  };

  useLayoutEffect(() => {
    const tabs = launchTabsRef.current;
    const active = tabs?.querySelector<HTMLElement>('button[aria-current="page"]');
    if (!tabs || !active) {
      return;
    }

    const tabsRect = tabs.getBoundingClientRect();
    const activeRect = active.getBoundingClientRect();
    if (activeRect.left < tabsRect.left) {
      tabs.scrollLeft += activeRect.left - tabsRect.left - 12;
    } else if (activeRect.right > tabsRect.right) {
      tabs.scrollLeft += activeRect.right - tabsRect.right + 12;
    }
  }, [activeTab, view]);

  useLayoutEffect(() => {
    if (activeTab !== "results" || view !== "detail") {
      return;
    }

    const list = tabBodyRef.current?.querySelector<HTMLElement>(".launches-reference-result-table");
    if (list === undefined || list === null) {
      return;
    }

    const savedPosition = resultListPositionsRef.current.get(resultListNavigationKey);
    if (savedPosition !== undefined) {
      list.scrollTop = savedPosition;
    } else if (routeResultId !== undefined) {
      const selectedRow = list.querySelector<HTMLElement>("button.selected");
      if (selectedRow !== null) {
        const listRect = list.getBoundingClientRect();
        const rowRect = selectedRow.getBoundingClientRect();
        list.scrollTop +=
          rowRect.top - listRect.top - (list.clientHeight - selectedRow.clientHeight) / 2;
      } else {
        list.scrollTop = 0;
      }
    } else {
      list.scrollTop = 0;
    }

    const rememberPosition = () => {
      if (list.querySelector(":scope > button") !== null) {
        rememberResultListValue(
          resultListPositionsRef.current,
          resultListNavigationKey,
          list.scrollTop
        );
      }
    };
    list.addEventListener("scroll", rememberPosition, { passive: true });
    return () => {
      list.removeEventListener("scroll", rememberPosition);
    };
  }, [activeTab, filteredResults.length, resultListNavigationKey, routeResultId, view]);
  useEffect(() => {
    if (routeResultId === undefined) {
      setActiveTab(parseLaunchTab(routeLaunchTab));
    }
  }, [routeLaunchTab, routeResultId]);

  useEffect(() => {
    if (routeQuery !== undefined) {
      setQuery(routeQuery);
      setStatusFilter(undefined);
      setActiveResultFilterId(undefined);
      setActiveTab("results");
    }
  }, [routeQuery]);

  useEffect(() => {
    if (resultQuery !== query) {
      onResultQueryChange?.(query);
    }
  }, [onResultQueryChange, query, resultQuery]);

  useEffect(() => {
    if (resultStatusFilter !== statusFilter) {
      onResultStatusFilterChange?.(statusFilter);
    }
  }, [onResultStatusFilterChange, resultStatusFilter, statusFilter]);

  const openResultReport = (id: string, tab: LaunchTab = "results") => {
    rememberCurrentResultListPosition();
    rememberResultListValue(resultListSelectionsRef.current, resultListNavigationKey, id);
    setLocalSelectedResultId(id);
    setActiveTab(tab);
    onSelectResult?.(id);
    onOpenResult?.(id);
  };

  const openResultsByStatus = (status: ResultStatus) => {
    const firstMatchingResult = launchResults.find((result) => matchesStatusFilter(result, status));
    setStatusFilter(status);
    setQuery("");
    setActiveTab("results");
    onOpenTab?.("results");

    if (firstMatchingResult !== undefined) {
      setLocalSelectedResultId(firstMatchingResult.id);
      onSelectResult?.(firstMatchingResult.id);
    }
  };

  const openResultsByTag = (tag: string) => {
    const tagQuery = `tag = ${JSON.stringify(tag)}`;
    const firstMatchingResult = launchResults.find((result) => result.tags.includes(tag));
    setQuery(tagQuery);
    setStatusFilter(undefined);
    setActiveResultFilterId(undefined);
    setActiveTab("results");
    onOpenTab?.("results");

    if (firstMatchingResult !== undefined) {
      setLocalSelectedResultId(firstMatchingResult.id);
      onSelectResult?.(firstMatchingResult.id);
    }
  };

  const openAllResults = () => {
    setStatusFilter(undefined);
    setQuery("");
    setActiveTab("results");
    onOpenTab?.("results");
  };

  const changeResultPageIndex = (index: number) => {
    rememberCurrentResultListPosition();
    onOpenTab?.("results");
    onResultPageIndexChange?.(index);
  };

  const changeResultQuery = (nextQuery: string) => {
    if (nextQuery === query) {
      return;
    }
    setQuery(nextQuery);
    if (routeResultId !== undefined) {
      onOpenTab?.("results");
    }
  };

  const changeResultStatusFilter = (status: ResultStatus | undefined) => {
    if (status === statusFilter) {
      return;
    }
    setStatusFilter(status);
    if (routeResultId !== undefined) {
      onOpenTab?.("results");
    }
  };

  const changeResultPageSize = (size: number) => {
    rememberCurrentResultListPosition();
    onOpenTab?.("results");
    onResultPageSizeChange?.(size);
  };

  const openLaunchDetail = (launchId: string) => {
    setSelectedLaunchId(launchId);
    setActiveTab("overview");
    setQuery("");
    setStatusFilter(undefined);
    setView("detail");
    onOpenLaunch?.(launchId);
  };

  const openLaunchList = () => {
    rememberCurrentResultListPosition();
    setView("list");
    onOpenLaunchList?.();
  };

  const actorId =
    typeof window === "undefined"
      ? "admin"
      : (window.localStorage.getItem("testhistory.actorId") ?? "admin");

  useEffect(() => {
    if (selectedResultId !== undefined) {
      setLocalSelectedResultId(selectedResultId);
    }
  }, [selectedResultId]);

  useEffect(() => {
    if (routeLaunchId !== undefined) {
      setSelectedLaunchId(routeLaunchId);
      setView("detail");
      return;
    }

    if (routeResultId === undefined) {
      setView("list");
    }
  }, [routeLaunchId, routeResultId]);

  useEffect(() => {
    if (routeResultId === undefined) {
      return;
    }

    if (selectedResultLaunchId !== undefined) {
      setSelectedLaunchId(selectedResultLaunchId);
    }
    setActiveTab((currentTab) => (currentTab === "errors" ? "errors" : "results"));
    setView("detail");
  }, [routeResultId, selectedResultLaunchId]);

  useEffect(() => {
    if (selectedResultLaunchId !== undefined) {
      setSelectedLaunchId(selectedResultLaunchId);
      return;
    }

    if (selectedLaunchId === "" || !launchItems.some((item) => item.id === selectedLaunchId)) {
      setSelectedLaunchId(launchItems[0]?.id ?? "");
    }
  }, [launchItems, selectedLaunchId, selectedResultLaunchId]);

  if (selectedLaunch === undefined && !isLaunchListLoading && !isLaunchDetailLoading) {
    return (
      <section className="launches-reference-page" aria-label="Запуски">
        <div className="launches-reference-state-empty">
          <strong>{routeLaunchId === undefined ? "Запуски не найдены" : "Запуск не найден"}</strong>
          <span>
            {routeLaunchId === undefined
              ? "Отчет появится после загрузки запусков."
              : "Проверьте ссылку или выберите другой запуск в списке."}
          </span>
        </div>
      </section>
    );
  }

  if (selectedLaunch === undefined) {
    return (
      <section className="launches-reference-page" aria-label="Запуски">
        <article className="launches-reference-frame">
          <ReferenceRouteState
            kind="loading"
            title="Загружаем запуск"
            text="Данные выбранного запуска еще подтягиваются. Уже загруженные разделы не считаются полным отчетом."
          />
        </article>
      </section>
    );
  }

  if (view === "list") {
    return (
      <LaunchListView
        activeFilterId={activeLaunchFilterId}
        actorId={actorId}
        launchItems={filteredLaunchItems}
        projectId={projectId}
        query={launchQuery}
        onActiveFilterChange={setActiveLaunchFilterId}
        onQueryChange={setLaunchQuery}
        onRefresh={onRefresh}
        onSelectLaunch={openLaunchDetail}
        partial={launchListPartial}
        loading={isLaunchListLoading}
        totalCount={launchItems.length}
      />
    );
  }

  const primaryTabs = launchTabs;

  return (
    <section className="launches-reference-page" aria-label="Запуски">
      <header className="launches-reference-crumbs">
        <nav className="launches-reference-crumbs-nav" aria-label="Путь к запуску">
          <a href="#launch" onClick={openLaunchList}>
            <span>Запуски</span>
          </a>
          <ChevronRight aria-hidden="true" size={16} />
          {activeTab === "overview" ? (
            <span
              className="launches-reference-crumbs-current launches-reference-crumbs-launch"
              aria-current="page"
              title={selectedLaunch.name}
            >
              {selectedLaunch.name}
            </span>
          ) : (
            <>
              <button
                className="launches-reference-crumbs-launch-link"
                type="button"
                title={`Обзор запуска: ${selectedLaunch.name}`}
                onClick={() => {
                  rememberCurrentResultListPosition();
                  setActiveTab("overview");
                  onOpenTab?.("overview");
                }}
              >
                {selectedLaunch.name}
              </button>
              <ChevronRight aria-hidden="true" size={16} />
              <span className="launches-reference-crumbs-current" aria-current="page">
                {launchTabs.find((tab) => tab.id === activeTab)?.label}
              </span>
            </>
          )}
        </nav>

        <div className="launches-reference-heading-row">
          <div className="launches-reference-heading">
            <h1 title={selectedLaunch.name}>{selectedLaunch.name}</h1>
            <div className="launches-reference-heading-meta">
              <span className={`launches-reference-state state-${selectedLaunch.state}`}>
                {launchStateLabels[selectedLaunch.state] ?? selectedLaunch.state}
              </span>
              <span className="launches-reference-heading-id" title={selectedLaunch.id}>
                ID {selectedLaunch.id.slice(0, 8)}
              </span>
            </div>
          </div>

          <div className="launches-reference-status-tools">
            {onRefresh !== undefined ? (
              <button
                className="launches-reference-secondary-action"
                type="button"
                title="Обновить данные запуска после внешней загрузки или закрытия"
                onClick={onRefresh}
              >
                <RefreshCw aria-hidden="true" focusable="false" size={15} strokeWidth={2.2} />
                <span>Обновить</span>
              </button>
            ) : null}
            {onDeleteLaunch !== undefined ? (
              <button
                className="launches-reference-danger-action"
                type="button"
                title="Удалить запуск вместе со всеми результатами и вложениями"
                onClick={() => onDeleteLaunch(selectedLaunch.id)}
              >
                <Trash2 aria-hidden="true" focusable="false" size={15} strokeWidth={2.2} />
                <span>Удалить</span>
              </button>
            ) : null}
          </div>
        </div>
      </header>

      <article className="launches-reference-frame">
        <div className="launches-reference-section-bar">
          <nav
            className="launches-reference-tabs launches-reference-tabs--top"
            aria-label="Разделы запуска"
            ref={launchTabsRef}
          >
            {primaryTabs.map((tab) => {
              const active = activeTab === tab.id;

              return (
                <button
                  aria-current={active ? "page" : undefined}
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    if (activeTab === "results") {
                      rememberCurrentResultListPosition();
                    }
                    setActiveTab(tab.id);
                    onOpenTab?.(tab.id);
                  }}
                >
                  {tab.label}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="launches-reference-tab-body" ref={tabBodyRef}>
          {isLaunchDetailLoading && launchResults.length === 0 ? (
            <ReferenceRouteState
              compact
              kind="loading"
              title="Загружаем детали запуска"
              text="Панели показывают уже доступные данные и не считаются полным отчетом."
            />
          ) : null}
          {activeTab === "overview" ? (
            <OverviewTab
              launch={selectedLaunch}
              results={launchResults}
              onSelectAll={openAllResults}
              onSelectResult={(id) => openResultReport(id)}
              onSelectStatus={openResultsByStatus}
            />
          ) : null}
          {activeTab === "results" ? (
            <ResultsTab
              integrationProviders={integrationProviders}
              activeFilterId={activeResultFilterId}
              activeStatusFilter={statusFilter}
              actorId={actorId}
              projectId={projectId}
              filteredResults={filteredResults}
              launchCounters={selectedLaunch.counters}
              loading={isResultLoading || isLaunchDetailLoading}
              onActiveFilterChange={setActiveResultFilterId}
              onClearStatusFilter={() => changeResultStatusFilter(undefined)}
              onQueryChange={changeResultQuery}
              onResultPageIndexChange={changeResultPageIndex}
              onResultPageSizeChange={changeResultPageSize}
              onFilterByTag={openResultsByTag}
              onSelectResult={(id) => openResultReport(id)}
              onStatusFilterChange={changeResultStatusFilter}
              query={query}
              resultPage={resultPage}
              resultPageIndex={resultPageIndex}
              resultPageSize={resultPageSize}
              requestedResultId={routeResultId}
              results={launchResults}
              routeResultTab={routeResultTab}
              selectedResult={selectedResult}
              onOpenResultTab={onOpenResultTab}
              onToggleMuteResult={onToggleMuteResult}
              onUnlinkResultDefect={onUnlinkResultDefect}
            />
          ) : null}
          {activeTab === "errors" ? (
            <ErrorsTab
              integrationProviders={integrationProviders}
              loading={isResultLoading || isLaunchDetailLoading}
              results={launchResults}
              routeResultTab={routeResultTab}
              selectedResult={selectedResult}
              onOpenResultTab={onOpenResultTab}
              onFilterByTag={openResultsByTag}
              onSelectResult={(id) => openResultReport(id, "errors")}
              onToggleMuteResult={onToggleMuteResult}
              onUnlinkResultDefect={onUnlinkResultDefect}
            />
          ) : null}
          {activeTab === "charts" ? <ChartsTab results={launchResults} /> : null}
          {activeTab === "comparison" ? (
            <LaunchComparisonScreen
              initialSession={comparisonSessions[selectedLaunch.id]}
              launch={selectedLaunch}
              launchItems={launchItems}
              onSelectResult={(id) => openResultReport(id)}
              onSessionChange={(session) =>
                setComparisonSessions((current) => ({
                  ...current,
                  [selectedLaunch.id]: session
                }))
              }
            />
          ) : null}
        </div>
      </article>
    </section>
  );
}

function LaunchListView({
  activeFilterId,
  actorId,
  launchItems,
  loading,
  onActiveFilterChange,
  onQueryChange,
  onRefresh,
  onSelectLaunch,
  partial,
  projectId,
  query,
  totalCount
}: {
  activeFilterId?: string | undefined;
  actorId: string;
  launchItems: LaunchListItem[];
  loading: boolean;
  onActiveFilterChange: (id: string | undefined) => void;
  onQueryChange: (query: string) => void;
  onRefresh?: (() => void) | undefined;
  onSelectLaunch: (launchId: string) => void;
  partial?: LaunchesReferencePartialState | undefined;
  projectId: string;
  query: string;
  totalCount: number;
}) {
  const visibleLaunchItems = launchItems.slice(0, 50);
  const partialMessage = getPartialStateMessage(
    partial,
    "Показана загруженная часть списка запусков. Полный объем еще не подтвержден."
  );

  return (
    <section className="launches-reference-page launches-reference-list-page" aria-label="Запуски">
      <article className="launches-reference-list-frame">
        <header className="launches-reference-list-head">
          <h1>
            <span>Запуски</span>
            <span
              className="launches-reference-list-count"
              title={partialMessage === undefined ? "Всего запусков" : "Загружено запусков"}
            >
              {totalCount.toLocaleString("ru-RU")}
            </span>
          </h1>
          <div className="launches-reference-list-actions">
            {onRefresh !== undefined ? (
              <button
                type="button"
                title="Обновить список запусков после внешней загрузки"
                onClick={onRefresh}
              >
                <RefreshCw aria-hidden="true" focusable="false" size={18} strokeWidth={2.2} />
                Обновить
              </button>
            ) : null}
          </div>
        </header>

        <ThqlSearchPanel
          activeFilterId={activeFilterId}
          actorId={actorId}
          entity="launches"
          projectId={projectId}
          query={query}
          onActiveFilterChange={onActiveFilterChange}
          onQueryChange={onQueryChange}
        />

        <div className="launches-reference-list">
          {loading ? (
            <ReferenceRouteState
              compact
              kind="loading"
              title="Загружаем список запусков"
              text="Показываем уже доступные строки, без предположения о полном количестве запусков."
            />
          ) : null}
          {partialMessage !== undefined ? (
            <ReferenceRouteState
              compact
              kind="partial"
              title="Список загружен частично"
              text={partialMessage}
            />
          ) : null}

          {visibleLaunchItems.map((launch) => {
            const metadata = parseLaunchMetadata(launch);
            const metadataItems = metadata.tags.filter(
              (value) => value.toLocaleLowerCase() !== metadata.branch.toLocaleLowerCase()
            );
            const compactId =
              launch.id.length > 12 ? `${launch.id.slice(0, 8)}…` : formatLaunchId(launch.id);
            const total = getLaunchTotal(launch);

            return (
              <button
                className="launches-reference-list-row"
                key={launch.id}
                type="button"
                onClick={() => onSelectLaunch(launch.id)}
              >
                <span className="launches-reference-list-main">
                  <strong>
                    <span>{launch.name}</span>
                    <em className={`state-${launch.state}`}>
                      {launchStateLabels[launch.state] ?? launch.state}
                    </em>
                  </strong>
                  <small className="launches-reference-list-id" title={launch.id}>
                    ID {compactId}
                  </small>
                </span>

                <LaunchProgressBar counters={launch.counters} total={total} />

                <span className="launches-reference-list-meta">
                  <span>
                    <small>Метаданные</small>
                    <span className="launches-reference-list-tags">
                      {metadataItems.map((tag) => (
                        <em key={tag}>{tag}</em>
                      ))}
                      {metadataItems.length === 0 ? <em>Нет дополнительных данных</em> : null}
                    </span>
                  </span>
                  <span>
                    <small>Ветка</small>
                    <em>{metadata.branch}</em>
                  </span>
                </span>
              </button>
            );
          })}

          {launchItems.length > visibleLaunchItems.length ? (
            <div className="launches-reference-list-window-note">
              Показаны первые {visibleLaunchItems.length.toLocaleString("ru-RU")} из{" "}
              {launchItems.length.toLocaleString("ru-RU")} запусков. Используйте поиск для уточнения
              списка.
            </div>
          ) : null}

          {launchItems.length === 0 && !loading ? (
            <div className="launches-reference-state-empty">
              <strong>Запуски не найдены</strong>
              <span>Очистите поиск или дождитесь новых результатов.</span>
            </div>
          ) : null}
        </div>
      </article>
    </section>
  );
}
