import { ArrowUpRight, ChevronLeft, ChevronRight, Link2Off } from "lucide-react";
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";

import type {
  LaunchListItem,
  ResultParameter,
  ResultStatus,
  TestResult,
  WorkspaceListPage
} from "../m1Workspace.js";
import { formatStatus } from "./LaunchesReferenceFormatters.js";
import {
  collectLaunchParameters,
  defaultOverviewListPageSize,
  getLaunchTotal,
  overviewListPageSizeOptions,
  type DefectOverviewItem
} from "./LaunchesReferenceModel.js";
import { formatResultDuration } from "./LaunchesResultDuration.js";
import { resultStatusGroupLabels, resultStatusOrder } from "./resultStatusPresentation.js";
import { useLaunchLinkedIssues } from "./useLaunchLinkedIssues.js";

const overviewStatusOrder: ResultStatus[] = resultStatusOrder.filter(
  (status) => status !== "muted"
);
const overviewStatusColors: Record<ResultStatus, string> = {
  broken: "#f59e0b",
  failed: "#ef4444",
  muted: "#64748b",
  passed: "#10b981",
  skipped: "#94a3b8",
  unknown: "#6366f1"
};

export function OverviewTab({
  launch,
  onSelectAll,
  onSelectProblemResults,
  onSelectResult,
  onSelectStatus,
  results
}: {
  launch: LaunchListItem;
  onSelectAll: () => void;
  onSelectProblemResults?: (() => void) | undefined;
  onSelectResult: (id: string) => void;
  onSelectStatus: (status: ResultStatus) => void;
  results: TestResult[];
}) {
  const total = getLaunchTotal(launch);
  const unresolved = results.filter(
    (result) => result.status === "failed" || result.status === "broken"
  );
  const problemTotal = launch.counters.failed + launch.counters.broken;
  const linkedIssues = useLaunchLinkedIssues(launch);
  const linkedIssuePage =
    linkedIssues.state.status === "ready" ? linkedIssues.state.data : undefined;
  const defectItems: DefectOverviewItem[] =
    linkedIssuePage?.items.map((issue) => ({
      id: issue.id,
      resultId: issue.resultUuid,
      subtitle: "",
      title: issue.resultName
    })) ?? [];
  const hasUnloadedResults = total > results.length;
  const parameters = collectLaunchParameters(launch, results);
  const passRate = total > 0 ? Math.round((launch.counters.passed / total) * 100) : 0;
  const chartSegments = overviewStatusOrder.map((status) => {
    const count = launch.counters[status];
    const percent = total > 0 ? (count / total) * 100 : 0;
    return { count, percent, status };
  });

  return (
    <div className="launches-reference-overview">
      <section className="launches-reference-card launches-reference-overview-summary">
        <div className="launches-reference-overview-summary-heading">
          <h2>Результаты запуска</h2>
          <button type="button" onClick={onSelectAll}>
            Все результаты
            <ArrowUpRight aria-hidden="true" size={16} />
          </button>
        </div>
        <div className="launches-reference-overview-summary-main">
          <button
            aria-label={`Успешные: ${launch.counters.passed.toLocaleString("ru-RU")} из ${total.toLocaleString("ru-RU")} (${passRate}%). Открыть успешные результаты`}
            className="launches-reference-overview-score"
            type="button"
            onClick={() => onSelectStatus("passed")}
          >
            <strong className="launches-reference-overview-score-value">
              {passRate}
              <span>%</span>
            </strong>
            <span className="launches-reference-overview-score-copy">
              <strong>Успешно</strong>
              <span>
                {launch.counters.passed.toLocaleString("ru-RU")} из {total.toLocaleString("ru-RU")}{" "}
                тестов
              </span>
            </span>
          </button>

          <div className="launches-reference-overview-breakdown">
            <div
              aria-label="Распределение результатов по статусам"
              className="launches-reference-overview-distribution"
              role="group"
            >
              {chartSegments.map((segment) =>
                segment.count > 0 ? (
                  <button
                    aria-label={`${resultStatusGroupLabels[segment.status]}: ${segment.count.toLocaleString("ru-RU")} (${Math.round(segment.percent)}%). Открыть результаты с этим статусом`}
                    className={`is-${segment.status}${segment.percent < 8 ? " is-narrow" : ""}`}
                    key={segment.status}
                    style={
                      {
                        "--segment-color": overviewStatusColors[segment.status],
                        flexGrow: segment.count
                      } as CSSProperties
                    }
                    title={`${resultStatusGroupLabels[segment.status]}: ${segment.count.toLocaleString("ru-RU")} (${Math.round(segment.percent)}%)`}
                    type="button"
                    onClick={() => onSelectStatus(segment.status)}
                  >
                    <span aria-hidden="true">{segment.count.toLocaleString("ru-RU")}</span>
                  </button>
                ) : null
              )}
            </div>
            <ul className="launches-reference-overview-legend" aria-label="Фильтры по статусу">
              {chartSegments.map((segment) => (
                <li key={segment.status}>
                  <button
                    aria-label={`${resultStatusGroupLabels[segment.status]}: ${segment.count.toLocaleString("ru-RU")}. Открыть результаты с этим статусом`}
                    className={`launches-reference-overview-legend-item is-${segment.status}${segment.count === 0 ? " is-empty" : ""}`}
                    type="button"
                    onClick={() => onSelectStatus(segment.status)}
                  >
                    <i style={{ backgroundColor: overviewStatusColors[segment.status] }} />
                    <span>{resultStatusGroupLabels[segment.status]}</span>
                    <strong>{segment.count.toLocaleString("ru-RU")}</strong>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <div className="launches-reference-overview-content">
        <section className="launches-reference-card launches-reference-overview-card-unresolved">
          <OverviewCardTitle
            action={
              onSelectProblemResults !== undefined ? (
                <button type="button" onClick={onSelectProblemResults}>
                  Все проблемные <ArrowUpRight aria-hidden="true" size={15} />
                </button>
              ) : undefined
            }
            count={hasUnloadedResults ? problemTotal : unresolved.length}
            note={hasUnloadedResults ? `из них ${unresolved.length} загружено` : "во всём запуске"}
            tone="attention"
          >
            Проблемные результаты
          </OverviewCardTitle>
          <div className="launches-reference-overview-scope">
            <span>
              Проваленные и сломанные тесты
              {hasUnloadedResults ? ` среди ${results.length} загруженных результатов.` : "."}
            </span>
          </div>
          <PagedResultList
            emptyText={
              hasUnloadedResults
                ? "Среди загруженных результатов нет проваленных или сломанных."
                : "В запуске нет проваленных или сломанных результатов."
            }
            results={unresolved}
            onSelectResult={onSelectResult}
          />
        </section>

        <div className="launches-reference-overview-side">
          <section className="launches-reference-card launches-reference-overview-card-defects">
            <OverviewCardTitle count={linkedIssuePage?.page.total}>
              Связанные дефекты
            </OverviewCardTitle>
            <p className="launches-reference-overview-scope-copy">
              ID дефектов, указанные в результатах запуска.
            </p>
            {linkedIssues.state.status === "loading" ? (
              <div className="launches-reference-centered" role="status">
                Загружаем связанные дефекты…
              </div>
            ) : linkedIssues.state.status === "error" ? (
              <div className="launches-reference-overview-defects-error" role="alert">
                <span>Не удалось загрузить связанные дефекты.</span>
                <button type="button" onClick={linkedIssues.retry}>
                  Повторить
                </button>
              </div>
            ) : (
              <PagedDefectList
                emptyText="В запуске нет связанных дефектов."
                items={defectItems}
                page={linkedIssuePage?.page}
                onPageIndexChange={linkedIssues.setPageIndex}
                onPageSizeChange={linkedIssues.setPageSize}
                onSelectResult={onSelectResult}
              />
            )}
          </section>

          <section className="launches-reference-card launches-reference-overview-card-variables">
            <OverviewCardTitle count={parameters.length}>Переменные окружения</OverviewCardTitle>
            <PagedVariablesList parameters={parameters} />
          </section>
        </div>
      </div>
    </div>
  );
}

function OverviewCardTitle({
  action,
  children,
  count,
  note,
  tone
}: {
  action?: ReactNode;
  children: ReactNode;
  count?: number | undefined;
  note?: string;
  tone?: "attention";
}) {
  return (
    <div className={`launches-reference-overview-card-heading${tone ? ` is-${tone}` : ""}`}>
      <h2>{children}</h2>
      {count !== undefined ? <em>{count.toLocaleString("ru-RU")}</em> : null}
      {note ? <small>{note}</small> : null}
      {action ? <div className="launches-reference-overview-card-action">{action}</div> : null}
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
          <span />
        </div>
        {pager.visibleItems.map((result) => (
          <button key={result.id} type="button" onClick={() => onSelectResult(result.id)}>
            <span className="launches-reference-compact-result-copy">
              <strong>{result.name}</strong>
              <small>{result.suite}</small>
            </span>
            <span className="launches-reference-compact-result-duration">
              {formatResultDuration(result.duration)}
            </span>
            <StatusBadge status={result.status} />
            <ChevronRight
              aria-hidden="true"
              className="launches-reference-overview-row-chevron"
              size={16}
            />
          </button>
        ))}
      </div>
    </PagedCardContent>
  );
}

export function PagedDefectList({
  emptyText,
  items,
  onPageIndexChange,
  onPageSizeChange,
  onSelectResult,
  page
}: {
  emptyText: string;
  items: DefectOverviewItem[];
  onPageIndexChange?: (index: number) => void;
  onPageSizeChange?: (size: number) => void;
  onSelectResult: (id: string) => void;
  page?: WorkspaceListPage | undefined;
}) {
  const localPager = usePagedItems(items);
  const pager: PagedItems<DefectOverviewItem> =
    page === undefined
      ? localPager
      : {
          currentPage: Math.floor(page.offset / page.limit),
          endIndex: page.offset + page.returned,
          goToNextPage: () => onPageIndexChange?.(Math.floor(page.offset / page.limit) + 1),
          goToPreviousPage: () => onPageIndexChange?.(Math.floor(page.offset / page.limit) - 1),
          pageCount: Math.max(1, Math.ceil(page.total / page.limit)),
          pageSize: page.limit,
          setPageSize: (size) => onPageSizeChange?.(size),
          startIndex: page.offset,
          totalItems: page.total,
          visibleItems: items
        };

  if (items.length === 0) {
    return (
      <div className="launches-reference-centered launches-reference-defects-empty" role="status">
        <span className="launches-reference-defects-empty-icon">
          <Link2Off aria-hidden="true" />
        </span>
        <span className="launches-reference-defects-empty-copy">
          <strong>{emptyText}</strong>
        </span>
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
              {item.subtitle ? <small>{item.subtitle}</small> : null}
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
