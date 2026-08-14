import { useMemo, useState } from "react";

import type { TestResult } from "../m1Workspace.js";
import { filterResults } from "./TestCaseDetailReferenceUtils.js";
import { ThqlSearchPanel } from "./ThqlSearchPanel.js";

import "./TestCaseListReferenceScreen.css";

type TestCaseListReferenceScreenProps = {
  results: TestResult[];
  onSelect?: ((id: string) => void) | undefined;
};

export function TestCaseListReferenceScreen({
  results,
  onSelect
}: TestCaseListReferenceScreenProps) {
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const [query, setQuery] = useState("");
  const [activeFilterId, setActiveFilterId] = useState<string | undefined>();

  const actorId =
    typeof window === "undefined"
      ? "admin"
      : (window.localStorage.getItem("testhistory.actorId") ?? "admin");
  const visibleResults = useMemo(() => filterResults(results, query), [query, results]);

  function handleRowClick(id: string) {
    setSelectedId(id);
    onSelect?.(id);
  }

  return (
    <section className="test-case-list-reference-screen" aria-label="Список тест-кейсов">
      <header className="test-case-list-reference-topbar">
        <h1 aria-label="Тест-кейсы">
          <span>Тест-кейсы</span>
          <span
            className="test-case-list-reference-count"
            title={`Показано ${visibleResults.length.toLocaleString("ru-RU")} из ${results.length.toLocaleString("ru-RU")}`}
            aria-hidden="true"
          >
            {visibleResults.length.toLocaleString("ru-RU")}
          </span>
        </h1>
      </header>

      <section className="test-case-list-reference-controls" aria-label="Поиск и фильтры">
        <ThqlSearchPanel
          activeFilterId={activeFilterId}
          actorId={actorId}
          entity="testCases"
          projectId="ws"
          query={query}
          onActiveFilterChange={setActiveFilterId}
          onQueryChange={setQuery}
        />
      </section>

      <div className="test-case-list-reference-list" role="list" aria-label="Тест-кейсы">
        {visibleResults.map((result) => (
          <button
            className={`test-case-list-reference-row ${selectedId === result.id ? "selected" : ""}`}
            key={result.id}
            type="button"
            role="listitem"
            onClick={() => handleRowClick(result.id)}
            aria-pressed={selectedId === result.id}
            aria-label={`${result.name}, владелец ${result.owner}, ID ${result.allureId}`}
          >
            <span className="test-case-list-reference-copy">
              <span className="test-case-list-reference-name" title={result.name}>
                {result.name}
              </span>
              <span className="test-case-list-reference-id" title={result.id}>
                ID {compactTechnicalId(result.id)}
              </span>
            </span>
            <span className="test-case-list-reference-meta">
              <span>{result.owner}</span>
              <span>#{result.allureId}</span>
            </span>
          </button>
        ))}

        {visibleResults.length === 0 ? (
          <div className="test-case-list-reference-empty-state">Ничего не найдено</div>
        ) : null}
      </div>
    </section>
  );
}

function compactTechnicalId(value: string) {
  return value.length > 12 ? `${value.slice(0, 8)}…` : value;
}
