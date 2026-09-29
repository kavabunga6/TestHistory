import { CheckCircle2, ChevronRight, MousePointer2, PauseCircle } from "lucide-react";
import type { LaunchErrorSummaryReadModel } from "@testhistory/contracts";
import {
  useEffect,
  useLayoutEffect,
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
import { formatLaunchErrorGroupHeading, loadLaunchErrorSummary } from "./LaunchErrorSummaryData.js";
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
const mobileLaunchViewport = "(max-width: 760px)";

function useMobileLaunchViewport(): boolean {
  const [mobile, setMobile] = useState(
    () =>
      typeof window !== "undefined" && (window.matchMedia?.(mobileLaunchViewport).matches ?? false)
  );

  useEffect(() => {
    const media = window.matchMedia?.(mobileLaunchViewport);
    if (media === undefined) return;
    const update = () => setMobile(media.matches);
    media.addEventListener("change", update);
    update();
    return () => media.removeEventListener("change", update);
  }, []);

  return mobile;
}

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
  onCloseResult,
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
  onCloseResult?: (() => void) | undefined;
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
  const mobile = useMobileLaunchViewport();
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
        requestedResultId === undefined ? "is-mobile-list" : "is-mobile-detail"
      } ${splitResize.resizing ? "is-resizing" : ""}`}
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
            <div className="launches-reference-list-empty" role="status">
              <strong>
                {query.trim() || activeStatusFilter
                  ? "Нет результатов по выбранному фильтру"
                  : "В запуске пока нет результатов"}
              </strong>
              {query.trim() || activeStatusFilter ? (
                <>
                  <span>Измените запрос или покажите все результаты запуска.</span>
                  <button
                    type="button"
                    onClick={() => {
                      onQueryChange("");
                      onClearStatusFilter();
                    }}
                  >
                    Сбросить фильтр
                  </button>
                </>
              ) : (
                <span>Они появятся здесь после загрузки тестового отчета.</span>
              )}
            </div>
          ) : (
            filteredResults.map((result) => (
              <button
                className={
                  selectedResult?.id === result.id && (!mobile || requestedResultId !== undefined)
                    ? "selected"
                    : ""
                }
                aria-current={
                  selectedResult?.id === result.id && (!mobile || requestedResultId !== undefined)
                    ? "true"
                    : undefined
                }
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
        {requestedResultId !== undefined ? (
          <button className="launches-reference-mobile-back" onClick={onCloseResult} type="button">
            ← К списку результатов
          </button>
        ) : null}
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
            <strong>
              {filteredResults.length === 0
                ? "Нет результатов для просмотра"
                : "Результат не выбран"}
            </strong>
            <span>
              {filteredResults.length === 0
                ? "Проверьте фильтры слева, чтобы открыть отчет теста."
                : "Выберите тест слева, чтобы открыть его отчет."}
            </span>
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
  launchId,
  loading,
  onFilterByTag,
  onCloseResult,
  onOpenResultTab,
  onSelectResult,
  onShowProblemResults,
  onToggleMuteResult,
  onUnlinkResultDefect,
  results,
  requestedResultId,
  routeResultTab,
  selectedResult
}: {
  integrationProviders?: IntegrationLinkProvider[] | undefined;
  launchId: string;
  loading: boolean;
  onFilterByTag?: ((tag: string) => void) | undefined;
  onCloseResult?: (() => void) | undefined;
  onOpenResultTab?: ((tab: string) => void) | undefined;
  onSelectResult: (id: string) => void;
  onShowProblemResults?: (() => void) | undefined;
  onToggleMuteResult?: ((id: string) => void) | undefined;
  onUnlinkResultDefect?: ((resultId: string, defectId: string) => void) | undefined;
  results: TestResult[];
  requestedResultId?: string | undefined;
  routeResultTab?: string | undefined;
  selectedResult: TestResult | undefined;
}) {
  const splitResize = useLaunchSplitResize();
  const mobile = useMobileLaunchViewport();
  const [summaryState, setSummaryState] = useState<
    | { status: "loading" }
    | { status: "ready"; summary: LaunchErrorSummaryReadModel }
    | { status: "error" }
  >({ status: "loading" });
  const [summaryRetry, setSummaryRetry] = useState(0);
  const [explicitErrorResultId, setExplicitErrorResultId] = useState(requestedResultId);
  useEffect(() => {
    const controller = new AbortController();
    setSummaryState({ status: "loading" });
    void loadLaunchErrorSummary(launchId, controller.signal)
      .then((summary) => {
        if (!controller.signal.aborted) setSummaryState({ status: "ready", summary });
      })
      .catch(() => {
        if (!controller.signal.aborted) setSummaryState({ status: "error" });
      });
    return () => controller.abort();
  }, [launchId, summaryRetry]);

  const localErrorGroups = collectErrorGroups(results);
  const summary = summaryState.status === "ready" ? summaryState.summary : undefined;
  const errorGroups = summary
    ? summary.groups.map((group) => ({
        ...group,
        examples: group.examples.map((example) => ({
          id: example.resultUuid,
          name: example.name,
          status: example.status,
          duration: formatResultDuration(
            example.durationMs === undefined
              ? "n/a"
              : example.durationMs < 1_000
                ? `${Math.round(example.durationMs)}ms`
                : `${(example.durationMs / 1_000).toFixed(2)}s`
          )
        }))
      }))
    : localErrorGroups.map((group) => ({
        name: group.name,
        failed: group.failed,
        broken: group.broken,
        resultsTruncated: false,
        examples: group.results.map((result) => ({
          id: result.id,
          name: result.name,
          status: result.status,
          duration: formatResultDuration(result.duration)
        }))
      }));
  const firstErrorId = errorGroups[0]?.examples[0]?.id;
  const preferredErrorResultId = requestedResultId ?? explicitErrorResultId ?? firstErrorId;
  const selectedErrorResult =
    selectedResult !== undefined &&
    selectedResult.id === preferredErrorResultId &&
    (selectedResult.status === "failed" || selectedResult.status === "broken")
      ? selectedResult
      : results.find(
          (result) =>
            result.id === preferredErrorResultId &&
            (result.status === "failed" || result.status === "broken")
        );
  const selectedErrorGroupIndex = errorGroups.findIndex((group) =>
    group.examples.some((example) => example.id === selectedErrorResult?.id)
  );
  const expandedErrorGroupIndex = selectedErrorGroupIndex < 0 ? 0 : selectedErrorGroupIndex;
  const initialSelectionResolved = useRef(false);
  const errorListRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    if (summaryState.status !== "ready") return;
    const list = errorListRef.current;
    const row = list?.querySelector<HTMLButtonElement>(
      ".launches-reference-error-results button.selected"
    );
    if (list === null || list === undefined || row === null || row === undefined) return;
    const listRect = list.getBoundingClientRect();
    const rowRect = row.getBoundingClientRect();
    if (rowRect.top < listRect.top + 48 || rowRect.bottom > listRect.bottom - 16) {
      list.scrollTop += rowRect.top - listRect.top - Math.min(110, list.clientHeight / 3);
    }
    const headingBottom = list
      .querySelector(".launches-reference-errors-heading")
      ?.getBoundingClientRect().bottom;
    if (headingBottom !== undefined) {
      const firstVisibleGroup = Array.from(
        list.querySelectorAll<HTMLDetailsElement>(".launches-reference-error-group")
      ).find((group) => group.getBoundingClientRect().bottom > headingBottom);
      if (firstVisibleGroup !== undefined && !firstVisibleGroup.contains(row)) {
        const groupTop = firstVisibleGroup.getBoundingClientRect().top;
        if (groupTop < headingBottom) {
          list.scrollTop += firstVisibleGroup.getBoundingClientRect().bottom - headingBottom;
        }
      }
    }
  }, [selectedErrorResult?.id, selectedErrorGroupIndex, summaryState.status]);

  useEffect(() => {
    if (
      loading ||
      summaryState.status === "loading" ||
      initialSelectionResolved.current ||
      requestedResultId !== undefined ||
      explicitErrorResultId !== undefined ||
      firstErrorId === undefined
    ) {
      return;
    }
    if (mobile) return;
    initialSelectionResolved.current = true;
    if (selectedErrorResult?.trace === undefined) {
      onSelectResult(firstErrorId);
    }
  }, [
    explicitErrorResultId,
    firstErrorId,
    loading,
    mobile,
    onSelectResult,
    requestedResultId,
    selectedErrorResult,
    summaryState.status
  ]);

  if (!loading && summary?.failedResults === 0 && summary.brokenResults === 0) {
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
        requestedResultId === undefined ? "is-mobile-list" : "is-mobile-detail"
      } ${splitResize.resizing ? "is-resizing" : ""}`}
      style={splitResize.splitStyle}
    >
      <aside className="launches-reference-errors-list">
        <div className="launches-reference-errors-content" ref={errorListRef}>
          <div className="launches-reference-errors-heading">
            <div>
              <h2>Ошибки</h2>
              <p>
                {summary === undefined
                  ? summaryState.status === "error"
                    ? "Сводка всего запуска недоступна; показаны загруженные результаты"
                    : "Загружаем сводку всего запуска…"
                  : `Весь запуск · ${summary.failedResults + summary.brokenResults} результатов с ошибкой`}
              </p>
            </div>
            {onShowProblemResults !== undefined ? (
              <button onClick={onShowProblemResults} type="button">
                Все проблемные
              </button>
            ) : null}
          </div>
          {summaryState.status === "error" ? (
            <div className="launches-reference-errors-notice" role="alert">
              Не удалось получить все группы ошибок.
              <button onClick={() => setSummaryRetry((value) => value + 1)} type="button">
                Повторить
              </button>
            </div>
          ) : null}
          {summary !== undefined &&
          selectedErrorResult !== undefined &&
          selectedErrorGroupIndex < 0 ? (
            <p className="launches-reference-errors-notice" role="status">
              Открытый результат не входит в краткий список примеров. Остальные результаты доступны
              во вкладке «Результаты тестов».
            </p>
          ) : null}
          <div className="launches-reference-error-header">
            <span>Причина</span>
            <span>Результатов</span>
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
            <div className="launches-reference-centered">
              {summaryState.status === "error"
                ? "Загруженные результаты не содержат ошибок"
                : "Ожидаем сводку ошибок…"}
            </div>
          ) : (
            errorGroups.map((group, index) => (
              <details
                className="launches-reference-error-group"
                key={group.name}
                open={index === expandedErrorGroupIndex}
              >
                <summary>
                  <ChevronRight size={18} />
                  <span title={group.name}>{formatLaunchErrorGroupHeading(group.name)}</span>
                  {group.failed > 0 ? (
                    <em aria-label={`Проваленных: ${group.failed}`} className="failed">
                      {group.failed}
                    </em>
                  ) : null}
                  {group.broken > 0 ? (
                    <em aria-label={`Сломанных: ${group.broken}`} className="broken">
                      {group.broken}
                    </em>
                  ) : null}
                </summary>
                <div className="launches-reference-error-results">
                  {group.examples.map((result) => (
                    <button
                      className={
                        (selectedErrorResult?.id ?? firstErrorId) === result.id &&
                        (!mobile || requestedResultId !== undefined)
                          ? "selected"
                          : ""
                      }
                      key={result.id}
                      type="button"
                      onClick={() => {
                        setExplicitErrorResultId(result.id);
                        onSelectResult(result.id);
                      }}
                    >
                      <StatusIcon status={result.status} />
                      <span>{result.name}</span>
                      <small>{result.duration}</small>
                    </button>
                  ))}
                  {group.resultsTruncated ? (
                    <span className="launches-reference-errors-more">
                      Показаны {group.examples.length} из {group.failed + group.broken}. Все
                      результаты доступны во вкладке «Результаты тестов».
                    </span>
                  ) : null}
                </div>
              </details>
            ))
          )}
          {summary?.groupsTruncated ? (
            <p className="launches-reference-errors-more">
              Показаны первые {summary.groups.length} из {summary.totalGroups} групп. Полный список
              результатов доступен во вкладке «Результаты тестов».
            </p>
          ) : null}
        </div>
      </aside>

      <LaunchSplitResizer label="Изменить ширину списка ошибок" resize={splitResize} />

      <section className="launches-reference-detail-pane">
        {requestedResultId !== undefined ? (
          <button className="launches-reference-mobile-back" onClick={onCloseResult} type="button">
            ← К списку ошибок
          </button>
        ) : null}
        {(loading || summaryState.status === "loading") &&
        selectedErrorResult?.trace === undefined ? (
          <ReferenceRouteState
            kind="loading"
            title="Загружаем отчет ошибки"
            text="Правая панель откроется, когда появится результат с ошибкой."
          />
        ) : selectedErrorResult === undefined ? (
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
