import { AlertTriangle, BarChart3, CheckCircle2, Clock3, Search, ShieldAlert } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

import type { ResultStatus, TestResult } from "../m1Workspace.js";
import { getJson } from "../apiHttp.js";

import "./AnalyticsReferenceScreen.css";

type AnalyticsReferenceScreenProps = {
  projectId?: string | undefined;
  results: TestResult[];
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

type StatusMetric = {
  status: ResultStatus;
  count: number;
  percent: string;
};

const statusOrder: ResultStatus[] = ["failed", "broken", "passed", "skipped", "muted"];
const signalLimit = 50;

export function AnalyticsReferenceScreen({ projectId, results }: AnalyticsReferenceScreenProps) {
  const [query, setQuery] = useState("");
  const [analyticsRead, setAnalyticsRead] = useState<AnalyticsRunReadModel["result"]>();
  const model = useMemo(() => buildAnalyticsModel(results, query), [query, results]);

  useEffect(() => {
    if (projectId === undefined) return;
    const controller = new AbortController();
    getJson<AnalyticsRunReadModel>("/api/v1/analytics/run", {
      method: "POST",
      signal: controller.signal,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: { entity: "results", projectId, groupBy: ["status"] } })
    })
      .then((read) => setAnalyticsRead(read.result))
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
    >
      <header className="analytics-reference-header">
        <div className="analytics-reference-header-copy">
          <p className="analytics-reference-kicker">Рабочая аналитика</p>
          <h1>Аналитика</h1>
          <span>
            {formatCount(model.total)} результатов в текущем срезе,{" "}
            {formatCount(model.filteredTotal)} после фильтра
          </span>
        </div>
        <label className="analytics-reference-search">
          <Search size={16} />
          <input
            aria-label="Поиск аналитических сигналов"
            placeholder="Поиск по тесту, сьюту, владельцу, задаче"
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
          value={
            analyticsRead?.metrics.passRate === null || analyticsRead === undefined
              ? model.passRate
              : formatRate(analyticsRead.metrics.passRate)
          }
          note={`${formatCount(analyticsRead?.metrics.statusCounters.passed ?? model.counts.passed)} пройдено`}
          tone="passed"
        />
        <MetricTile
          icon={<ShieldAlert size={22} strokeWidth={2} />}
          label="Открытые риски"
          value={formatCount(
            analyticsRead === undefined
              ? model.openRisks
              : (analyticsRead.metrics.statusCounters.failed ?? 0) +
                  (analyticsRead.metrics.statusCounters.broken ?? 0)
          )}
          note={`${formatCount(analyticsRead?.metrics.statusCounters.failed ?? model.counts.failed)} провалено, ${formatCount(analyticsRead?.metrics.statusCounters.broken ?? model.counts.broken)} сломано`}
          tone="failed"
        />
        <MetricTile
          icon={<Clock3 size={22} strokeWidth={2} />}
          label="Средняя длительность"
          value={
            analyticsRead?.metrics.averageDurationMs === null || analyticsRead === undefined
              ? model.averageDuration
              : formatDurationMilliseconds(analyticsRead.metrics.averageDurationMs)
          }
          note={`${formatCount(model.slowSignals.length)} медленных сигналов`}
          tone="accent"
        />
        <MetricTile
          icon={<AlertTriangle size={22} strokeWidth={2} />}
          label="Нестабильные кандидаты"
          value={formatCount(model.flakyCandidates.length)}
          note="История меняла статус"
          tone="broken"
        />
      </div>

      {analyticsRead !== undefined && analyticsRead.series.length > 0 ? (
        <section className="analytics-reference-trend" aria-label="Динамика запусков">
          <div className="analytics-reference-panel-title">
            <BarChart3 size={18} />
            <h3>Динамика запусков</h3>
            <span>{formatLaunchSeriesCount(Math.min(12, analyticsRead.series.length))}</span>
          </div>
          <div className="analytics-reference-trend-bars">
            {analyticsRead.series.slice(-12).map((point) => {
              const percent = Math.round((point.metrics.passRate ?? 0) * 100);
              return (
                <article key={point.id} title={`${point.name}: ${percent}%`}>
                  <div>
                    <i style={{ height: `${Math.max(3, percent)}%` }} />
                  </div>
                  <strong>{percent}%</strong>
                  <span>{formatTrendDate(point.createdAt)}</span>
                </article>
              );
            })}
          </div>
          <div className="analytics-reference-percentiles">
            <span>
              <small>Медиана</small>
              <strong>{formatDurationMilliseconds(analyticsRead.metrics.p50DurationMs)}</strong>
            </span>
            <span>
              <small>95-й перцентиль</small>
              <strong>{formatDurationMilliseconds(analyticsRead.metrics.p95DurationMs)}</strong>
            </span>
            <span>
              <small>Результатов</small>
              <strong>{formatCount(analyticsRead.metrics.count)}</strong>
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
              model.prioritySignals.map((result) => <SignalRow key={result.id} result={result} />)
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
              model.slowSignals.map((result) => <SignalRow key={result.id} result={result} />)
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
              <strong role="cell">{result.name}</strong>
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

function SignalRow({ result }: { result: TestResult }) {
  const metadata = [result.suite, result.owner].filter(Boolean).join(" · ");

  return (
    <article className="analytics-reference-signal-card">
      <div>
        <strong>{result.name}</strong>
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

function buildAnalyticsModel(results: TestResult[], query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  const filtered = normalizedQuery
    ? results.filter((result) => matchesResult(result, normalizedQuery))
    : results;
  const counts = countStatuses(filtered);
  const filteredTotal = filtered.length;
  const passRate =
    filteredTotal > 0 ? `${Math.round((counts.passed / filteredTotal) * 100)}%` : "0%";
  const durations = filtered
    .map((result) => parseDurationSeconds(result.duration))
    .filter((item) => item > 0);
  const averageDuration =
    durations.length > 0
      ? formatDurationSeconds(durations.reduce((sum, item) => sum + item, 0) / durations.length)
      : "Нет данных";
  const prioritySignals = filtered
    .filter((result) => result.status === "failed" || result.status === "broken")
    .sort(
      (left, right) => parseDurationSeconds(right.duration) - parseDurationSeconds(left.duration)
    )
    .slice(0, 6);
  const slowSignals = filtered
    .filter((result) => parseDurationSeconds(result.duration) >= 2)
    .sort(
      (left, right) => parseDurationSeconds(right.duration) - parseDurationSeconds(left.duration)
    )
    .slice(0, 6);
  const flakyCandidates = filtered.filter((result) => new Set(result.history).size > 1);
  const visibleSignals = filtered
    .slice()
    .sort((left, right) => {
      const riskDelta = statusRiskScore(right.status) - statusRiskScore(left.status);
      return riskDelta !== 0
        ? riskDelta
        : parseDurationSeconds(right.duration) - parseDurationSeconds(left.duration);
    })
    .slice(0, signalLimit);
  const statusMetrics: StatusMetric[] = statusOrder.map((status) => ({
    count: counts[status],
    percent: filteredTotal > 0 ? `${Math.round((counts[status] / filteredTotal) * 100)}%` : "0%",
    status
  }));

  return {
    averageDuration,
    counts,
    filteredTotal,
    flakyCandidates,
    openRisks: counts.failed + counts.broken,
    passRate,
    prioritySignals,
    slowSignals,
    statusMetrics,
    total: results.length,
    visibleSignals
  };
}

function matchesResult(result: TestResult, query: string): boolean {
  return [
    result.id,
    result.allureId,
    result.name,
    result.suite,
    result.owner,
    result.status,
    result.severity,
    result.layer,
    result.defect ?? "",
    ...result.tags,
    ...result.issues,
    ...result.testKeys
  ]
    .join(" ")
    .toLowerCase()
    .includes(query);
}

function countStatuses(results: TestResult[]): Record<ResultStatus, number> {
  const counts = statusOrder.reduce(
    (accumulator, status) => {
      accumulator[status] = 0;
      return accumulator;
    },
    {} as Record<ResultStatus, number>
  );

  for (const result of results) {
    counts[result.status] += 1;
  }

  return counts;
}

function statusRiskScore(status: ResultStatus): number {
  switch (status) {
    case "failed":
      return 5;
    case "broken":
      return 4;
    case "muted":
      return 2;
    case "skipped":
      return 1;
    case "passed":
      return 0;
  }
}

function formatStatus(status: ResultStatus): string {
  switch (status) {
    case "passed":
      return "Пройден";
    case "failed":
      return "Провален";
    case "broken":
      return "Сломан";
    case "skipped":
      return "Пропущен";
    case "muted":
      return "Карантин";
  }
}

function parseDurationSeconds(duration: string): number {
  const millisecondsMatch = duration.match(/(\d+(?:[.,]\d+)?)\s*ms/);
  const durationWithoutMilliseconds = duration.replace(/(\d+(?:[.,]\d+)?)\s*ms/g, "");
  const minutesMatch = durationWithoutMilliseconds.match(/(\d+(?:[.,]\d+)?)\s*m(?!s)/);
  const secondsMatch = durationWithoutMilliseconds.match(/(\d+(?:[.,]\d+)?)\s*s/);

  const minutes = parseDurationPart(minutesMatch?.[1]) * 60;
  const seconds = parseDurationPart(secondsMatch?.[1]);
  const milliseconds = parseDurationPart(millisecondsMatch?.[1]) / 1000;

  return minutes + seconds + milliseconds;
}

function parseDurationPart(value: string | undefined): number {
  return value === undefined ? 0 : Number.parseFloat(value.replace(",", ".")) || 0;
}

function formatDurationSeconds(duration: number): string {
  if (duration < 1) {
    return `${Math.round(duration * 1000)}ms`;
  }
  if (duration < 60) {
    return `${duration.toFixed(2).replace(/\.?0+$/, "")}s`;
  }
  const minutes = Math.floor(duration / 60);
  const seconds = Math.round(duration % 60);
  return `${minutes}m ${seconds}s`;
}

function formatCount(value: number): string {
  return new Intl.NumberFormat("ru-RU").format(value);
}

function formatRate(value: number): string {
  return `${Math.round(value * 1_000) / 10}%`;
}

function formatDurationMilliseconds(value: number | null): string {
  if (value === null) return "Нет данных";
  return formatDurationSeconds(value / 1_000);
}

function formatTrendDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit" }).format(date);
}

function formatLaunchSeriesCount(value: number): string {
  const mod10 = value % 10;
  const mod100 = value % 100;
  const noun =
    mod10 === 1 && mod100 !== 11
      ? "запуск"
      : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)
        ? "запуска"
        : "запусков";
  return `Последние ${value} ${noun}`;
}
