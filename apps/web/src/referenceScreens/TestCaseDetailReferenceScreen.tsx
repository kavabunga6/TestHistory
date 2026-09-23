import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleDashed,
  FileText,
  PauseCircle,
  Paperclip,
  Trash2,
  XCircle
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";

import {
  AttachmentDownloadButton,
  AttachmentPreview,
  AttachmentViewerButton
} from "../AttachmentViewer.js";
import type { ResultAttachment, ResultStatus, ScenarioStep, TestResult } from "../m1Workspace.js";
import { resolveIssueTrackerLink } from "../projectSettings.js";
import type { IntegrationLinkProvider } from "../projectSettingsTypes.js";
import {
  collapseHistoryToFinalRunResults,
  getCurrentRunAttempts,
  getCurrentRunRetryCount
} from "../resultHistory.js";
import { shouldExpandScenarioStep } from "../scenarioStepTree.js";
import {
  collectAttachments,
  filterResults,
  findMostInformativeResult,
  formatHistoryDate,
  formatHistoryRailLabel,
  formatStatus,
  getDefectCreator,
  isExternalUrl,
  isResultQuarantined,
  uniqueStrings
} from "./TestCaseDetailReferenceUtils.js";
import { ResultIdCopy } from "./ResultIdCopy.js";
import { ThqlSearchPanel } from "./ThqlSearchPanel.js";
import { useResizableListWidth } from "./useResizableListWidth.js";

import "./TestCaseDetailReferenceScreen.css";

type DetailTab = "overview" | "history" | "retries" | "attachments" | "quarantine" | "defects";
type OpenTestResult = (resultId: string, launchId?: string, testCaseId?: string) => void;

const detailTabs: Array<{ key: DetailTab; label: string; count?: (result: TestResult) => number }> =
  [
    { key: "overview", label: "Обзор" },
    {
      key: "history",
      label: "История результатов",
      count: (result) =>
        collapseHistoryToFinalRunResults(result.historyPoints ?? []).length || result.history.length
    },
    { key: "retries", label: "Перезапуски", count: getCurrentRunRetryCount },
    { key: "attachments", label: "Вложения", count: (result) => collectAttachments(result).length },
    {
      key: "defects",
      label: "Дефекты",
      count: (result) => result.issues.length + (result.defect ? 1 : 0)
    },
    {
      key: "quarantine",
      label: "Карантин",
      count: (result) => (isResultQuarantined(result) ? 1 : 0)
    }
  ];
const TEST_CASE_REFERENCE_PAGE_SIZE = 50;
const TEST_CASE_LIST_WIDTH_KEY = "testhistory:test-case-list-width";
const TEST_CASE_LIST_DEFAULT_WIDTH = 420;
const TEST_CASE_LIST_MIN_WIDTH = 390;
const TEST_CASE_LIST_MAX_WIDTH = 720;

function parseDetailTab(value: string | undefined): DetailTab {
  return detailTabs.some((tab) => tab.key === value) ? (value as DetailTab) : "overview";
}

