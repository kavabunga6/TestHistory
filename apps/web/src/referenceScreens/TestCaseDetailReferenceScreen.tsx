import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  CircleDashed,
  FileText,
  PauseCircle,
  Paperclip,
  Trash2,
  XCircle
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";

import {
  AttachmentDownloadButton,
  AttachmentPreview,
  AttachmentViewerButton
} from "../AttachmentViewer.js";
import type {
  ResultAttachment,
  ResultStatus,
  ResultTrace,
  ScenarioStep,
  TestResult
} from "../m1Workspace.js";
import type { IntegrationLinkProvider } from "../projectSettingsTypes.js";
import {
  collapseHistoryToFinalRunResults,
  getCurrentRunAttempts,
  getCurrentRunRetryCount
} from "../resultHistory.js";
import { collectTerminalFailurePaths, shouldExpandScenarioStep } from "../scenarioStepTree.js";
import { isLikelyThqlQuery } from "../thqlQueryDetection.js";
import { formatResultDuration } from "./LaunchesResultDuration.js";
import {
  collectAttachments,
  filterResults,
  findMostInformativeResult,
  formatHistoryDate,
  formatHistoryRailLabel,
  formatStatus,
  getTestCaseState,
  isResultQuarantined,
  uniqueStrings
} from "./TestCaseDetailReferenceUtils.js";
import { ResultIdCopy } from "./ResultIdCopy.js";
import { TestCaseMetadataSections } from "./TestCaseMetadataSections.js";
import { TestCaseDefectsTab, TestCaseQuarantineTab } from "./TestCaseDetailRelationsTabs.js";
import {
  ReferenceListPagination,
  referenceListPageSize,
  useReferenceListPagination,
  type ReferenceListPage
} from "./ReferenceListPagination.js";
import { ThqlSearchPanel } from "./ThqlSearchPanel.js";
import { useResizableListWidth } from "./useResizableListWidth.js";

import "./TestCaseDetailReferenceScreen.css";

type DetailTab = "overview" | "history" | "retries" | "attachments" | "quarantine" | "defects";
type OpenTestResult = (resultId: string, launchId?: string, testCaseId?: string) => void;

const detailTabs: Array<{ key: DetailTab; label: string; count?: (result: TestResult) => number }> =
  [
    { key: "overview", label: "Обзор" },
    {
      key: "history",
      label: "История результатов",
      count: (result) =>
        collapseHistoryToFinalRunResults(result.historyPoints ?? []).length || result.history.length
    },
    { key: "retries", label: "Перезапуски", count: getCurrentRunRetryCount },
    { key: "attachments", label: "Вложения", count: (result) => collectAttachments(result).length },
    {
      key: "defects",
      label: "Дефекты",
      count: (result) =>
        uniqueStrings([result.defect ?? "", ...result.issues]).length +
        (result.defectHistory?.length ?? 0)
    },
    {
      key: "quarantine",
      label: "Карантин",
      count: (result) => (isResultQuarantined(result) ? 1 : 0)
    }
  ];
const TEST_CASE_LIST_WIDTH_KEY = "testhistory:test-case-list-width";
const TEST_CASE_LIST_DEFAULT_WIDTH = 340;
const TEST_CASE_LIST_MIN_WIDTH = 320;
const TEST_CASE_LIST_MAX_WIDTH = 720;

function parseDetailTab(value: string | undefined): DetailTab {
  return detailTabs.some((tab) => tab.key === value) ? (value as DetailTab) : "overview";
}

