import { useEffect, useMemo, useState } from "react";
import { Bug, MoreHorizontal, Search, SlidersHorizontal } from "lucide-react";

import type { ResultStatus, TestResult } from "./m1Workspace.js";
import { formatListCount, ReadOnlyAction, StatusBadge } from "./workspaceCommon.js";
import { formatAuditDate } from "./workspaceDate.js";
export function DefectsWorkspace({ results }: { results: TestResult[] }) {
  const [defectQuery, setDefectQuery] = useState("");
  const [selectedDefectId, setSelectedDefectId] = useState<string | undefined>();
  const allDefectSummaries = useMemo(() => buildDefectSummaries(results), [results]);
  const defectSummaries = useMemo(
    () => filterDefectSummaries(allDefectSummaries, defectQuery),
    [allDefectSummaries, defectQuery]
  );
  const selectedDefect = getVisibleSelectedDefect(defectSummaries, selectedDefectId);

  useEffect(() => {
    if (selectedDefect !== undefined && selectedDefect.id !== selectedDefectId) {
      setSelectedDefectId(selectedDefect.id);
    }
  }, [selectedDefect, selectedDefectId]);

  return (
    <section className="defects-workspace">
      <section className="defects-list-panel" aria-label="Список дефектов">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Дефекты</span>
            <h2>Дефекты</h2>
          </div>
          <div className="toolbar">
            <ReadOnlyAction
              icon={<SlidersHorizontal size={16} />}
              label="Опции фильтра применены"
            />
            <ReadOnlyAction icon={<Bug size={16} />} label="Дефекты из read model" />
          </div>
        </div>
        <label className="search-field">
          <Search size={17} />
          <input
            aria-label="Поиск дефектов"
            placeholder="Поиск и фильтрация"
            value={defectQuery}
            onChange={(event) => setDefectQuery(event.target.value)}
          />
        </label>
        <div className="defects-count">
          <span>Нет сохраненных фильтров</span>
          <strong>Дефекты: {formatListCount(defectSummaries.length)}</strong>
        </div>
        <div className="defect-list">
          {defectSummaries.map((defect) => (
            <button
              className={`defect-row ${selectedDefect?.id === defect.id ? "selected" : ""}`}
              key={defect.id}
              type="button"
              onClick={() => setSelectedDefectId(defect.id)}
            >
              <input
                aria-label={`Выбрать дефект ${defect.title}`}
                tabIndex={-1}
                type="checkbox"
                readOnly
              />
              <span
                className={`defect-state ${defect.activeMute === undefined ? "open" : "muted"}`}
              >
                {defect.activeMute === undefined ? "ОТКРЫТ" : "КАРАНТИН"}
              </span>
              <span className="defect-row-title">
                <strong>{defect.title}</strong>
                <small>Тест-кейсы: {formatListCount(defect.testCaseCount)}</small>
              </span>
              <span className="defect-row-counters">
                {defect.failedCount > 0 ? <em className="failed">{defect.failedCount}</em> : null}
                {defect.brokenCount > 0 ? <em className="broken">{defect.brokenCount}</em> : null}
              </span>
            </button>
          ))}
          {defectSummaries.length === 0 ? (
            <div className="empty-state">
              <strong>Дефекты не найдены</strong>
              <span>
                Измените поиск или дождитесь проваленных/сломанных результатов со связанными
                задачами.
              </span>
            </div>
          ) : null}
        </div>
      </section>

      {selectedDefect !== undefined ? (
        <DefectDetails defect={selectedDefect} />
      ) : (
        <aside className="defect-detail-panel empty-detail-panel">
          <div className="empty-state">
            <Bug size={22} />
            <strong>Выберите дефект для отображения</strong>
            <span>Слева показаны только дефекты текущего проекта.</span>
          </div>
        </aside>
      )}
    </section>
  );
}
type DefectSummary = {
  id: string;
  title: string;
  results: TestResult[];
  failedCount: number;
  brokenCount: number;
  skippedCount: number;
  passedCount: number;
  testCaseCount: number;
  tags: string[];
  owners: string[];
  activeMute?: NonNullable<TestResult["defectMute"]>;
};