export function TestCaseDetailReferenceScreen({
  integrationProviders = [],
  onDeleteTestCase,
  onOpenResult,
  onOpenLaunchResultsByTag,
  onOpenTab,
  onSelect,
  onToggleMuteResult,
  onUnlinkResultDefect,
  projectId = "ws",
  results,
  routeTab,
  selectedId
}: {
  integrationProviders?: IntegrationLinkProvider[] | undefined;
  onDeleteTestCase?: ((id: string) => void) | undefined;
  onOpenResult?: OpenTestResult | undefined;
  onOpenLaunchResultsByTag?: ((tag: string, resultId: string) => void) | undefined;
  onOpenTab?: ((tab: string) => void) | undefined;
  onSelect?: ((id: string) => void) | undefined;
  onToggleMuteResult?: ((id: string) => void) | undefined;
  onUnlinkResultDefect?: ((resultId: string, defectId: string) => void) | undefined;
  projectId?: string | undefined;
  results: TestResult[];
  routeTab?: string | undefined;
  selectedId?: string;
}) {
  const [query, setQuery] = useState("");
  const [activeFilterId, setActiveFilterId] = useState<string | undefined>();
  const { listWidth, onSeparatorKeyDown, onSeparatorPointerDown, resizing, screenRef } =
    useResizableListWidth({
      bodyClass: "tc-detail-reference-is-resizing",
      defaultWidth: TEST_CASE_LIST_DEFAULT_WIDTH,
      maxWidth: TEST_CASE_LIST_MAX_WIDTH,
      minWidth: TEST_CASE_LIST_MIN_WIDTH,
      storageKey: TEST_CASE_LIST_WIDTH_KEY
    });

  const filteredResults = useMemo(() => filterResults(results, query), [query, results]);
  const firstResults = filteredResults.slice(0, TEST_CASE_REFERENCE_PAGE_SIZE);
  const requestedResult = filteredResults.find((result) => result.id === selectedId);
  const visibleResults =
    requestedResult !== undefined && !firstResults.includes(requestedResult)
      ? [requestedResult, ...firstResults.slice(0, TEST_CASE_REFERENCE_PAGE_SIZE - 1)]
      : firstResults;
  const hasRequestedResult = selectedId !== undefined && selectedId.trim().length > 0;
  const selectedResult =
    filteredResults.find((result) => result.id === selectedId) ??
    results.find((result) => result.id === selectedId) ??
    (hasRequestedResult
      ? undefined
      : (findMostInformativeResult(filteredResults) ?? findMostInformativeResult(results)));

  useEffect(() => {
    if (!hasRequestedResult && selectedResult !== undefined) {
      onSelect?.(selectedResult.id);
    }
  }, [hasRequestedResult, onSelect, selectedResult?.id]);
  const screenStyle = {
    "--tc-detail-reference-list-width": `${listWidth}px`
  } as CSSProperties;
  const actorId =
    typeof window === "undefined"
      ? "admin"
      : (window.localStorage.getItem("testhistory.actorId") ?? "admin");

  return (
    <section
      ref={screenRef}
      className={`tc-detail-reference-screen ${resizing ? "is-resizing" : ""}`}
      style={screenStyle}
      aria-label="Тест-кейсы"
    >
      <aside className="tc-detail-reference-list-panel" aria-label="Список тест-кейсов">
        <header className="tc-detail-reference-list-header">
          <h1>
            <span>Тест-кейсы</span>
            <span
              className="tc-detail-reference-count-badge"
              title={`Показано ${visibleResults.length.toLocaleString("ru-RU")} из ${results.length.toLocaleString("ru-RU")}`}
              aria-hidden="true"
            >
              {filteredResults.length.toLocaleString("ru-RU")}
            </span>
            <span className="tc-detail-reference-sr-only">
              Показано {visibleResults.length.toLocaleString("ru-RU")} из{" "}
              {results.length.toLocaleString("ru-RU")} тест-кейсов
            </span>
          </h1>
        </header>

        <div className="tc-detail-reference-filter-panel">
          <ThqlSearchPanel
            activeFilterId={activeFilterId}
            actorId={actorId}
            entity="testCases"
            projectId={projectId}
            query={query}
            onActiveFilterChange={setActiveFilterId}
            onQueryChange={setQuery}
          />
        </div>

        <div className="tc-detail-reference-list">
          {visibleResults.map((result) => (
            <article
              className={`tc-detail-reference-row ${selectedResult?.id === result.id ? "selected" : ""} ${
                result.deletedAt !== undefined ? "deleted" : ""
              }`}
              key={result.id}
            >
              <button
                className="tc-detail-reference-row-main"
                type="button"
                aria-pressed={selectedResult?.id === result.id}
                onClick={() => onSelect?.(result.id)}
              >
                <span
                  className={`tc-detail-reference-quarantine-icon ${
                    result.muted || result.defectMute !== undefined ? "active" : ""
                  }`}
                  title={
                    result.muted || result.defectMute !== undefined
                      ? "Результат в карантине"
                      : undefined
                  }
                  aria-hidden={result.muted || result.defectMute !== undefined ? undefined : true}
                >
                  {result.muted || result.defectMute !== undefined ? (
                    <PauseCircle aria-hidden="true" size={15} />
                  ) : null}
                </span>
                <span className="tc-detail-reference-row-copy">
                  <strong>{result.name}</strong>
                  <small>
                    {result.owner || "Владелец не назначен"}
                    {result.deletedAt !== undefined ? " · удалён" : ""}
                  </small>
                </span>
              </button>
            </article>
          ))}

          {filteredResults.length === 0 ? (
            <div className="tc-detail-reference-empty">
              <strong>Нет тест-кейсов</strong>
              <span>Измените фильтр или строку поиска.</span>
            </div>
          ) : null}
        </div>
      </aside>

      <button
        className="tc-detail-reference-splitter"
        type="button"
        aria-label="Изменить ширину списка тест-кейсов"
        aria-valuemax={TEST_CASE_LIST_MAX_WIDTH}
        aria-valuemin={TEST_CASE_LIST_MIN_WIDTH}
        aria-valuenow={listWidth}
        role="separator"
        title="Потяните, чтобы изменить ширину списка"
        onKeyDown={onSeparatorKeyDown}
        onPointerDown={onSeparatorPointerDown}
      />

      {selectedResult === undefined ? (
        <section className="tc-detail-reference-details empty" aria-label="Детали тест-кейса">
          <div className="tc-detail-reference-empty">
            <strong>Выберите тест-кейс</strong>
            <span>Детали появятся справа от списка.</span>
          </div>
        </section>
      ) : (
        <TestCaseDetails
          integrationProviders={integrationProviders}
          result={selectedResult}
          routeTab={routeTab}
          onDeleteTestCase={onDeleteTestCase}
          onOpenResult={onOpenResult ?? onSelect}
          onOpenTab={onOpenTab}
          onFilterByTag={(tag) =>
            onOpenLaunchResultsByTag !== undefined
              ? onOpenLaunchResultsByTag(tag, selectedResult.id)
              : setQuery(`tag = ${JSON.stringify(tag)}`)
          }
          onToggleMuteResult={onToggleMuteResult}
          onUnlinkResultDefect={onUnlinkResultDefect}
        />
      )}
    </section>
  );
}

