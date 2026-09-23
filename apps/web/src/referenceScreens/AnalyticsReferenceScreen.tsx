import { AlertTriangle, BarChart3, CheckCircle2, Clock3, Search, ShieldAlert } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

import type { TestResult } from "../m1Workspace.js";
import { getJson } from "../apiHttp.js";

import "./AnalyticsReferenceScreen.css";
import {
  buildAnalyticsModel,
  buildServerAnalyticsModel,
  formatCount,
  formatDurationMilliseconds,
  formatLaunchSeriesCount,
  formatStatus,
  formatTrendDate,
  type AnalyticsSignal
} from "./AnalyticsReferenceModel.js";
import { useProjectAnalyticsResults } from "./AnalyticsReferenceData.js";

type AnalyticsReferenceScreenProps = {
  projectId?: string | undefined;
  results: TestResult[];
  onOpenResult?: ((id: string, launchId?: string) => void) | undefined;
};

type AnalyticsRunReadModel = {
  result: {
    metrics: {
      count: number;
      statusCounters: Record<string, number>;
      passRate: number | null;
      failureRate: number | null;
      averageDurationMs: number | null;
      p50DurationMs: number | null;
      p95DurationMs: number | null;
    };
    series: Array<{
      id: string;
      name: string;
      createdAt: string;
      metrics: { count: number; passRate: number | null; averageDurationMs: number | null };
    }>;
  };
};

