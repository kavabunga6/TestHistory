import {
  AlertCircle,
  ChevronDown,
  ChevronRight,
  FileText,
  Image,
  LockKeyhole,
  Paperclip
} from "lucide-react";
import { useEffect, useState, type CSSProperties } from "react";

import type {
  ResultAttachment,
  ScenarioStep,
  TestCaseHistoryPoint,
  TestResult
} from "../m1Workspace.js";
import { resolveIssueTrackerLink } from "../projectSettings.js";
import type { IntegrationLinkProvider } from "../projectSettingsTypes.js";
import { getCurrentRunAttempts } from "../resultHistory.js";
import { shouldExpandScenarioStep } from "../scenarioStepTree.js";
import {
  AttachmentDownloadButton,
  AttachmentPreview as AttachmentInlinePreview,
  AttachmentViewerButton
} from "../AttachmentViewer.js";
import {
  formatHistoryDate,
  formatHistoryRailLabel,
  formatSeverity,
  formatStatus,
  isExternalUrl,
  uniqueStrings
} from "./LaunchesReferenceFormatters.js";
import {
  collectAttachments,
  getActiveDefectValues,
  getDefectCreator,
  getDefectValues,
  getHistoryPoints,
  getQuarantineMeta,
  getQuarantineSummary,
  getQuarantineTitle,
  isResultQuarantined,
  parseResultReportTab,
  resolveHistoryResultId,
  resultReportTabs,
  type ResultReportTab
} from "./LaunchesReferenceModel.js";
import { StatusIcon } from "./LaunchesStatusIcon.js";

export function ResultReport({
  integrationProviders = [],
  onFilterByTag,
  onSelectResult,
  onOpenTab,
  onToggleMuteResult,
  onUnlinkResultDefect,
  routeTab,
  result,
  results
}: {
  integrationProviders?: IntegrationLinkProvider[] | undefined;
  onFilterByTag?: ((tag: string) => void) | undefined;
  onSelectResult: ((id: string) => void) | undefined;
  onOpenTab?: ((tab: string) => void) | undefined;
  onToggleMuteResult?: ((id: string) => void) | undefined;
  onUnlinkResultDefect?: ((resultId: string, defectId: string) => void) | undefined;
  routeTab?: string | undefined;
  result: TestResult;
  results: TestResult[];
}) {
  const [activeResultTab, setActiveResultTab] = useState<ResultReportTab>(
    parseResultReportTab(routeTab)
  );
  const isQuarantined = isResultQuarantined(result);
  useEffect(() => {
    setActiveResultTab(parseResultReportTab(routeTab));
  }, [result.id, routeTab]);
  useEffect(() => {
    if (activeResultTab === "quarantine" && !isQuarantined) {
      setActiveResultTab("overview");
      onOpenTab?.("overview");
    }
  }, [activeResultTab, isQuarantined, onOpenTab]);

  return (
    <section
      className="launches-reference-result-report"
      aria-label={`Отчет результата ${result.name}`}
    >
      <div className="launches-reference-result-title">
        <div className="launches-reference-result-heading">
          <small>{result.suite}</small>
          <strong>{result.name}</strong>
          <div className="launches-reference-result-state-row">
            <span className={`launches-reference-result-status-pill ${result.status}`}>
              <StatusIcon status={result.status} />
              {formatStatus(result.status)}
            </span>
            <span className="launches-reference-result-duration">{result.duration}</span>
            <span className="launches-reference-result-context-pill">Слой: {result.layer}</span>
            <span className="launches-reference-result-context-pill">
              Серьезность: {formatSeverity(result.severity)}
            </span>
          </div>
        </div>
        {onToggleMuteResult !== undefined ? (
          <button
            className={`launches-reference-result-action ${isQuarantined ? "is-muted" : ""}`}
            type="button"
            title={
              isQuarantined
                ? "Вернуть результат из карантина в аналитику"
                : "Перенести результат в карантин и исключить из аналитики"
            }
            onClick={() => onToggleMuteResult(result.id)}
          >
            <LockKeyhole size={15} />
            <span>{isQuarantined ? "Вернуть" : "В карантин"}</span>
          </button>
        ) : null}
      </div>

      <nav className="launches-reference-result-tabs" aria-label="Вкладки результата теста">
        {resultReportTabs.map((tab) => {
          const count = tab.count?.(result);
          const disabled = tab.id === "quarantine" && !isQuarantined;

          return (
            <button
              className={activeResultTab === tab.id && !disabled ? "active" : ""}
              disabled={disabled}
              key={tab.id}
              type="button"
              aria-current={activeResultTab === tab.id && !disabled ? "page" : undefined}
              onClick={() => {
                if (!disabled) {
                  setActiveResultTab(tab.id);
                  onOpenTab?.(tab.id);
                }
              }}
            >
              {tab.label}
              {count !== undefined && count > 0 ? (
                <span className="typography-role-meta">{count.toLocaleString("ru-RU")}</span>
              ) : null}
            </button>
          );
        })}
      </nav>

      {activeResultTab === "overview" ? (
        <ResultOverviewTab
          integrationProviders={integrationProviders}
          result={result}
          results={results}
          onFilterByTag={onFilterByTag}
          onSelectResult={onSelectResult}
        />
      ) : null}
      {activeResultTab === "history" ? (
        <ResultHistoryTab result={result} results={results} onSelectResult={onSelectResult} />
      ) : null}
      {activeResultTab === "retries" ? <ResultRetriesTab result={result} /> : null}
      {activeResultTab === "attachments" ? <ResultAttachmentsTab result={result} /> : null}
      {activeResultTab === "quarantine" ? <ResultQuarantineTab result={result} /> : null}
      {activeResultTab === "defects" ? (
        <ResultDefectsTab result={result} onUnlinkResultDefect={onUnlinkResultDefect} />
      ) : null}
      {activeResultTab === "fields" ? <ResultFieldsTab result={result} /> : null}
    </section>
  );
}

