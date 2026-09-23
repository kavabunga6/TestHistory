import type { ApiProjectReadModel } from "./m1WorkspaceApiTypes.js";

export type ProjectListStatus = "idle" | "loading" | "ready" | "error";

export type ProjectSelection = {
  error?: string | undefined;
  projects: ApiProjectReadModel[];
  selectedProjectId?: string | undefined;
  status: ProjectListStatus;
};

const storagePrefix = "testhistory:selected-project:v1:";

export function chooseProjectId(
  projects: ApiProjectReadModel[],
  preferredProjectId?: string
): string | undefined {
  return projects.find((project) => project.id === preferredProjectId)?.id ?? projects[0]?.id;
}

export function readSelectedProjectId(userId: string): string | undefined {
  try {
    return globalThis.localStorage?.getItem(`${storagePrefix}${userId}`) ?? undefined;
  } catch {
    return undefined;
  }
}

export function saveSelectedProjectId(userId: string, projectId: string): void {
  try {
    globalThis.localStorage?.setItem(`${storagePrefix}${userId}`, projectId);
  } catch {
    // Selection stays available in memory when storage is disabled.
  }
}