export function TestCaseDetailReferenceScreen({
  integrationProviders = [],
  onPageIndexChange,
  onPageSizeChange,
  onDeleteTestCase,
  onOpenResult,
  onOpenLaunchResultsByTag,
  onOpenTab,
  onSelect,
  onToggleMuteResult,
  page: serverPage,
  pageIndex: serverPageIndex,
  pageSize: serverPageSize,
  projectId = "ws",
  query: controlledQuery,
  onQueryChange,
  results,
  routeTab,
  selectedDetail,
  selectedId
}: {
  integrationProviders?: IntegrationLinkProvider[] | undefined;
  onPageIndexChange?: ((index: number) => void) | undefined;
  onPageSizeChange?: ((size: number) => void) | undefined;
  onDeleteTestCase?: ((id: string) => void) | undefined;
  onOpenResult?: OpenTestResult | undefined;
  onOpenLaunchResultsByTag?: ((tag: string, resultId: string) => void) | undefined;
  onOpenTab?: ((tab: string) => void) | undefined;
  onSelect?: ((id: string) => void) | undefined;
  onToggleMuteResult?: ((id: string) => void) | undefined;
  onUnlinkResultDefect?: ((resultId: string, defectId: string) => void) | undefined;
  page?: ReferenceListPage | undefined;
  pageIndex?: number | undefined;
  pageSize?: number | undefined;
  projectId?: string | undefined;
  query?: string | undefined;
  onQueryChange?: ((query: string) => void) | undefined;
  results: TestResult[];
  routeTab?: string | undefined;
  selectedDetail?: TestResult | undefined;
  selectedId?: string;
}) {
  const [localQuery, setLocalQuery] = useState("");
  const query = controlledQuery ?? localQuery;
  const setQuery = onQueryChange ?? setLocalQuery;
  const [activeFilterId, setActiveFilterId] = useState<string | undefined>();
  const { listWidth, onSeparatorKeyDown, onSeparatorPointerDown, resizing, screenRef } =
    useResizableListWidth({
      bodyClass: "tc-detail-reference-is-resizing",
      defaultWidth: TEST_CASE_LIST_DEFAULT_WIDTH,
      maxWidth: TEST_CASE_LIST_MAX_WIDTH,
      minWidth: TEST_CASE_LIST_MIN_WIDTH,
      storageKey: TEST_CASE_LIST_WIDTH_KEY
    });

  const searchOnCurrentPage =
    serverPage !== undefined && (onQueryChange === undefined || isLikelyThqlQuery(query));
  const filteredResults = useMemo(
    () =>
      serverPage !== undefined && !searchOnCurrentPage ? results : filterResults(results, query),
    [query, results, searchOnCurrentPage, serverPage]
  );
  const localPagination = useReferenceListPagination({
    context: JSON.stringify([selectedId, query, projectId]),
    count: filteredResults.length,
    selectedIndex: filteredResults.findIndex((result) => result.id === selectedId)
  });
  const page = serverPage
    ? (serverPageIndex ?? Math.floor(serverPage.offset / serverPage.limit))
    : localPagination.page;
  const pageSize = serverPage
    ? referenceListPageSize(serverPageSize ?? serverPage.limit)
    : localPagination.pageSize;
  const visibleResults = serverPage
    ? filteredResults
    : filteredResults.slice(page * pageSize, (page + 1) * pageSize);
  const total = serverPage?.total ?? filteredResults.length;
  const hasRequestedResult = selectedId !== undefined && selectedId.trim().length > 0;
  const selectedResult =
    filteredResults.find((result) => result.id === selectedId) ??
    (selectedDetail !== undefined && selectedDetail.id === selectedId
      ? selectedDetail
      : undefined) ??
    results.find((result) => result.id === selectedId) ??
    (hasRequestedResult
      ? undefined
      : (findMostInformativeResult(filteredResults) ?? findMostInformativeResult(results)));

  useEffect(() => {
    if (!hasRequestedResult && selectedResult !== undefined) {
      onSelect?.(selectedResult.id);
    }
  }, [hasRequestedResult, onSelect, selectedResult?.id]);
  const screenStyle = {
    "--tc-detail-reference-list-width": `${listWidth}px`
  } as CSSProperties;
  const actorId =
    typeof window === "undefined"
      ? "admin"
      : (window.localStorage.getItem("testhistory.actorId") ?? "admin");

  return (
    <section
      ref={screenRef}
      className={`tc-detail-reference-screen ${resizing ? "is-resizing" : ""}`}
      style={screenStyle}
      aria-label="Тест-кейсы"
    >
      <aside className="tc-detail-reference-list-panel" aria-label="Список тест-кейсов">
        <header className="tc-detail-reference-list-header">
          <h1>
            <span>Тест-кейсы</span>
            <span
              className="tc-detail-reference-count-badge"
              title={
                serverPage
                  ? `${searchOnCurrentPage ? "Всего" : "Найдено"} тест-кейсов в проекте: ${total.toLocaleString("ru-RU")}`
                  : `Найдено ${total.toLocaleString("ru-RU")} из ${results.length.toLocaleString("ru-RU")}`
              }
              aria-hidden="true"
            >
              {total.toLocaleString("ru-RU")}
            </span>
            <span className="tc-detail-reference-sr-only">
              {serverPage
                ? `${searchOnCurrentPage ? "Всего" : "Найдено"} ${total.toLocaleString("ru-RU")} тест-кейсов в проекте`
                : `Найдено ${total.toLocaleString("ru-RU")} из ${results.length.toLocaleString("ru-RU")} тест-кейсов`}
            </span>
          </h1>
        </header>

        <div className="tc-detail-reference-filter-panel">
          <ThqlSearchPanel
            activeFilterId={activeFilterId}
            actorId={actorId}
            entity="testCases"
            projectId={projectId}
            query={query}
            onActiveFilterChange={setActiveFilterId}
            onQueryChange={setQuery}
          />
          {serverPage ? (
            <p className="tc-detail-reference-page-search-note">
              {searchOnCurrentPage ? "THQL-фильтр на текущей странице" : "Поиск по всему проекту"}
              {searchOnCurrentPage && query.trim()
                ? ` · найдено ${filteredResults.length} из ${results.length}`
                : ""}
            </p>
          ) : null}
        </div>

        {selectedDetail !== undefined &&
        selectedDetail.id === selectedId &&
        !results.some((result) => result.id === selectedId) ? (
          <div className="tc-detail-reference-pinned" role="status">
            <small>Выбранный кейс вне текущей страницы</small>
            <strong>{selectedDetail.name}</strong>
          </div>
        ) : null}

        <div className="tc-detail-reference-list">
          {visibleResults.map((result) => (
            <article
              className={`tc-detail-reference-row ${selectedResult?.id === result.id ? "selected" : ""} ${
                result.deletedAt !== undefined ? "deleted" : ""
              }`}
              key={result.id}
            >
              <button
                className="tc-detail-reference-row-main"
                type="button"
                aria-pressed={selectedResult?.id === result.id}
                onClick={() => onSelect?.(result.id)}
              >
                <span
                  className={`tc-detail-reference-quarantine-icon ${
                    result.muted || result.defectMute !== undefined ? "active" : ""
                  }`}
                  title={
                    result.muted || result.defectMute !== undefined
                      ? "Результат в карантине"
                      : undefined
                  }
                  aria-hidden={result.muted || result.defectMute !== undefined ? undefined : true}
                >
                  {result.muted || result.defectMute !== undefined ? (
                    <PauseCircle aria-hidden="true" size={15} />
                  ) : null}
                </span>
                <span className="tc-detail-reference-row-copy">
                  <strong>{result.name}</strong>
                  <small>
                    {result.owner || "Владелец не назначен"}
                    {result.deletedAt !== undefined ? " · удалён" : ""}
                  </small>
                </span>
              </button>
            </article>
          ))}

          {filteredResults.length === 0 ? (
            <div className="tc-detail-reference-empty">
              <strong>Нет тест-кейсов</strong>
              <span>
                {searchOnCurrentPage && query.trim()
                  ? "На этой странице совпадений нет. Перейдите на другую страницу или измените поиск."
                  : "Измените фильтр или строку поиска."}
              </span>
            </div>
          ) : null}
        </div>
        <ReferenceListPagination
          count={total}
          label="Тест-кейсы"
          offset={serverPage?.offset}
          returned={serverPage?.returned}
          onPageChange={onPageIndexChange ?? localPagination.setPage}
          onPageSizeChange={onPageSizeChange ?? localPagination.setPageSize}
          page={page}
          pageSize={pageSize}
        />
      </aside>

      <button
        className="tc-detail-reference-splitter"
        type="button"
        aria-label="Изменить ширину списка тест-кейсов"
        aria-valuemax={TEST_CASE_LIST_MAX_WIDTH}
        aria-valuemin={TEST_CASE_LIST_MIN_WIDTH}
        aria-valuenow={listWidth}
        role="separator"
        title="Потяните, чтобы изменить ширину списка"
        onKeyDown={onSeparatorKeyDown}
        onPointerDown={onSeparatorPointerDown}
      />

      {selectedResult === undefined ? (
        <section className="tc-detail-reference-details empty" aria-label="Детали тест-кейса">
          <div className="tc-detail-reference-empty">
            <strong>Выберите тест-кейс</strong>
            <span>Детали появятся справа от списка.</span>
          </div>
        </section>
      ) : (
        <TestCaseDetails
          integrationProviders={integrationProviders}
          result={selectedResult}
          routeTab={routeTab}
          onDeleteTestCase={onDeleteTestCase}
          onOpenResult={onOpenResult}
          onOpenTab={onOpenTab}
          onFilterByTag={(tag) =>
            onOpenLaunchResultsByTag !== undefined
              ? onOpenLaunchResultsByTag(tag, selectedResult.id)
              : setQuery(`tag = ${JSON.stringify(tag)}`)
          }
          onToggleMuteResult={onToggleMuteResult}
        />
      )}
    </section>
  );
}