function ResultOverviewTab({
  integrationProviders,
  onFilterByTag,
  onSelectResult,
  result,
  results
}: {
  integrationProviders: IntegrationLinkProvider[];
  onFilterByTag?: ((tag: string) => void) | undefined;
  onSelectResult: ((id: string) => void) | undefined;
  result: TestResult;
  results: TestResult[];
}) {
  const quarantineSummary = getQuarantineSummary(result);

  return (
    <div className="launches-reference-result-overview">
      <div className="launches-reference-result-main">
        {result.trace !== undefined ? <TraceDetails result={result} /> : null}
        <ScenarioSection result={result} />
      </div>
      <aside className="launches-reference-result-rail">
        <section>
          <h4>История результатов</h4>
          <HistoryRail result={result} results={results} onSelectResult={onSelectResult} />
        </section>
        <RailSection title="Длительность" values={[result.duration]} />
        <RailSection title="Теги" values={result.tags} onSelectValue={onFilterByTag} />
        <RailSection
          title="Параметры"
          values={(result.parameters ?? []).map(
            (parameter) => `${parameter.name}: ${parameter.masked ? "[redacted]" : parameter.value}`
          )}
        />
        <RailSection title="Ключи теста" values={result.testKeys} />
        <RailSection title="Ссылки" values={result.linkDetails ?? result.links} />
        <RailSection
          title="Дефекты"
          values={getDefectValues(result).map((value) => {
            const url = result.issues.includes(value)
              ? resolveIssueTrackerLink(integrationProviders, value)
              : undefined;
            return url === undefined ? value : { label: value, url };
          })}
        />
        <RailSection
          title="Карантин"
          values={
            isResultQuarantined(result) && quarantineSummary.length > 0 ? [quarantineSummary] : []
          }
        />
      </aside>
    </div>
  );
}

