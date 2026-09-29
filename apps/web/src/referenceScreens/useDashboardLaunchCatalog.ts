import { useEffect, useMemo, useRef, useState } from "react";

import { getJson } from "../apiHttp.js";
import type { ApiLaunchReadModel, ApiPagedList } from "../m1WorkspaceApiTypes.js";
import { mapApiLaunchListItem } from "../m1WorkspaceMappers.js";
import type { LaunchListItem } from "../m1WorkspaceTypes.js";

const pageSize = 100;

type CatalogState = {
  projectId: string | undefined;
  status: "loading" | "loading-more" | "ready" | "error";
  items: LaunchListItem[];
  nextCursor: string | null;
  hasMore: boolean;
  total: number | undefined;
};

function emptyState(projectId: string | undefined): CatalogState {
  return {
    projectId,
    status: projectId === undefined ? "ready" : "loading",
    items: [],
    nextCursor: null,
    hasMore: false,
    total: undefined
  };
}

export function useDashboardLaunchCatalog(
  projectId: string | undefined,
  initialItems: LaunchListItem[]
) {
  const [state, setState] = useState<CatalogState>(() => emptyState(projectId));
  const [reloadAttempt, setReloadAttempt] = useState(0);
  const requestController = useRef<AbortController | null>(null);
  const activeState = state.projectId === projectId ? state : emptyState(projectId);

  useEffect(() => {
    requestController.current?.abort();
    if (projectId === undefined) {
      setState(emptyState(undefined));
      return;
    }

    const controller = new AbortController();
    requestController.current = controller;
    setState(emptyState(projectId));
    void fetchPage(projectId, undefined, controller.signal)
      .then((page) => {
        if (!controller.signal.aborted) {
          setState({ projectId, status: "ready", ...page });
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setState((current) =>
            current.projectId === projectId ? { ...current, status: "error" } : current
          );
        }
      });

    return () => requestController.current?.abort();
  }, [projectId, reloadAttempt]);

  const loadMore = async () => {
    if (
      projectId === undefined ||
      activeState.status === "loading" ||
      activeState.status === "loading-more" ||
      !activeState.hasMore ||
      activeState.nextCursor === null
    ) {
      return;
    }

    const controller = new AbortController();
    requestController.current = controller;
    const cursor = activeState.nextCursor;
    setState((current) => ({ ...current, status: "loading-more" }));
    try {
      const page = await fetchPage(projectId, cursor, controller.signal);
      if (controller.signal.aborted) return;
      setState((current) =>
        current.projectId === projectId
          ? {
              projectId,
              status: "ready",
              items: [...current.items, ...page.items],
              nextCursor: page.nextCursor,
              hasMore: page.hasMore,
              total: page.total
            }
          : current
      );
    } catch {
      if (!controller.signal.aborted) {
        setState((current) =>
          current.projectId === projectId ? { ...current, status: "error" } : current
        );
      }
    }
  };

  const items = useMemo(() => {
    const byId = new Map<string, LaunchListItem>();
    for (const item of [...initialItems, ...activeState.items]) {
      if (projectId !== undefined && item.projectId !== undefined && item.projectId !== projectId) {
        continue;
      }
      if (!byId.has(item.id)) byId.set(item.id, item);
    }
    return [...byId.values()];
  }, [activeState.items, initialItems, projectId]);

  return {
    items,
    status: activeState.status,
    hasMore: activeState.hasMore,
    total: activeState.total,
    loadMore,
    retry: () => {
      if (activeState.hasMore && activeState.nextCursor !== null) {
        void loadMore();
      } else {
        setReloadAttempt((attempt) => attempt + 1);
      }
    }
  };
}

async function fetchPage(projectId: string, cursor: string | undefined, signal: AbortSignal) {
  const params = new URLSearchParams({ limit: String(pageSize) });
  if (cursor !== undefined) params.set("cursor", cursor);
  const response = await getJson<ApiLaunchReadModel[] | ApiPagedList<ApiLaunchReadModel>>(
    `/api/v1/projects/${encodeURIComponent(projectId)}/launches?${params}`,
    { signal }
  );
  return {
    items: (Array.isArray(response) ? response : response.items).map(mapApiLaunchListItem),
    nextCursor: Array.isArray(response) ? null : (response.page?.nextCursor ?? null),
    hasMore: Array.isArray(response) ? false : (response.page?.hasMore ?? false),
    total: Array.isArray(response) ? response.length : response.page?.total
  };
}
