import type {
  LaunchDashboardAggregateReadModel,
  LaunchDashboardAggregateRequest
} from "@testhistory/contracts";

import { requestJson } from "../apiHttp.js";
import type { SavedDashboardWidget } from "./DashboardReferenceModel.js";

const maxWidgetsPerRequest = 24;

export async function loadLaunchDashboardAggregate(
  launchId: string,
  widgets: SavedDashboardWidget[],
  signal: AbortSignal
): Promise<LaunchDashboardAggregateReadModel> {
  if (widgets.length === 0) {
    throw new Error("Нет виджетов для расчёта.");
  }

  const batches: LaunchDashboardAggregateReadModel[] = [];
  for (let offset = 0; offset < widgets.length; offset += maxWidgetsPerRequest) {
    if (signal.aborted) {
      throw signal.reason;
    }
    batches.push(
      await loadAggregateBatch(
        launchId,
        widgets.slice(offset, offset + maxWidgetsPerRequest),
        signal
      )
    );
  }

  const first = batches[0]!;
  if (
    batches.some(
      (batch) => batch.projectId !== first.projectId || batch.totalResults !== first.totalResults
    )
  ) {
    throw new Error("Запуск изменился во время расчёта виджетов. Обновите дашборд.");
  }
  return {
    ...first,
    widgets: batches.flatMap((batch) => batch.widgets)
  };
}

async function loadAggregateBatch(
  launchId: string,
  widgets: SavedDashboardWidget[],
  signal: AbortSignal
): Promise<LaunchDashboardAggregateReadModel> {
  const body: LaunchDashboardAggregateRequest = {
    widgets: widgets.map(({ id, kind, metric, groupBy, thql, entity }) => ({
      id,
      kind,
      metric,
      groupBy,
      thql,
      entity
    }))
  };
  const aggregate = await requestJson<LaunchDashboardAggregateReadModel>(
    `/api/v1/launches/${encodeURIComponent(launchId)}/dashboard/aggregate`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal
    }
  );

  if (
    aggregate?.kind !== "launch-dashboard-aggregate" ||
    aggregate.launchId !== launchId ||
    !Number.isInteger(aggregate.totalResults) ||
    aggregate.totalResults < 0 ||
    !Array.isArray(aggregate.widgets) ||
    aggregate.widgets.length !== widgets.length ||
    widgets.some((widget) => {
      const item = aggregate.widgets.find((candidate) => candidate.id === widget.id);
      return (
        item === undefined ||
        (item.status !== "ready" && item.status !== "unsupported") ||
        (item.status === "ready" &&
          (!Number.isInteger(item.filteredCount) ||
            !Array.isArray(item.groups) ||
            !Array.isArray(item.tableRows)))
      );
    })
  ) {
    throw new Error("Сервер вернул неполную сводку дашборда.");
  }

  return aggregate;
}