function ScenarioSection({ result }: { result: TestResult }) {
  return (
    <details className="launches-reference-mini-section" open>
      <summary>
        <h4>Выполняемый сценарий</h4>
        <ChevronDown size={16} />
      </summary>
      {result.steps.length === 0 ? (
        <p className="launches-reference-muted">Шаги не переданы.</p>
      ) : (
        <ScenarioStepTree steps={result.steps} />
      )}
    </details>
  );
}

function ResultHistoryTab({
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

function ResultRetriesTab({ result }: { result: TestResult }) {
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

function ResultAttachmentsTab({ result }: { result: TestResult }) {
  const attachments = collectAttachments(result);

  return (
    <div className="launches-reference-result-tab-panel">
      <section>
        <h4>Вложения</h4>
        {attachments.length === 0 ? (
          <p className="launches-reference-muted">Вложений нет.</p>
        ) : (
          <AttachmentList attachments={attachments} />
        )}
      </section>
    </div>
  );
}

function ResultQuarantineTab({ result }: { result: TestResult }) {
  const quarantineTitle = getQuarantineTitle(result);
  const quarantineMeta = getQuarantineMeta(result);

  return (
    <div className="launches-reference-result-tab-panel">
      <section>
        <h4>Карантин</h4>
        {result.muted || result.defectMute ? (
          <div className="launches-reference-quarantine">
            <strong>{quarantineTitle}</strong>
            <span>{quarantineMeta}</span>
          </div>
        ) : (
          <p className="launches-reference-muted">Карантинные правила не применяются.</p>
        )}
      </section>
    </div>
  );
}

function ResultDefectsTab({
  onUnlinkResultDefect,
  result
}: {
  onUnlinkResultDefect?: ((resultId: string, defectId: string) => void) | undefined;
  result: TestResult;
}) {
  const activeDefects = getActiveDefectValues(result);
  const archivedDefects = result.defectHistory ?? [];

  return (
    <div className="launches-reference-result-tab-panel">
      <section>
        <h4>Дефекты</h4>
        {activeDefects.length === 0 ? (
          <p className="launches-reference-muted">Дефекты не связаны с этим результатом.</p>
        ) : (
          <div className="launches-reference-defects">
            {activeDefects.map((defect) => (
              <article key={defect}>
                <AlertCircle size={16} />
                <div className="launches-reference-defect-copy">
                  <strong>{defect}</strong>
                  <span>Создатель: {getDefectCreator(result, defect)}</span>
                  <span>Связано с текущим результатом запуска</span>
                </div>
                {onUnlinkResultDefect !== undefined ? (
                  <button
                    className="launches-reference-defect-unlink"
                    type="button"
                    title="Отвязать дефект от этого тест-кейса"
                    onClick={() => onUnlinkResultDefect(result.id, defect)}
                  >
                    Отвязать
                  </button>
                ) : null}
              </article>
            ))}
          </div>
        )}
        {archivedDefects.length > 0 ? (
          <div className="launches-reference-defect-history">
            <h5>История отвязок</h5>
            {archivedDefects.map((defect) => (
              <span key={`${defect.id}-${defect.removedAt}`}>
                {defect.id} · отвязан {formatHistoryDate(defect.removedAt)}
              </span>
            ))}
          </div>
        ) : null}
      </section>
    </div>
  );
}

function ResultFieldsTab({ result }: { result: TestResult }) {
  return (
    <div className="launches-reference-result-tab-panel">
      <section>
        <h4>Поля и связи</h4>
        <ResultAttributes result={result} />
      </section>
    </div>
  );
}

function HistoryRail({
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
          aria-label={`${formatStatus(point.status)}, ${point.launchName}, ${formatHistoryRailLabel(point)}, ${point.duration}`}
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
            <em>{attempt.duration}</em>
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
          <em>{point.duration}</em>
        </button>
      ))}
    </div>
  );
}

