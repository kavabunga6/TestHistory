import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Bug, Trash2 } from "lucide-react";

import { filterRecordsByQuery } from "../analyticsQuery.js";
import type { TestResult } from "../m1Workspace.js";
import { getHashFromRoute } from "../workspaceRouting.js";
import { ThqlSearchPanel } from "./ThqlSearchPanel.js";

import "./DefectsReferenceScreen.css";

export type DefectStatus = "open" | "closed";
export type DefectStatusFilter = "all" | DefectStatus | "quarantined";

export type DefectSummary = {
  createdBy: string;
  id: string;
  title: string;
  results: TestResult[];
  testCaseCount: number;
  tags: string[];
  owners: string[];
  links: string[];
  quarantine?: NonNullable<TestResult["defectMute"]>;
  status: DefectStatus;
};

type DefectReferenceLink = {
  href: string;
  id: string;
  label: string;
};

type DefectResultLink = {
  duration: string;
  href: string;
  id: string;
  launchName: string;
  name: string;
  owner: string;
  status: TestResult["status"];
  tags: string;
};

const DEFECT_REFERENCE_PAGE_SIZE = 50;
const DEFECT_LIST_WIDTH_KEY = "testhistory:defect-list-width";
const DEFECT_LIST_DEFAULT_WIDTH = 420;
const DEFECT_LIST_MIN_WIDTH = 360;
const DEFECT_LIST_MAX_WIDTH = 720;

function clampDefectListWidth(value: number): number {
  return Math.min(DEFECT_LIST_MAX_WIDTH, Math.max(DEFECT_LIST_MIN_WIDTH, Math.round(value)));
}

function readStoredDefectListWidth(): number {
  if (typeof window === "undefined") {
    return DEFECT_LIST_DEFAULT_WIDTH;
  }

  try {
    const stored = window.localStorage.getItem(DEFECT_LIST_WIDTH_KEY);
    if (stored === null) {
      return DEFECT_LIST_DEFAULT_WIDTH;
    }
    const parsed = Number(stored);
    return Number.isFinite(parsed) ? clampDefectListWidth(parsed) : DEFECT_LIST_DEFAULT_WIDTH;
  } catch {
    return DEFECT_LIST_DEFAULT_WIDTH;
  }
}

function writeStoredDefectListWidth(value: number) {
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(DEFECT_LIST_WIDTH_KEY, String(clampDefectListWidth(value)));
    } catch {
      // The resized column still works for the current visit when storage is unavailable.
    }
  }
}

