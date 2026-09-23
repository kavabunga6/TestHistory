import { CheckCircle2, ChevronRight, MousePointer2, PauseCircle } from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent
} from "react";

import type { LaunchResultPage, ResultStatus, TestResult } from "../m1Workspace.js";
import type { IntegrationLinkProvider } from "../projectSettingsTypes.js";
import { formatStatus } from "./LaunchesReferenceFormatters.js";
import {
  collectErrorGroups,
  filterStatusOrder,
  isResultQuarantined,
  matchesStatusFilter
} from "./LaunchesReferenceModel.js";
import { ResultReport } from "./LaunchesResultReport.js";
import { LaunchesResultsPagination } from "./LaunchesResultsPagination.js";
import { ReferenceRouteState } from "./LaunchesReferenceRouteState.js";
import { formatResultDuration } from "./LaunchesResultDuration.js";
import { StatusIcon } from "./LaunchesStatusIcon.js";
import { ThqlSearchPanel } from "./ThqlSearchPanel.js";

export {
  OverviewTab,
  PagedDefectList,
  PagedResultList,
  PagedVariablesList
} from "./LaunchesReferenceOverview.js";
export { ChartsTab, LaunchProgressBar, TimelineTab } from "./LaunchesReferenceVisualTabs.js";

const launchSplitListMinWidth = 380;
const launchSplitListFallbackWidth = 480;
const launchSplitListMaxWidth = 1080;
const launchResultDetailMinWidth = 500;
const launchSplitListDefaultRatio = 0.43;
const launchSplitListWidthKey = "testhistory:launch-detail-list-width-v3";

function compactResultId(id: string): string {
  const numericSuffix = /(?:^|[-_#])(\d{3,})$/.exec(id)?.[1];
  return numericSuffix ?? (id.length > 10 ? `${id.slice(0, 8)}…` : id);
}

function clampLaunchSplitListWidth(value: number, containerWidth?: number): number {
  const availableMaximum =
    containerWidth === undefined
      ? launchSplitListMaxWidth
      : Math.max(
          launchSplitListMinWidth,
          Math.min(launchSplitListMaxWidth, containerWidth - launchResultDetailMinWidth - 9)
        );

  return Math.min(availableMaximum, Math.max(launchSplitListMinWidth, Math.round(value)));
}

function readStoredLaunchSplitListWidth(): number | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }

  try {
    const stored = window.localStorage.getItem(launchSplitListWidthKey);
    if (stored === null) {
      return undefined;
    }
    const parsed = Number(stored);
    return Number.isFinite(parsed) ? clampLaunchSplitListWidth(parsed) : undefined;
  } catch {
    return undefined;
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
  const [storedListWidth, setStoredListWidth] = useState(readStoredLaunchSplitListWidth);
  const [containerWidth, setContainerWidth] = useState<number | undefined>();
  const [resizing, setResizing] = useState(false);
  const splitRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const split = splitRef.current;
    if (split === null) {
      return;
    }

    const updateWidth = () => setContainerWidth(split.getBoundingClientRect().width);
    updateWidth();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateWidth);
      return () => window.removeEventListener("resize", updateWidth);
    }

    const observer = new ResizeObserver(updateWidth);
    observer.observe(split);
    return () => observer.disconnect();
  }, []);

  const listWidth = clampLaunchSplitListWidth(
    storedListWidth ??
      (containerWidth === undefined
        ? launchSplitListFallbackWidth
        : containerWidth * launchSplitListDefaultRatio),
    containerWidth
  );

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
      setStoredListWidth(nextWidth);
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
    "--launch-split-list-width":
      storedListWidth === undefined && containerWidth === undefined
        ? `min(${launchSplitListDefaultRatio * 100}%, calc(100% - ${launchResultDetailMinWidth}px), ${launchSplitListMaxWidth}px)`
        : `${listWidth}px`
  } as CSSProperties;

  const onResizeKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
      return;
    }

    event.preventDefault();
    const direction = event.key === "ArrowLeft" ? -1 : 1;
    const containerWidth = splitRef.current?.getBoundingClientRect().width;
    const nextWidth = clampLaunchSplitListWidth(listWidth + direction * 24, containerWidth);
    setStoredListWidth(nextWidth);
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

