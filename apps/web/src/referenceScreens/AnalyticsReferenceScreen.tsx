import { AlertTriangle, ArrowUpRight, BarChart3, Clock3, RefreshCw, Search } from "lucide-react";
import { useMemo, useState } from "react";

import type { TestResult } from "../m1Workspace.js";
import { getHashFromRoute } from "../workspaceRouting.js";

import "./AnalyticsReferenceScreen.css";
import "./AnalyticsReferenceResponsive.css";
import {
  buildAnalyticsModel,
  buildServerAnalyticsModel,
  formatCount
} from "./AnalyticsReferenceModel.js";
import { useProjectAnalyticsResults } from "./AnalyticsReferenceData.js";
import { AnalyticsReferenceContent } from "./AnalyticsReferenceContent.js";
import { useProjectLaunchTrend } from "./useProjectLaunchTrend.js";

type AnalyticsReferenceScreenProps = {
  projectId?: string | undefined;
  results: TestResult[];
  onOpenResult?: ((id: string, launchId?: string) => void) | undefined;
};

export function AnalyticsReferenceScreen({
  projectId,
  results,
  onOpenResult
}: AnalyticsReferenceScreenProps) {
  const [query, setQuery] = useState("");
  const localModel = useMemo(() => buildAnalyticsModel(results, query), [query, results]);
  const projectResults = useProjectAnalyticsResults(projectId, query);
  const launchTrend = useProjectLaunchTrend(projectId);
  const serverReady = projectResults.status === "ready" && projectResults.read !== undefined;
  const model = useMemo(
    () =>
      serverReady && projectResults.read !== undefined
        ? buildServerAnalyticsModel(projectResults.read)
        : localModel,
    [localModel, projectResults.read, serverReady]
  );
  const hasQuery = query.trim().length > 0;
  const emptyState =
    model.filteredTotal === 0
      ? serverReady && model.total === 0
        ? {
            title: "В проекте пока нет результатов",
            description: "Загрузите результаты тестов, чтобы увидеть сводку и сигналы проекта."
          }
        : projectResults.status === "error"
          ? {
              title: "Нет доступных результатов",
              description: "Не удалось загрузить аналитику проекта. Повторите запрос."
            }
          : projectResults.status === "loading"
            ? {
                title: hasQuery ? "Ищем результаты проекта" : "Загружаем результаты проекта",
                description: "Сводка появится, когда данные будут доступны."
              }
            : hasQuery && model.total > 0
              ? {
                  title: "Поиск не дал результатов",
                  description:
                    "Измените запрос или очистите поиск, чтобы вернуться к сводке проекта."
                }
              : {
                  title: "Нет выбранного проекта",
                  description: "Выберите проект, чтобы увидеть его аналитику."
                }
      : undefined;

  return (
    <section
      className="analytics-reference-screen product-view analytics-view"
      aria-label="Аналитика"
      aria-busy={projectResults.status === "loading"}
    >
      <header className="analytics-reference-header">
        <div className="analytics-reference-header-copy">
          <div className="analytics-reference-title-row">
            <h1>Аналитика</h1>
            <span className={`analytics-reference-scope${serverReady ? "" : " is-partial"}`}>
              {serverReady ? "Весь проект · за всё время" : "Частичные данные"}
            </span>
          </div>
          <span>
            {serverReady ? (
              <>
                {hasQuery ? "Найдено" : "В анализе"} {formatCount(model.filteredTotal)}
                {hasQuery ? ` из ${formatCount(model.total)}` : ""} результатов проекта
              </>
            ) : projectResults.status === "loading" ? (
              "Загружаем результаты всего проекта"
            ) : (
              <>
                {projectResults.status === "error" ? "Аналитика проекта недоступна · " : null}В
                анализе {formatCount(model.filteredTotal)} из {formatCount(model.total)} загруженных
                результатов
              </>
            )}
          </span>
          <a
            className="analytics-reference-dashboard-link"
            href={getHashFromRoute({ mode: "dashboard" })}
          >
            К дашборду запуска <ArrowUpRight aria-hidden="true" size={14} />
          </a>
        </div>
        <label className="analytics-reference-search">
          <Search size={16} />
          <input
            aria-label="Поиск аналитических сигналов"
            placeholder="Поиск тестов"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
      </header>

      {!serverReady ? (
        <div
          className={`analytics-reference-availability${projectResults.status === "error" ? " is-error" : ""}`}
          role={projectResults.status === "error" ? "alert" : "status"}
        >
          {projectResults.status === "error" ? (
            <AlertTriangle aria-hidden="true" size={18} />
          ) : (
            <Clock3 aria-hidden="true" size={18} />
          )}
          <div>
            <strong>
              {model.total > 0
                ? "Показан только загруженный фрагмент"
                : "Полные данные проекта ещё не показаны"}
            </strong>
            <p>
              {projectResults.status === "error"
                ? "Запрос аналитики не выполнился. Показатели ниже охватывают только загруженные результаты."
                : projectResults.status === "loading"
                  ? "Собираем сводку по проекту. Показатели ниже временно охватывают только загруженные результаты."
                  : "Выберите проект, чтобы получить полную аналитику. Пока доступны только загруженные результаты."}
            </p>
          </div>
          {projectResults.status === "error" ? (
            <button onClick={projectResults.retry} type="button">
              <RefreshCw aria-hidden="true" size={14} />
              Повторить
            </button>
          ) : null}
        </div>
      ) : null}

      {emptyState ? (
        <div className="analytics-reference-empty-state" role="status">
          <BarChart3 aria-hidden="true" size={24} />
          <strong>{emptyState.title}</strong>
          <p>{emptyState.description}</p>
          {hasQuery && model.total > 0 && serverReady ? (
            <button onClick={() => setQuery("")} type="button">
              Очистить поиск
            </button>
          ) : null}
        </div>
      ) : (
        <AnalyticsReferenceContent
          hasQuery={hasQuery}
          model={model}
          onOpenResult={onOpenResult}
          projectResults={projectResults}
          serverReady={serverReady}
          launchTrend={launchTrend}
        />
      )}
    </section>
  );
}
