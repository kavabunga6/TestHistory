import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  ChevronRight,
  Clock3,
  ShieldAlert
} from "lucide-react";
import type { ReactNode } from "react";

import {
  buildAnalyticsModel,
  buildServerAnalyticsModel,
  excludePrioritySignals,
  formatCount,
  formatStatus,
  type AnalyticsSignal
} from "./AnalyticsReferenceModel.js";
import { useProjectAnalyticsResults } from "./AnalyticsReferenceData.js";
import { ProjectLaunchTrend } from "./ProjectLaunchTrend.js";
import { useProjectLaunchTrend } from "./useProjectLaunchTrend.js";
import { resultStatusGroupLabels } from "./resultStatusPresentation.js";

export function AnalyticsReferenceContent({
  hasQuery,
  launchTrend,
  model,
  onOpenResult,
  projectResults,
  serverReady
}: {
  hasQuery: boolean;
  launchTrend: ReturnType<typeof useProjectLaunchTrend>;
  model: ReturnType<typeof buildAnalyticsModel> | ReturnType<typeof buildServerAnalyticsModel>;
  onOpenResult?: ((id: string, launchId?: string) => void) | undefined;
  projectResults: ReturnType<typeof useProjectAnalyticsResults>;
  serverReady: boolean;
}) {
  const distinctSlowSignals = excludePrioritySignals(model.prioritySignals, model.slowSignals);

  return (
    <>
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
          label="Неуспешные результаты"
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
              : model.flakyCount > 0
                ? "История меняла статус"
                : "Смены статуса не обнаружены"
          }
          tone="broken"
        />
      </div>

      {serverReady && !hasQuery ? <ProjectLaunchTrend trend={launchTrend} /> : null}

      <div className="analytics-reference-grid">
        <section
          className="analytics-reference-panel analytics-reference-status-panel"
          aria-label="Статусы результатов"
        >
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
                <span>{resultStatusGroupLabels[metric.status]}</span>
                <div
                  aria-label={`${resultStatusGroupLabels[metric.status]}: ${formatCount(metric.count)}, ${metric.percent}`}
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
          <SignalPreviewList
            emptyMessage="Критичных падений в текущем фильтре нет"
            onOpenResult={onOpenResult}
            signals={model.prioritySignals}
          />
        </section>

        <section className="analytics-reference-panel" aria-label="Медленные тесты">
          <div className="analytics-reference-panel-title">
            <Clock3 size={18} />
            <h3>Медленные тесты</h3>
          </div>
          <SignalPreviewList
            emptyMessage={
              model.slowSignals.length > 0
                ? "Самые медленные тесты уже показаны среди приоритетных"
                : "Нет медленных тестов в текущем фильтре"
            }
            onOpenResult={onOpenResult}
            signals={distinctSlowSignals}
          />
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
              <span data-label="Набор" role="cell" title={result.suite}>
                {result.suite}
              </span>
              <span data-label="Владелец" role="cell" title={result.owner || "Не назначен"}>
                {result.owner || "Не назначен"}
              </span>
              <em data-label="Длит." role="cell">
                {result.duration}
              </em>
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
    </>
  );
}

function SignalPreviewList({
  emptyMessage,
  onOpenResult,
  signals
}: {
  emptyMessage: string;
  onOpenResult?: ((id: string, launchId?: string) => void) | undefined;
  signals: AnalyticsSignal[];
}) {
  const preview = signals.slice(0, 3);
  const remaining = signals.slice(3);

  return (
    <div className="analytics-reference-signal-list">
      {signals.length === 0 ? (
        <p className="analytics-reference-empty-note">{emptyMessage}</p>
      ) : null}
      {preview.map((result) => (
        <SignalRow key={result.id} result={result} onOpenResult={onOpenResult} />
      ))}
      {remaining.length > 0 ? (
        <details className="analytics-reference-signal-more">
          <summary>
            <ChevronRight aria-hidden="true" size={14} />
            Ещё {formatCount(remaining.length)} в этой группе
          </summary>
          {remaining.map((result) => (
            <SignalRow key={result.id} result={result} onOpenResult={onOpenResult} />
          ))}
        </details>
      ) : null}
    </div>
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
        {metadata.length > 0 ? <span title={metadata}>{metadata}</span> : null}
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