export function DefectsReferenceScreen({
  onDeleteDefect,
  onOpenDefect,
  routeDefectId,
  results
}: {
  onDeleteDefect?: ((id: string) => void) | undefined;
  onOpenDefect?: ((id: string) => void) | undefined;
  routeDefectId?: string | undefined;
  results: TestResult[];
}) {
  const [query, setQuery] = useState("");
  const [activeFilterId, setActiveFilterId] = useState<string | undefined>();
  const [selectedDefectId, setSelectedDefectId] = useState<string | undefined>();
  const [listWidth, setListWidth] = useState(readStoredDefectListWidth);
  const [resizing, setResizing] = useState(false);
  const screenRef = useRef<HTMLElement | null>(null);

  const defects = useMemo(() => buildDefectSummaries(results), [results]);
  const filteredDefects = useMemo(() => filterDefects(defects, query, "all"), [defects, query]);
  const visibleDefects = filteredDefects.slice(0, DEFECT_REFERENCE_PAGE_SIZE);
  const effectiveSelectedDefectId = routeDefectId ?? selectedDefectId;
  const actorId =
    typeof window === "undefined"
      ? "admin"
      : (window.localStorage.getItem("testhistory.actorId") ?? "admin");
  const selectedDefect =
    visibleDefects.find((defect) => defect.id === effectiveSelectedDefectId) ?? visibleDefects[0];

  useEffect(() => {
    if (!resizing) {
      return;
    }

    const handlePointerMove = (event: PointerEvent) => {
      const screenLeft = screenRef.current?.getBoundingClientRect().left ?? 0;
      const nextWidth = clampDefectListWidth(event.clientX - screenLeft);
      setListWidth(nextWidth);
      writeStoredDefectListWidth(nextWidth);
    };
    const handlePointerUp = () => setResizing(false);

    document.body.classList.add("defects-reference-is-resizing");
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp, { once: true });

    return () => {
      document.body.classList.remove("defects-reference-is-resizing");
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [resizing]);

  const screenStyle = {
    "--defects-reference-list-width": `${listWidth}px`
  } as CSSProperties;

  return (
    <section
      ref={screenRef}
      className={`defects-reference-screen ${resizing ? "is-resizing" : ""}`}
      style={screenStyle}
      aria-label="Дефекты"
    >
      <header className="defects-reference-crumbs">
        <strong>Дефекты</strong>
        {selectedDefect !== undefined ? (
          <>
            <span>/</span>
            <span>{formatDefectDisplayName(selectedDefect)}</span>
          </>
        ) : null}
      </header>

      <div className="defects-reference-workspace">
        <aside className="defects-reference-list-panel" aria-label="Список дефектов">
          <header className="defects-reference-header">
            <h1>
              <span>Дефекты</span>
              <span
                className="defects-reference-count"
                title={`Найдено дефектов: ${formatCount(filteredDefects.length)}`}
              >
                {formatCount(filteredDefects.length)}
              </span>
            </h1>
          </header>

          <ThqlSearchPanel
            activeFilterId={activeFilterId}
            actorId={actorId}
            entity="defects"
            projectId="ws"
            query={query}
            onActiveFilterChange={setActiveFilterId}
            onQueryChange={setQuery}
          />

          <div className="defects-reference-list">
            {visibleDefects.map((defect) => (
              <button
                aria-pressed={selectedDefect?.id === defect.id}
                className={`defects-reference-row ${selectedDefect?.id === defect.id ? "selected" : ""}`}
                key={defect.id}
                type="button"
                onClick={() => {
                  setSelectedDefectId(defect.id);
                  onOpenDefect?.(defect.id);
                }}
              >
                <span className={`defects-reference-status ${defect.status}`}>
                  {formatDefectStatus(defect.status)}
                </span>
                <span className="defects-reference-row-copy">
                  <strong title={defect.title}>{defect.title}</strong>
                  <small title={defect.id}>
                    #{formatDefectId(defect.id)} · Создатель: {defect.createdBy}
                  </small>
                  <small>Тест-кейсы: {defect.testCaseCount}</small>
                </span>
              </button>
            ))}

            {visibleDefects.length === 0 ? (
              <div className="defects-reference-list-empty">
                <Bug size={18} />
                <strong>Дефекты не найдены</strong>
                <span>Измените поиск, чтобы увидеть связанные дефекты.</span>
              </div>
            ) : null}
          </div>

          {filteredDefects.length > DEFECT_REFERENCE_PAGE_SIZE ? (
            <footer className="defects-reference-footer">
              Показано {formatCount(visibleDefects.length)} из {formatCount(filteredDefects.length)}
            </footer>
          ) : null}
        </aside>

        <button
          className="defects-reference-splitter"
          type="button"
          aria-label="Изменить ширину списка дефектов"
          aria-valuemax={DEFECT_LIST_MAX_WIDTH}
          aria-valuemin={DEFECT_LIST_MIN_WIDTH}
          aria-valuenow={listWidth}
          role="separator"
          title="Потяните, чтобы изменить ширину списка"
          onKeyDown={(event) => {
            if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
              return;
            }
            event.preventDefault();
            const direction = event.key === "ArrowLeft" ? -1 : 1;
            const nextWidth = clampDefectListWidth(listWidth + direction * 24);
            setListWidth(nextWidth);
            writeStoredDefectListWidth(nextWidth);
          }}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            setResizing(true);
          }}
        />

        {selectedDefect === undefined ? (
          <DefectEmptyState />
        ) : (
          <DefectDetails defect={selectedDefect} onDeleteDefect={onDeleteDefect} />
        )}
      </div>
    </section>
  );
}