function RailSection({
  onSelectValue,
  title,
  values
}: {
  onSelectValue?: ((value: string) => void) | undefined;
  title: string;
  values: Array<string | { label: string; url: string }>;
}) {
  if (values.length === 0) {
    return null;
  }

  return (
    <section>
      <h4>{title}</h4>
      <div className="launches-reference-value-list">
        {values.map((value) => {
          const label = typeof value === "string" ? value : value.label;
          const url = typeof value === "string" ? value : value.url;
          if (isExternalUrl(url)) {
            return (
              <a href={url} key={`${label}-${url}`} rel="noreferrer" target="_blank">
                {label}
              </a>
            );
          }
          if (onSelectValue !== undefined) {
            return (
              <button key={label} type="button" onClick={() => onSelectValue(label)}>
                {label}
              </button>
            );
          }
          return <span key={label}>{label}</span>;
        })}
      </div>
    </section>
  );
}

function TraceDetails({ result }: { result: TestResult }) {
  if (result.trace === undefined) {
    return null;
  }

  return (
    <details className="launches-reference-trace">
      <summary>
        <span className="launches-reference-trace-summary-copy">
          <span className={`launches-reference-trace-status ${result.status}`}>
            {formatStatus(result.status)}
          </span>
          <strong>{result.trace.message}</strong>
        </span>
        <span className="launches-reference-trace-disclosure">
          Стек вызовов
          <ChevronDown size={16} />
        </span>
      </summary>
      <div className="launches-reference-trace-stack">
        {result.trace.stack.map((line, index) => (
          <code key={`${index}-${line}`}>{line}</code>
        ))}
      </div>
    </details>
  );
}

function ScenarioStepTree({
  depth = 0,
  parentPath = "",
  steps
}: {
  depth?: number;
  parentPath?: string;
  steps: ScenarioStep[];
}) {
  return (
    <ol className="launches-reference-step-tree">
      {steps.map((step, index) => {
        const path = parentPath ? `${parentPath}.${index + 1}` : `${index + 1}`;
        return (
          <ScenarioStepNode depth={depth} key={`${path}-${step.name}`} path={path} step={step} />
        );
      })}
    </ol>
  );
}

function ScenarioStepNode({
  depth,
  path,
  step
}: {
  depth: number;
  path: string;
  step: ScenarioStep;
}) {
  const childSteps = step.steps ?? [];
  const attachments = step.attachments ?? [];
  const expandable = childSteps.length > 0 || attachments.length > 0;
  const [expanded, setExpanded] = useState(() => shouldExpandScenarioStep(step));
  const depthStyle = { "--launches-step-indent": `${depth * 24}px` } as CSSProperties;
  const row = (
    <span className={`launches-reference-step-row is-${step.status}`} style={depthStyle}>
      <span
        aria-hidden="true"
        className={`launches-reference-step-disclosure ${expandable ? "" : "is-placeholder"}`}
        title={expandable ? (expanded ? "Свернуть шаг" : "Развернуть шаг") : undefined}
      >
        {expandable ? <ChevronRight size={16} /> : null}
      </span>
      <span className="launches-reference-step-status">
        <StatusIcon status={step.status} />
      </span>
      <strong>{step.name}</strong>
      <em>{step.duration}</em>
    </span>
  );

  return (
    <li>
      {expandable ? (
        <details open={expanded} onToggle={(event) => setExpanded(event.currentTarget.open)}>
          <summary aria-label={`${expanded ? "Свернуть" : "Развернуть"} шаг ${path}: ${step.name}`}>
            {row}
          </summary>
          {childSteps.length > 0 ? (
            <ScenarioStepTree depth={depth + 1} parentPath={path} steps={childSteps} />
          ) : null}
          {attachments.length > 0 ? (
            <AttachmentList attachments={attachments} compact depth={depth + 1} />
          ) : null}
        </details>
      ) : (
        row
      )}
    </li>
  );
}

function AttachmentList({
  attachments,
  compact = false,
  depth = 0
}: {
  attachments: ResultAttachment[];
  compact?: boolean;
  depth?: number;
}) {
  const depthStyle = compact
    ? ({ "--launches-step-indent": `${depth * 24}px` } as CSSProperties)
    : undefined;
  return (
    <div
      className={`launches-reference-attachments ${compact ? "compact" : ""}`}
      style={depthStyle}
    >
      {attachments.map((attachment) => (
        <AttachmentRow attachment={attachment} key={`${attachment.source}-${attachment.name}`} />
      ))}
    </div>
  );
}

