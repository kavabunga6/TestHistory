import type { TestCaseHistoryPoint, TestResult } from "../m1Workspace.js";
import { getCurrentRunAttempts } from "../resultHistory.js";
import {
  formatHistoryDate,
  formatHistoryRailLabel,
  formatStatus
} from "./LaunchesReferenceFormatters.js";
import { getHistoryPoints, resolveHistoryResultId } from "./LaunchesReferenceModel.js";
import { formatResultDuration } from "./LaunchesResultDuration.js";
import { StatusIcon } from "./LaunchesStatusIcon.js";
export function ResultHistoryTab({
  onSelectResult,
  result,
  results
}: {
  onSelectResult: ((id: string) => void) | undefined;
  result: TestResult;
  results: TestResult[];
}) {
  const historyPoints = getHistoryPoints(result);

  return (
    <div className="launches-reference-result-tab-panel">
      <section>
        <h4>История результатов</h4>
        <p className="launches-reference-history-note">
          Здесь показан один итоговый результат теста для каждого запуска.
        </p>
        <HistoryList
          result={result}
          results={results}
          points={historyPoints}
          onSelectResult={onSelectResult}
        />
      </section>
    </div>
  );
}

export function ResultRetriesTab({ result }: { result: TestResult }) {
  return (
    <div className="launches-reference-result-tab-panel">
      <section>
        <h4>Перезапуски</h4>
        <p className="launches-reference-history-note">
          Попытки относятся только к текущему запуску. Итоговой считается последняя попытка.
        </p>
        <RetryAttemptsSection result={result} />
      </section>
    </div>
  );
}

export function HistoryRail({
  onSelectResult,
  result,
  results
}: {
  onSelectResult: ((id: string) => void) | undefined;
  result: TestResult;
  results: TestResult[];
}) {
  const points = getHistoryPoints(result).slice(0, 7);

  if (points.length === 0) {
    return <p className="launches-reference-muted">История пока пустая.</p>;
  }

  return (
    <div className="launches-reference-history-rail" aria-label="Последние запуски теста">
      {points.map((point, index) => (
        <button
          key={`${point.resultUuid}-${index}`}
          type="button"
          disabled={onSelectResult === undefined}
          aria-label={`${formatStatus(point.status)}, ${point.launchName}, ${formatHistoryRailLabel(point)}, ${formatResultDuration(point.duration)}`}
          title={
            onSelectResult === undefined
              ? "Навигация к результату недоступна в этом контексте"
              : point.launchName
          }
          onClick={() => onSelectResult?.(resolveHistoryResultId(results, result, point))}
        >
          <span className={`launches-reference-history-status ${point.status}`}>
            {formatStatus(point.status)}
          </span>
          <span className="launches-reference-history-date">{formatHistoryRailLabel(point)}</span>
        </button>
      ))}
    </div>
  );
}

function RetryAttemptsSection({ result }: { result: TestResult }) {
  const attempts = getCurrentRunAttempts(result);

  if (attempts.length <= 1) {
    return <p className="launches-reference-muted">В текущем запуске перезапусков не было.</p>;
  }

  return (
    <div className="launches-reference-attempts" aria-label="Попытки текущего запуска">
      <h5>Попытки текущего запуска</h5>
      <div className="launches-reference-attempt-list">
        {attempts.map((attempt) => (
          <article className={attempt.final ? "is-final" : ""} key={attempt.attempt}>
            <span className={`launches-reference-status-mark ${attempt.status}`}>
              <StatusIcon status={attempt.status} />
            </span>
            <div>
              <strong>
                Попытка {attempt.attempt}
                {attempt.final ? " · итоговый результат" : ""}
              </strong>
              <small>
                {formatStatus(attempt.status)}
                {attempt.startedAt ? ` · ${formatHistoryDate(attempt.startedAt)}` : ""}
                {attempt.message ? ` · ${attempt.message}` : ""}
              </small>
            </div>
            <em>{formatResultDuration(attempt.duration)}</em>
          </article>
        ))}
      </div>
    </div>
  );
}

function HistoryList({
  onSelectResult,
  points,
  result,
  results
}: {
  onSelectResult: ((id: string) => void) | undefined;
  points: TestCaseHistoryPoint[];
  result: TestResult;
  results: TestResult[];
}) {
  if (points.length === 0) {
    return <p className="launches-reference-muted">История пока пустая.</p>;
  }

  return (
    <div className="launches-reference-history-table" aria-label="История запусков теста">
      <div className="launches-reference-history-table-head" aria-hidden="true">
        <span>Статус</span>
        <span>Запуск</span>
        <span>Длительность</span>
      </div>
      {points.map((point, index) => (
        <button
          key={`${point.resultUuid}-${index}`}
          type="button"
          disabled={onSelectResult === undefined}
          title={
            onSelectResult === undefined
              ? "Навигация к результату недоступна в этом контексте"
              : undefined
          }
          onClick={() => onSelectResult?.(resolveHistoryResultId(results, result, point))}
        >
          <span className={`launches-reference-status-mark ${point.status}`}>
            <StatusIcon status={point.status} />
          </span>
          <span className="launches-reference-history-copy">
            <strong>{point.launchName}</strong>
            <small>
              {formatStatus(point.status)}
              {point.startedAt ? ` · ${formatHistoryDate(point.startedAt)}` : ""}
              {point.flaky ? " · нестабилен" : ""}
            </small>
          </span>
          <em>{formatResultDuration(point.duration)}</em>
        </button>
      ))}
    </div>
  );
}
