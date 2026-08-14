import { GitCompareArrows, LoaderCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { getJson } from "../apiHttp.js";
import type { LaunchListItem } from "../m1Workspace.js";
import { getLaunchTotal } from "./LaunchesReferenceModel.js";

const comparisonDateFormatter = new Intl.DateTimeFormat("ru-RU", {
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  month: "2-digit",
  year: "2-digit"
});

export type LaunchComparisonReadModel = {
  kind: "launch-comparison";
  base: {
    id: string;
    name: string;
    metrics: { passRate: number | null; averageDurationMs: number | null };
  };
  target: {
    id: string;
    name: string;
    metrics: { passRate: number | null; averageDurationMs: number | null };
  };
  summary: {
    new: number;
    removed: number;
    fixed: number;
    regressed: number;
    "status-changed": number;
    unchanged: number;
    durationRegressions: number;
  };
  metricDeltas: { passRate: number | null; averageDurationMs: number | null };
  rows: Array<{
    testCaseId: string;
    name: string;
    change: "new" | "removed" | "fixed" | "regressed" | "status-changed" | "unchanged";
    durationTrend: "slower" | "faster" | "unchanged" | "unavailable";
    durationDeltaMs?: number;
    base?: { resultUuid: string; status: string; durationMs?: number };
    target?: { resultUuid: string; status: string; durationMs?: number };
  }>;
};

export type LaunchComparisonSession = {
  baselineId: string;
  comparison?: LaunchComparisonReadModel | undefined;
};

export function LaunchComparisonScreen({
  initialSession,
  launch,
  launchItems,
  onSelectResult,
  onSessionChange
}: {
  initialSession?: LaunchComparisonSession | undefined;
  launch: LaunchListItem;
  launchItems: LaunchListItem[];
  onSelectResult: (id: string) => void;
  onSessionChange?: ((session: LaunchComparisonSession) => void) | undefined;
}) {
  const candidates = launchItems
    .filter((item) => item.id !== launch.id && item.projectId === launch.projectId)
    .sort(
      (left, right) =>
        getLaunchTimestamp(right) - getLaunchTimestamp(left) ||
        right.id.localeCompare(left.id, "ru", { numeric: true })
    );
  const [baselineId, setBaselineId] = useState(initialSession?.baselineId ?? "");
  const [comparison, setComparison] = useState<LaunchComparisonReadModel | undefined>(
    initialSession?.comparison
  );
  const [comparisonState, setComparisonState] = useState<"idle" | "loading" | "ready" | "error">(
    initialSession?.comparison === undefined ? "idle" : "ready"
  );
  const requestController = useRef<AbortController | undefined>(undefined);

  useEffect(() => {
    requestController.current?.abort();
    setBaselineId(initialSession?.baselineId ?? "");
    setComparison(initialSession?.comparison);
    setComparisonState(initialSession?.comparison === undefined ? "idle" : "ready");
  }, [launch.id]);

  useEffect(() => () => requestController.current?.abort(), []);

  const requestComparison = async () => {
    if (launch.projectId === undefined || baselineId === "") return;

    requestController.current?.abort();
    const controller = new AbortController();
    requestController.current = controller;
    setComparison(undefined);
    setComparisonState("loading");
    onSessionChange?.({ baselineId });

    try {
      const value = await getJson<LaunchComparisonReadModel>(
        `/api/v1/projects/${encodeURIComponent(launch.projectId)}/launches/compare?baseLaunchId=${encodeURIComponent(
          baselineId
        )}&targetLaunchId=${encodeURIComponent(launch.id)}&limit=50`,
        { signal: controller.signal }
      );
      if (controller.signal.aborted) return;
      setComparison(value);
      setComparisonState("ready");
      onSessionChange?.({ baselineId, comparison: value });
    } catch (error: unknown) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setComparison(undefined);
      setComparisonState("error");
    }
  };

  const resetSelection = (nextBaselineId: string) => {
    requestController.current?.abort();
    setBaselineId(nextBaselineId);
    setComparison(undefined);
    setComparisonState("idle");
    onSessionChange?.({ baselineId: nextBaselineId });
  };

  return (
    <div className="launches-reference-comparison-page">
      <section className="launches-reference-comparison-screen" aria-label="Сравнение запусков">
        <header className="launches-reference-comparison-heading">
          <span className="launches-reference-comparison-heading-icon" aria-hidden="true">
            <GitCompareArrows />
          </span>
          <span>
            <h1>Сравнение запусков</h1>
            <p>Выберите базовый прогон. Данные сравнения загрузятся только после подтверждения.</p>
          </span>
        </header>

        <div className="launches-reference-comparison-request">
          <label className="launches-reference-comparison-picker">
            <span>Сравнить текущий запуск с</span>
            <select
              value={baselineId}
              disabled={candidates.length === 0 || comparisonState === "loading"}
              onChange={(event) => resetSelection(event.target.value)}
            >
              <option value="">
                {candidates.length === 0 ? "Нет доступных запусков" : "Выберите запуск"}
              </option>
              {candidates.map((item) => {
                const label = formatLaunchOption(item);
                return (
                  <option key={item.id} title={label} value={item.id}>
                    {label}
                  </option>
                );
              })}
            </select>
          </label>
          <button
            className="launches-reference-comparison-submit"
            disabled={baselineId === "" || comparisonState === "loading"}
            type="button"
            onClick={() => void requestComparison()}
          >
            {comparisonState === "loading" ? (
              <LoaderCircle className="is-spinning" aria-hidden="true" />
            ) : (
              <GitCompareArrows aria-hidden="true" />
            )}
            <span>{comparisonState === "loading" ? "Сравниваем…" : "Сравнить"}</span>
          </button>
        </div>

        {comparisonState === "idle" ? (
          <div className="launches-reference-comparison-empty">
            <GitCompareArrows aria-hidden="true" />
            <strong>
              {candidates.length === 0
                ? "Нет другого запуска для сравнения"
                : "Выберите запуск для сравнения"}
            </strong>
            <span>
              {candidates.length === 0
                ? "Сравнение станет доступно после появления ещё одного запуска в проекте."
                : "До нажатия кнопки «Сравнить» запрос к серверу не выполняется."}
            </span>
          </div>
        ) : null}
        {comparisonState === "loading" ? (
          <p className="launches-reference-comparison-message">Сравниваем запуски…</p>
        ) : null}
        {comparisonState === "error" ? (
          <p className="launches-reference-comparison-message is-error">
            Не удалось загрузить сравнение. Проверьте доступность выбранного запуска и повторите
            запрос.
          </p>
        ) : null}
        {comparison !== undefined ? (
          <div className="launches-reference-comparison-result">
            <div className="launches-reference-comparison-pair">
              <span>
                <small>Базовый запуск</small>
                <strong>{comparison.base.name}</strong>
              </span>
              <GitCompareArrows aria-hidden="true" />
              <span>
                <small>Текущий запуск</small>
                <strong>{comparison.target.name}</strong>
              </span>
            </div>
            <div className="launches-reference-comparison-metrics" aria-label="Изменения запуска">
              <ComparisonMetric
                label="Регрессии"
                tone="regressed"
                value={comparison.summary.regressed}
              />
              <ComparisonMetric label="Исправлено" tone="fixed" value={comparison.summary.fixed} />
              <ComparisonMetric label="Новые тесты" tone="new" value={comparison.summary.new} />
              <ComparisonMetric
                label="Замедлились"
                tone="slower"
                value={comparison.summary.durationRegressions}
              />
              <ComparisonMetric
                label="Успешность"
                tone="neutral"
                value={formatPercentDelta(comparison.metricDeltas.passRate)}
              />
            </div>
            <div
              className="launches-reference-comparison-list"
              role="table"
              aria-label="Отличия тестов между запусками"
            >
              <div className="launches-reference-comparison-table-head" role="row">
                <span role="columnheader">Тест</span>
                <span role="columnheader">Базовый прогон</span>
                <span role="columnheader">Текущий прогон</span>
                <span role="columnheader">Изменение</span>
                <span role="columnheader">Разница времени</span>
              </div>
              {comparison.rows
                .filter((row) => row.change !== "unchanged" || row.durationTrend === "slower")
                .slice(0, 50)
                .map((row) => (
                  <button
                    className={`launches-reference-comparison-row is-${row.change}`}
                    disabled={row.target === undefined}
                    key={row.testCaseId}
                    role="row"
                    type="button"
                    onClick={() =>
                      row.target !== undefined && onSelectResult(row.target.resultUuid)
                    }
                  >
                    <span className="launches-reference-comparison-test" role="cell">
                      <strong>{row.name}</strong>
                      <small>{row.testCaseId}</small>
                    </span>
                    <ComparisonPoint point={row.base} role="cell" />
                    <ComparisonPoint point={row.target} role="cell" />
                    <span
                      className={`launches-reference-comparison-change typography-role-meta is-${row.change}`}
                      role="cell"
                    >
                      {formatComparisonChange(row.change)}
                    </span>
                    <em
                      className={`launches-reference-comparison-duration typography-role-meta is-${row.durationTrend}`}
                      role="cell"
                    >
                      {row.durationDeltaMs === undefined
                        ? "—"
                        : formatDurationDelta(row.durationDeltaMs)}
                    </em>
                  </button>
                ))}
              {comparison.rows.every(
                (row) => row.change === "unchanged" && row.durationTrend !== "slower"
              ) ? (
                <p className="launches-reference-comparison-message">
                  Регрессий и заметных изменений нет.
                </p>
              ) : null}
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function ComparisonMetric({
  label,
  tone,
  value
}: {
  label: string;
  tone: string;
  value: number | string;
}) {
  return (
    <article className={`launches-reference-comparison-metric is-${tone}`}>
      <strong>{value}</strong>
      <span>{label}</span>
    </article>
  );
}

function ComparisonPoint({
  point,
  role
}: {
  point: LaunchComparisonReadModel["rows"][number]["base"];
  role: "cell";
}) {
  if (point === undefined) {
    return (
      <span
        className="launches-reference-comparison-point typography-role-meta is-absent"
        role={role}
      >
        Нет в прогоне
      </span>
    );
  }
  return (
    <span className="launches-reference-comparison-point" role={role}>
      <span
        className={`launches-reference-comparison-status typography-role-meta is-${point.status}`}
      >
        {formatComparisonStatus(point.status)}
      </span>
      <small>{formatComparisonDuration(point.durationMs)}</small>
    </span>
  );
}

function formatComparisonChange(change: LaunchComparisonReadModel["rows"][number]["change"]) {
  return {
    new: "Новый",
    removed: "Удалён",
    fixed: "Исправлен",
    regressed: "Регрессия",
    "status-changed": "Статус изменён",
    unchanged: "Без изменения"
  }[change];
}

function formatPercentDelta(value: number | null) {
  if (value === null) return "—";
  const percent = Math.round(value * 1_000) / 10;
  return `${percent > 0 ? "+" : ""}${percent}%`;
}

function formatDurationDelta(value: number) {
  const rounded = Math.round(value);
  return `${rounded > 0 ? "+" : ""}${rounded} мс`;
}

function formatComparisonDuration(value: number | undefined) {
  if (value === undefined) return "время не указано";
  if (value < 1_000) return `${Math.round(value)} мс`;
  return `${Math.round(value / 10) / 100} с`;
}

function formatComparisonStatus(status: string) {
  return (
    {
      broken: "Сломан",
      failed: "Провален",
      passed: "Успешный",
      skipped: "Пропущен",
      unknown: "Неизвестен"
    }[status] ?? status
  );
}

function formatLaunchOption(item: LaunchListItem) {
  const timestamp = getLaunchTimestamp(item);
  const createdAt =
    timestamp === Number.NEGATIVE_INFINITY
      ? "дата не указана"
      : comparisonDateFormatter.format(timestamp);
  const compactId = item.id.length > 12 ? item.id.slice(0, 8) : item.id;
  const details = [
    createdAt,
    `ID ${compactId}`,
    `${getLaunchTotal(item).toLocaleString("ru-RU")} тестов`,
    item.name
  ];
  if (item.branch?.trim()) details.push(`ветка ${item.branch.trim()}`);
  return details.join(" · ");
}

function getLaunchTimestamp(item: LaunchListItem) {
  const timestamp = Date.parse(item.createdAt ?? "");
  return Number.isFinite(timestamp) ? timestamp : Number.NEGATIVE_INFINITY;
}
