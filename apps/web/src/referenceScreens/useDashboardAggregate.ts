import type { LaunchDashboardAggregateReadModel } from "@testhistory/contracts";
import { useEffect, useState } from "react";

import { loadLaunchDashboardAggregate } from "./DashboardReferenceAggregateData.js";
import type { SavedDashboardWidget } from "./DashboardReferenceModel.js";

export type DashboardAggregateState =
  | { status: "empty" }
  | { status: "loading"; key: string }
  | { status: "ready"; key: string; aggregate: LaunchDashboardAggregateReadModel }
  | { status: "error"; key: string };

export function useDashboardAggregate(
  launchId: string | undefined,
  widgets: SavedDashboardWidget[]
) {
  const [state, setState] = useState<DashboardAggregateState>({ status: "empty" });
  const [retryAttempt, setRetryAttempt] = useState(0);
  const widgetKey = JSON.stringify(
    widgets.map(({ id, kind, metric, groupBy, thql, entity }) => ({
      id,
      kind,
      metric,
      groupBy,
      thql,
      entity
    }))
  );
  const key = `${launchId ?? ""}:${widgetKey}:${retryAttempt}`;

  useEffect(() => {
    if (launchId === undefined || widgets.length === 0) {
      return;
    }

    const controller = new AbortController();
    setState({ status: "loading", key });
    void loadLaunchDashboardAggregate(launchId, widgets, controller.signal)
      .then((aggregate) => {
        if (!controller.signal.aborted) {
          setState({ status: "ready", key, aggregate });
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setState({ status: "error", key });
        }
      });

    return () => controller.abort();
    // widgetKey carries every field sent to the API, so a render with the same widgets does not refetch.
  }, [launchId, widgetKey, retryAttempt]);

  return {
    state:
      launchId === undefined || widgets.length === 0
        ? ({ status: "empty" } as const)
        : state.status !== "empty" && state.key === key
          ? state
          : ({ status: "loading", key } as const),
    retry: () => setRetryAttempt((attempt) => attempt + 1)
  };
}