function AttachmentRow({ attachment }: { attachment: ResultAttachment }) {
  return (
    <details className="launches-reference-attachment">
      <summary>
        <span className="launches-reference-attachment-icon">
          {getAttachmentRowIcon(attachment)}
        </span>
        <span className="launches-reference-attachment-name">
          <strong>{attachment.name}</strong>
          <small>
            {attachment.mediaType} {"\u00b7"} {attachment.size}
          </small>
        </span>
        <span className="launches-reference-attachment-tools">
          <span
            className="launches-reference-attachment-actions"
            onClick={(event) => event.preventDefault()}
          >
            <AttachmentViewerButton attachment={attachment} compact />
            <AttachmentDownloadButton attachment={attachment} compact />
          </span>
          <ChevronDown aria-hidden="true" size={16} />
        </span>
      </summary>
      <div className="launches-reference-attachment-body">
        {hasInlinePreview(attachment) ? (
          <AttachmentInlinePreview attachment={attachment} />
        ) : (
          <p className="launches-reference-muted">
            Превью для этого типа файла недоступно — откройте или скачайте вложение.
          </p>
        )}
      </div>
    </details>
  );
}

function hasInlinePreview(attachment: ResultAttachment): boolean {
  const mediaType = attachment.mediaType.toLowerCase();
  const isMedia = mediaType.startsWith("image/") || mediaType.startsWith("video/");

  return isMedia || attachment.preview?.body.type === "redacted-text";
}

function getAttachmentRowIcon(attachment: ResultAttachment) {
  const mediaType = attachment.mediaType.toLowerCase();

  if (mediaType.startsWith("image/") || mediaType.startsWith("video/")) {
    return <Image aria-hidden="true" size={15} />;
  }

  if (mediaType.startsWith("text/") || attachment.preview?.body.type === "redacted-text") {
    return <FileText aria-hidden="true" size={15} />;
  }

  return <Paperclip aria-hidden="true" size={15} />;
}
function ResultAttributes({ result }: { result: TestResult }) {
  const parameters = result.parameters ?? [];
  const tags = uniqueStrings(result.tags);
  const testKeys = uniqueStrings(result.testKeys);
  const links = uniqueStrings(result.links);
  const defects = uniqueStrings(getDefectValues(result));
  const hasValues =
    parameters.length > 0 ||
    tags.length > 0 ||
    testKeys.length > 0 ||
    links.length > 0 ||
    defects.length > 0;

  if (!hasValues) {
    return <p className="launches-reference-muted">Поля и связи не заданы.</p>;
  }

  return (
    <div className="launches-reference-attributes">
      {parameters.length > 0 ? (
        <div className="launches-reference-fields-group">
          <h5>Параметры</h5>
          <dl>
            {parameters.map((parameter) => (
              <div key={parameter.name}>
                <dt>{parameter.name}</dt>
                <dd>{parameter.masked ? "[redacted]" : parameter.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      ) : null}
      <ResultAttributeValues title="Метки" values={tags} />
      <ResultAttributeValues title="Ключи теста" values={testKeys} />
      <ResultAttributeValues title="Ссылки" values={links} links />
      <ResultAttributeValues title="Дефекты" values={defects} />
    </div>
  );
}

function ResultAttributeValues({
  links = false,
  title,
  values
}: {
  links?: boolean;
  title: string;
  values: string[];
}) {
  if (values.length === 0) {
    return null;
  }

  return (
    <div className="launches-reference-fields-group">
      <h5>{title}</h5>
      <div className="launches-reference-fields-values">
        {values.map((value) =>
          links && isExternalUrl(value) ? (
            <a href={value} key={value} rel="noreferrer" target="_blank">
              {value}
            </a>
          ) : (
            <span key={value}>{value}</span>
          )
        )}
      </div>
    </div>
  );
}
