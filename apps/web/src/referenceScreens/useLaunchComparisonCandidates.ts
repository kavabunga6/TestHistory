import { useEffect, useMemo, useRef, useState } from "react";

import { getJson } from "../apiHttp.js";
import type { ApiLaunchReadModel, ApiPagedList } from "../m1WorkspaceApiTypes.js";
import { mapApiLaunchListItem } from "../m1WorkspaceMappers.js";
import type { LaunchListItem } from "../m1WorkspaceTypes.js";

const candidatePageSize = 500;

type CandidatePage = {
  items: LaunchListItem[];
  nextCursor: string | null;
  hasMore: boolean;
};

type CandidateState = CandidatePage & {
  status: "loading" | "loading-more" | "ready" | "error";
};

const emptyState: CandidateState = {
  items: [],
  nextCursor: null,
  hasMore: false,
  status: "loading"
};

export function useLaunchComparisonCandidates(
  launch: LaunchListItem,
  launchItems: LaunchListItem[]
) {
  const [state, setState] = useState<CandidateState>(emptyState);
  const [reloadKey, setReloadKey] = useState(0);
  const requestController = useRef<AbortController | undefined>(undefined);

  useEffect(() => {
    requestController.current?.abort();
    if (launch.projectId === undefined) {
      setState({ ...emptyState, status: "ready" });
      return;
    }

    const controller = new AbortController();
    requestController.current = controller;
    setState(emptyState);
    void fetchCandidatePage(launch.projectId, undefined, controller.signal)
      .then((page) => {
        if (!controller.signal.aborted) setState({ ...page, status: "ready" });
      })
      .catch(() => {
        if (!controller.signal.aborted) setState({ ...emptyState, status: "error" });
      });
    return () => requestController.current?.abort();
  }, [launch.projectId, reloadKey]);

  const loadMore = async () => {
    if (launch.projectId === undefined || !state.hasMore || state.nextCursor === null) return;
    requestController.current?.abort();
    const controller = new AbortController();
    requestController.current = controller;
    setState((current) => ({ ...current, status: "loading-more" }));
    try {
      const page = await fetchCandidatePage(launch.projectId, state.nextCursor, controller.signal);
      if (controller.signal.aborted) return;
      setState((current) => ({
        items: [...current.items, ...page.items],
        nextCursor: page.nextCursor,
        hasMore: page.hasMore,
        status: "ready"
      }));
    } catch {
      if (!controller.signal.aborted) setState((current) => ({ ...current, status: "error" }));
    }
  };

  const candidates = useMemo(() => {
    const byId = new Map<string, LaunchListItem>();
    for (const item of [...launchItems, ...state.items]) {
      if (item.id !== launch.id && item.projectId === launch.projectId) byId.set(item.id, item);
    }
    return Array.from(byId.values()).sort(
      (left, right) =>
        getLaunchTimestamp(right) - getLaunchTimestamp(left) ||
        right.id.localeCompare(left.id, "ru", { numeric: true })
    );
  }, [launch.id, launch.projectId, launchItems, state.items]);

  return {
    candidates,
    candidateStatus: state.status,
    hasMoreCandidates: state.hasMore,
    loadMore,
    reload: () => setReloadKey((current) => current + 1)
  };
}

async function fetchCandidatePage(
  projectId: string,
  cursor: string | undefined,
  signal: AbortSignal
): Promise<CandidatePage> {
  const params = new URLSearchParams({ limit: String(candidatePageSize) });
  if (cursor !== undefined) params.set("cursor", cursor);
  const payload = await getJson<ApiLaunchReadModel[] | ApiPagedList<ApiLaunchReadModel>>(
    `/api/v1/projects/${encodeURIComponent(projectId)}/launches?${params.toString()}`,
    { signal }
  );
  return {
    items: (Array.isArray(payload) ? payload : payload.items).map(mapApiLaunchListItem),
    nextCursor: Array.isArray(payload) ? null : (payload.page?.nextCursor ?? null),
    hasMore: Array.isArray(payload) ? false : (payload.page?.hasMore ?? false)
  };
}

function getLaunchTimestamp(item: LaunchListItem) {
  const timestamp = Date.parse(item.createdAt ?? "");
  return Number.isFinite(timestamp) ? timestamp : Number.NEGATIVE_INFINITY;
}
