import { useCallback, useEffect, useState } from "react";

import { getJson } from "../apiHttp.js";
import { PermissionDeniedHttpError } from "../apiPermissions.js";

export type ProjectLaunchTrendRead = {
  result: {
    metrics: {
      count: number;
      p50DurationMs: number | null;
      p95DurationMs: number | null;
    };
    series: Array<{
      id: string;
      name: string;
      createdAt: string;
      metrics: { count: number; passRate: number | null };
    }>;
  };
};

type TrendState = {
  key: string;
  status: "idle" | "loading" | "ready" | "error" | "denied";
  read?: ProjectLaunchTrendRead["result"];
};

export function useProjectLaunchTrend(projectId: string | undefined) {
  const [retryAttempt, setRetryAttempt] = useState(0);
  const key = `${projectId ?? ""}\u0000${retryAttempt}`;
  const [state, setState] = useState<TrendState>({ key, status: "idle" });

  useEffect(() => {
    if (projectId === undefined) {
      setState({ key, status: "idle" });
      return;
    }

    const controller = new AbortController();
    setState({ key, status: "loading" });
    void getJson<ProjectLaunchTrendRead>("/api/v1/analytics/run", {
      method: "POST",
      signal: controller.signal,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: { entity: "results", projectId, groupBy: ["status"] } })
    })
      .then((read) => {
        if (!controller.signal.aborted) {
          setState({ key, status: "ready", read: read.result });
        }
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setState({
            key,
            status: error instanceof PermissionDeniedHttpError ? "denied" : "error"
          });
        }
      });

    return () => controller.abort();
  }, [key, projectId]);

  const retry = useCallback(() => setRetryAttempt((attempt) => attempt + 1), []);
  const activeState: TrendState = state.key === key ? state : { key, status: "loading" };
  return { ...activeState, retry };
}
