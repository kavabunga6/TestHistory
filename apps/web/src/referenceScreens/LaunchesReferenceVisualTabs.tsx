import type { ResultStatus, TestResult } from "../m1Workspace.js";
import { formatStatus } from "./LaunchesReferenceFormatters.js";
import {
  analyticsStatusOrder,
  buildDurationBuckets,
  collectTimelineRows,
  formatAverageDuration,
  getPartialStateMessage,
  type LaunchesReferencePartialState
} from "./LaunchesReferenceModel.js";
import { ReferenceRouteState } from "./LaunchesReferenceRouteState.js";
import { formatResultDuration } from "./LaunchesResultDuration.js";
import { StatusIcon } from "./LaunchesStatusIcon.js";

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
                <em>{formatResultDuration(row.duration)}</em>
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
  total
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
          const showCount = total > 0 && value / total >= 0.12;

          return (
            <span
              className={`is-${status}`}
              key={status}
              aria-label={`${formatStatus(status)}: ${value}`}
              style={{ flexBasis: 0, flexGrow: value }}
              title={`${formatStatus(status)}: ${value}`}
            >
              {showCount ? value.toLocaleString("ru-RU") : null}
            </span>
          );
        })}
      </div>
    </div>
  );
}