function DefectEmptyState() {
  return (
    <main className="defects-reference-detail-panel empty" aria-label="Детали дефекта">
      <div className="defects-reference-empty-state">
        <Bug size={28} />
        <strong>Выберите дефект для отображения</strong>
      </div>
    </main>
  );
}

function DefectDetails({
  defect,
  onDeleteDefect
}: {
  defect: DefectSummary;
  onDeleteDefect?: ((id: string) => void) | undefined;
}) {
  return (
    <main className="defects-reference-detail-panel" aria-label="Информация о выбранном дефекте">
      <header className="defects-reference-detail-header">
        <div className="defects-reference-detail-title">
          <span className={`defects-reference-status ${defect.status}`}>
            {formatDefectStatus(defect.status)}
          </span>
          <span className="defects-reference-detail-title-copy">
            <small title={defect.id}>#{formatDefectId(defect.id)}</small>
            <h2>{defect.title}</h2>
          </span>
        </div>
        {onDeleteDefect !== undefined ? (
          <div className="defects-reference-detail-actions">
            <button
              className="danger"
              title="Удалить дефект из активных связей, сохранив его в истории тестов"
              type="button"
              onClick={() => onDeleteDefect(defect.id)}
            >
              <Trash2 aria-hidden="true" focusable="false" size={16} strokeWidth={2.2} />
              Удалить
            </button>
          </div>
        ) : null}
      </header>

      <dl className="defects-reference-detail-meta">
        <div>
          <dt>Создан:</dt>
          <dd>{formatCreatedAt(defect)}</dd>
        </div>
        <div>
          <dt>Создатель:</dt>
          <dd>{defect.createdBy}</dd>
        </div>
        <div>
          <dt>Тест-кейсы:</dt>
          <dd>{formatCount(defect.testCaseCount)}</dd>
        </div>
      </dl>

      <div className="defects-reference-detail-grid">
        <DefectSection title="Описание">
          <p>Описание не задано.</p>
        </DefectSection>

        <DefectSection title="Правила автоматизации">
          <p>Автоматические правила для этого дефекта не настроены.</p>
        </DefectSection>

        <DefectSection title="Запуски">
          <DefectSimpleList
            empty="Нет информации о запусках"
            items={collectLaunchLinks(defect).map((launch) => ({
              href: getHashFromRoute({ launchId: launch.id, mode: "launch" }),
              id: launch.id,
              label: launch.label
            }))}
            label="Запуск"
          />
        </DefectSection>

        <DefectSection title="Тест-кейсы">
          <DefectSimpleList
            empty="Нет тест-кейсов"
            items={collectTestCaseLinks(defect).map((testCase) => ({
              href: getHashFromRoute({
                mode: "case",
                testCaseId: testCase.id,
                testCaseTab: "overview"
              }),
              id: testCase.id,
              label: testCase.label
            }))}
            label="Кейс"
          />
        </DefectSection>

        <DefectSection className="wide" title="Результаты тестов">
          <DefectResultList defect={defect} />
        </DefectSection>
      </div>
    </main>
  );
}

function DefectSection({
  children,
  className,
  title
}: {
  children: ReactNode;
  className?: string;
  title: string;
}) {
  return (
    <section className={`defects-reference-section ${className ?? ""}`.trim()}>
      <header>
        <h3>{title}</h3>
      </header>
      {children}
    </section>
  );
}

