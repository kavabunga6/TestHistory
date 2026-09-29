import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode
} from "react";
import { Bug, Trash2 } from "lucide-react";

import { filterRecordsByQuery } from "../analyticsQuery.js";
import type { TestResult } from "../m1Workspace.js";
import { isLikelyThqlQuery } from "../thqlQueryDetection.js";
import { getHashFromRoute } from "../workspaceRouting.js";
import { formatResultDuration } from "./LaunchesResultDuration.js";
import {
  ReferenceListPagination,
  referenceListPageSize,
  useReferenceListPagination,
  type ReferenceListPage
} from "./ReferenceListPagination.js";
import { ThqlSearchPanel } from "./ThqlSearchPanel.js";
import { useResizableListWidth } from "./useResizableListWidth.js";

import "./DefectsReferenceScreen.css";

export type DefectStatus = "open" | "closed";
export type DefectStatusFilter = "all" | DefectStatus | "quarantined";

export type DefectSummary = {
  id: string;
  title: string;
  results: TestResult[];
  testCaseCount: number;
  affectedTestIds: string[];
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
  tags: string[];
};

const DEFECT_LIST_WIDTH_KEY = "testhistory:defect-list-width";
const DEFECT_LIST_DEFAULT_WIDTH = 420;
const DEFECT_LIST_MIN_WIDTH = 360;
const DEFECT_LIST_MAX_WIDTH = 720;

