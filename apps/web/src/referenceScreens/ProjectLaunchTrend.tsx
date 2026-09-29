import { ArrowUpRight, BarChart3, RefreshCw } from "lucide-react";

import { getHashFromRoute } from "../workspaceRouting.js";
import {
  formatCount,
  formatDurationMilliseconds,
  formatLaunchSeriesCount,
  formatTrendDate
} from "./AnalyticsReferenceModel.js";
import type { useProjectLaunchTrend } from "./useProjectLaunchTrend.js";

import "./ProjectLaunchTrend.css";

type Trend = ReturnType<typeof useProjectLaunchTrend>;

export function ProjectLaunchTrend({
  compact = false,
  trend
}: {
  compact?: boolean;
  trend: Trend;
}) {
  if (trend.status === "idle") return null;

  const points = trend.read?.series.slice(compact ? -6 : -12) ?? [];
  if (compact && trend.status === "ready" && points.length === 1) {
    return (
      <section
        aria-label="Динамика запусков проекта"
        className="project-launch-trend is-compact is-single-note"
      >
        <BarChart3 aria-hidden="true" size={17} />
        <span>Один запуск с результатами · динамика появится после следующего</span>
        <a href={getHashFromRoute({ mode: "analytics" })}>
          Вся аналитика <ArrowUpRight aria-hidden="true" size={14} />
        </a>
      </section>
    );
  }
  const latest = points.at(-1);
  const previous = points.at(-2);
  const latestPercent =
    latest?.metrics.passRate == null ? null : Math.round(latest.metrics.passRate * 100);
  const change =
    latest?.metrics.passRate != null && previous?.metrics.passRate != null
      ? Math.round((latest.metrics.passRate - previous.metrics.passRate) * 100)
      : null;

  return (
    <section
      aria-label="Динамика запусков проекта"
      className={`project-launch-trend${compact ? " is-compact" : " analytics-reference-trend"}`}
    >
      <header className="project-launch-trend__heading">
        <div className="project-launch-trend__title">
          <BarChart3 aria-hidden="true" size={17} />
          <div>
            <h2>{compact ? "Динамика проекта" : "Динамика запусков"}</h2>
            <span>
              {trend.status === "ready"
                ? points.length === 0
                  ? "Запусков с результатами пока нет"
                  : points.length === 1
                    ? "Один запуск с результатами"
                    : `${formatLaunchSeriesCount(points.length)} с результатами`
                : "Весь проект · успешность запусков"}
            </span>
          </div>
        </div>
        {compact ? (
          <a
            className="project-launch-trend__analytics-link"
            href={getHashFromRoute({ mode: "analytics" })}
          >
            Вся аналитика <ArrowUpRight aria-hidden="true" size={14} />
          </a>
        ) : null}
      </header>

      {trend.status === "loading" ? (
        <div className="project-launch-trend__state" role="status">
          Загружаем динамику запусков…
        </div>
      ) : trend.status === "error" ? (
        <div className="project-launch-trend__state is-error" role="alert">
          <span>Динамика проекта не загрузилась.</span>
          <button onClick={trend.retry} type="button">
            <RefreshCw aria-hidden="true" size={14} /> Повторить
          </button>
        </div>
      ) : trend.status === "denied" ? (
        <div className="project-launch-trend__state" role="status">
          Для просмотра динамики проекта нужны права на аналитику.
        </div>
      ) : points.length === 0 ? (
        <div className="project-launch-trend__state" role="status">
          Тренд появится после загрузки результатов в запуски проекта.
        </div>
      ) : points.length === 1 ? (
        <div className="project-launch-trend__single">
          <strong className={rateTone(latestPercent)}>
            {latestPercent === null ? "—" : `${latestPercent}%`}
          </strong>
          <div>
            <a href={getHashFromRoute({ mode: "launch", launchId: latest!.id })}>{latest?.name}</a>
            <span>
              {formatResultCount(latest?.metrics.count ?? 0)} · сравнение появится после следующего
              запуска
            </span>
          </div>
        </div>
      ) : (
        <>
          <nav aria-label="Запуски в динамике" className="project-launch-trend__chart">
            {points.map((point) => {
              const rate = point.metrics.passRate;
              const percent = rate === null ? null : Math.round(rate * 100);
              return (
                <a
                  aria-label={`${point.name}, ${formatTrendDate(point.createdAt)}: ${percent === null ? "нет данных об успешности" : `успешность ${percent}%`}, ${formatResultCount(point.metrics.count)}`}
                  className="project-launch-trend__point"
                  href={getHashFromRoute({ mode: "launch", launchId: point.id })}
                  key={point.id}
                  title={point.name}
                >
                  <span className="project-launch-trend__rate">
                    {percent === null ? "—" : `${percent}%`}
                  </span>
                  <span className="project-launch-trend__track">
                    {percent === null ? null : (
                      <span
                        className={rateTone(percent)}
                        style={{ height: `${Math.max(percent, 2)}%` }}
                      />
                    )}
                  </span>
                  <span className="project-launch-trend__name">{point.name}</span>
                  <span className="project-launch-trend__date">
                    {formatTrendDate(point.createdAt)}
                  </span>
                </a>
              );
            })}
          </nav>
          <footer className="project-launch-trend__footer">
            <span>
              Последний запуск:{" "}
              <strong>{latestPercent === null ? "—" : `${latestPercent}%`}</strong>
            </span>
            {change !== null ? (
              <span className={change > 0 ? "is-better" : change < 0 ? "is-worse" : ""}>
                {change > 0 ? "+" : ""}
                {change} п.п. к предыдущему
              </span>
            ) : null}
            {!compact && trend.read ? (
              <span className="project-launch-trend__durations">
                Медиана {formatDurationMilliseconds(trend.read.metrics.p50DurationMs)} · 95-й
                перцентиль {formatDurationMilliseconds(trend.read.metrics.p95DurationMs)} ·{" "}
                {formatCount(trend.read.metrics.count)} результатов
              </span>
            ) : null}
          </footer>
        </>
      )}
    </section>
  );
}

function rateTone(percent: number | null): string {
  return percent === null
    ? "is-unknown"
    : percent < 50
      ? "is-low"
      : percent < 80
        ? "is-mid"
        : "is-high";
}

function formatResultCount(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  const noun =
    mod10 === 1 && mod100 !== 11
      ? "результат"
      : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)
        ? "результата"
        : "результатов";
  return `${formatCount(count)} ${noun}`;
}