function DefectSimpleList({
  empty,
  items,
  label
}: {
  empty: string;
  items: DefectReferenceLink[];
  label: string;
}) {
  if (items.length === 0) {
    return <p>{empty}</p>;
  }

  return (
    <div className="defects-reference-simple-list">
      {items.map((item, index) => (
        <a href={item.href} key={item.id}>
          <small>
            {label} {index + 1}
          </small>
          <strong>{item.label}</strong>
        </a>
      ))}
    </div>
  );
}

function DefectResultList({ defect }: { defect: DefectSummary }) {
  const linkedResults = collectResultLinks(defect);

  if (linkedResults.length === 0) {
    return <p>Нет результатов тестов</p>;
  }

  return (
    <div className="defects-reference-result-list">
      <div className="defects-reference-result-head" aria-hidden="true">
        <span>Статус</span>
        <span>Результат</span>
        <span>Окружение</span>
        <span>Длительность</span>
      </div>
      {linkedResults.map((result) => (
        <a className="defects-reference-result-row" href={result.href} key={result.id}>
          <span className={`defects-reference-result-status ${result.status}`}>
            {formatResultStatus(result.status)}
          </span>
          <span>
            <strong>{result.name}</strong>
            <small>{result.launchName}</small>
          </span>
          <span>
            <strong>{result.owner}</strong>
            <small>{result.tags}</small>
          </span>
          <time>{result.duration}</time>
        </a>
      ))}
    </div>
  );
}

export function buildDefectSummaries(results: TestResult[]): DefectSummary[] {
  const groups = new Map<string, TestResult[]>();

  for (const result of results) {
    if (result.defect === undefined || result.defect.trim().length === 0) {
      continue;
    }

    groups.set(result.defect, [...(groups.get(result.defect) ?? []), result]);
  }

  return [...groups.entries()]
    .map(([id, groupedResults]) => {
      const quarantine = groupedResults.find(
        (result) => result.defectMute !== undefined
      )?.defectMute;
      const hasActiveFailure = groupedResults.some(
        (result) => result.status === "failed" || result.status === "broken"
      );
      const status: DefectStatus = hasActiveFailure ? "open" : "closed";
      const base = {
        createdBy: groupedResults[0]?.owner || "Не назначен",
        id,
        title: groupedResults[0]?.name ?? id,
        results: groupedResults,
        testCaseCount: new Set(groupedResults.map((result) => result.id)).size,
        tags: uniqueValues(groupedResults.flatMap((result) => result.tags)),
        owners: uniqueValues(groupedResults.map((result) => result.owner)),
        links: uniqueValues(
          groupedResults.flatMap((result) => [...result.issues, ...result.links])
        ),
        status
      };

      return quarantine === undefined ? base : { ...base, quarantine };
    })
    .sort((left, right) => {
      const statusOrder = { open: 0, closed: 1 } satisfies Record<DefectStatus, number>;
      return (
        statusOrder[left.status] - statusOrder[right.status] || left.id.localeCompare(right.id)
      );
    });
}

export function filterDefects(
  defects: DefectSummary[],
  query: string,
  statusFilter: DefectStatusFilter
): DefectSummary[] {
  const normalizedQuery = query.trim().toLowerCase();
  const statusMatchedDefects = defects.filter((defect) =>
    matchesDefectStatusFilter(defect, statusFilter)
  );

  if (normalizedQuery.length > 0 && isLikelyThqlQuery(query)) {
    try {
      return filterRecordsByQuery(statusMatchedDefects, query, toDefectSearchRecord);
    } catch {
      return [];
    }
  }

  return statusMatchedDefects.filter((defect) => {
    const matchesQuery =
      normalizedQuery.length === 0 ||
      [
        defect.id,
        defect.title,
        defect.status,
        formatDefectStatus(defect.status),
        ...defect.tags,
        ...defect.owners,
        ...defect.links,
        ...defect.results.map((result) => result.name)
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery);

    return matchesQuery;
  });
}

function matchesDefectStatusFilter(defect: DefectSummary, statusFilter: DefectStatusFilter) {
  return (
    statusFilter === "all" ||
    (statusFilter === "quarantined"
      ? defect.quarantine !== undefined
      : defect.status === statusFilter)
  );
}

