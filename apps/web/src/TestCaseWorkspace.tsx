import { useEffect, useState } from "react";
import {
  AlertTriangle,
  CircleDot,
  Clock3,
  GitBranch,
  MoreHorizontal,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  UploadCloud
} from "lucide-react";

import type { ApiState } from "./api.js";
import { ApiStateNotice } from "./ApiStateNotice.js";
import { AttachmentList } from "./AttachmentList.js";
import { TestCaseHistoryCompare } from "./HistoryComparePanels.js";
import type { TestResult } from "./m1Workspace.js";
import { StepList, TestCaseOverview, ValueGroup } from "./ResultDetails.js";
import {
  EmptyState,
  formatListCount,
  ListReadinessPanel,
  ReadOnlyAction
} from "./workspaceCommon.js";
import { formatAuditDate } from "./workspaceDate.js";
import {
  LIST_PAGE_SIZE,
  statusLabels,
  testCaseDetailTabs,
  type TestCaseDetailTab
} from "./workspaceRouting.js";
export function TestCaseWorkspace({
  apiState,
  results,
  selectedId,
  onSelect
}: {
  apiState: ApiState;
  results: TestResult[];
  selected: TestResult;
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const [filter, setFilter] = useState<TestCaseListFilter>("Все");
  const [query, setQuery] = useState("");
  const [selectedCaseIds, setSelectedCaseIds] = useState<Set<string>>(new Set());
  const filteredResults = filterTestCaseResults(results, filter, query);
  const visibleResults = filteredResults.slice(0, LIST_PAGE_SIZE);
  const detailResult = getVisibleSelectedTestCase(filteredResults, selectedId);

  useEffect(() => {
    if (detailResult !== undefined && detailResult.id !== selectedId) {
      onSelect(detailResult.id);
    }
  }, [detailResult, onSelect, selectedId]);

  const toggleCase = (id: string) => {
    setSelectedCaseIds((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  return (
    <section className="case-layout">
      <section className="case-list">
        <ApiStateNotice
          apiState={apiState}
          readyText="Тест-кейсы загружены из выбранного запуска и сопоставлены с Allure-совместимыми идентификаторами."
          scope="тест-кейсы"
        />
        <div className="section-heading">
          <div>
            <span className="eyebrow">Репозиторий</span>
            <h2>Все тест-кейсы</h2>
          </div>
          <div className="toolbar">
            <ReadOnlyAction icon={<SlidersHorizontal size={16} />} label="Вид сохранен" />
            <ReadOnlyAction icon={<UploadCloud size={16} />} label="Импорт через API" />
          </div>
        </div>
        <div className="filter-strip">
          {testCaseListFilters.map((item) => (
            <button
              className={filter === item ? "active" : ""}
              key={item}
              type="button"
              aria-pressed={filter === item}
              onClick={() => setFilter(item)}
            >
              {item}
            </button>
          ))}
        </div>
        <label className="search-field">
          <Search size={17} />
          <input
            placeholder="Поиск тест-кейсов"
            aria-label="Поиск тест-кейсов"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <span className="ready-pill">Готово</span>
        </label>
        <ListReadinessPanel
          rendered={visibleResults.length}
          scope="Тест-кейсы"
          states={{ filter: "ready", pagination: "ready", search: "ready", sort: "ready" }}
          total={filteredResults.length}
        />
        {selectedCaseIds.size > 0 ? (
          <div className="bulk-strip">
            <span>{selectedCaseIds.size} выбрано</span>
            <ReadOnlyAction label="Выбор готов для API операции" />
          </div>
        ) : null}
        <div className="case-items">
          {visibleResults.map((result) => (
            <article
              className={`case-item ${selectedId === result.id ? "selected" : ""}`}
              key={result.id}
            >
              <input
                aria-label={`Выбрать ${result.name}`}
                checked={selectedCaseIds.has(result.id)}
                type="checkbox"
                onChange={() => toggleCase(result.id)}
              />
              <button type="button" onClick={() => onSelect(result.id)}>
                <span className={`status-dot ${result.status}`} />
                <span>
                  <strong>{result.name}</strong>
                  <small>
                    AllureID {result.allureId} / {result.id}
                  </small>
                  <IdentityStateBadges result={result} compact />
                </span>
                <small>{result.owner}</small>
              </button>
            </article>
          ))}
          {filteredResults.length === 0 ? (
            <div className="empty-state">
              <strong>Нет тест-кейсов для выбранного вида</strong>
              <span>Измените фильтр или поисковый запрос.</span>
            </div>
          ) : null}
        </div>
        <div className="case-footer">
          <span>
            Показано {formatListCount(visibleResults.length)} из{" "}
            {formatListCount(filteredResults.length)}, нестабильных:{" "}
            {results.filter((result) => new Set(result.history).size > 1).length}
          </span>
          <ReadOnlyAction label="Создание через API" />
        </div>
      </section>
      {detailResult !== undefined ? (
        <TestCaseDetails apiState={apiState} result={detailResult} />
      ) : (
        <EmptyTestCaseDetails filter={filter} query={query} />
      )}
    </section>
  );
}

const testCaseListFilters = ["Все", "Падали недавно", "Без владельца"] as const;
type TestCaseListFilter = (typeof testCaseListFilters)[number];

export function filterTestCaseResults(
  results: TestResult[],
  filter: TestCaseListFilter,
  query: string
): TestResult[] {
  const normalizedQuery = query.trim().toLowerCase();

  return results.filter((result) => {
    const matchesFilter =
      filter === "Все" ||
      (filter === "Падали недавно" && result.history.includes("failed")) ||
      (filter === "Без владельца" && result.owner.length === 0);
    const haystack = `${result.name} ${result.id} ${result.allureId} ${result.owner}`.toLowerCase();
    return matchesFilter && haystack.includes(normalizedQuery);
  });
}

export function getVisibleSelectedTestCase(
  filteredResults: TestResult[],
  selectedId: string
): TestResult | undefined {
  return filteredResults.find((result) => result.id === selectedId) ?? filteredResults[0];
}

function EmptyTestCaseDetails({ filter, query }: { filter: TestCaseListFilter; query: string }) {
  const normalizedQuery = query.trim();

  return (
    <aside className="details-panel case-details empty-detail-panel">
      <div className="empty-state">
        <strong>Тест-кейс не выбран</strong>
        <span>
          По фильтру "{filter}"{normalizedQuery ? ` и запросу "${normalizedQuery}"` : ""} нет
          подходящих тест-кейсов.
        </span>
      </div>
    </aside>
  );
}

function TestCaseDetails({ apiState, result }: { apiState: ApiState; result: TestResult }) {
  const [activeTab, setActiveTab] = useState<TestCaseDetailTab>("overview");

  useEffect(() => {
    setActiveTab("overview");
  }, [result.id]);

  return (
    <aside className="details-panel case-details">
      <PanelTitle result={result} subtitle="Тест-кейс" />
      <nav className="case-detail-tabs" aria-label="Вкладки выбранного тест-кейса">
        {testCaseDetailTabs.map((tab) => {
          return (
            <button
              aria-current={activeTab === tab.id ? "page" : undefined}
              className={activeTab === tab.id ? "active" : ""}
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          );
        })}
      </nav>
      <TestCaseDetailTabContent apiState={apiState} result={result} tab={activeTab} />
    </aside>
  );
}

export function TestCaseDetailTabContent({
  apiState = { loading: false },
  result,
  tab
}: {
  apiState?: ApiState;
  result: TestResult;
  tab: TestCaseDetailTab;
}) {
  if (tab === "history") {
    return (
      <div className="case-tab-content">
        <TestCaseIdentityHistory result={result} />
        <TestCaseHistoryCompare apiState={apiState} result={result} />
      </div>
    );
  }

  if (tab === "scenario") {
    return (
      <div className="case-tab-content">
        <StepList steps={result.steps} />
      </div>
    );
  }

  if (tab === "overview") {
    return <TestCaseOverview result={result} />;
  }

  if (tab === "attachments") {
    return <AttachmentList apiState={apiState} attachments={result.attachments ?? []} />;
  }

  if (tab === "quarantine") {
    return <TestCaseQuarantineDetails result={result} />;
  }

  if (tab === "defects") {
    return <TestCaseDefectDetails result={result} />;
  }

  if (tab === "changelog") {
    return <TestCaseChangeLog result={result} />;
  }

  return (
    <div className="case-tab-content">
      <EmptyState
        title={`${testCaseDetailTabs.find((item) => item.id === tab)?.label ?? "Вкладка"} недоступна`}
        copy="Для этой вкладки нет данных в текущем read model."
      />
    </div>
  );
}

function TestCaseQuarantineDetails({ result }: { result: TestResult }) {
  const values = [
    result.muted ? "Активный карантин" : "Активного карантина нет",
    `Текущий статус: ${statusLabels[result.status]}`,
    result.previousStatus
      ? `До карантина: ${statusLabels[result.previousStatus]}`
      : "Предыдущий статус не менялся",
    result.defect ? `Связанный дефект: ${result.defect}` : "Связанный дефект не назначен"
  ];

  return (
    <section className="detail-section">
      <h3>Карантины</h3>
      <div className="label-link-grid">
        <ValueGroup label="Состояние" values={values} />
        <ValueGroup
          label="Теги"
          values={result.tags.filter((tag) => /mute|quarantine/i.test(tag))}
        />
      </div>
    </section>
  );
}

function TestCaseDefectDetails({ result }: { result: TestResult }) {
  const historyValues = (result.defectHistory ?? []).map(
    (item) =>
      `${item.id}: ${item.title}${item.removedAt ? ` / удален ${formatAuditDate(item.removedAt)}` : ""}`
  );

  return (
    <section className="detail-section">
      <h3>Дефекты</h3>
      <div className="label-link-grid">
        <ValueGroup
          label="Активные связи"
          values={[...(result.defect ? [result.defect] : []), ...result.issues]}
        />
        <ValueGroup label="История связей" values={historyValues} />
      </div>
    </section>
  );
}

function TestCaseChangeLog({ result }: { result: TestResult }) {
  const entries = result.history.map((status, index) => ({
    id: `${result.id}-${status}-${index}`,
    label: `Запуск #${1285 + index}`,
    value: `${statusLabels[status]} / ${index === result.history.length - 1 ? result.duration : "1.12s"}`
  }));

  return (
    <section className="detail-section">
      <h3>Журнал изменений</h3>
      <div className="history-timeline compact">
        {entries.map((entry) => (
          <div className="history-point" key={entry.id}>
            <GitBranch size={16} />
            <span>{entry.label}</span>
            <small>{entry.value}</small>
          </div>
        ))}
      </div>
    </section>
  );
}

function PanelTitle({ result, subtitle }: { result: TestResult; subtitle: string }) {
  return (
    <div className="panel-title">
      <div>
        <p>{subtitle}</p>
        <h2>
          <span className="allure-id">ID Allure {result.allureId}</span>
          {result.name}
        </h2>
      </div>
      <ReadOnlyAction icon={<MoreHorizontal size={18} />} label="Действия во вкладках" />
    </div>
  );
}

function IdentityStateBadges({
  result,
  compact = false
}: {
  result: TestResult;
  compact?: boolean;
}) {
  const identity = result.identity;

  if (identity === undefined) {
    return compact ? null : (
      <span className="identity-badges" aria-label="Состояние идентичности">
        <span className="identity-badge stable">Стабильная идентичность</span>
      </span>
    );
  }

  return (
    <span className="identity-badges" aria-label="Состояние идентичности">
      <span className={`identity-badge ${identity.state}`}>
        {formatIdentityState(identity.state)}
      </span>
      {!compact ? (
        <span className="identity-badge confidence">
          Уверенность {Math.round(identity.confidence * 100)}%
        </span>
      ) : null}
    </span>
  );
}

function TestCaseIdentityHistory({ result }: { result: TestResult }) {
  const identity = result.identity;

  return (
    <section className="detail-section identity-history">
      <div className="identity-history-title">
        <div>
          <h3>История идентичности</h3>
          <p>Сопоставление Allure-идентификаторов и аудит корректировок кейса.</p>
        </div>
        <IdentityStateBadges result={result} />
      </div>
      {identity === undefined ? (
        <EmptyState
          title="Стабильная идентичность"
          copy="Для этого тест-кейса нет корректировок, разделений, слияний или сомнительных совпадений."
        />
      ) : (
        <div className="identity-history-grid">
          <article>
            <GitBranch size={16} />
            <span>Идентификатор истории</span>
            <strong>{identity.historyId}</strong>
          </article>
          <article>
            <CircleDot size={16} />
            <span>Канонический кейс</span>
            <strong>{identity.canonicalTestCaseId}</strong>
          </article>
          <article>
            <Clock3 size={16} />
            <span>Изменено</span>
            <strong>{formatIdentityChangedAt(identity.changedAt)}</strong>
          </article>
          <article>
            <ShieldCheck size={16} />
            <span>Автор</span>
            <strong>{identity.actor}</strong>
          </article>
          <article className="wide">
            <AlertTriangle size={16} />
            <span>Причина</span>
            <strong>{identity.reason}</strong>
          </article>
          <IdentityValueList
            label="Предыдущие history id"
            values={identity.previousHistoryIds ?? []}
          />
          <IdentityValueList
            label="Связанные тест-кейсы"
            values={identity.relatedTestCaseIds ?? []}
          />
        </div>
      )}
    </section>
  );
}

function IdentityValueList({ label, values }: { label: string; values: string[] }) {
  return (
    <article className="wide identity-value-list">
      <span>{label}</span>
      {values.length === 0 ? (
        <strong>None recorded</strong>
      ) : (
        <div>
          {values.map((value) => (
            <code key={value}>{value}</code>
          ))}
        </div>
      )}
    </article>
  );
}

function formatIdentityState(state: NonNullable<TestResult["identity"]>["state"]): string {
  const labels: Record<NonNullable<TestResult["identity"]>["state"], string> = {
    corrected: "Идентичность исправлена",
    split: "История разделена",
    merged: "История объединена",
    uncertain: "Сомнительное совпадение"
  };

  return labels[state];
}

function formatIdentityChangedAt(value: string): string {
  return formatAuditDate(value);
}
