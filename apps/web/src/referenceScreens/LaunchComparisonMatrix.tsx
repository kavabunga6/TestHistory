import { GitCompareArrows, LoaderCircle, Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { getJson } from "../apiHttp.js";
import type { LaunchListItem } from "../m1Workspace.js";
import { ReferenceListPagination, type ReferenceListPageSize } from "./ReferenceListPagination.js";
import "./LaunchComparisonMatrix.css";

type MatrixFocus = "all" | "problems" | "changed";
type MatrixPoint = { resultUuid: string; status: string; durationMs?: number };

export type LaunchComparisonMatrixReadModel = {
  kind: "launch-comparison-matrix";
  launches: Array<{
    id: string;
    name: string;
    createdAt: string;
    metrics: { total: number; passRate: number | null };
  }>;
  summary: {
    testCases: number;
    currentProblems: number;
    changed: number;
    new: number;
    removed: number;
  };
  page: { limit: number; offset: number; returned: number; total: number; hasMore: boolean };
  rows: Array<{
    testCaseId: string;
    name: string;
    points: Array<MatrixPoint | null>;
    changed: boolean;
    currentProblem: boolean;
  }>;
};

export type LaunchComparisonMatrixSession = {
  selectedIds: string[];
  matrix?: LaunchComparisonMatrixReadModel;
  focus: MatrixFocus;
  page: number;
  pageSize: ReferenceListPageSize;
};

const matrixDateFormatter = new Intl.DateTimeFormat("ru-RU", {
  day: "2-digit",
  month: "2-digit",
  year: "2-digit"
});

export function LaunchComparisonMatrix({
  candidateStatus,
  candidates,
  hasMoreCandidates,
  initialSession,
  launch,
  loadMore,
  onSelectResult,
  onSessionChange,
  reloadCandidates
}: {
  candidateStatus: "loading" | "loading-more" | "ready" | "error";
  candidates: LaunchListItem[];
  hasMoreCandidates: boolean;
  initialSession: LaunchComparisonMatrixSession;
  launch: LaunchListItem;
  loadMore: () => Promise<void>;
  onSelectResult: (id: string, launchId: string) => void;
  onSessionChange: (session: LaunchComparisonMatrixSession) => void;
  reloadCandidates: () => void;
}) {
  const [selectedIds, setSelectedIds] = useState(initialSession.selectedIds);
  const [search, setSearch] = useState("");
  const [matrix, setMatrix] = useState(initialSession.matrix);
  const [focus, setFocus] = useState<MatrixFocus>(initialSession.focus);
  const [page, setPage] = useState(initialSession.page);
  const [pageSize, setPageSize] = useState(initialSession.pageSize);
  const [state, setState] = useState<"idle" | "loading" | "ready" | "error">(
    initialSession.matrix === undefined ? "idle" : "ready"
  );
  const [pickerOpen, setPickerOpen] = useState(initialSession.matrix === undefined);
  const requestController = useRef<AbortController | undefined>(undefined);

  useEffect(() => () => requestController.current?.abort(), []);

  const updateSelection = (id: string) => {
    requestController.current?.abort();
    const nextIds = selectedIds.includes(id)
      ? selectedIds.filter((selected) => selected !== id)
      : [...selectedIds, id];
    setSelectedIds(nextIds);
    setMatrix(undefined);
    setState("idle");
    setFocus("all");
    setPage(0);
    onSessionChange({ selectedIds: nextIds, focus: "all", page: 0, pageSize });
  };

  const requestMatrix = async (nextPage = page, nextSize = pageSize, nextFocus = focus) => {
    if (launch.projectId === undefined || selectedIds.length === 0) return;
    requestController.current?.abort();
    const controller = new AbortController();
    requestController.current = controller;
    setPage(nextPage);
    setPageSize(nextSize);
    setFocus(nextFocus);
    setMatrix(undefined);
    setState("loading");
    onSessionChange({ selectedIds, focus: nextFocus, page: nextPage, pageSize: nextSize });
    const orderedIds = [...selectedIds].sort((left, right) => {
      const leftDate = Date.parse(candidates.find((item) => item.id === left)?.createdAt ?? "");
      const rightDate = Date.parse(candidates.find((item) => item.id === right)?.createdAt ?? "");
      return (
        (Number.isFinite(leftDate) ? leftDate : 0) - (Number.isFinite(rightDate) ? rightDate : 0) ||
        left.localeCompare(right)
      );
    });
    const params = new URLSearchParams({
      launchIds: [...orderedIds, launch.id].join(","),
      focus: nextFocus,
      limit: String(nextSize),
      offset: String(nextPage * nextSize)
    });
    try {
      const value = await getJson<LaunchComparisonMatrixReadModel>(
        `/api/v1/projects/${encodeURIComponent(launch.projectId)}/launches/compare/matrix?${params.toString()}`,
        { signal: controller.signal }
      );
      if (controller.signal.aborted) return;
      setMatrix(value);
      setState("ready");
      setPickerOpen(false);
      onSessionChange({
        selectedIds,
        matrix: value,
        focus: nextFocus,
        page: nextPage,
        pageSize: nextSize
      });
    } catch (error: unknown) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setState("error");
      setPickerOpen(true);
    }
  };

  const matchingCandidates = candidates.filter((item) => {
    const query = search.trim().toLocaleLowerCase("ru");
    return (
      selectedIds.includes(item.id) ||
      query === "" ||
      `${item.name} ${item.id} ${item.branch ?? ""}`.toLocaleLowerCase("ru").includes(query)
    );
  });
  const visibleCandidates = matchingCandidates
    .sort(
      (left, right) =>
        Number(selectedIds.includes(right.id)) - Number(selectedIds.includes(left.id))
    )
    .slice(0, 12);

  return (
    <div className="launches-reference-matrix">
      <div className="launches-reference-matrix-setup">
        <div className="launches-reference-matrix-setup-top">
          <div className="launches-reference-matrix-setup-copy">
            <strong>История тестов между запусками</strong>
            <span>
              {matrix === undefined
                ? "Выберите до четырёх запусков. Текущий запуск всегда будет последним столбцом."
                : `${matrix.launches.length} ${matrix.launches.length === 5 ? "запусков" : "запуска"} · текущий запуск в последнем столбце`}
            </span>
          </div>
          {matrix !== undefined ? (
            <button
              aria-expanded={pickerOpen}
              className="launches-reference-matrix-toggle-picker"
              onClick={() => setPickerOpen((open) => !open)}
              type="button"
            >
              {pickerOpen ? "Скрыть выбор" : "Изменить запуски"}
            </button>
          ) : null}
        </div>
        {pickerOpen ? (
          <>
            <label className="launches-reference-matrix-search">
              <Search aria-hidden="true" />
              <input
                aria-label="Найти запуск для матрицы"
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Название, ID или ветка"
                type="search"
                value={search}
              />
            </label>
            <fieldset className="launches-reference-matrix-candidates">
              <legend>Запуски ({selectedIds.length} из 4 выбрано)</legend>
              {visibleCandidates.map((item) => (
                <label className="launches-reference-matrix-candidate" key={item.id}>
                  <input
                    checked={selectedIds.includes(item.id)}
                    disabled={
                      state === "loading" ||
                      (selectedIds.length === 4 && !selectedIds.includes(item.id))
                    }
                    onChange={() => updateSelection(item.id)}
                    type="checkbox"
                  />
                  <span title={item.name}>{item.name}</span>
                  <small>
                    {formatDate(item.createdAt)} · {item.id.slice(0, 8)}
                  </small>
                </label>
              ))}
              {visibleCandidates.length === 0 ? (
                <span className="launches-reference-matrix-candidate-empty">
                  Запуски не найдены
                </span>
              ) : null}
            </fieldset>
            {matchingCandidates.length > visibleCandidates.length ? (
              <small className="launches-reference-matrix-search-note">
                Показаны первые 12 запусков. Уточните поиск, чтобы найти более ранний.
              </small>
            ) : null}
            {hasMoreCandidates ? (
              <button
                className="launches-reference-matrix-load-more"
                disabled={candidateStatus === "loading-more"}
                onClick={() => void loadMore()}
                type="button"
              >
                {candidateStatus === "loading-more"
                  ? "Загружаем…"
                  : "Загрузить более ранние запуски"}
              </button>
            ) : null}
            {candidateStatus === "error" ? (
              <button
                className="launches-reference-matrix-load-more"
                onClick={reloadCandidates}
                type="button"
              >
                Не удалось загрузить список запусков · Повторить
              </button>
            ) : null}
            <button
              className="launches-reference-comparison-submit"
              disabled={selectedIds.length === 0 || state === "loading"}
              onClick={() => void requestMatrix(0)}
              type="button"
            >
              {state === "loading" ? (
                <LoaderCircle className="is-spinning" aria-hidden="true" />
              ) : (
                <GitCompareArrows aria-hidden="true" />
              )}
              {state === "loading" ? "Строим матрицу…" : "Построить матрицу"}
            </button>
          </>
        ) : null}
      </div>

      {state === "idle" ? (
        <p className="launches-reference-matrix-message">
          Выберите запуски, чтобы увидеть историю статусов каждого теста.
        </p>
      ) : null}
      {state === "loading" ? (
        <p className="launches-reference-matrix-message">Сопоставляем тесты…</p>
      ) : null}
      {state === "error" ? (
        <p className="launches-reference-matrix-message is-error">
          Не удалось построить матрицу. Проверьте доступность выбранных запусков и повторите запрос.
        </p>
      ) : null}
      {matrix !== undefined ? (
        <div className="launches-reference-matrix-result">
          <div className="launches-reference-matrix-summary" aria-label="Сводка матрицы">
            <span>
              <strong>{matrix.summary.testCases}</strong> тестов
            </span>
            <span className="is-problem">
              <strong>{matrix.summary.currentProblems}</strong> проблемных сейчас
            </span>
            <span>
              <strong>{matrix.summary.changed}</strong> менялись
            </span>
          </div>
          <div className="launches-reference-matrix-toolbar">
            <strong>Статусы по запускам</strong>
            <label>
              <span>Показать</span>
              <select
                aria-label="Фильтр тестов в матрице"
                onChange={(event) =>
                  void requestMatrix(0, pageSize, event.target.value as MatrixFocus)
                }
                value={focus}
              >
                <option value="all">Все тесты</option>
                <option value="problems">Проблемные сейчас</option>
                <option value="changed">Менялись</option>
              </select>
            </label>
          </div>
          <p className="launches-reference-matrix-scroll-hint">
            Листайте таблицу по горизонтали, чтобы увидеть остальные запуски.
          </p>
          <div className="launches-reference-matrix-scroller">
            <table
              aria-label="Матрица статусов тестов по запускам"
              className="launches-reference-matrix-table"
              style={{
                minWidth: `calc(var(--matrix-name-column-width) + ${matrix.launches.length * 190}px)`
              }}
            >
              <colgroup>
                <col style={{ width: "var(--matrix-name-column-width)" }} />
                {matrix.launches.map((item) => (
                  <col key={item.id} />
                ))}
              </colgroup>
              <thead>
                <tr>
                  <th scope="col">Тест</th>
                  {matrix.launches.map((item, index) => (
                    <th
                      className={index === matrix.launches.length - 1 ? "is-current" : undefined}
                      key={item.id}
                      scope="col"
                      title={item.name}
                    >
                      <strong>{item.name}</strong>
                      <small>
                        {index === matrix.launches.length - 1 ? "Текущий · " : ""}
                        {formatDate(item.createdAt)} · {formatPassRate(item.metrics.passRate)}
                      </small>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {matrix.rows.map((row) => (
                  <tr
                    className={row.currentProblem ? "is-problem" : undefined}
                    key={row.testCaseId}
                  >
                    <td className="launches-reference-matrix-test" title={row.name}>
                      <strong>{row.name}</strong>
                      <small>
                        {row.testCaseId}
                        {row.changed ? " · менялся" : ""}
                      </small>
                    </td>
                    {matrix.launches.map((item, index) => {
                      const point = row.points[index];
                      return (
                        <td
                          className={
                            index === matrix.launches.length - 1 ? "is-current" : undefined
                          }
                          key={item.id}
                        >
                          {point === null || point === undefined ? (
                            <span className="launches-reference-matrix-absent">—</span>
                          ) : (
                            <button
                              aria-label={`${row.name}, ${item.name}: ${statusLabel(point.status)}`}
                              className="launches-reference-matrix-point"
                              onClick={() => onSelectResult(point.resultUuid, item.id)}
                              title="Открыть результат"
                              type="button"
                            >
                              <span
                                className={`launches-reference-comparison-status is-${point.status}`}
                              >
                                {statusLabel(point.status)}
                              </span>
                              {point.durationMs !== undefined ? (
                                <small>{formatDuration(point.durationMs)}</small>
                              ) : null}
                            </button>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
                {matrix.rows.length === 0 ? (
                  <tr>
                    <td
                      className="launches-reference-matrix-empty"
                      colSpan={matrix.launches.length + 1}
                    >
                      Тестов для выбранного фильтра нет.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <ReferenceListPagination
            count={matrix.page.total}
            label="матрица запусков"
            offset={matrix.page.offset}
            onPageChange={(nextPage) => void requestMatrix(nextPage)}
            onPageSizeChange={(nextSize) => void requestMatrix(0, nextSize)}
            page={page}
            pageSize={pageSize}
            returned={matrix.page.returned}
          />
        </div>
      ) : null}
    </div>
  );
}

function formatDate(value: string | undefined) {
  const date = Date.parse(value ?? "");
  return Number.isFinite(date) ? matrixDateFormatter.format(date) : "Дата не указана";
}

function formatPassRate(value: number | null) {
  return value === null ? "успешность —" : `${Math.round(value * 100)}% успеха`;
}

function formatDuration(value: number) {
  return value < 1_000 ? `${Math.round(value)} мс` : `${Math.round(value / 10) / 100} с`;
}

function statusLabel(status: string) {
  return (
    (
      {
        passed: "Успешный",
        failed: "Провален",
        broken: "Сломан",
        skipped: "Пропущен",
        unknown: "Неизвестен"
      } as Record<string, string>
    )[status] ?? status
  );
}
