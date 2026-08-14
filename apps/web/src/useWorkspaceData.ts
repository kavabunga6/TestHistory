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
import { emptyM1Workspace, loadM1Workspace } from "./m1Workspace.js";
import type { WorkspaceRoute } from "./workspaceRouting.js";

export type RefreshWorkspaceOptions = {
  focusLaunchId?: string | undefined;
  focusResultId?: string | undefined;
};

export function useWorkspaceData(
  route: WorkspaceRoute,
  setApiState: Dispatch<SetStateAction<ApiState>>,
  authenticationIdentity?: string
) {
  const [workspace, setWorkspace] = useState(emptyM1Workspace);
  const [selectedId, setSelectedId] = useState(
    route.resultId ?? getDefaultSelectedResultId(emptyM1Workspace.results)
  );
  const [workspaceLoading, setWorkspaceLoading] = useState(true);
  const refreshSequenceRef = useRef(0);

  const refreshWorkspace = useCallback(
    async (options: RefreshWorkspaceOptions = {}) => {
      const refreshSequence = refreshSequenceRef.current + 1;
      refreshSequenceRef.current = refreshSequence;
      setWorkspaceLoading(true);
      try {
        const nextWorkspace = await loadM1Workspace({
          preferredLaunchId: options.focusLaunchId ?? route.launchId,
          preferredResultId: options.focusResultId ?? route.resultId,
          preferredTestCaseId: route.testCaseId,
          preferredDefectId: route.defectId,
          routeScope: getWorkspaceRouteScope({
            ...route,
            launchId: options.focusLaunchId ?? route.launchId,
            resultId: options.focusResultId ?? route.resultId
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
        const focusResultId = options.focusResultId ?? routeResultId;
        setSelectedId((currentId) =>
          focusResultId !== undefined &&
          nextWorkspace.results.some((result) => result.id === focusResultId)
            ? focusResultId
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
    [route.defectId, route.launchId, route.mode, route.resultId, route.testCaseId, setApiState]
  );

  const refreshWorkspaceRef = useRef(refreshWorkspace);
  refreshWorkspaceRef.current = refreshWorkspace;

  useEffect(() => {
    void refreshWorkspaceRef.current();
  }, [authenticationIdentity, route.defectId, route.launchId, route.mode, route.testCaseId]);

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

  return {
    refreshWorkspace,
    selectedId,
    setSelectedId,
    setWorkspace,
    workspace,
    workspaceLoading
  };
}
