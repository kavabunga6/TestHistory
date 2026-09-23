import { ArrowUpRight, CheckCircle2, ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";

import type { LaunchListItem, ResultParameter, ResultStatus, TestResult } from "../m1Workspace.js";
import { formatStatus } from "./LaunchesReferenceFormatters.js";
import {
  collectDefectItems,
  collectLaunchParameters,
  defaultOverviewListPageSize,
  getLaunchTotal,
  overviewListPageSizeOptions,
  type DefectOverviewItem
} from "./LaunchesReferenceModel.js";
import { formatResultDuration } from "./LaunchesResultDuration.js";

const overviewStatusOrder: ResultStatus[] = ["passed", "failed", "broken", "skipped"];

const overviewStatusLabels: Record<ResultStatus, string> = {
  broken: "Сломаны и неизвестны",
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
        <div className="launches-reference-overview-summary-heading">
          <span className="launches-reference-overview-eyebrow">Итог запуска</span>
          <h2>Распределение результатов</h2>
          <button type="button" onClick={onSelectAll}>
            Все результаты
            <ArrowUpRight aria-hidden="true" size={16} />
          </button>
        </div>
        <div className="launches-reference-overview-summary-main">
          <div className="launches-reference-overview-score">
            <div className="launches-reference-overview-donut-wrap">
              <svg
                aria-label={`Результаты запуска: ${total.toLocaleString("ru-RU")} тестов`}
                className="launches-reference-overview-donut"
                role="group"
                viewBox="0 0 180 180"
              >
                <circle
                  className="launches-reference-overview-donut-track"
                  cx="90"
                  cy="90"
                  r="68"
                />
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
                <strong>
                  {passRate}
                  <span>%</span>
                </strong>
                <span>успех</span>
              </button>
            </div>
            <div className="launches-reference-overview-score-copy">
              <span>Успешные тесты</span>
              <strong>
                {launch.counters.passed.toLocaleString("ru-RU")}
                <small> / {total.toLocaleString("ru-RU")}</small>
              </strong>
              <p>результатов запуска</p>
            </div>
          </div>

          <div className="launches-reference-overview-breakdown">
            <div className="launches-reference-overview-distribution" aria-hidden="true">
              {chartSegments.map((segment) =>
                segment.count > 0 ? (
                  <span
                    key={segment.status}
                    style={{
                      backgroundColor: overviewStatusColors[segment.status],
                      flexGrow: segment.count
                    }}
                  />
                ) : null
              )}
            </div>
            <ul className="launches-reference-overview-legend" aria-label="Фильтры по статусу">
              {chartSegments.map((segment) => (
                <li key={segment.status}>
                  <button
                    aria-label={`${overviewStatusLabels[segment.status]}: ${segment.count.toLocaleString("ru-RU")}. ${segment.status === "broken" ? "Открыть оба статуса" : "Открыть результаты с этим статусом"}`}
                    className={`launches-reference-overview-legend-item is-${segment.status}`}
                    title={
                      segment.status === "broken"
                        ? "Показать сломанные результаты и результаты с неопределённым статусом"
                        : undefined
                    }
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
        </div>
      </section>

      <div className="launches-reference-overview-content">
        <section className="launches-reference-card launches-reference-overview-card-unresolved">
          <OverviewCardTitle count={unresolved.length} note="среди загруженных" tone="attention">
            Неразобранные результаты
          </OverviewCardTitle>
          <PagedResultList
            emptyText="В запуске пока нет неразобранных результатов."
            results={unresolved}
            onSelectResult={onSelectResult}
          />
        </section>

        <div className="launches-reference-overview-side">
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
      </div>
    </div>
  );
}

function OverviewCardTitle({
  children,
  count,
  note,
  tone
}: {
  children: ReactNode;
  count: number;
  note?: string;
  tone?: "attention";
}) {
  return (
    <div className={`launches-reference-overview-card-heading${tone ? ` is-${tone}` : ""}`}>
      <h2>{children}</h2>
      <em>{count.toLocaleString("ru-RU")}</em>
      {note ? <small>{note}</small> : null}
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
  onSelectResult
}: {
  emptyText: string;
  items: DefectOverviewItem[];
  onSelectResult: (id: string) => void;
}) {
  const pager = usePagedItems(items);

  if (items.length === 0) {
    return (
      <div className="launches-reference-centered launches-reference-defects-empty" role="status">
        <span className="launches-reference-defects-empty-icon">
          <CheckCircle2 aria-hidden="true" />
        </span>
        <span className="launches-reference-defects-empty-copy">
          <strong>{emptyText}</strong>
          <small>Связанные с результатами дефекты появятся здесь.</small>
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