export function ResultsTab({
  integrationProviders = [],
  activeFilterId,
  activeStatusFilter,
  actorId,
  filteredResults,
  launchCounters,
  loading,
  onActiveFilterChange,
  onClearStatusFilter,
  onFilterByTag,
  onQueryChange,
  onResultPageIndexChange,
  onResultPageSizeChange,
  onOpenResultTab,
  onSelectResult,
  onStatusFilterChange,
  onToggleMuteResult,
  onUnlinkResultDefect,
  projectId = "ws",
  query,
  resultPage,
  resultPageIndex = 0,
  resultPageSize = 25,
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
  launchCounters?: Record<ResultStatus, number> | undefined;
  loading: boolean;
  onActiveFilterChange: (id: string | undefined) => void;
  onClearStatusFilter: () => void;
  onFilterByTag?: ((tag: string) => void) | undefined;
  onQueryChange: (query: string) => void;
  onResultPageIndexChange?: ((index: number) => void) | undefined;
  onResultPageSizeChange?: ((size: number) => void) | undefined;
  onOpenResultTab?: ((tab: string) => void) | undefined;
  onSelectResult: (id: string) => void;
  onStatusFilterChange: (status: ResultStatus | undefined) => void;
  onToggleMuteResult?: ((id: string) => void) | undefined;
  onUnlinkResultDefect?: ((resultId: string, defectId: string) => void) | undefined;
  projectId?: string | undefined;
  query: string;
  resultPage?: LaunchResultPage | undefined;
  resultPageIndex?: number | undefined;
  resultPageSize?: number | undefined;
  results: TestResult[];
  requestedResultId?: string | undefined;
  routeResultTab?: string | undefined;
  selectedResult: TestResult | undefined;
}) {
  const splitResize = useLaunchSplitResize();
  const countForStatus = (status: ResultStatus) => {
    const pageCount = results.filter((result) => matchesStatusFilter(result, status)).length;
    return status === "muted"
      ? Math.max(launchCounters?.muted ?? 0, pageCount)
      : (launchCounters?.[status] ?? pageCount);
  };
  const availableStatusFilters = filterStatusOrder.filter(
    (status) => status === "muted" || status === activeStatusFilter || countForStatus(status) > 0
  );

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
          projectId={projectId}
          query={query}
          onActiveFilterChange={onActiveFilterChange}
          onQueryChange={onQueryChange}
          trailingFilters={
            <label
              className={`launches-reference-results-status-picker ${
                activeStatusFilter ? "is-filtered" : ""
              }`}
            >
              <span>Статус</span>
              <select
                aria-label="Фильтр по статусу"
                value={activeStatusFilter ?? ""}
                onChange={(event) => {
                  const status = filterStatusOrder.find((item) => item === event.target.value);
                  if (status === undefined) {
                    onClearStatusFilter();
                    return;
                  }
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
                <option value="">Все статусы</option>
                {availableStatusFilters.map((status) => {
                  const count = countForStatus(status);
                  const label =
                    status === "muted" && !launchCounters?.muted
                      ? formatStatus(status)
                      : `${formatStatus(status)} · ${count.toLocaleString("ru-RU")}`;
                  return (
                    <option key={status} value={status}>
                      {label}
                    </option>
                  );
                })}
              </select>
            </label>
          }
        />

        <div className="launches-reference-result-table" aria-label="Результаты">
          <div className="launches-reference-result-table-head" aria-hidden="true">
            <span title="Цвет значка показывает статус теста; выберите статус в фильтре выше">
              Статус
            </span>
            <span>ID</span>
            <span>Название</span>
            <span>Время</span>
          </div>
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
                aria-current={selectedResult?.id === result.id ? "true" : undefined}
                key={result.id}
                title={`${formatStatus(result.status)} · ${result.name}`}
                type="button"
                onClick={() => onSelectResult(result.id)}
              >
                <span
                  className={`launches-reference-result-table-status is-${result.status}`}
                  role="img"
                  aria-label={`Статус: ${formatStatus(result.status)}`}
                  title={formatStatus(result.status)}
                >
                  <StatusIcon status={result.status} size={17} />
                </span>
                <span className="launches-reference-result-table-id" title={result.id}>
                  {compactResultId(result.id)}
                </span>
                <span className="launches-reference-result-table-name" title={result.name}>
                  <strong>{result.name}</strong>
                  {isResultQuarantined(result) ? (
                    <PauseCircle aria-label="Результат в карантине" size={14} />
                  ) : null}
                </span>
                <em>{formatResultDuration(result.duration)}</em>
              </button>
            ))
          )}
        </div>
        <LaunchesResultsPagination
          loading={loading}
          onPageIndexChange={onResultPageIndexChange}
          onPageSizeChange={onResultPageSizeChange}
          page={resultPage}
          pageIndex={resultPageIndex}
          pageSize={resultPageSize}
        />
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
                      <small>{formatResultDuration(result.duration)}</small>
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