export function DefectsReferenceScreen({
  onDeleteDefect,
  onOpenDefect,
  onPageIndexChange,
  onPageSizeChange,
  page: serverPage,
  pageIndex: serverPageIndex,
  pageSize: serverPageSize,
  projectId = "ws",
  query: controlledQuery,
  onQueryChange,
  routeDefectId,
  results,
  selectedDetail
}: {
  onDeleteDefect?: ((id: string) => void) | undefined;
  onOpenDefect?: ((id: string) => void) | undefined;
  onPageIndexChange?: ((index: number) => void) | undefined;
  onPageSizeChange?: ((size: number) => void) | undefined;
  page?: ReferenceListPage | undefined;
  pageIndex?: number | undefined;
  pageSize?: number | undefined;
  projectId?: string | undefined;
  query?: string | undefined;
  onQueryChange?: ((query: string) => void) | undefined;
  routeDefectId?: string | undefined;
  results: TestResult[];
  selectedDetail?: TestResult | undefined;
}) {
  const [localQuery, setLocalQuery] = useState("");
  const query = controlledQuery ?? localQuery;
  const setQuery = onQueryChange ?? setLocalQuery;
  const [activeFilterId, setActiveFilterId] = useState<string | undefined>();
  const [selectedDefectId, setSelectedDefectId] = useState<string | undefined>();
  const listRef = useRef<HTMLDivElement>(null);
  const centeredSelectionRef = useRef<string | undefined>(undefined);
  const { listWidth, onSeparatorKeyDown, onSeparatorPointerDown, resizing, screenRef } =
    useResizableListWidth({
      bodyClass: "defects-reference-is-resizing",
      defaultWidth: DEFECT_LIST_DEFAULT_WIDTH,
      maxWidth: DEFECT_LIST_MAX_WIDTH,
      minWidth: DEFECT_LIST_MIN_WIDTH,
      storageKey: DEFECT_LIST_WIDTH_KEY
    });

  const defects = useMemo(() => buildDefectSummaries(results), [results]);
  const searchOnCurrentPage =
    serverPage !== undefined && (onQueryChange === undefined || isLikelyThqlQuery(query));
  const filteredDefects = useMemo(
    () =>
      serverPage !== undefined && !searchOnCurrentPage
        ? defects
        : filterDefects(defects, query, "all"),
    [defects, query, searchOnCurrentPage, serverPage]
  );
  const effectiveSelectedDefectId = routeDefectId ?? selectedDefectId;
  const localPagination = useReferenceListPagination({
    context: JSON.stringify([effectiveSelectedDefectId, query, projectId]),
    count: filteredDefects.length,
    selectedIndex: filteredDefects.findIndex((defect) => defect.id === effectiveSelectedDefectId)
  });
  const page = serverPage
    ? (serverPageIndex ?? Math.floor(serverPage.offset / serverPage.limit))
    : localPagination.page;
  const pageSize = serverPage
    ? referenceListPageSize(serverPageSize ?? serverPage.limit)
    : localPagination.pageSize;
  const visibleDefects = serverPage
    ? filteredDefects
    : filteredDefects.slice(page * pageSize, (page + 1) * pageSize);
  const total = serverPage?.total ?? filteredDefects.length;
  const actorId =
    typeof window === "undefined"
      ? "admin"
      : (window.localStorage.getItem("testhistory.actorId") ?? "admin");
  const selectedDefect =
    filteredDefects.find((defect) => defect.id === effectiveSelectedDefectId) ??
    (selectedDetail !== undefined && selectedDetail.id === effectiveSelectedDefectId
      ? buildDefectSummaries([selectedDetail])[0]
      : undefined) ??
    (routeDefectId ? undefined : visibleDefects[0]);

  useLayoutEffect(() => {
    const list = listRef.current;
    const selectedRow = list?.querySelector<HTMLElement>('button[aria-pressed="true"]');
    if (list === null || selectedRow === null || selectedRow === undefined) {
      return;
    }
    const selectionKey = `${page}:${selectedDefect?.id ?? ""}`;
    if (centeredSelectionRef.current === selectionKey) return;
    const listBounds = list.getBoundingClientRect();
    const rowBounds = selectedRow.getBoundingClientRect();
    list.scrollTop +=
      rowBounds.top - listBounds.top - (list.clientHeight - selectedRow.clientHeight) / 2;
    centeredSelectionRef.current = selectionKey;
  }, [page, selectedDefect?.id, visibleDefects]);

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
                title={
                  serverPage
                    ? `${searchOnCurrentPage ? "Всего" : "Найдено"} дефектов в проекте: ${formatCount(total)}`
                    : `Найдено дефектов: ${formatCount(total)}`
                }
              >
                {formatCount(total)}
              </span>
            </h1>
          </header>

          <ThqlSearchPanel
            activeFilterId={activeFilterId}
            actorId={actorId}
            entity="defects"
            projectId={projectId}
            query={query}
            onActiveFilterChange={setActiveFilterId}
            onQueryChange={setQuery}
          />
          {serverPage ? (
            <p className="defects-reference-page-search-note">
              {searchOnCurrentPage ? "THQL-фильтр на текущей странице" : "Поиск по всему проекту"}
              {searchOnCurrentPage && query.trim()
                ? ` · найдено ${filteredDefects.length} из ${defects.length}`
                : ""}
            </p>
          ) : null}

          {selectedDetail !== undefined &&
          selectedDetail.id === effectiveSelectedDefectId &&
          !defects.some((defect) => defect.id === effectiveSelectedDefectId) ? (
            <div className="defects-reference-pinned" role="status">
              <small>Выбранный дефект вне текущей страницы</small>
              <strong>{selectedDetail.name}</strong>
            </div>
          ) : null}

          <div className="defects-reference-list" ref={listRef}>
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
                  <small title={defect.id}>#{formatDefectId(defect.id)}</small>
                  {defect.affectedTestIds.length > 0 ? (
                    <small title={defect.affectedTestIds.join(", ")}>
                      Кейсы: {defect.affectedTestIds.slice(0, 2).join(", ")}
                      {defect.affectedTestIds.length > 2
                        ? ` +${defect.affectedTestIds.length - 2}`
                        : ""}
                    </small>
                  ) : (
                    <small>Тест-кейсы: {defect.testCaseCount}</small>
                  )}
                </span>
              </button>
            ))}

            {visibleDefects.length === 0 ? (
              <div className="defects-reference-list-empty">
                <Bug size={18} />
                <strong>Дефекты не найдены</strong>
                <span>
                  {searchOnCurrentPage && query.trim()
                    ? "На этой странице совпадений нет. Перейдите на другую страницу или измените поиск."
                    : "Измените поиск, чтобы увидеть связанные дефекты."}
                </span>
              </div>
            ) : null}
          </div>

          <ReferenceListPagination
            count={total}
            label="Дефекты"
            offset={serverPage?.offset}
            returned={serverPage?.returned}
            onPageChange={onPageIndexChange ?? localPagination.setPage}
            onPageSizeChange={onPageSizeChange ?? localPagination.setPageSize}
            page={page}
            pageSize={pageSize}
          />
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
          onKeyDown={onSeparatorKeyDown}
          onPointerDown={onSeparatorPointerDown}
        />

        {selectedDefect === undefined ? (
          <DefectEmptyState requestedId={routeDefectId} />
        ) : (
          <DefectDetails defect={selectedDefect} onDeleteDefect={onDeleteDefect} />
        )}
      </div>
    </section>
  );
}

