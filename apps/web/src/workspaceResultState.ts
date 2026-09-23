import type { M1Workspace, TestResult } from "./m1Workspace.js";

/** Apply an optimistic result update to both the list and its separately loaded detail. */
export function updateWorkspaceResults(
  workspace: M1Workspace,
  update: (result: TestResult) => TestResult
): M1Workspace {
  return {
    ...workspace,
    results: workspace.results.map(update),
    ...(workspace.selectedResultDetail === undefined
      ? {}
      : { selectedResultDetail: update(workspace.selectedResultDetail) })
  };
}

export function findWorkspaceResult(
  workspace: M1Workspace,
  resultId: string
): TestResult | undefined {
  return (
    workspace.results.find((result) => result.id === resultId) ??
    (workspace.selectedResultDetail?.id === resultId ? workspace.selectedResultDetail : undefined)
  );
}