function toDefectSearchRecord(defect: DefectSummary) {
  return {
    id: defect.id,
    link: defect.links,
    owner: defect.owners,
    quarantined: defect.quarantine !== undefined,
    status: defect.status,
    tag: defect.tags,
    tags: defect.tags,
    testcasecount: defect.testCaseCount,
    title: defect.title
  };
}

function isLikelyThqlQuery(query: string): boolean {
  return /(?:=|!=|~=|>=|<=|>|<|\bin\b|\band\b|\bor\b|\bnot\b|\[|\])/i.test(query);
}

function collectLaunchLinks(defect: DefectSummary): Array<{ id: string; label: string }> {
  const launches = new Map<string, string>();

  for (const result of defect.results) {
    const candidates = [
      result.historyCompare?.to,
      result.historyCompare?.from,
      ...(result.historyPoints ?? [])
    ];
    for (const candidate of candidates) {
      if (
        candidate?.launchId !== undefined &&
        candidate.launchId.trim().length > 0 &&
        candidate.launchName.trim().length > 0
      ) {
        launches.set(candidate.launchId, candidate.launchName);
      }
    }
  }

  return [...launches].map(([id, label]) => ({ id, label }));
}

function collectTestCaseLinks(defect: DefectSummary): Array<{ id: string; label: string }> {
  const testCases = new Map<string, string>();

  for (const result of defect.results) {
    for (const id of result.testKeys) {
      if (id.trim().length > 0) {
        testCases.set(id, id);
      }
    }
  }

  return [...testCases].map(([id, label]) => ({ id, label }));
}

function collectResultLinks(defect: DefectSummary): DefectResultLink[] {
  const results = new Map<string, DefectResultLink>();

  for (const result of defect.results) {
    for (const point of result.historyPoints ?? []) {
      if (point.launchId.trim().length === 0 || point.resultUuid.trim().length === 0) {
        continue;
      }

      const testCaseId = point.testCaseId ?? result.testKeys[0] ?? result.allureId;
      const id = `${point.launchId}:${point.resultUuid}`;
      results.set(id, {
        duration: point.duration,
        href: getHashFromRoute({
          launchId: point.launchId,
          mode: "launch",
          resultId: point.resultUuid,
          resultTab: "overview"
        }),
        id,
        launchName: point.launchName,
        name: testCaseId,
        owner: result.owner || "Не назначен",
        status: point.status,
        tags: result.tags.slice(0, 3).join(", ") || "Без тегов"
      });
    }
  }

  return [...results.values()];
}

function formatDefectDisplayName(defect: DefectSummary): string {
  return `#${formatDefectId(defect.id)} ${defect.title}`;
}

function formatDefectId(id: string): string {
  const normalizedId = id.replace(/^defect:/i, "");
  return normalizedId.length > 12 ? `${normalizedId.slice(0, 8)}…` : normalizedId;
}

function formatCreatedAt(defect: DefectSummary): string {
  const startedAt =
    defect.results[0]?.historyCompare?.to.startedAt ??
    defect.results[0]?.historyCompare?.from.startedAt ??
    defect.results[0]?.historyPoints?.[0]?.startedAt;

  if (startedAt === undefined) {
    return "неизвестно";
  }

  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(startedAt));
}

function uniqueValues(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function formatDefectStatus(status: DefectStatus): string {
  return status === "closed" ? "ЗАКРЫТ" : "ОТКРЫТ";
}

function formatResultStatus(status: TestResult["status"]): string {
  const labels: Record<TestResult["status"], string> = {
    broken: "Сломан",
    failed: "Провален",
    muted: "Карантин",
    passed: "Пройден",
    skipped: "Пропущен"
  };

  return labels[status];
}

function formatCount(count: number): string {
  return count.toLocaleString("ru-RU");
}
