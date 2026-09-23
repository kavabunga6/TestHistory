import { AlertCircle, LockKeyhole } from "lucide-react";
import { useEffect, useState } from "react";

import type { TestResult } from "../m1Workspace.js";
import { resolveIssueTrackerLink } from "../projectSettings.js";
import type { IntegrationLinkProvider } from "../projectSettingsTypes.js";
import {
  formatHistoryDate,
  formatSeverity,
  formatStatus,
  isExternalUrl
} from "./LaunchesReferenceFormatters.js";
import {
  getActiveDefectValues,
  getDefectCreator,
  getDefectValues,
  getQuarantineSummary,
  isResultQuarantined,
  parseResultReportTab,
  type ResultReportTab
} from "./LaunchesReferenceModel.js";
import { ResultDiagnostics } from "./LaunchesResultDiagnostics.js";
import { ResultAttachmentsTab } from "./LaunchesResultAttachments.js";
import { ResultFieldsTab, ResultQuarantineTab } from "./LaunchesResultDetailsTabs.js";
import { formatResultDuration } from "./LaunchesResultDuration.js";
import { HistoryRail, ResultHistoryTab, ResultRetriesTab } from "./LaunchesResultHistory.js";
import { ScenarioSection } from "./LaunchesResultScenario.js";
import { ResultTabs } from "./LaunchesResultTabs.js";
import { StatusIcon } from "./LaunchesStatusIcon.js";

import "./LaunchesResultReport.css";
import "./LaunchesResultReportPolish.css";
import "./LaunchesResultDiagnostics.css";
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
  const quarantineActionHint = isQuarantined
    ? "Вернуть только этот результат из карантина. Он снова будет учитываться в аналитике."
    : "Поместить только этот результат в карантин. Он перестанет учитываться в аналитике.";
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
          <div className="launches-reference-result-identity-row">
            <small title={result.suite}>{result.suite}</small>
            {onToggleMuteResult !== undefined ? (
              <button
                className={`launches-reference-result-action ${isQuarantined ? "is-muted" : ""}`}
                type="button"
                aria-description={quarantineActionHint}
                title={quarantineActionHint}
                onClick={() => onToggleMuteResult(result.id)}
              >
                <LockKeyhole size={15} />
                <span>{isQuarantined ? "Вернуть" : "В карантин"}</span>
              </button>
            ) : null}
          </div>
          <div className="launches-reference-result-headline">
            <span
              className={`launches-reference-result-status-pill typography-role-meta ${result.status}`}
            >
              <StatusIcon status={result.status} />
              {formatStatus(result.status)}
            </span>
            <strong className="typography-role-title">{result.name}</strong>
            <span className="launches-reference-result-duration">
              {formatResultDuration(result.duration)}
            </span>
          </div>
        </div>
      </div>

      <ResultTabs
        activeTab={activeResultTab}
        isQuarantined={isQuarantined}
        result={result}
        onSelectTab={(tab) => {
          setActiveResultTab(tab);
          onOpenTab?.(tab);
        }}
      />

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
        {result.trace !== undefined || result.status === "failed" || result.status === "broken" ? (
          <ResultDiagnostics key={result.id} result={result} />
        ) : null}
        <ScenarioSection result={result} />
      </div>
      <aside className="launches-reference-result-rail">
        <RailSection
          title="Данные результата"
          values={[`Слой: ${result.layer}`, `Серьезность: ${formatSeverity(result.severity)}`]}
        />
        <section>
          <h4>История результатов</h4>
          <HistoryRail result={result} results={results} onSelectResult={onSelectResult} />
        </section>
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

export function ResultDefectsTab({
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