function DefectEmptyState({ requestedId }: { requestedId?: string | undefined }) {
  return (
    <section className="defects-reference-detail-panel empty" aria-label="Детали дефекта">
      <div className="defects-reference-empty-state">
        <Bug size={28} />
        <strong>{requestedId ? "Дефект не найден" : "Выберите дефект для отображения"}</strong>
        {requestedId ? <span>Проверьте ссылку или выберите дефект из списка.</span> : null}
      </div>
    </section>
  );
}

function DefectDetails({
  defect,
  onDeleteDefect
}: {
  defect: DefectSummary;
  onDeleteDefect?: ((id: string) => void) | undefined;
}) {
  const description = defect.results.find((result) => result.id === defect.id)?.description?.trim();
  const diagnostic = defect.results
    .find(
      (result) =>
        (result.status === "failed" || result.status === "broken") && result.trace?.message.trim()
    )
    ?.trace?.message.trim();

  return (
    <section className="defects-reference-detail-panel" aria-label="Информация о выбранном дефекте">
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
          <dt>Тест-кейсов</dt>
          <dd>{formatCount(defect.testCaseCount)}</dd>
        </div>
        <div>
          <dt>Запусков</dt>
          <dd>{formatCount(collectLaunchLinks(defect).length)}</dd>
        </div>
        <div>
          <dt>ID дефекта</dt>
          <dd>{defect.id}</dd>
        </div>
      </dl>

      {description && description !== defect.title ? (
        <section className="defects-reference-description" aria-label="Описание дефекта">
          <h3>Описание дефекта</h3>
          <p>{description}</p>
        </section>
      ) : null}

      {diagnostic ? (
        <section className="defects-reference-diagnostic" aria-label="Причина сбоя">
          <h3>Причина сбоя</h3>
          <p>{diagnostic}</p>
        </section>
      ) : null}

      <div className="defects-reference-detail-grid">
        <DefectSection className="wide" title="Результаты тестов">
          <DefectResultList defect={defect} />
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
      </div>
    </section>
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
        <span>Владелец / теги</span>
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
          <span className="defects-reference-result-context">
            <strong>{result.owner}</strong>
            <span className="defects-reference-result-tags">
              {result.tags.length > 0 ? (
                result.tags.map((tag) => <small key={tag}>{tag}</small>)
              ) : (
                <small className="is-empty">Без тегов</small>
              )}
            </span>
          </span>
          <time>{formatResultDuration(result.duration)}</time>
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
      const cluster = groupedResults.find((result) => result.id === id && result.defectStatus);
      const affectedTestIds = uniqueValues(groupedResults.flatMap((result) => result.testKeys));
      const quarantine = groupedResults.find(
        (result) => result.defectMute !== undefined
      )?.defectMute;
      const hasActiveFailure = groupedResults.some(
        (result) => result.status === "failed" || result.status === "broken"
      );
      const status: DefectStatus =
        cluster?.defectStatus ??
        groupedResults.find((result) => result.defectStatus)?.defectStatus ??
        (hasActiveFailure ? "open" : "closed");
      const base = {
        id,
        title: cluster?.name ?? groupedResults[0]?.name ?? id,
        results: groupedResults,
        testCaseCount:
          affectedTestIds.length || new Set(groupedResults.map((result) => result.id)).size,
        affectedTestIds,
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
        ...defect.affectedTestIds,
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
        name: result.name,
        owner: result.owner || "Не назначен",
        status: point.status,
        tags: uniqueValues(result.tags)
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
    skipped: "Пропущен",
    unknown: "Неизвестен"
  };

  return labels[status];
}

function formatCount(count: number): string {
  return count.toLocaleString("ru-RU");
}
