import type { LaunchDashboardAggregateReadModel } from "@testhistory/contracts";
import { ArrowUpRight, RefreshCw } from "lucide-react";

import type { LaunchListItem, ResultStatus } from "../m1Workspace.js";
import { formatLaunchState, getHashFromRoute } from "../workspaceRouting.js";
import { resultStatusGroupLabels, resultStatusOrder } from "./resultStatusPresentation.js";

import "./DashboardLaunchSummary.css";

const summaryStatuses: Array<{ status: ResultStatus; label: string }> = resultStatusOrder.map(
  (status) => ({ status, label: resultStatusGroupLabels[status] })
);

export function DashboardLaunchSummary({
  aggregate,
  launch,
  onRefresh
}: {
  aggregate: LaunchDashboardAggregateReadModel;
  launch: LaunchListItem | undefined;
  onRefresh: () => void;
}) {
  const launchId = launch?.id ?? aggregate.launchId;
  const resultsRoute = getHashFromRoute({ mode: "launch", launchId, launchTab: "results" });
  const launchRoute = getHashFromRoute({ mode: "launch", launchId });
  const counts = launch?.counters;
  const counterTotal = counts
    ? summaryStatuses.reduce((sum, { status }) => sum + counts[status], 0)
    : 0;
  const hasCompleteCounts =
    counts !== undefined && aggregate.totalResults > 0 && counterTotal === aggregate.totalResults;
  const visibleStatuses = summaryStatuses.filter(
    ({ status }) => hasCompleteCounts && (counts[status] > 0 || status === "passed")
  );

  return (
    <section aria-label="Сводка выбранного запуска" className="dashboard-launch-summary">
      <div className="dashboard-launch-summary__heading">
        <div className="dashboard-launch-summary__identity">
          <span className="dashboard-launch-summary__eyebrow">Обзор выбранного запуска</span>
          <div className="dashboard-launch-summary__title-row">
            <h2 title={launch?.name}>
              <a href={launchRoute}>{launch?.name ?? "Выбранный запуск"}</a>
            </h2>
            {launch?.state ? (
              <span className="dashboard-launch-summary__state">
                {formatLaunchState(launch.state)}
              </span>
            ) : null}
          </div>
        </div>
        <div className="dashboard-launch-summary__actions">
          <a href={launchRoute}>
            Открыть запуск <ArrowUpRight aria-hidden="true" size={15} />
          </a>
          <button aria-label="Обновить данные дашборда" onClick={onRefresh} type="button">
            <RefreshCw aria-hidden="true" size={15} />
            Обновить
          </button>
        </div>
      </div>

      <div className="dashboard-launch-summary__metrics">
        <a className="dashboard-launch-summary__metric is-total" href={resultsRoute}>
          <strong>{aggregate.totalResults.toLocaleString("ru-RU")}</strong>
          <span>Результаты</span>
        </a>
        {visibleStatuses.map(({ status, label }) => {
          const count = counts?.[status] ?? 0;
          const query = `status = "${status}"`;
          return (
            <a
              className={`dashboard-launch-summary__metric is-${status}`}
              href={getHashFromRoute({
                mode: "launch",
                launchId,
                launchTab: "results",
                launchQuery: query
              })}
              key={status}
              title={`Показать результаты: ${label.toLowerCase()}`}
            >
              <strong>{count.toLocaleString("ru-RU")}</strong>
              <span>{label}</span>
            </a>
          );
        })}
      </div>

      {hasCompleteCounts ? (
        <div
          aria-label={`Распределение статусов: ${visibleStatuses.map(({ status, label }) => `${label.toLowerCase()} — ${counts?.[status] ?? 0}`).join(", ")}`}
          className="dashboard-launch-summary__distribution"
          role="img"
        >
          {visibleStatuses.map(({ status }) => (
            <span
              aria-hidden="true"
              className={`is-${status}`}
              key={status}
              style={{ flexGrow: counts?.[status] ?? 0 }}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}