function TestCaseDetails({
  integrationProviders,
  onDeleteTestCase,
  onFilterByTag,
  onOpenResult,
  onOpenTab,
  onToggleMuteResult,
  routeTab,
  result
}: {
  integrationProviders: IntegrationLinkProvider[];
  onDeleteTestCase?: ((id: string) => void) | undefined;
  onFilterByTag: (tag: string) => void;
  onOpenResult: OpenTestResult | undefined;
  onOpenTab?: ((tab: string) => void) | undefined;
  onToggleMuteResult?: ((id: string) => void) | undefined;
  routeTab?: string | undefined;
  result: TestResult;
}) {
  const [activeTab, setActiveTab] = useState<DetailTab>(parseDetailTab(routeTab));
  const isQuarantined = isResultQuarantined(result);
  const latestAvailablePoint = collapseHistoryToFinalRunResults(result.historyPoints ?? [])
    .filter((point) => point.launchId.trim() !== "" && point.resultUuid.trim() !== "")
    .sort((left, right) => Date.parse(right.startedAt) - Date.parse(left.startedAt))[0];
  const caseState = getTestCaseState(result);

  useEffect(() => {
    setActiveTab(parseDetailTab(routeTab));
  }, [result.id, routeTab]);
  useEffect(() => {
    if (activeTab === "quarantine" && !isQuarantined) {
      setActiveTab("overview");
      onOpenTab?.("overview");
    }
  }, [activeTab, isQuarantined, onOpenTab]);

  return (
    <section className="tc-detail-reference-details" aria-label="Детали выбранного тест-кейса">
      <header className="tc-detail-reference-detail-header">
        <div className="tc-detail-reference-title-row">
          <div className="tc-detail-reference-identifiers">
            {result.allureId && result.allureId !== result.id ? (
              <span className="tc-detail-reference-id" title={result.allureId}>
                Allure ID: {result.allureId}
              </span>
            ) : null}
            <ResultIdCopy label="ID тест-кейса" resultId={result.id} />
          </div>
          {onToggleMuteResult !== undefined ||
          (onDeleteTestCase !== undefined && result.deletedAt === undefined) ? (
            <div className="tc-detail-reference-actions">
              {onToggleMuteResult !== undefined ? (
                <button
                  className="tc-detail-reference-action"
                  type="button"
                  title={
                    isQuarantined
                      ? "Вернуть результат из карантина в аналитику"
                      : "Перенести результат в карантин и исключить из аналитики"
                  }
                  onClick={() => onToggleMuteResult(result.id)}
                >
                  <PauseCircle size={15} />
                  <span>{isQuarantined ? "Вернуть" : "В карантин"}</span>
                </button>
              ) : null}
              {onDeleteTestCase !== undefined && result.deletedAt === undefined ? (
                <button
                  className="tc-detail-reference-action danger"
                  type="button"
                  title="Пометить тест-кейс удаленным"
                  onClick={() => onDeleteTestCase(result.id)}
                >
                  <Trash2 aria-hidden="true" focusable="false" size={15} strokeWidth={2.2} />
                  Удалить
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
        {result.suite ? <p>{result.suite}</p> : null}
        <div className="tc-detail-reference-heading-line">
          <h2>{result.name}</h2>
          <div className="tc-detail-reference-badges">
            <span className={caseState.className}>Состояние кейса: {caseState.label}</span>
            <span className={`result-status-${result.status}`}>
              Последний результат: {formatStatus(result.status)}
            </span>
            {isQuarantined ? <span className="muted">Карантин</span> : null}
          </div>
        </div>
        <div className="tc-detail-reference-highlights" aria-label="Основные данные тест-кейса">
          {result.duration && result.duration !== "n/a" ? (
            <span>
              Длительность: <strong>{formatResultDuration(result.duration)}</strong>
            </span>
          ) : null}
          <span>
            Слой: <strong>{result.layer}</strong>
          </span>
          {result.owner && result.owner !== "Unassigned" ? (
            <span>
              Владелец: <strong>{result.owner}</strong>
            </span>
          ) : null}
        </div>
        {latestAvailablePoint !== undefined && onOpenResult !== undefined ? (
          <button
            className="tc-detail-reference-open-latest"
            type="button"
            title={`Открыть результат из загруженной истории: ${latestAvailablePoint.launchName}`}
            onClick={() => openHistoryPoint(latestAvailablePoint, onOpenResult, result.id)}
          >
            Открыть результат из истории «{latestAvailablePoint.launchName}»
            <ChevronRight aria-hidden="true" size={15} />
          </button>
        ) : null}
        <details className="tc-detail-reference-quick-fields">
          <summary>
            Поля и связи <ChevronDown aria-hidden="true" size={15} />
          </summary>
          <div className="tc-detail-reference-quick-fields-grid">
            <TestCaseMetadataSections
              compact
              integrationProviders={integrationProviders}
              onFilterByTag={onFilterByTag}
              result={result}
            />
          </div>
        </details>
      </header>

      <nav className="tc-detail-reference-tabs" aria-label="Вкладки тест-кейса">
        {detailTabs.map((tab) => {
          const count = tab.count?.(result);
          const disabled = tab.key === "quarantine" && !isQuarantined;

          return (
            <button
              className={activeTab === tab.key && !disabled ? "active" : ""}
              disabled={disabled}
              title={disabled ? "Тест не находится в карантине" : undefined}
              key={tab.key}
              type="button"
              aria-current={activeTab === tab.key && !disabled ? "page" : undefined}
              onClick={() => {
                if (!disabled) {
                  setActiveTab(tab.key);
                  onOpenTab?.(tab.key);
                }
              }}
            >
              {tab.label}
              {count !== undefined && count > 0 ? (
                <span className="typography-role-meta">{count.toLocaleString("ru-RU")}</span>
              ) : null}
            </button>
          );
        })}
      </nav>

      {activeTab === "overview" ? (
        <OverviewTab
          integrationProviders={integrationProviders}
          result={result}
          onFilterByTag={onFilterByTag}
          onOpenResult={onOpenResult}
        />
      ) : null}
      {activeTab === "history" ? <HistoryTab result={result} onOpenResult={onOpenResult} /> : null}
      {activeTab === "retries" ? <RetriesTab result={result} /> : null}
      {activeTab === "attachments" ? <AttachmentsTab result={result} /> : null}
      {activeTab === "quarantine" ? <TestCaseQuarantineTab result={result} /> : null}
      {activeTab === "defects" ? (
        <TestCaseDefectsTab integrationProviders={integrationProviders} result={result} />
      ) : null}
    </section>
  );
}

function OverviewTab({
  integrationProviders,
  onFilterByTag,
  onOpenResult,
  result
}: {
  integrationProviders: IntegrationLinkProvider[];
  onFilterByTag: (tag: string) => void;
  onOpenResult: OpenTestResult | undefined;
  result: TestResult;
}) {
  const hasHistory = collapseHistoryToFinalRunResults(result.historyPoints ?? []).length > 0;
  const terminalFailurePaths = collectTerminalFailurePaths(result.steps);
  const fallbackPath =
    (result.status === "failed" || result.status === "broken") && terminalFailurePaths.length === 1
      ? terminalFailurePaths[0]
      : undefined;

  return (
    <div className="tc-detail-reference-overview">
      <div className="tc-detail-reference-overview-main">
        <section>
          <h3>Описание</h3>
          <p className={!result.description ? "muted" : undefined}>
            {result.description?.trim() || "Нет описания"}
          </p>
        </section>

        <ParametersSection result={result} />

        <section>
          <h3>Сценарий из тестового результата</h3>
          {result.steps.length === 0 ? (
            <p className="muted">Шаги не переданы в результате.</p>
          ) : (
            <div className="tc-detail-reference-steps" role="tree">
              {result.steps.map((step, index) => (
                <StepTreeItem
                  fallbackPath={fallbackPath}
                  fallbackTrace={result.trace}
                  index={index}
                  key={`${result.id}-${step.name}-${index}`}
                  path={`${index + 1}`}
                  step={step}
                />
              ))}
            </div>
          )}
        </section>
      </div>

      <aside className="tc-detail-reference-side-rail" aria-label="Свойства тест-кейса">
        <section
          className={`tc-detail-reference-rail-card tc-detail-reference-history-card ${hasHistory ? "" : "is-empty"}`}
        >
          <h3>История результатов</h3>
          <HistoryRail result={result} onOpenResult={onOpenResult} />
        </section>

        <section className="tc-detail-reference-rail-card tc-detail-reference-duration-card">
          <h3>Длительность</h3>
          <strong>{formatResultDuration(result.duration)}</strong>
        </section>

        <TestCaseMetadataSections
          integrationProviders={integrationProviders}
          onFilterByTag={onFilterByTag}
          result={result}
        />
      </aside>
    </div>
  );
}

function HistoryRail({
  onOpenResult,
  result
}: {
  onOpenResult: OpenTestResult | undefined;
  result: TestResult;
}) {
  const points = collapseHistoryToFinalRunResults(
    result.historyPoints !== undefined && result.historyPoints.length > 0
      ? result.historyPoints
      : []
  ).slice(0, 7);

  if (points.length === 0) {
    return null;
  }

  return (
    <div className="tc-detail-reference-history">
      {points.map((point, index) => {
        const navigable = isHistoryPointNavigable(point, onOpenResult);

        return (
          <button
            className={`tc-detail-reference-history-item ${point.status}`}
            disabled={!navigable}
            key={`${point.resultUuid}-${index}`}
            type="button"
            aria-label={`Открыть результат ${point.launchName}: ${formatStatus(point.status)}`}
            title={
              navigable
                ? `Открыть результат ${point.launchName}`
                : "Для этой записи нет ссылки на конкретный результат запуска"
            }
            onClick={() => openHistoryPoint(point, onOpenResult, result.id)}
          >
            <strong>{point.launchName}</strong>
            <time>{formatHistoryRailLabel(point)}</time>
          </button>
        );
      })}
    </div>
  );
}

function HistoryTab({
  onOpenResult,
  result
}: {
  onOpenResult: OpenTestResult | undefined;
  result: TestResult;
}) {
  const historyPoints = collapseHistoryToFinalRunResults(
    result.historyPoints !== undefined && result.historyPoints.length > 0
      ? result.historyPoints
      : []
  );

  return (
    <div className="tc-detail-reference-tab-panel">
      <section>
        <h3>История результатов</h3>
        <p className="tc-detail-reference-history-note">
          Здесь показан один итоговый результат тест-кейса для каждого запуска.
        </p>
        {historyPoints.length === 0 ? (
          <p className="muted">История запусков не передана для этого тест-кейса.</p>
        ) : (
          <div className="tc-detail-reference-history-table">
            {historyPoints.map((point, index) => {
              const navigable = isHistoryPointNavigable(point, onOpenResult);

              return (
                <button
                  key={`${point.resultUuid}-${index}`}
                  disabled={!navigable}
                  type="button"
                  title={
                    navigable
                      ? `Открыть результат ${point.launchName}`
                      : "Для этой записи нет ссылки на конкретный результат запуска"
                  }
                  onClick={() => openHistoryPoint(point, onOpenResult, result.id)}
                >
                  <span className={`tc-detail-reference-status-mark ${point.status}`}>
                    <StatusIcon status={point.status} />
                  </span>
                  <span className="tc-detail-reference-history-copy">
                    <strong>{point.launchName}</strong>
                    <small>
                      {formatStatus(point.status)}
                      {point.startedAt ? ` · ${formatHistoryDate(point.startedAt)}` : ""}
                      {point.flaky ? " · нестабилен" : ""}
                    </small>
                  </span>
                  <em>{formatResultDuration(point.duration)}</em>
                </button>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function RetriesTab({ result }: { result: TestResult }) {
  return (
    <div className="tc-detail-reference-tab-panel">
      <section>
        <h3>Перезапуски</h3>
        <p className="tc-detail-reference-history-note">
          Попытки относятся только к текущему запуску. Итоговой считается последняя попытка.
        </p>
        <RetryAttemptsSection result={result} />
      </section>
    </div>
  );
}

function RetryAttemptsSection({ result }: { result: TestResult }) {
  const attempts = getCurrentRunAttempts(result);

  if (attempts.length <= 1) {
    return <p className="muted">В текущем запуске перезапусков не было.</p>;
  }

  return (
    <div className="tc-detail-reference-attempts" aria-label="Попытки текущего запуска">
      <h4>Попытки текущего запуска</h4>
      <div className="tc-detail-reference-attempt-list">
        {attempts.map((attempt) => (
          <article className={attempt.final ? "is-final" : ""} key={attempt.attempt}>
            <span className={`tc-detail-reference-status-mark ${attempt.status}`}>
              <StatusIcon status={attempt.status} />
            </span>
            <div>
              <strong>
                Попытка {attempt.attempt}
                {attempt.final ? " · итоговый результат" : ""}
              </strong>
              <small>
                {formatStatus(attempt.status)}
                {attempt.startedAt ? ` · ${formatHistoryDate(attempt.startedAt)}` : ""}
                {attempt.message ? ` · ${attempt.message}` : ""}
              </small>
            </div>
            <em>{formatResultDuration(attempt.duration)}</em>
          </article>
        ))}
      </div>
    </div>
  );
}

function ParametersSection({ result }: { result: TestResult }) {
  const parameters = result.parameters ?? [];

  if (parameters.length === 0) {
    return null;
  }

  return (
    <section>
      <h3>Параметры</h3>
      <dl className="tc-detail-reference-parameter-list">
        {parameters.map((parameter) => (
          <div key={`${parameter.name}-${parameter.value}`}>
            <dt>
              {parameter.name}
              {parameter.excluded ? <em>исключен</em> : null}
            </dt>
            <dd className={parameter.masked ? "masked" : undefined}>
              {parameter.masked ? "значение скрыто" : parameter.value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function AttachmentsTab({ result }: { result: TestResult }) {
  const attachments = collectAttachments(result);

  return (
    <div className="tc-detail-reference-tab-panel">
      <section>
        <h3>Вложения</h3>
        {attachments.length === 0 ? (
          <p className="muted">Вложения не переданы в результате.</p>
        ) : (
          <div className="tc-detail-reference-attachments">
            {attachments.map(({ attachment, ownerPath }) => (
              <AttachmentRow
                attachment={attachment}
                key={`${ownerPath}-${attachment.source}-${attachment.name}`}
                ownerPath={ownerPath}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function StepTreeItem({
  depth = 0,
  fallbackPath,
  fallbackTrace,
  index: _index,
  path,
  step
}: {
  depth?: number;
  fallbackPath: string | undefined;
  fallbackTrace: ResultTrace | undefined;
  index: number;
  path: string;
  step: ScenarioStep;
}) {
  const childSteps = step.steps ?? [];
  const attachments = step.attachments ?? [];
  const hasChildren = childSteps.length > 0 || attachments.length > 0;
  const [expanded, setExpanded] = useState(() => shouldExpandScenarioStep(step));
  const trace = step.trace ?? (path === fallbackPath ? fallbackTrace : undefined);
  const hasFailure =
    (step.status === "failed" || step.status === "broken") &&
    (trace?.message.trim() || trace?.stack.some((line) => line.trim()));
  const failure =
    hasFailure && trace ? <StepFailure path={path} status={step.status} trace={trace} /> : null;

  return (
    <div
      className="tc-detail-reference-step-node"
      role="treeitem"
      aria-expanded={hasChildren ? expanded : undefined}
    >
      <div
        className={`tc-detail-reference-step-line ${step.status}`}
        style={{ "--step-indent": `${depth * 22}px` } as CSSProperties}
      >
        {hasChildren ? (
          <button
            className="tc-detail-reference-step-expander"
            type="button"
            aria-label={expanded ? "Свернуть шаг" : "Раскрыть шаг"}
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
          </button>
        ) : (
          <span className="tc-detail-reference-step-expander" aria-hidden="true" />
        )}
        <span className="tc-detail-reference-step-index">{path}</span>
        <span
          className={`tc-detail-reference-status-mark ${step.status}`}
          title={formatStatus(step.status)}
        >
          <StatusIcon status={step.status} />
        </span>
        <span className="tc-detail-reference-step-copy">
          <strong>{step.name}</strong>
        </span>
        {attachments.length > 0 ? (
          <span className="tc-detail-reference-step-attachments">
            <Paperclip size={13} />
            {attachments.length}
          </span>
        ) : null}
        <span className="tc-detail-reference-step-duration">
          {formatResultDuration(step.duration)}
        </span>
      </div>

      {expanded ? (
        <div className="tc-detail-reference-step-children" role="group">
          {failure}
          {childSteps.map((child, childIndex) => (
            <StepTreeItem
              depth={depth + 1}
              fallbackPath={fallbackPath}
              fallbackTrace={fallbackTrace}
              index={childIndex}
              key={`${child.name}-${childIndex}`}
              path={`${path}.${childIndex + 1}`}
              step={child}
            />
          ))}
          {attachments.map((attachment) => (
            <StepAttachmentRow
              attachment={attachment}
              depth={depth + 1}
              key={`${step.name}-${attachment.source}-${attachment.name}`}
            />
          ))}
        </div>
      ) : null}
      {!hasChildren ? failure : null}
    </div>
  );
}

function StepFailure({
  path,
  status,
  trace
}: {
  path: string;
  status: ScenarioStep["status"];
  trace: ResultTrace;
}) {
  const message = trace.message.trim();
  const stack = trace.stack.map((line) => line.trim()).filter(Boolean);
  const exception = stack.find((line) => /(?:Error|Exception|Failure)(?::|$)/i.test(line));

  return (
    <div
      aria-label={`Диагностика шага ${path}`}
      className={`tc-detail-reference-step-failure ${status}`}
      role="group"
    >
      <strong>{status === "broken" ? "Сбой на шаге" : "Ошибка на шаге"}</strong>
      {exception && exception !== message ? <code>{exception}</code> : null}
      {message ? <p>{message}</p> : null}
      {stack.length > 0 ? (
        <details>
          <summary>Стек вызовов</summary>
          <pre>{stack.join("\n")}</pre>
        </details>
      ) : null}
    </div>
  );
}

function StepAttachmentRow({ attachment, depth }: { attachment: ResultAttachment; depth: number }) {
  return (
    <div
      className="tc-detail-reference-step-attachment-row"
      style={{ "--step-indent": `${depth * 22}px` } as CSSProperties}
    >
      <Paperclip size={14} />
      <span>
        <strong>{attachment.name}</strong>
        <small>{attachment.mediaType}</small>
      </span>
      <em>{attachment.size}</em>
      <AttachmentViewerButton attachment={attachment} compact />
      <AttachmentDownloadButton attachment={attachment} compact />
      <AttachmentPreview attachment={attachment} />
    </div>
  );
}

function AttachmentRow({
  attachment,
  ownerPath
}: {
  attachment: ResultAttachment;
  ownerPath: string;
}) {
  return (
    <article>
      <FileText size={15} />
      <span>
        <strong>{attachment.name}</strong>
        <small>
          {ownerPath} · {attachment.mediaType} · {attachment.size}
        </small>
      </span>
      <em>{attachment.retained ? "сохранено" : "очистка"}</em>
      <AttachmentViewerButton attachment={attachment} compact />
      <AttachmentDownloadButton attachment={attachment} compact />
      <AttachmentPreview attachment={attachment} />
    </article>
  );
}

function StatusIcon({ status }: { status: ResultStatus }) {
  if (status === "muted") {
    return <PauseCircle size={15} />;
  }
  if (status === "passed") {
    return <CheckCircle2 size={15} />;
  }
  if (status === "failed") {
    return <XCircle size={15} />;
  }
  if (status === "broken") {
    return <AlertCircle size={15} />;
  }
  if (status === "unknown") {
    return <CircleHelp size={15} />;
  }
  return <CircleDashed size={15} />;
}

function isHistoryPointNavigable(
  point: NonNullable<TestResult["historyPoints"]>[number],
  onOpenResult: OpenTestResult | undefined
): boolean {
  return (
    onOpenResult !== undefined && point.launchId.trim() !== "" && point.resultUuid.trim() !== ""
  );
}

function openHistoryPoint(
  point: NonNullable<TestResult["historyPoints"]>[number],
  onOpenResult: OpenTestResult | undefined,
  currentTestCaseId: string
) {
  if (!isHistoryPointNavigable(point, onOpenResult)) {
    return;
  }

  onOpenResult?.(point.resultUuid, point.launchId, point.testCaseId ?? currentTestCaseId);
}