export function AnalyticsReferenceScreen({
  projectId,
  results,
  onOpenResult
}: AnalyticsReferenceScreenProps) {
  const [query, setQuery] = useState("");
  const [analyticsRead, setAnalyticsRead] = useState<{
    projectId: string;
    result: AnalyticsRunReadModel["result"];
  }>();
  const localModel = useMemo(() => buildAnalyticsModel(results, query), [query, results]);
  const projectResults = useProjectAnalyticsResults(projectId, query);
  const serverReady = projectResults.status === "ready" && projectResults.read !== undefined;
  const trendRead = analyticsRead?.projectId === projectId ? analyticsRead?.result : undefined;
  const model = useMemo(
    () =>
      serverReady && projectResults.read !== undefined
        ? buildServerAnalyticsModel(projectResults.read)
        : localModel,
    [localModel, projectResults.read, serverReady]
  );

  useEffect(() => {
    if (projectId === undefined) return;
    const controller = new AbortController();
    getJson<AnalyticsRunReadModel>("/api/v1/analytics/run", {
      method: "POST",
      signal: controller.signal,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: { entity: "results", projectId, groupBy: ["status"] } })
    })
      .then((read) => setAnalyticsRead({ projectId, result: read.result }))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setAnalyticsRead(undefined);
      });
    return () => controller.abort();
  }, [projectId]);

  return (
    <section
      className="analytics-reference-screen product-view analytics-view"
      aria-label="Аналитика"
      aria-busy={projectResults.status === "loading"}
    >
      <header className="analytics-reference-header">
        <div className="analytics-reference-header-copy">
          <p className="analytics-reference-kicker">Рабочая аналитика</p>
          <h1>Аналитика</h1>
          <span>
            {serverReady ? (
              <>
                Найдено {formatCount(model.filteredTotal)} из {formatCount(model.total)} результатов
                проекта
              </>
            ) : projectResults.status === "loading" ? (
              "Загружаем весь проект · Пока показан загруженный фрагмент"
            ) : (
              <>
                {projectResults.status === "error" ? "Полная аналитика недоступна · " : null}
                Показано {formatCount(model.filteredTotal)} из {formatCount(model.total)}{" "}
                загруженных результатов
              </>
            )}
          </span>
        </div>
        <label className="analytics-reference-search">
          <Search size={16} />
          <input
            aria-label="Поиск аналитических сигналов"
            placeholder="Поиск тестов"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
      </header>

      <div className="analytics-reference-summary" aria-label="Сводка аналитики">
        <MetricTile
          icon={<CheckCircle2 size={22} strokeWidth={2} />}
          label="Успешность"
          value={model.passRate}
          note={`${formatCount(model.counts.passed)} пройдено`}
          tone="passed"
        />
        <MetricTile
          icon={<ShieldAlert size={22} strokeWidth={2} />}
          label="Открытые риски"
          value={formatCount(model.openRisks)}
          note={`${formatCount(model.counts.failed)} провалено, ${formatCount(model.counts.broken)} сломано`}
          tone="failed"
        />
        <MetricTile
          icon={<Clock3 size={22} strokeWidth={2} />}
          label="Средняя длительность"
          value={model.averageDuration}
          note={`${formatCount(model.slowCount)} медленных сигналов`}
          tone="accent"
        />
        <MetricTile
          icon={<AlertTriangle size={22} strokeWidth={2} />}
          label="Нестабильные кандидаты"
          value={formatCount(model.flakyCount)}
          note={
            serverReady && projectResults.read?.metrics.flakyDataComplete === false
              ? "Часть истории недоступна"
              : "История меняла статус"
          }
          tone="broken"
        />
      </div>

      {query.trim() === "" && trendRead !== undefined && trendRead.series.length > 0 ? (
        <section className="analytics-reference-trend" aria-label="Динамика запусков">
          <div className="analytics-reference-panel-title">
            <BarChart3 size={18} />
            <h3>Динамика запусков</h3>
            <span>{formatLaunchSeriesCount(Math.min(12, trendRead.series.length))}</span>
          </div>
          <div
            className="analytics-reference-trend-bars"
            style={{
              gridTemplateColumns: `repeat(${Math.min(12, trendRead.series.length)}, minmax(120px, 1fr))`
            }}
          >
            {trendRead.series.slice(-12).map((point) => {
              const percent = Math.round((point.metrics.passRate ?? 0) * 100);
              return (
                <article key={point.id} title={`${point.name}: ${percent}%`}>
                  <div>
                    <i style={{ height: `${Math.max(3, percent)}%` }} />
                  </div>
                  <strong>{percent}%</strong>
                  <small className="analytics-reference-trend-name">{point.name}</small>
                  <span>{formatTrendDate(point.createdAt)}</span>
                </article>
              );
            })}
          </div>
          <div className="analytics-reference-percentiles">
            <span>
              <small>Медиана</small>
              <strong>{formatDurationMilliseconds(trendRead.metrics.p50DurationMs)}</strong>
            </span>
            <span>
              <small>95-й перцентиль</small>
              <strong>{formatDurationMilliseconds(trendRead.metrics.p95DurationMs)}</strong>
            </span>
            <span>
              <small>Результатов</small>
              <strong>{formatCount(trendRead.metrics.count)}</strong>
            </span>
          </div>
        </section>
      ) : null}

      <div className="analytics-reference-grid">
        <section className="analytics-reference-panel" aria-label="Статусы результатов">
          <div className="analytics-reference-panel-title">
            <BarChart3 size={18} />
            <h3>Статусы</h3>
          </div>
          <div className="analytics-reference-status-list">
            {model.statusMetrics.map((metric) => (
              <div
                className={`analytics-reference-status-row analytics-reference-status-row--${metric.status}`}
                key={metric.status}
              >
                <span>{formatStatus(metric.status)}</span>
                <div
                  aria-label={`${formatStatus(metric.status)}: ${formatCount(metric.count)}, ${metric.percent}`}
                  aria-valuemax={100}
                  aria-valuemin={0}
                  aria-valuenow={Number.parseInt(metric.percent, 10)}
                  className="analytics-reference-status-track"
                  role="progressbar"
                >
                  <i style={{ width: metric.percent }} />
                </div>
                <strong>{formatCount(metric.count)}</strong>
                <em>{metric.percent}</em>
              </div>
            ))}
          </div>
        </section>

        <section className="analytics-reference-panel" aria-label="Риск-сигналы">
          <div className="analytics-reference-panel-title">
            <ShieldAlert size={18} />
            <h3>Приоритетные сигналы</h3>
          </div>
          <div className="analytics-reference-signal-list">
            {model.prioritySignals.length > 0 ? (
              model.prioritySignals.map((result) => (
                <SignalRow key={result.id} result={result} onOpenResult={onOpenResult} />
              ))
            ) : (
              <p className="analytics-reference-empty-note">
                Критичных падений в текущем фильтре нет
              </p>
            )}
          </div>
        </section>

        <section className="analytics-reference-panel" aria-label="Медленные тесты">
          <div className="analytics-reference-panel-title">
            <Clock3 size={18} />
            <h3>Медленные тесты</h3>
          </div>
          <div className="analytics-reference-signal-list">
            {model.slowSignals.length > 0 ? (
              model.slowSignals.map((result) => (
                <SignalRow key={result.id} result={result} onOpenResult={onOpenResult} />
              ))
            ) : (
              <p className="analytics-reference-empty-note">
                Нет медленных тестов в текущем фильтре
              </p>
            )}
          </div>
        </section>
      </div>

      <section className="analytics-reference-table-panel" aria-label="Аналитические сигналы">
        <div className="analytics-reference-panel-title">
          <BarChart3 size={18} />
          <h3>Сигналы</h3>
          <span>
            Показано {formatCount(model.visibleSignals.length)} из{" "}
            {formatCount(model.filteredTotal)}
          </span>
        </div>
        <div className="analytics-reference-table" role="table">
          <div className="analytics-reference-table-head" role="row">
            <span role="columnheader">Тест</span>
            <span role="columnheader">Статус</span>
            <span role="columnheader">Набор</span>
            <span role="columnheader">Владелец</span>
            <span role="columnheader">Длительность</span>
          </div>
          {model.visibleSignals.map((result) => (
            <div className="analytics-reference-signal-row" key={result.id} role="row">
              <strong role="cell">
                {onOpenResult === undefined ? (
                  result.name
                ) : (
                  <button
                    className="analytics-reference-result-link"
                    onClick={() => openResult(result, onOpenResult)}
                    type="button"
                  >
                    {result.name}
                  </button>
                )}
              </strong>
              <span
                className={`analytics-reference-status-badge analytics-reference-status-badge--${result.status}`}
                role="cell"
              >
                {formatStatus(result.status)}
              </span>
              <span role="cell">{result.suite}</span>
              <span role="cell">{result.owner || "Не назначен"}</span>
              <em role="cell">{result.duration}</em>
            </div>
          ))}
          {model.visibleSignals.length === 0 ? (
            <p className="analytics-reference-table-empty">Нет сигналов в текущем фильтре</p>
          ) : null}
        </div>
        {serverReady && projectResults.read?.page.hasMore ? (
          <div className="analytics-reference-table-footer">
            <button
              disabled={projectResults.loadingMore}
              onClick={projectResults.loadMore}
              type="button"
            >
              {projectResults.loadingMore ? "Загружаем…" : "Показать ещё"}
            </button>
            {projectResults.pageError ? (
              <span role="alert">Следующую страницу загрузить не удалось. Повторите попытку.</span>
            ) : null}
          </div>
        ) : null}
      </section>
    </section>
  );
}

