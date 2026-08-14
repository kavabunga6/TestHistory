import { CheckCircle2, ChevronLeft, ChevronRight, MousePointer2, PauseCircle } from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode
} from "react";

import type { LaunchListItem, ResultParameter, ResultStatus, TestResult } from "../m1Workspace.js";
import type { IntegrationLinkProvider } from "../projectSettingsTypes.js";
import { formatStatus } from "./LaunchesReferenceFormatters.js";
import {
  analyticsStatusOrder,
  buildDurationBuckets,
  collectDefectItems,
  collectErrorGroups,
  collectLaunchParameters,
  collectTimelineRows,
  defaultOverviewListPageSize,
  filterStatusOrder,
  formatAverageDuration,
  getLaunchTotal,
  getPartialStateMessage,
  isResultQuarantined,
  matchesStatusFilter,
  overviewListPageSizeOptions,
  type DefectOverviewItem,
  type LaunchesReferencePartialState
} from "./LaunchesReferenceModel.js";
import { ResultReport } from "./LaunchesResultReport.js";
import { ReferenceRouteState } from "./LaunchesReferenceRouteState.js";
import { StatusIcon } from "./LaunchesStatusIcon.js";
import { ThqlSearchPanel } from "./ThqlSearchPanel.js";

const overviewStatusOrder: ResultStatus[] = ["passed", "failed", "broken", "skipped"];
const launchSplitListMinWidth = 340;
const launchSplitListDefaultWidth = 400;
const launchSplitListMaxWidth = 720;
const launchResultDetailMinWidth = 620;
const launchSplitListWidthKey = "testhistory:launch-detail-list-width";
const legacyLaunchSplitListWidthKeys = [
  "testhistory:launch-results-list-width",
  "testhistory:launch-errors-list-width"
] as const;
const overviewStatusLabels: Record<ResultStatus, string> = {
  broken: "Сломаны",
  failed: "Провалены",
  muted: "В карантине",
  passed: "Успешные",
  skipped: "Пропущены"
};
const overviewStatusColors: Record<ResultStatus, string> = {
  broken: "#d18b2c",
  failed: "#d95f57",
  muted: "#64748b",
  passed: "#48a568",
  skipped: "#8793a3"
};

function clampLaunchSplitListWidth(value: number, containerWidth?: number): number {
  const availableMaximum =
    containerWidth === undefined
      ? launchSplitListMaxWidth
      : Math.max(
          launchSplitListMinWidth,
          Math.min(launchSplitListMaxWidth, containerWidth - launchResultDetailMinWidth)
        );

  return Math.min(availableMaximum, Math.max(launchSplitListMinWidth, Math.round(value)));
}

function readStoredLaunchSplitListWidth(): number {
  if (typeof window === "undefined") {
    return launchSplitListDefaultWidth;
  }

  try {
    const stored =
      window.localStorage.getItem(launchSplitListWidthKey) ??
      legacyLaunchSplitListWidthKeys
        .map((key) => window.localStorage.getItem(key))
        .find((value) => value !== null) ??
      null;
    if (stored === null) {
      return launchSplitListDefaultWidth;
    }
    const parsed = Number(stored);
    return Number.isFinite(parsed)
      ? clampLaunchSplitListWidth(parsed)
      : launchSplitListDefaultWidth;
  } catch {
    return launchSplitListDefaultWidth;
  }
}

function writeStoredLaunchSplitListWidth(value: number) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(launchSplitListWidthKey, String(clampLaunchSplitListWidth(value)));
  } catch {
    // The resized column still works for the current visit when storage is unavailable.
  }
}