function TestCaseDetails({
  integrationProviders,
  onDeleteTestCase,
  onFilterByTag,
  onOpenResult,
  onOpenTab,
  onToggleMuteResult,
  onUnlinkResultDefect,
  routeTab,
  result
}: {
  integrationProviders: IntegrationLinkProvider[];
  onDeleteTestCase?: ((id: string) => void) | undefined;
  onFilterByTag: (tag: string) => void;
  onOpenResult: OpenTestResult | undefined;
  onOpenTab?: ((tab: string) => void) | undefined;
  onToggleMuteResult?: ((id: string) => void) | undefined;
  onUnlinkResultDefect?: ((resultId: string, defectId: string) => void) | undefined;
  routeTab?: string | undefined;
  result: TestResult;
}) {
  const [activeTab, setActiveTab] = useState<DetailTab>(parseDetailTab(routeTab));
  const isQuarantined = isResultQuarantined(result);

  useEffect(() => {
    setActiveTab(parseDetailTab(routeTab));
  }, [result.id, routeTab]);
  useEffect(() => {
    if (activeTab === "quarantine" && !isQuarantined) {
      setActiveTab("overview");
      onOpenTab?.("overview");
    }
  }, [activeTab, isQuarantined, onOpenTab]);

  return (
    <section className="tc-detail-reference-details" aria-label="Детали выбранного тест-кейса">
      <header className="tc-detail-reference-detail-header">
        <div className="tc-detail-reference-title-row">
          <div className="tc-detail-reference-identifiers">
            <span className="tc-detail-reference-id" title={result.allureId || result.id}>
              #{result.allureId || result.id}
            </span>
            <ResultIdCopy resultId={result.id} />
          </div>
          {onToggleMuteResult !== undefined ||
          (onDeleteTestCase !== undefined && result.deletedAt === undefined) ? (
            <div className="tc-detail-reference-actions">
              {onToggleMuteResult !== undefined ? (
                <button
                  className="tc-detail-reference-action"
                  type="button"
                  title={
                    isQuarantined
                      ? "Вернуть результат из карантина в аналитику"
                      : "Перенести результат в карантин и исключить из аналитики"
                  }
                  onClick={() => onToggleMuteResult(result.id)}
                >
                  <PauseCircle size={15} />
                  <span>{isQuarantined ? "Вернуть" : "В карантин"}</span>
                </button>
              ) : null}
              {onDeleteTestCase !== undefined && result.deletedAt === undefined ? (
                <button
                  className="tc-detail-reference-action danger"
                  type="button"
                  title="Пометить тест-кейс удаленным"
                  onClick={() => onDeleteTestCase(result.id)}
                >
                  <Trash2 aria-hidden="true" focusable="false" size={15} strokeWidth={2.2} />
                  Удалить
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
        {result.suite ? <p>{result.suite}</p> : null}
        <div className="tc-detail-reference-heading-line">
          <h2>{result.name}</h2>
          <div className="tc-detail-reference-badges">
            <span className={result.deletedAt !== undefined ? "deleted" : "active"}>
              {result.deletedAt !== undefined ? "Удален" : "Активный"}
            </span>
            {isQuarantined ? <span className="muted">Карантин</span> : null}
          </div>
        </div>
      </header>

      <nav className="tc-detail-reference-tabs" aria-label="Вкладки тест-кейса">
        {detailTabs.map((tab) => {
          const count = tab.count?.(result);
          const disabled = tab.key === "quarantine" && !isQuarantined;

          return (
            <button
              className={activeTab === tab.key && !disabled ? "active" : ""}
              disabled={disabled}
              title={disabled ? "Тест не находится в карантине" : undefined}
              key={tab.key}
              type="button"
              aria-current={activeTab === tab.key && !disabled ? "page" : undefined}
              onClick={() => {
                if (!disabled) {
                  setActiveTab(tab.key);
                  onOpenTab?.(tab.key);
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

      {activeTab === "overview" ? (
        <OverviewTab
          integrationProviders={integrationProviders}
          result={result}
          onFilterByTag={onFilterByTag}
          onOpenResult={onOpenResult}
        />
      ) : null}
      {activeTab === "history" ? <HistoryTab result={result} onOpenResult={onOpenResult} /> : null}
      {activeTab === "retries" ? <RetriesTab result={result} /> : null}
      {activeTab === "attachments" ? <AttachmentsTab result={result} /> : null}
      {activeTab === "quarantine" ? <QuarantineTab result={result} /> : null}
      {activeTab === "defects" ? (
        <DefectsTab result={result} onUnlinkResultDefect={onUnlinkResultDefect} />
      ) : null}
    </section>
  );
}

function OverviewTab({
  integrationProviders,
  onFilterByTag,
  onOpenResult,
  result
}: {
  integrationProviders: IntegrationLinkProvider[];
  onFilterByTag: (tag: string) => void;
  onOpenResult: OpenTestResult | undefined;
  result: TestResult;
}) {
  const hasHistory = collapseHistoryToFinalRunResults(result.historyPoints ?? []).length > 0;

  return (
    <div className="tc-detail-reference-overview">
      <div className="tc-detail-reference-overview-main">
        <section>
          <h3>Описание</h3>
          <p className={!result.description ? "muted" : undefined}>
            {result.description?.trim() || "Нет описания"}
          </p>
        </section>

        <ParametersSection result={result} />

        <section>
          <h3>Сценарий из тестового результата</h3>
          {result.steps.length === 0 ? (
            <p className="muted">Шаги не переданы в результате.</p>
          ) : (
            <div className="tc-detail-reference-steps" role="tree">
              {result.steps.map((step, index) => (
                <StepTreeItem
                  index={index}
                  key={`${result.id}-${step.name}-${index}`}
                  path={`${index + 1}`}
                  step={step}
                />
              ))}
            </div>
          )}
        </section>
      </div>

      <aside className="tc-detail-reference-side-rail" aria-label="Свойства тест-кейса">
        <section
          className={`tc-detail-reference-rail-card tc-detail-reference-history-card ${hasHistory ? "" : "is-empty"}`}
        >
          <h3>История результатов</h3>
          <HistoryRail result={result} onOpenResult={onOpenResult} />
        </section>

        <section className="tc-detail-reference-rail-card tc-detail-reference-duration-card">
          <h3>Длительность</h3>
          <strong>{result.duration}</strong>
        </section>

        <div className="tc-detail-reference-rail-card" role="group" aria-label="Теги">
          <RailSection
            title="Теги"
            values={result.tags}
            variant="chips"
            onSelectValue={onFilterByTag}
          />
        </div>

        <div className="tc-detail-reference-rail-card" role="group" aria-label="Кастомные поля">
          <CustomFieldsRail fields={result.customFields} />
        </div>

        <div className="tc-detail-reference-rail-card" role="group" aria-label="Ключи теста">
          <RailSection title="Ключи теста" values={result.testKeys} variant="chips" />
        </div>

        <div className="tc-detail-reference-rail-card" role="group" aria-label="Ссылки">
          <RailSection title="Ссылки" values={result.linkDetails ?? result.links} />
        </div>

        <div
          className="tc-detail-reference-rail-card"
          role="group"
          aria-label="Задачи из баг-трекера"
        >
          <RailSection
            title="Задачи из баг-трекера"
            values={uniqueStrings([
              ...(result.defect ? [result.defect] : []),
              ...result.issues
            ]).map((value) => {
              const url = result.issues.includes(value)
                ? resolveIssueTrackerLink(integrationProviders, value)
                : undefined;
              return url === undefined ? value : { label: value, url };
            })}
            variant="chips"
          />
        </div>
      </aside>
    </div>
  );
}

function HistoryRail({
  onOpenResult,
  result
}: {
  onOpenResult: OpenTestResult | undefined;
  result: TestResult;
}) {
  const points = collapseHistoryToFinalRunResults(
    result.historyPoints !== undefined && result.historyPoints.length > 0
      ? result.historyPoints
      : []
  ).slice(0, 7);

  if (points.length === 0) {
    return null;
  }

  return (
    <div className="tc-detail-reference-history">
      {points.map((point, index) => {
        const navigable = isHistoryPointNavigable(point, onOpenResult);

        return (
          <button
            className={`tc-detail-reference-history-item ${point.status}`}
            disabled={!navigable}
            key={`${point.resultUuid}-${index}`}
            type="button"
            aria-label={`Открыть результат ${point.launchName}: ${formatStatus(point.status)}`}
            title={
              navigable
                ? `Открыть результат ${point.launchName}`
                : "Для этой записи нет ссылки на конкретный результат запуска"
            }
            onClick={() => openHistoryPoint(point, onOpenResult, result.id)}
          >
            <strong>{point.launchName}</strong>
            <time>{formatHistoryRailLabel(point)}</time>
          </button>
        );
      })}
    </div>
  );
}

function HistoryTab({
  onOpenResult,
  result
}: {
  onOpenResult: OpenTestResult | undefined;
  result: TestResult;
}) {
  const historyPoints = collapseHistoryToFinalRunResults(
    result.historyPoints !== undefined && result.historyPoints.length > 0
      ? result.historyPoints
      : []
  );

  return (
    <div className="tc-detail-reference-tab-panel">
      <section>
        <h3>История результатов</h3>
        <p className="tc-detail-reference-history-note">
          Здесь показан один итоговый результат тест-кейса для каждого запуска.
        </p>
        {historyPoints.length === 0 ? (
          <p className="muted">История запусков не передана для этого тест-кейса.</p>
        ) : (
          <div className="tc-detail-reference-history-table">
            {historyPoints.map((point, index) => {
              const navigable = isHistoryPointNavigable(point, onOpenResult);

              return (
                <button
                  key={`${point.resultUuid}-${index}`}
                  disabled={!navigable}
                  type="button"
                  title={
                    navigable
                      ? `Открыть результат ${point.launchName}`
                      : "Для этой записи нет ссылки на конкретный результат запуска"
                  }
                  onClick={() => openHistoryPoint(point, onOpenResult, result.id)}
                >
                  <span className={`tc-detail-reference-status-mark ${point.status}`}>
                    <StatusIcon status={point.status} />
                  </span>
                  <span className="tc-detail-reference-history-copy">
                    <strong>{point.launchName}</strong>
                    <small>
                      {formatStatus(point.status)}
                      {point.startedAt ? ` · ${formatHistoryDate(point.startedAt)}` : ""}
                      {point.flaky ? " · нестабилен" : ""}
                    </small>
                  </span>
                  <em>{point.duration}</em>
                </button>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function RetriesTab({ result }: { result: TestResult }) {
  return (
    <div className="tc-detail-reference-tab-panel">
      <section>
        <h3>Перезапуски</h3>
        <p className="tc-detail-reference-history-note">
          Попытки относятся только к текущему запуску. Итоговой считается последняя попытка.
        </p>
        <RetryAttemptsSection result={result} />
      </section>
    </div>
  );
}

function RetryAttemptsSection({ result }: { result: TestResult }) {
  const attempts = getCurrentRunAttempts(result);

  if (attempts.length <= 1) {
    return <p className="muted">В текущем запуске перезапусков не было.</p>;
  }

  return (
    <div className="tc-detail-reference-attempts" aria-label="Попытки текущего запуска">
      <h4>Попытки текущего запуска</h4>
      <div className="tc-detail-reference-attempt-list">
        {attempts.map((attempt) => (
          <article className={attempt.final ? "is-final" : ""} key={attempt.attempt}>
            <span className={`tc-detail-reference-status-mark ${attempt.status}`}>
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

function ParametersSection({ result }: { result: TestResult }) {
  const parameters = result.parameters ?? [];

  if (parameters.length === 0) {
    return null;
  }

  return (
    <section>
      <h3>Параметры</h3>
      <dl className="tc-detail-reference-parameter-list">
        {parameters.map((parameter) => (
          <div key={`${parameter.name}-${parameter.value}`}>
            <dt>
              {parameter.name}
              {parameter.excluded ? <em>исключен</em> : null}
            </dt>
            <dd className={parameter.masked ? "masked" : undefined}>
              {parameter.masked ? "значение скрыто" : parameter.value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function AttachmentsTab({ result }: { result: TestResult }) {
  const attachments = collectAttachments(result);

  return (
    <div className="tc-detail-reference-tab-panel">
      <section>
        <h3>Вложения</h3>
        {attachments.length === 0 ? (
          <p className="muted">Вложения не переданы в результате.</p>
        ) : (
          <div className="tc-detail-reference-attachments">
            {attachments.map(({ attachment, ownerPath }) => (
              <AttachmentRow
                attachment={attachment}
                key={`${ownerPath}-${attachment.source}-${attachment.name}`}
                ownerPath={ownerPath}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function QuarantineTab({ result }: { result: TestResult }) {
  return (
    <div className="tc-detail-reference-tab-panel">
      <section>
        <h3>Карантин</h3>
        {result.muted || result.defectMute ? (
          <div className="tc-detail-reference-quarantine">
            <strong>Тест помечен как приглушенный</strong>
            <span>
              {result.defectMute?.reason ?? "Причина будет загружена из политики карантина."}
            </span>
          </div>
        ) : (
          <p className="muted">Карантинные правила не применяются.</p>
        )}
      </section>
    </div>
  );
}

function DefectsTab({
  onUnlinkResultDefect,
  result
}: {
  onUnlinkResultDefect?: ((resultId: string, defectId: string) => void) | undefined;
  result: TestResult;
}) {
  const defects = uniqueStrings([result.defect ?? "", ...result.issues]);
  const archivedDefects = result.defectHistory ?? [];

  return (
    <div className="tc-detail-reference-tab-panel">
      <section>
        <h3>Дефекты</h3>
        {defects.length === 0 ? (
          <p className="muted">Дефекты не связаны с тест-кейсом.</p>
        ) : (
          <div className="tc-detail-reference-defects">
            {defects.map((defect) => (
              <article key={defect}>
                <AlertCircle size={16} />
                <div className="tc-detail-reference-defect-copy">
                  <strong>{defect}</strong>
                  <span>Создатель: {getDefectCreator(result, defect)}</span>
                  <span>Связано с текущим результатом</span>
                </div>
                {onUnlinkResultDefect !== undefined ? (
                  <button
                    className="tc-detail-reference-defect-unlink"
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
          <div className="tc-detail-reference-defect-history">
            <h4>История дефектов</h4>
            {archivedDefects.map((defect) => (
              <span key={`${defect.id}-${defect.removedAt}`}>
                {defect.id} · удален из активных связей {formatHistoryDate(defect.removedAt)}
              </span>
            ))}
          </div>
        ) : null}
      </section>
    </div>
  );
}

function StepTreeItem({
  depth = 0,
  index: _index,
  path,
  step
}: {
  depth?: number;
  index: number;
  path: string;
  step: ScenarioStep;
}) {
  const childSteps = step.steps ?? [];
  const attachments = step.attachments ?? [];
  const hasChildren = childSteps.length > 0 || attachments.length > 0;
  const [expanded, setExpanded] = useState(() => shouldExpandScenarioStep(step));

  return (
    <div
      className="tc-detail-reference-step-node"
      role="treeitem"
      aria-expanded={hasChildren ? expanded : undefined}
    >
      <div
        className={`tc-detail-reference-step-line ${step.status}`}
        style={{ "--step-indent": `${depth * 22}px` } as CSSProperties}
      >
        {hasChildren ? (
          <button
            className="tc-detail-reference-step-expander"
            type="button"
            aria-label={expanded ? "Свернуть шаг" : "Раскрыть шаг"}
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
          </button>
        ) : (
          <span className="tc-detail-reference-step-expander" aria-hidden="true" />
        )}
        <span className="tc-detail-reference-step-index">{path}</span>
        <span
          className={`tc-detail-reference-status-mark ${step.status}`}
          title={formatStatus(step.status)}
        >
          <StatusIcon status={step.status} />
        </span>
        <span className="tc-detail-reference-step-copy">
          <strong>{step.name}</strong>
        </span>
        {attachments.length > 0 ? (
          <span className="tc-detail-reference-step-attachments">
            <Paperclip size={13} />
            {attachments.length}
          </span>
        ) : null}
        <span className="tc-detail-reference-step-duration">{step.duration}</span>
      </div>

      {expanded ? (
        <div className="tc-detail-reference-step-children" role="group">
          {childSteps.map((child, childIndex) => (
            <StepTreeItem
              depth={depth + 1}
              index={childIndex}
              key={`${child.name}-${childIndex}`}
              path={`${path}.${childIndex + 1}`}
              step={child}
            />
          ))}
          {attachments.map((attachment) => (
            <StepAttachmentRow
              attachment={attachment}
              depth={depth + 1}
              key={`${step.name}-${attachment.source}-${attachment.name}`}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function StepAttachmentRow({ attachment, depth }: { attachment: ResultAttachment; depth: number }) {
  return (
    <div
      className="tc-detail-reference-step-attachment-row"
      style={{ "--step-indent": `${depth * 22}px` } as CSSProperties}
    >
      <Paperclip size={14} />
      <span>
        <strong>{attachment.name}</strong>
        <small>{attachment.mediaType}</small>
      </span>
      <em>{attachment.size}</em>
      <AttachmentViewerButton attachment={attachment} compact />
      <AttachmentDownloadButton attachment={attachment} compact />
      <AttachmentPreview attachment={attachment} />
    </div>
  );
}

function AttachmentRow({
  attachment,
  ownerPath
}: {
  attachment: ResultAttachment;
  ownerPath: string;
}) {
  return (
    <article>
      <FileText size={15} />
      <span>
        <strong>{attachment.name}</strong>
        <small>
          {ownerPath} · {attachment.mediaType} · {attachment.size}
        </small>
      </span>
      <em>{attachment.retained ? "сохранено" : "очистка"}</em>
      <AttachmentViewerButton attachment={attachment} compact />
      <AttachmentDownloadButton attachment={attachment} compact />
      <AttachmentPreview attachment={attachment} />
    </article>
  );
}

function RailSection({
  onSelectValue,
  title,
  values,
  variant = "rows"
}: {
  title: string;
  values: Array<string | { label: string; url: string }>;
  onSelectValue?: ((value: string) => void) | undefined;
  variant?: "chips" | "rows";
}) {
  const hasValues = values.length > 0;

  return (
    <section
      className={`tc-detail-reference-rail-section rail-section--${variant} ${hasValues ? "" : "is-empty"}`}
    >
      <h3>{title}</h3>
      {hasValues ? (
        <div className="tc-detail-reference-value-list">
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
      ) : null}
    </section>
  );
}

function CustomFieldsRail({ fields }: { fields: TestResult["customFields"] }) {
  const hasFields = fields.length > 0;

  return (
    <section
      className={`tc-detail-reference-rail-section rail-section--fields ${hasFields ? "" : "is-empty"}`}
    >
      <h3>Кастомные поля</h3>
      {hasFields ? (
        <dl className="tc-detail-reference-field-list">
          {fields.map((field) => (
            <div key={`${field.label}-${field.value}`}>
              <dt>{field.label}</dt>
              <dd>{field.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </section>
  );
}

function StatusIcon({ status }: { status: ResultStatus }) {
  if (status === "muted") {
    return <PauseCircle size={15} />;
  }
  if (status === "passed") {
    return <CheckCircle2 size={15} />;
  }
  if (status === "failed") {
    return <XCircle size={15} />;
  }
  if (status === "broken") {
    return <AlertCircle size={15} />;
  }
  return <CircleDashed size={15} />;
}

function isHistoryPointNavigable(
  point: NonNullable<TestResult["historyPoints"]>[number],
  onOpenResult: OpenTestResult | undefined
): boolean {
  return (
    onOpenResult !== undefined && point.launchId.trim() !== "" && point.resultUuid.trim() !== ""
  );
}

function openHistoryPoint(
  point: NonNullable<TestResult["historyPoints"]>[number],
  onOpenResult: OpenTestResult | undefined,
  currentTestCaseId: string
) {
  if (!isHistoryPointNavigable(point, onOpenResult)) {
    return;
  }

  onOpenResult?.(point.resultUuid, point.launchId, point.testCaseId ?? currentTestCaseId);
}