function buildDefectSummaries(results: TestResult[]): DefectSummary[] {
  const groups = new Map<string, TestResult[]>();

  for (const result of results) {
    if (result.defect === undefined) {
      continue;
    }

    const current = groups.get(result.defect) ?? [];
    current.push(result);
    groups.set(result.defect, current);
  }

  return [...groups.entries()]
    .map(([defectId, groupedResults]) => {
      const counts = getStatusCounts(groupedResults);
      const tags = uniqueValues(groupedResults.flatMap((result) => result.tags)).slice(0, 6);
      const owners = uniqueValues(groupedResults.map((result) => result.owner).filter(Boolean));
      const activeMute = groupedResults.find(
        (result) => result.defectMute !== undefined
      )?.defectMute;
      const base = {
        id: defectId,
        title: defectId,
        results: groupedResults,
        failedCount: counts.failed,
        brokenCount: counts.broken,
        skippedCount: counts.skipped,
        passedCount: counts.passed,
        testCaseCount: new Set(groupedResults.map((result) => result.id)).size,
        tags,
        owners
      };

      return activeMute === undefined ? base : { ...base, activeMute };
    })
    .sort((left, right) => {
      const leftRed = left.failedCount + left.brokenCount;
      const rightRed = right.failedCount + right.brokenCount;
      return rightRed - leftRed || left.title.localeCompare(right.title);
    });
}

export function filterDefectSummaries(defects: DefectSummary[], query: string): DefectSummary[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (normalizedQuery.length === 0) {
    return defects;
  }

  return defects.filter((defect) =>
    [
      defect.id,
      defect.title,
      ...defect.tags,
      ...defect.owners,
      ...defect.results.map((result) => `${result.name} ${result.id} ${result.allureId}`)
    ]
      .join(" ")
      .toLowerCase()
      .includes(normalizedQuery)
  );
}

export function getVisibleSelectedDefect(
  defects: DefectSummary[],
  selectedId: string | undefined
): DefectSummary | undefined {
  return defects.find((defect) => defect.id === selectedId) ?? defects[0];
}

function uniqueValues(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

function getStatusCounts(items: TestResult[]): Record<ResultStatus, number> {
  return items.reduce(
    (counts, item) => {
      if (item.status !== "muted") {
        counts[item.status] += 1;
      }
      return counts;
    },
    { passed: 0, failed: 0, broken: 0, skipped: 0, muted: 0 }
  );
}

function DefectDetails({ defect }: { defect: DefectSummary }) {
  const mainResult = defect.results[0];

  return (
    <aside className="defect-detail-panel" aria-label="Информация о выбранном дефекте">
      <header className="defect-detail-header">
        <div>
          <span className={`defect-state ${defect.activeMute === undefined ? "open" : "muted"}`}>
            {defect.activeMute === undefined ? "ОТКРЫТ" : "КАРАНТИН"}
          </span>
          <h2>{defect.title}</h2>
          <p>
            {formatListCount(defect.testCaseCount)} тест-кейсов ·{" "}
            {formatListCount(defect.results.length)} результатов
          </p>
        </div>
        <ReadOnlyAction icon={<MoreHorizontal size={18} />} label="Действия в API" />
      </header>

      <section className="defect-detail-tabs" aria-label="Разделы дефекта">
        <span className="active">Обзор</span>
        <span>История</span>
        <span>Тест-кейсы</span>
      </section>

      <section className="defect-overview-list" aria-label="Сводка дефекта">
        <div>
          <span>Провалены</span>
          <strong>{formatListCount(defect.failedCount)}</strong>
        </div>
        <div>
          <span>Сломаны</span>
          <strong>{formatListCount(defect.brokenCount)}</strong>
        </div>
        <div>
          <span>Пройдены</span>
          <strong>{formatListCount(defect.passedCount)}</strong>
        </div>
        <div>
          <span>Пропущены</span>
          <strong>{formatListCount(defect.skippedCount)}</strong>
        </div>
      </section>

      <section className="defect-detail-section">
        <h3>Описание</h3>
        <p>
          Дефект связан с результатами автотестов текущего проекта. Ниже показаны только
          пользовательские данные: статус, связанные тесты, теги и карантин.
        </p>
      </section>

      <section className="defect-detail-section">
        <h3>Связанные тесты</h3>
        <div className="defect-linked-tests">
          {defect.results.map((result) => (
            <article key={result.id}>
              <StatusBadge status={result.status} />
              <span>
                <strong>{result.name}</strong>
                <small>
                  AllureID {result.allureId} / {result.id}
                </small>
              </span>
              <em>{result.duration}</em>
            </article>
          ))}
        </div>
      </section>

      <aside className="defect-side-info">
        <section>
          <h3>Карантин</h3>
          {defect.activeMute === undefined ? (
            <span>Активного карантина нет</span>
          ) : defect.activeMute.expiresAt !== undefined ? (
            <span>Активен до {formatAuditDate(defect.activeMute.expiresAt)}</span>
          ) : (
            <span>Активен без срока</span>
          )}
        </section>
        <section>
          <h3>Владелец</h3>
          <span>{defect.owners.join(", ") || mainResult?.owner || "Не назначен"}</span>
        </section>
        <section>
          <h3>Теги</h3>
          <div>
            {(defect.tags.length > 0 ? defect.tags : ["Нет тегов"]).map((tag) => (
              <em key={tag}>{tag}</em>
            ))}
          </div>
        </section>
      </aside>
    </aside>
  );
}