function useLaunchSplitResize() {
  const [listWidth, setListWidth] = useState(readStoredLaunchSplitListWidth);
  const [resizing, setResizing] = useState(false);
  const splitRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!resizing) {
      return;
    }

    const handlePointerMove = (event: PointerEvent) => {
      const splitBounds = splitRef.current?.getBoundingClientRect();
      if (splitBounds === undefined) {
        return;
      }

      const nextWidth = clampLaunchSplitListWidth(
        event.clientX - splitBounds.left,
        splitBounds.width
      );
      setListWidth(nextWidth);
      writeStoredLaunchSplitListWidth(nextWidth);
    };
    const handlePointerUp = () => setResizing(false);

    document.body.classList.add("launches-reference-is-resizing");
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp, { once: true });

    return () => {
      document.body.classList.remove("launches-reference-is-resizing");
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [resizing]);

  const splitStyle = {
    "--launch-split-list-width": `${listWidth}px`
  } as CSSProperties;

  const onResizeKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
      return;
    }

    event.preventDefault();
    const direction = event.key === "ArrowLeft" ? -1 : 1;
    const containerWidth = splitRef.current?.getBoundingClientRect().width;
    const nextWidth = clampLaunchSplitListWidth(listWidth + direction * 24, containerWidth);
    setListWidth(nextWidth);
    writeStoredLaunchSplitListWidth(nextWidth);
  };

  const onResizePointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    setResizing(true);
  };

  return {
    listWidth,
    onResizeKeyDown,
    onResizePointerDown,
    resizing,
    splitRef,
    splitStyle
  };
}

function LaunchSplitResizer({
  label,
  resize
}: {
  label: string;
  resize: ReturnType<typeof useLaunchSplitResize>;
}) {
  return (
    <button
      aria-label={label}
      aria-orientation="vertical"
      aria-valuemax={launchSplitListMaxWidth}
      aria-valuemin={launchSplitListMinWidth}
      aria-valuenow={resize.listWidth}
      className="launches-reference-split-resizer"
      role="separator"
      title={label}
      type="button"
      onKeyDown={resize.onResizeKeyDown}
      onPointerDown={resize.onResizePointerDown}
    />
  );
}

