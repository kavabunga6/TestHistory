import { useCallback, useEffect, useState } from "react";

import { getJson } from "./apiHttp.js";
import type { ApiProjectReadModel } from "./m1WorkspaceApiTypes.js";
import {
  chooseProjectId,
  readSelectedProjectId,
  saveSelectedProjectId,
  type ProjectSelection
} from "./projectSelection.js";

const initialSelection: ProjectSelection = { projects: [], status: "idle" };
type OwnedSelection = { userId?: string | undefined; selection: ProjectSelection };

export function useProjectSelection(userId?: string) {
  const [ownedSelection, setOwnedSelection] = useState<OwnedSelection>(() => ({
    userId,
    selection: initialSelection
  }));
  const [revision, setRevision] = useState(0);
  const selection = ownedSelection.userId === userId ? ownedSelection.selection : initialSelection;

  useEffect(() => {
    if (userId === undefined) {
      setOwnedSelection({ userId, selection: initialSelection });
      return;
    }

    const controller = new AbortController();
    setOwnedSelection({ userId, selection: { projects: [], status: "loading" } });
    void getJson<ApiProjectReadModel[]>("/api/v1/projects", { signal: controller.signal })
      .then((projects) => {
        if (controller.signal.aborted) {
          return;
        }
        const preferredProjectId = readSelectedProjectId(userId);
        const selectedProjectId = chooseProjectId(projects, preferredProjectId);
        setOwnedSelection((current) =>
          current.userId === userId
            ? { userId, selection: { projects, selectedProjectId, status: "ready" } }
            : current
        );
        if (selectedProjectId !== undefined && selectedProjectId !== preferredProjectId) {
          saveSelectedProjectId(userId, selectedProjectId);
        }
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setOwnedSelection((current) =>
            current.userId === userId
              ? {
                  userId,
                  selection: {
                    error: error instanceof Error ? error.message : String(error),
                    projects: [],
                    status: "error"
                  }
                }
              : current
          );
        }
      });

    return () => controller.abort();
  }, [revision, userId]);

  const selectProject = useCallback(
    (projectId: string) => {
      if (userId === undefined) {
        return;
      }
      setOwnedSelection((current) => {
        if (
          current.userId !== userId ||
          current.selection.status !== "ready" ||
          !current.selection.projects.some((project) => project.id === projectId)
        ) {
          return current;
        }
        saveSelectedProjectId(userId, projectId);
        return {
          userId,
          selection: { ...current.selection, selectedProjectId: projectId }
        };
      });
    },
    [userId]
  );

  const refreshProjects = useCallback(() => setRevision((current) => current + 1), []);

  return { ...selection, refreshProjects, selectProject };
}
