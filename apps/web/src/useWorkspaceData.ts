import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction
} from "react";

import type { ApiState } from "./api.js";
import { getDefaultSelectedResultId, getWorkspaceRouteScope } from "./appRoutingHelpers.js";
import {
  emptyM1Workspace,
  loadLaunchResultDetail,
  loadM1Workspace,
  workspaceDefaultResultPageSize
} from "./m1Workspace.js";
import type { ResultStatus } from "./m1Workspace.js";
import type { WorkspaceRoute } from "./workspaceRouting.js";

export type RefreshWorkspaceOptions = {
  focusLaunchId?: string | undefined;
  focusResultId?: string | undefined;
};

export function useWorkspaceData(
  route: WorkspaceRoute,
  setApiState: Dispatch<SetStateAction<ApiState>>,
  authenticationIdentity?: string,
  projectId?: string | null
) {
  const [workspace, setWorkspace] = useState(emptyM1Workspace);
  const [selectedId, setSelectedId] = useState(
    route.resultId ?? getDefaultSelectedResultId(emptyM1Workspace.results)
  );
  const [workspaceLoading, setWorkspaceLoading] = useState(true);
  const refreshSequenceRef = useRef(0);
  const workspaceRef = useRef(workspace);
  workspaceRef.current = workspace;
  const paginationScope = `${projectId ?? ""}:${route.launchId ?? ""}`;
  const [resultPagination, setResultPagination] = useState({
    index: 0,
    scope: paginationScope,
    size: workspaceDefaultResultPageSize
  });
  const resultPageSize = resultPagination.size;
  const resultPageIndex = resultPagination.scope === paginationScope ? resultPagination.index : 0;
  const [resultFilter, setResultFilter] = useState<{
    scope: string;
    query: string;
    status?: ResultStatus;
  }>({ scope: paginationScope, query: "" });
  const resultQuery = resultFilter.scope === paginationScope ? resultFilter.query : "";
  const resultStatusFilter =
    resultFilter.scope === paginationScope ? resultFilter.status : undefined;
  const [debouncedQueryState, setDebouncedQueryState] = useState({
    scope: paginationScope,
    query: ""
  });
  const debouncedResultQuery =
    debouncedQueryState.scope === paginationScope ? debouncedQueryState.query : "";

  useEffect(() => {
    if (debouncedResultQuery === resultQuery) {
      return;
    }
    const timer = window.setTimeout(() => {
      setDebouncedQueryState({ scope: paginationScope, query: resultQuery });
    }, 200);
    return () => window.clearTimeout(timer);
  }, [debouncedResultQuery, paginationScope, resultQuery]);

  const setResultPageSize = useCallback(
    (size: number) => {
      if (size !== 25 && size !== 50 && size !== 100) {
        return;
      }
      if (size === resultPageSize) {
        return;
      }
      setResultPagination({ index: 0, scope: paginationScope, size });
    },
    [paginationScope, resultPageSize]
  );

  const setResultPageIndex = useCallback(
    (index: number) => {
      if (!Number.isInteger(index) || index < 0) {
        return;
      }
      if (index === resultPageIndex) {
        return;
      }
      setResultPagination((current) => ({ ...current, index, scope: paginationScope }));
    },
    [paginationScope, resultPageIndex]
  );

  const setResultQuery = useCallback(
    (query: string) => {
      if (query === resultQuery) {
        return;
      }
      setResultFilter((current) => ({
        scope: paginationScope,
        query,
        ...(current.scope === paginationScope && current.status !== undefined
          ? { status: current.status }
          : {})
      }));
      setResultPagination((current) => ({ ...current, index: 0, scope: paginationScope }));
      refreshSequenceRef.current += 1;
    },
    [paginationScope, resultQuery]
  );

  const setResultStatusFilter = useCallback(
    (status: ResultStatus | undefined) => {
      if (status === resultStatusFilter) {
        return;
      }
      setResultFilter((current) => ({
        scope: paginationScope,
        query: current.scope === paginationScope ? current.query : "",
        ...(status !== undefined ? { status } : {})
      }));
      setResultPagination((current) => ({ ...current, index: 0, scope: paginationScope }));
      refreshSequenceRef.current += 1;
    },
    [paginationScope, resultStatusFilter]
  );

  const refreshWorkspace = useCallback(
    async (options: RefreshWorkspaceOptions = {}) => {
      const refreshSequence = refreshSequenceRef.current + 1;
      refreshSequenceRef.current = refreshSequence;
      if (projectId === null) {
        setWorkspace(emptyM1Workspace);
        setSelectedId("");
        setWorkspaceLoading(false);
        return;
      }
      setWorkspaceLoading(true);
      try {
        const focusLaunchId = options.focusLaunchId ?? route.launchId;
        const focusResultId = options.focusResultId ?? route.resultId;
        const loadResultPage = route.mode === "launch" && focusLaunchId !== undefined;
        const nextWorkspace = await loadM1Workspace({
          ...(projectId !== undefined ? { projectId } : {}),
          preferredLaunchId: focusLaunchId,
          preferredResultId: focusResultId,
          preferredTestCaseId: route.testCaseId,
          preferredDefectId: route.defectId,
          ...(loadResultPage
            ? {
                resultPageSize,
                ...(debouncedResultQuery.trim() !== ""
                  ? { resultQuery: debouncedResultQuery }
                  : {}),
                ...(resultStatusFilter !== undefined ? { resultStatusFilter } : {}),
                ...(resultPageIndex > 0
                  ? { resultPageCursor: String(resultPageIndex * resultPageSize) }
                  : {})
              }
            : {}),
          routeScope: getWorkspaceRouteScope({
            ...route,
            launchId: focusLaunchId,
            resultId: focusResultId
          })
        });
        if (refreshSequence !== refreshSequenceRef.current) {
          return;
        }
        setWorkspace(nextWorkspace);
        setApiState((currentState) => {
          const readyState = { ...currentState };
          delete readyState.error;
          return { ...readyState, loading: false };
        });
        const routeResultId = route.resultId;
        const selectedFocusResultId = options.focusResultId ?? routeResultId;
        setSelectedId((currentId) =>
          selectedFocusResultId !== undefined &&
          nextWorkspace.results.some((result) => result.id === selectedFocusResultId)
            ? selectedFocusResultId
            : nextWorkspace.results.some((result) => result.id === currentId)
              ? currentId
              : getDefaultSelectedResultId(nextWorkspace.results) || currentId
        );
      } catch (error) {
        if (refreshSequence !== refreshSequenceRef.current) {
          return;
        }
        console.error("Workspace refresh failed", error);
        setWorkspace(emptyM1Workspace);
        setSelectedId("");
        setApiState({
          loading: false,
          error: error instanceof Error ? error.message : String(error)
        });
      } finally {
        if (refreshSequence === refreshSequenceRef.current) {
          setWorkspaceLoading(false);
        }
      }
    },
    [
      projectId,
      debouncedResultQuery,
      resultPageIndex,
      resultPageSize,
      resultStatusFilter,
      route.defectId,
      route.launchId,
      route.mode,
      route.resultId,
      route.testCaseId,
      setApiState
    ]
  );

  const refreshWorkspaceRef = useRef(refreshWorkspace);
  refreshWorkspaceRef.current = refreshWorkspace;

  useEffect(() => {
    if (route.mode === "launch" && resultQuery !== debouncedResultQuery) {
      return;
    }
    void refreshWorkspaceRef.current();
  }, [
    authenticationIdentity,
    debouncedResultQuery,
    projectId,
    resultPageIndex,
    resultPageSize,
    resultQuery,
    resultStatusFilter,
    route.defectId,
    route.launchId,
    route.mode,
    route.testCaseId
  ]);

  useEffect(
    () => () => {
      refreshSequenceRef.current += 1;
    },
    []
  );

  useEffect(() => {
    if (route.resultId !== undefined) {
      setSelectedId(route.resultId);
    }
  }, [route.resultId]);

  useEffect(() => {
    const launchId = route.launchId;
    const resultId = route.resultId;
    if (
      route.mode !== "launch" ||
      launchId === undefined ||
      resultId === undefined ||
      !workspaceRef.current.launchItems.some((launch) => launch.id === launchId)
    ) {
      return;
    }

    let active = true;
    void loadLaunchResultDetail(launchId, resultId)
      .then((detail) => {
        if (!active) {
          return;
        }
        setWorkspace((currentWorkspace) => {
          if (
            (projectId !== undefined && currentWorkspace.projectId !== projectId) ||
            !currentWorkspace.launchItems.some((launch) => launch.id === launchId)
          ) {
            return currentWorkspace;
          }
          const existing = currentWorkspace.results.find((result) => result.id === resultId);
          if (existing === undefined) {
            return { ...currentWorkspace, selectedResultDetail: detail };
          }
          const mergedDetail = {
            ...existing,
            ...detail,
            history: existing.history,
            ...(existing.historyPoints !== undefined
              ? { historyPoints: existing.historyPoints }
              : {}),
            ...(existing.retryAttempts !== undefined
              ? { retryAttempts: existing.retryAttempts }
              : {}),
            ...(existing.historyCompare !== undefined
              ? { historyCompare: existing.historyCompare }
              : {})
          };
          return {
            ...currentWorkspace,
            selectedResultDetail: mergedDetail,
            results: currentWorkspace.results.map((result) =>
              result.id === resultId ? mergedDetail : result
            )
          };
        });
      })
      .catch((error: unknown) => {
        if (!active) {
          return;
        }
        setApiState({
          loading: false,
          error: error instanceof Error ? error.message : String(error)
        });
      });
    return () => {
      active = false;
    };
  }, [projectId, route.launchId, route.mode, route.resultId, setApiState]);

  return {
    refreshWorkspace,
    resultPageIndex,
    resultPageSize,
    resultQuery,
    resultStatusFilter,
    selectedId,
    setResultPageIndex,
    setResultPageSize,
    setResultQuery,
    setResultStatusFilter,
    setSelectedId,
    setWorkspace,
    workspace,
    workspaceLoading
  };
}
