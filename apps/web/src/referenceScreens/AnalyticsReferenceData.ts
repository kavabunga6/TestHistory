import { useCallback, useEffect, useRef, useState } from "react";
import type {
  AnalyticsResultListReadModel,
  AnalyticsResultSummaryReadModel
} from "@testhistory/contracts";

import { getJson } from "../apiHttp.js";

export type AnalyticsResultSummary = AnalyticsResultSummaryReadModel;
export type AnalyticsResultsRead = AnalyticsResultListReadModel;

type LoadState = {
  key: string;
  status: "idle" | "loading" | "ready" | "error";
  read?: AnalyticsResultsRead;
  loadingMore: boolean;
  pageError: boolean;
};

const pageSize = 50;

async function fetchAnalyticsResults(
  projectId: string,
  query: string,
  signal: AbortSignal,
  cursor?: string
): Promise<AnalyticsResultsRead> {
  const parameters = new URLSearchParams({ projectId, limit: String(pageSize) });
  if (query.length > 0) parameters.set("q", query);
  if (cursor !== undefined) parameters.set("cursor", cursor);
  return getJson<AnalyticsResultsRead>(`/api/v1/analytics/results?${parameters}`, { signal });
}

export function useProjectAnalyticsResults(projectId: string | undefined, query: string) {
  const normalizedQuery = query.trim();
  const key = `${projectId ?? ""}\u0000${normalizedQuery}`;
  const currentKey = useRef(key);
  const pageAbort = useRef<AbortController | null>(null);
  const [state, setState] = useState<LoadState>(() => ({
    key,
    status: "idle",
    loadingMore: false,
    pageError: false
  }));
  currentKey.current = key;

  useEffect(() => {
    pageAbort.current?.abort();
    pageAbort.current = null;
    if (projectId === undefined) {
      setState({ key, status: "idle", loadingMore: false, pageError: false });
      return;
    }

    const controller = new AbortController();
    setState({ key, status: "loading", loadingMore: false, pageError: false });
    const timer = window.setTimeout(
      () => {
        void fetchAnalyticsResults(projectId, normalizedQuery, controller.signal)
          .then((read) => {
            if (!controller.signal.aborted && currentKey.current === key) {
              setState({ key, status: "ready", read, loadingMore: false, pageError: false });
            }
          })
          .catch(() => {
            if (!controller.signal.aborted && currentKey.current === key) {
              setState({ key, status: "error", loadingMore: false, pageError: false });
            }
          });
      },
      normalizedQuery.length > 0 ? 250 : 0
    );

    return () => {
      window.clearTimeout(timer);
      controller.abort();
      pageAbort.current?.abort();
      pageAbort.current = null;
    };
  }, [key, normalizedQuery, projectId]);

  const activeState: LoadState =
    state.key === key ? state : { key, status: "loading", loadingMore: false, pageError: false };

  const loadMore = useCallback(() => {
    const cursor = activeState.read?.page.nextCursor;
    if (
      projectId === undefined ||
      cursor === null ||
      cursor === undefined ||
      activeState.status !== "ready" ||
      pageAbort.current !== null
    ) {
      return;
    }

    const controller = new AbortController();
    pageAbort.current = controller;
    setState((current) =>
      current.key === key ? { ...current, loadingMore: true, pageError: false } : current
    );
    void fetchAnalyticsResults(projectId, normalizedQuery, controller.signal, cursor)
      .then((page) => {
        if (controller.signal.aborted || currentKey.current !== key) return;
        setState((current) => {
          if (current.key !== key || current.read === undefined) return current;
          return {
            ...current,
            read: {
              ...page,
              items: [...current.read.items, ...page.items]
            },
            loadingMore: false,
            pageError: false
          };
        });
      })
      .catch(() => {
        if (!controller.signal.aborted && currentKey.current === key) {
          setState((current) =>
            current.key === key ? { ...current, loadingMore: false, pageError: true } : current
          );
        }
      })
      .finally(() => {
        if (pageAbort.current === controller) pageAbort.current = null;
      });
  }, [activeState, key, normalizedQuery, projectId]);

  return { ...activeState, loadMore };
}