function MetricTile({
  icon,
  label,
  note,
  tone,
  value
}: {
  icon: ReactNode;
  label: string;
  note: string;
  tone: "accent" | "broken" | "failed" | "passed";
  value: string;
}) {
  return (
    <article className={`analytics-reference-metric analytics-reference-metric--${tone}`}>
      <span>{icon}</span>
      <div>
        <small>{label}</small>
        <strong>{value}</strong>
        <em>{note}</em>
      </div>
    </article>
  );
}

function openResult(
  result: AnalyticsSignal,
  onOpenResult: (id: string, launchId?: string) => void
) {
  onOpenResult(result.resultId ?? result.id, result.launchId);
}

function SignalRow({
  result,
  onOpenResult
}: {
  result: AnalyticsSignal;
  onOpenResult?: ((id: string, launchId?: string) => void) | undefined;
}) {
  const metadata = [result.suite, result.owner].filter(Boolean).join(" · ");

  return (
    <article className="analytics-reference-signal-card">
      <div>
        <strong>
          {onOpenResult === undefined ? (
            result.name
          ) : (
            <button
              className="analytics-reference-result-link"
              onClick={() => openResult(result, onOpenResult)}
              type="button"
            >
              {result.name}
            </button>
          )}
        </strong>
        {metadata.length > 0 ? <span>{metadata}</span> : null}
      </div>
      <em
        className={`analytics-reference-status-badge analytics-reference-status-badge--${result.status}`}
      >
        {formatStatus(result.status)}
      </em>
      <small>{result.duration}</small>
    </article>
  );
}