export function OverviewTab({
  launch,
  onSelectAll,
  onSelectResult,
  onSelectStatus,
  results
}: {
  launch: LaunchListItem;
  onSelectAll: () => void;
  onSelectResult: (id: string) => void;
  onSelectStatus: (status: ResultStatus) => void;
  results: TestResult[];
}) {
  const total = getLaunchTotal(launch);
  const unresolved = results.filter(
    (result) => result.status === "failed" || result.status === "broken"
  );
  const defectItems = collectDefectItems(results);
  const parameters = collectLaunchParameters(launch, results);
  const passRate = total > 0 ? Math.round((launch.counters.passed / total) * 100) : 0;
  const activeStatusCount = overviewStatusOrder.filter(
    (status) => launch.counters[status] > 0
  ).length;
  let chartOffset = 0;
  const chartSegments = overviewStatusOrder.map((status) => {
    const count = launch.counters[status];
    const percent = total > 0 ? (count / total) * 100 : 0;
    const gap = activeStatusCount > 1 && count > 0 ? Math.min(1.25, percent * 0.2) : 0;
    const segment = {
      count,
      dash: Math.max(0, percent - gap),
      offset: -(chartOffset + gap / 2),
      percent,
      status
    };
    chartOffset += percent;
    return segment;
  });

  return (
    <div className="launches-reference-overview">
      <section className="launches-reference-card launches-reference-overview-summary">
        <h2>
          <span>Распределение результатов</span>
        </h2>
        <div className="launches-reference-overview-summary-main">
          <div className="launches-reference-overview-donut-wrap">
            <svg
              aria-label={`Результаты запуска: ${total.toLocaleString("ru-RU")} тестов`}
              className="launches-reference-overview-donut"
              role="group"
              viewBox="0 0 180 180"
            >
              <circle className="launches-reference-overview-donut-track" cx="90" cy="90" r="68" />
              {chartSegments.map((segment) =>
                segment.count > 0 ? (
                  <circle
                    aria-label={`${overviewStatusLabels[segment.status]}: ${segment.count.toLocaleString("ru-RU")}`}
                    className={`launches-reference-overview-donut-segment is-${segment.status}`}
                    cx="90"
                    cy="90"
                    key={segment.status}
                    pathLength="100"
                    r="68"
                    role="button"
                    style={
                      {
                        stroke: overviewStatusColors[segment.status],
                        strokeDasharray: `${segment.dash} ${100 - segment.dash}`,
                        strokeDashoffset: segment.offset
                      } as CSSProperties
                    }
                    tabIndex={0}
                    onClick={() => onSelectStatus(segment.status)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        onSelectStatus(segment.status);
                      }
                    }}
                  />
                ) : null
              )}
            </svg>
            <button
              aria-label={`Показать все ${total.toLocaleString("ru-RU")} результатов`}
              className="launches-reference-overview-donut-center"
              type="button"
              onClick={onSelectAll}
            >
              <strong>{passRate}%</strong>
              <span>успех</span>
              <small>{total.toLocaleString("ru-RU")} тестов</small>
            </button>
          </div>

          <ul className="launches-reference-overview-legend" aria-label="Фильтры по статусу">
            {chartSegments.map((segment) => (
              <li key={segment.status}>
                <button
                  aria-label={`${overviewStatusLabels[segment.status]}: ${segment.count.toLocaleString("ru-RU")}. Открыть результаты с этим статусом`}
                  className={`launches-reference-overview-legend-item is-${segment.status}`}
                  type="button"
                  onClick={() => onSelectStatus(segment.status)}
                >
                  <i style={{ backgroundColor: overviewStatusColors[segment.status] }} />
                  <span>{overviewStatusLabels[segment.status]}</span>
                  <strong>{segment.count.toLocaleString("ru-RU")}</strong>
                  <small>{Math.round(segment.percent)}%</small>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="launches-reference-card launches-reference-overview-card-unresolved">
        <OverviewCardTitle count={unresolved.length}>Неразобранные результаты</OverviewCardTitle>
        <PagedResultList
          emptyText="В запуске пока нет неразобранных результатов."
          results={unresolved}
          onSelectResult={onSelectResult}
        />
      </section>

      <section className="launches-reference-card launches-reference-overview-card-defects">
        <OverviewCardTitle count={defectItems.length}>Дефекты</OverviewCardTitle>
        <PagedDefectList
          emptyText="Нет дефектов в этом запуске"
          items={defectItems}
          onSelectResult={onSelectResult}
        />
      </section>

      <section className="launches-reference-card launches-reference-overview-card-variables">
        <OverviewCardTitle count={parameters.length}>Переменные окружения</OverviewCardTitle>
        <PagedVariablesList parameters={parameters} />
      </section>
    </div>
  );
}

function OverviewCardTitle({ children, count }: { children: ReactNode; count: number }) {
  return (
    <h2>
      <span>{children}</span>
      <em>{count.toLocaleString("ru-RU")}</em>
    </h2>
  );
}

export function ResultsTab({
  integrationProviders = [],
  activeFilterId,
  activeStatusFilter,
  actorId,
  filteredResults,
  loading,
  onActiveFilterChange,
  onClearStatusFilter,
  onFilterByTag,
  onQueryChange,
  onOpenResultTab,
  onSelectResult,
  onStatusFilterChange,
  onToggleMuteResult,
  onUnlinkResultDefect,
  query,
  results,
  requestedResultId,
  routeResultTab,
  selectedResult
}: {
  integrationProviders?: IntegrationLinkProvider[] | undefined;
  activeFilterId?: string | undefined;
  activeStatusFilter: ResultStatus | undefined;
  actorId: string;
  filteredResults: TestResult[];
  loading: boolean;
  onActiveFilterChange: (id: string | undefined) => void;
  onClearStatusFilter: () => void;
  onFilterByTag?: ((tag: string) => void) | undefined;
  onQueryChange: (query: string) => void;
  onOpenResultTab?: ((tab: string) => void) | undefined;
  onSelectResult: (id: string) => void;
  onStatusFilterChange: (status: ResultStatus | undefined) => void;
  onToggleMuteResult?: ((id: string) => void) | undefined;
  onUnlinkResultDefect?: ((resultId: string, defectId: string) => void) | undefined;
  query: string;
  results: TestResult[];
  requestedResultId?: string | undefined;
  routeResultTab?: string | undefined;
  selectedResult: TestResult | undefined;
}) {
  const splitResize = useLaunchSplitResize();

  return (
    <div
      ref={splitResize.splitRef}
      className={`launches-reference-split launches-reference-results-split launches-reference-resizable-split ${
        splitResize.resizing ? "is-resizing" : ""
      }`}
      style={splitResize.splitStyle}
    >
      <aside className="launches-reference-results-pane">
        <ThqlSearchPanel
          activeFilterId={activeFilterId}
          actorId={actorId}
          entity="launchResults"
          projectId="ws"
          query={query}
          onActiveFilterChange={onActiveFilterChange}
          onQueryChange={onQueryChange}
        />

        {activeStatusFilter !== undefined || results.some(isResultQuarantined) ? (
          <div className="launches-reference-chip-strip">
            {activeStatusFilter !== undefined ? (
              <button
                className="launches-reference-active-filter"
                type="button"
                onClick={onClearStatusFilter}
              >
                {formatStatus(activeStatusFilter)} ×
              </button>
            ) : null}
            {filterStatusOrder.map((status) => {
              const count = results.filter((result) => matchesStatusFilter(result, status)).length;
              if (count === 0 || activeStatusFilter === status) {
                return null;
              }

              return (
                <button
                  className="launches-reference-status-filter"
                  key={status}
                  type="button"
                  onClick={() => {
                    onQueryChange("");
                    onStatusFilterChange(status);
                    const firstMatchingResult = results.find((result) =>
                      matchesStatusFilter(result, status)
                    );
                    if (firstMatchingResult !== undefined) {
                      onSelectResult(firstMatchingResult.id);
                    }
                  }}
                >
                  {formatStatus(status)} {count.toLocaleString("ru-RU")}
                </button>
              );
            })}
          </div>
        ) : null}

        <div className="launches-reference-test-count">
          <span>Тесты: {filteredResults.length.toLocaleString("ru-RU")}</span>
        </div>

        <div className="launches-reference-result-table" aria-label="Результаты">
          {loading ? (
            <ReferenceRouteState
              compact
              kind="loading"
              title="Загружаем результаты"
              text="Список может быть неполным, пока маршрут результата или запуска догружается."
            />
          ) : null}
          {filteredResults.length === 0 && !loading ? (
            <p className="launches-reference-list-empty">Ничего не найдено</p>
          ) : (
            filteredResults.map((result) => (
              <button
                className={selectedResult?.id === result.id ? "selected" : ""}
                key={result.id}
                type="button"
                onClick={() => onSelectResult(result.id)}
              >
                <StatusIcon status={result.status} />
                <span
                  className={`launches-reference-quarantine-cell ${
                    result.muted || result.defectMute !== undefined ? "active" : ""
                  }`}
                  title={
                    result.muted || result.defectMute !== undefined
                      ? "Результат в карантине"
                      : undefined
                  }
                >
                  {result.muted || result.defectMute !== undefined ? (
                    <PauseCircle aria-hidden="true" size={16} />
                  ) : null}
                </span>
                <strong>{result.name}</strong>
                <em>{result.duration}</em>
              </button>
            ))
          )}
        </div>
      </aside>

      <LaunchSplitResizer label="Изменить ширину списка тестов" resize={splitResize} />

      <section className="launches-reference-detail-pane">
        {loading && selectedResult === undefined ? (
          <ReferenceRouteState
            kind="loading"
            title="Загружаем отчет результата"
            text="Правая панель откроется, когда выбранный результат будет доступен."
          />
        ) : selectedResult === undefined && requestedResultId !== undefined ? (
          <div className="launches-reference-empty-selection" role="status">
            <MousePointer2 size={42} />
            <strong>Результат теста не найден</strong>
            <span>
              Он мог быть удалён или не принадлежит выбранному запуску. Выберите доступный результат
              слева.
            </span>
          </div>
        ) : selectedResult === undefined ? (
          <div className="launches-reference-empty-selection">
            <MousePointer2 size={42} />
            <span>Выберите результат теста для отображения отчета</span>
          </div>
        ) : (
          <ResultReport
            integrationProviders={integrationProviders}
            routeTab={routeResultTab}
            result={selectedResult}
            results={results}
            onOpenTab={onOpenResultTab}
            onFilterByTag={onFilterByTag}
            onSelectResult={onSelectResult}
            onToggleMuteResult={onToggleMuteResult}
            onUnlinkResultDefect={onUnlinkResultDefect}
          />
        )}
      </section>
    </div>
  );
}

export function ErrorsTab({
  integrationProviders = [],
  loading,
  onFilterByTag,
  onOpenResultTab,
  onSelectResult,
  onToggleMuteResult,
  onUnlinkResultDefect,
  results,
  routeResultTab,
  selectedResult
}: {
  integrationProviders?: IntegrationLinkProvider[] | undefined;
  loading: boolean;
  onFilterByTag?: ((tag: string) => void) | undefined;
  onOpenResultTab?: ((tab: string) => void) | undefined;
  onSelectResult: (id: string) => void;
  onToggleMuteResult?: ((id: string) => void) | undefined;
  onUnlinkResultDefect?: ((resultId: string, defectId: string) => void) | undefined;
  results: TestResult[];
  routeResultTab?: string | undefined;
  selectedResult: TestResult | undefined;
}) {
  const splitResize = useLaunchSplitResize();
  const errorGroups = collectErrorGroups(results);
  const selectedErrorResult =
    selectedResult?.status === "failed" || selectedResult?.status === "broken"
      ? selectedResult
      : errorGroups[0]?.results[0];

  if (!loading && errorGroups.length === 0) {
    return (
      <section className="launches-reference-errors-empty" aria-live="polite">
        <div>
          <span className="launches-reference-errors-empty-icon">
            <CheckCircle2 aria-hidden="true" />
          </span>
          <h2>Ошибок в запуске нет</h2>
          <p>Нет результатов со статусом «Провален» или «Сломан».</p>
        </div>
      </section>
    );
  }

  return (
    <div
      ref={splitResize.splitRef}
      className={`launches-reference-split launches-reference-errors launches-reference-resizable-split ${
        splitResize.resizing ? "is-resizing" : ""
      }`}
      style={splitResize.splitStyle}
    >
      <aside className="launches-reference-errors-list">
        <div className="launches-reference-errors-content">
          <h2>Ошибки</h2>
          <div className="launches-reference-error-header">
            <span>Название</span>
            <span>Статус</span>
          </div>
          {loading ? (
            <ReferenceRouteState
              compact
              kind="loading"
              title="Загружаем ошибки"
              text="Группы ошибок будут уточняться по мере загрузки результатов."
            />
          ) : null}
          {errorGroups.length === 0 && !loading ? (
            <div className="launches-reference-centered">Ошибок в запуске нет</div>
          ) : (
            errorGroups.map((group, index) => (
              <details
                className="launches-reference-error-group"
                key={group.name}
                open={index === 0}
              >
                <summary>
                  <ChevronRight size={18} />
                  <span>{group.name}</span>
                  {group.failed > 0 ? <em className="failed">{group.failed}</em> : null}
                  {group.broken > 0 ? <em className="broken">{group.broken}</em> : null}
                </summary>
                <div className="launches-reference-error-results">
                  {group.results.map((result) => (
                    <button
                      className={selectedErrorResult?.id === result.id ? "selected" : ""}
                      key={result.id}
                      type="button"
                      onClick={() => onSelectResult(result.id)}
                    >
                      <StatusIcon status={result.status} />
                      <span>{result.name}</span>
                      <small>{result.duration}</small>
                    </button>
                  ))}
                </div>
              </details>
            ))
          )}
        </div>
      </aside>

      <LaunchSplitResizer label="Изменить ширину списка ошибок" resize={splitResize} />

      <section className="launches-reference-detail-pane">
        {loading && selectedErrorResult === undefined ? (
          <ReferenceRouteState
            kind="loading"
            title="Загружаем отчет ошибки"
            text="Правая панель откроется, когда появится результат с ошибкой."
          />
        ) : selectedErrorResult?.trace === undefined ? (
          <div className="launches-reference-top-message">Выберите ошибочный результат слева</div>
        ) : (
          <ResultReport
            integrationProviders={integrationProviders}
            routeTab={routeResultTab}
            result={selectedErrorResult}
            results={results}
            onOpenTab={onOpenResultTab}
            onFilterByTag={onFilterByTag}
            onSelectResult={onSelectResult}
            onToggleMuteResult={onToggleMuteResult}
            onUnlinkResultDefect={onUnlinkResultDefect}
          />
        )}
      </section>
    </div>
  );
}

export function ChartsTab({ results }: { results: TestResult[] }) {
  const buckets = buildDurationBuckets(results);
  const maxCount = Math.max(1, ...buckets.map((bucket) => bucket.count));
  const axisMaxCount = getDurationAxisMax(maxCount);
  const yAxisTicks = buildDurationAxisTicks(axisMaxCount);
  const averageDuration = formatAverageDuration(results);

  return (
    <div className="launches-reference-chart-page">
      <section className="launches-reference-card launches-reference-chart-card">
        <header className="launches-reference-chart-card-head">
          <h2>Распределение по продолжительности</h2>
          <span>
            Средняя продолжительность теста <strong>{averageDuration}</strong>
          </span>
        </header>
        {results.length > 0 ? (
          <div className="launches-reference-chart-wrap">
            <div className="launches-reference-chart-y-axis" aria-hidden="true">
              {[...yAxisTicks].reverse().map((tick) => (
                <span key={tick}>{tick}</span>
              ))}
            </div>
            <div
              className="launches-reference-chart"
              aria-label="Распределение по продолжительности"
            >
              {buckets.map((bucket) => (
                <div
                  aria-label={`${bucket.label}: ${bucket.count}`}
                  className="launches-reference-chart-column"
                  key={bucket.label}
                >
                  <div className="launches-reference-chart-bar">
                    <strong>{bucket.count}</strong>
                    <span
                      className={bucket.count === 0 ? "is-empty" : undefined}
                      style={{
                        height:
                          bucket.count === 0
                            ? "2px"
                            : `${Math.max(10, Math.round((bucket.count / axisMaxCount) * 190))}px`
                      }}
                    />
                  </div>
                  <em>{bucket.label}</em>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="launches-reference-centered">Нет данных для графика</div>
        )}
      </section>
    </div>
  );
}

function getDurationAxisMax(maxCount: number) {
  if (maxCount <= 10) {
    return 10;
  }

  if (maxCount <= 50) {
    return Math.ceil(maxCount / 5) * 5;
  }

  return Math.ceil(maxCount / 10) * 10;
}

function buildDurationAxisTicks(maxCount: number) {
  const step = maxCount <= 10 ? 2 : maxCount <= 50 ? 5 : 10;
  const ticks: number[] = [];
  for (let tick = 0; tick <= maxCount; tick += step) {
    ticks.push(tick);
  }
  return ticks;
}

export function TimelineTab({
  loading,
  onSelectResult,
  partial,
  results,
  selectedResultId
}: {
  loading: boolean;
  onSelectResult: (id: string) => void;
  partial?: LaunchesReferencePartialState | undefined;
  results: TestResult[];
  selectedResultId: string | undefined;
}) {
  const rows = collectTimelineRows(results).slice(0, 24);
  const partialMessage = getPartialStateMessage(
    partial,
    "Временная шкала построена по загруженным результатам. Поздние точки могут появиться после догрузки."
  );

  return (
    <div className="launches-reference-timeline-page">
      <section className="launches-reference-card">
        <h2>Временная шкала</h2>
        {loading ? (
          <ReferenceRouteState
            compact
            kind="loading"
            title="Загружаем временную шкалу"
            text="Показываем доступные события, пока результаты маршрута догружаются."
          />
        ) : null}
        {partialMessage !== undefined ? (
          <ReferenceRouteState
            compact
            kind="partial"
            title="Шкала построена частично"
            text={partialMessage}
          />
        ) : null}
        {rows.length === 0 ? (
          <div className="launches-reference-centered">
            {loading ? "События еще загружаются" : "Нет данных"}
          </div>
        ) : (
          <div className="launches-reference-timeline">
            {rows.map((row, index) => (
              <button
                className={selectedResultId === row.result.id ? "selected" : ""}
                key={`${row.launchId}-${row.resultUuid}-${index}`}
                type="button"
                onClick={() => onSelectResult(row.result.id)}
              >
                <StatusIcon status={row.status} />
                <strong>{row.result.name}</strong>
                <span>{row.startedAt}</span>
                <em>{row.duration}</em>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export function LaunchProgressBar({
  counters,
  total: _total
}: {
  counters: Record<ResultStatus, number>;
  total: number;
}) {
  const visibleStatuses = analyticsStatusOrder.filter((status) => counters[status] > 0);

  return (
    <div className="launches-reference-progress-wrap" aria-label="Распределение статусов">
      <div className="launches-reference-progress">
        {visibleStatuses.map((status) => {
          const value = counters[status];

          return (
            <span
              className={`is-${status}`}
              key={status}
              aria-label={`${formatStatus(status)}: ${value}`}
              style={{ flexBasis: 0, flexGrow: value }}
              title={`${formatStatus(status)}: ${value}`}
            >
              {value.toLocaleString("ru-RU")}
            </span>
          );
        })}
      </div>
    </div>
  );
}

export function PagedResultList({
  emptyText,
  onSelectResult,
  results
}: {
  emptyText: string;
  onSelectResult: (id: string) => void;
  results: TestResult[];
}) {
  const pager = usePagedItems(results);

  if (results.length === 0) {
    return <div className="launches-reference-centered">{emptyText}</div>;
  }

  return (
    <PagedCardContent pager={pager}>
      <div className="launches-reference-compact-results">
        <div className="launches-reference-compact-results-head" aria-hidden="true">
          <span>Название теста</span>
          <span>Время</span>
          <span>Статус</span>
        </div>
        {pager.visibleItems.map((result) => (
          <button key={result.id} type="button" onClick={() => onSelectResult(result.id)}>
            <span className="launches-reference-compact-result-copy">
              <strong>{result.name}</strong>
              <small>{result.suite}</small>
            </span>
            <span className="launches-reference-compact-result-duration">{result.duration}</span>
            <StatusBadge status={result.status} />
          </button>
        ))}
      </div>
    </PagedCardContent>
  );
}

export function PagedDefectList({
  emptyText,
  items,
  onSelectResult
}: {
  emptyText: string;
  items: DefectOverviewItem[];
  onSelectResult: (id: string) => void;
}) {
  const pager = usePagedItems(items);

  if (items.length === 0) {
    return (
      <div className="launches-reference-centered launches-reference-defects-empty">
        <CheckCircle2 aria-hidden="true" />
        <span>{emptyText}</span>
      </div>
    );
  }

  return (
    <PagedCardContent pager={pager}>
      <div className="launches-reference-defect-overview-list">
        <div className="launches-reference-defect-overview-head" aria-hidden="true">
          <span>Описание</span>
          <span>ID</span>
        </div>
        {pager.visibleItems.map((item) => (
          <button
            key={`${item.id}-${item.resultId}`}
            type="button"
            onClick={() => onSelectResult(item.resultId)}
          >
            <span>
              <strong>{item.title}</strong>
              <small>{item.subtitle}</small>
            </span>
            <em>{item.id}</em>
          </button>
        ))}
      </div>
    </PagedCardContent>
  );
}

export function PagedVariablesList({ parameters }: { parameters: ResultParameter[] }) {
  const pager = usePagedItems(parameters);

  if (parameters.length === 0) {
    return <div className="launches-reference-centered">Нет переменных</div>;
  }

  return (
    <PagedCardContent pager={pager}>
      <div className="launches-reference-variables-head" aria-hidden="true">
        <span>Имя</span>
        <span>Значение</span>
      </div>
      <dl className="launches-reference-variables">
        {pager.visibleItems.map((parameter) => (
          <div key={parameter.name}>
            <dt>{parameter.name}</dt>
            <dd>{parameter.value}</dd>
          </div>
        ))}
      </dl>
    </PagedCardContent>
  );
}

type PagedItems<T> = {
  currentPage: number;
  endIndex: number;
  goToNextPage: () => void;
  goToPreviousPage: () => void;
  pageCount: number;
  pageSize: number;
  setPageSize: (pageSize: number) => void;
  startIndex: number;
  totalItems: number;
  visibleItems: T[];
};

function usePagedItems<T>(items: T[]): PagedItems<T> {
  const [currentPage, setCurrentPage] = useState(0);
  const [pageSize, setPageSizeState] = useState(defaultOverviewListPageSize);
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const normalizedPage = Math.min(currentPage, pageCount - 1);
  const startIndex = normalizedPage * pageSize;
  const endIndex = Math.min(startIndex + pageSize, items.length);

  useEffect(() => {
    if (currentPage !== normalizedPage) {
      setCurrentPage(normalizedPage);
    }
  }, [currentPage, normalizedPage]);

  return {
    currentPage: normalizedPage,
    endIndex,
    goToNextPage: () => setCurrentPage((page) => Math.min(page + 1, pageCount - 1)),
    goToPreviousPage: () => setCurrentPage((page) => Math.max(page - 1, 0)),
    pageCount,
    pageSize,
    setPageSize: (nextPageSize) => {
      setPageSizeState(nextPageSize);
      setCurrentPage(0);
    },
    startIndex,
    totalItems: items.length,
    visibleItems: items.slice(startIndex, endIndex)
  };
}

function PagedCardContent<T>({ children, pager }: { children: ReactNode; pager: PagedItems<T> }) {
  return (
    <div className="launches-reference-card-content">
      <div className="launches-reference-card-scroll">{children}</div>
      <div className="launches-reference-card-spacer" aria-hidden="true" />
      {pager.totalItems > pager.pageSize ? <CardPager pager={pager} /> : null}
    </div>
  );
}

function CardPager<T>({ pager }: { pager: PagedItems<T> }) {
  return (
    <nav
      aria-label="Страницы списка"
      className="launches-reference-card-pager"
      data-page-size={pager.pageSize}
      data-total={pager.totalItems}
    >
      <span>
        {pager.startIndex + 1}-{pager.endIndex} из {pager.totalItems}
      </span>
      <label>
        <span>На странице</span>
        <select
          aria-label="Элементов на странице"
          value={pager.pageSize}
          onChange={(event) => pager.setPageSize(Number(event.target.value))}
        >
          {overviewListPageSizeOptions.map((pageSize) => (
            <option key={pageSize} value={pageSize}>
              {pageSize}
            </option>
          ))}
        </select>
      </label>
      <div>
        <button
          aria-label="Предыдущая страница"
          disabled={pager.currentPage === 0}
          type="button"
          onClick={pager.goToPreviousPage}
        >
          <ChevronLeft aria-hidden="true" size={16} />
        </button>
        <button
          aria-label="Следующая страница"
          disabled={pager.currentPage >= pager.pageCount - 1}
          type="button"
          onClick={pager.goToNextPage}
        >
          <ChevronRight aria-hidden="true" size={16} />
        </button>
      </div>
    </nav>
  );
}

function StatusBadge({ status }: { status: ResultStatus }) {
  return (
    <span className={`launches-reference-status-badge ${status}`}>{formatStatus(status)}</span>
  );
}
