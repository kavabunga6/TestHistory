import type { M1WorkspaceRouteScope, ScenarioStep, TestResult } from "./m1Workspace.js";
import type { WorkspaceRoute } from "./workspaceRouting.js";

export function getWorkspaceRouteScope(route: WorkspaceRoute): M1WorkspaceRouteScope | undefined {
  if (route.mode === "dashboard" || route.mode === "analytics") {
    return "launch-detail";
  }

  if (route.mode === "case") {
    return route.testCaseId !== undefined ? "test-case-detail" : "test-case-list";
  }

  if (route.mode === "defects") {
    return route.defectId !== undefined ? "defect-detail" : "defect-list";
  }

  if (route.mode === "launch") {
    if (route.resultId !== undefined) {
      return "result-detail";
    }

    if (route.launchId !== undefined) {
      return "launch-detail";
    }

    return "launch-list";
  }

  return undefined;
}

export function getDefaultSelectedResultId(results: TestResult[]): string {
  return (
    results.find((result) => result.status === "failed")?.id ??
    results.find((result) => result.status === "broken")?.id ??
    results.find(
      (result) => (result.attachments?.length ?? 0) > 0 || result.steps.some(hasNestedScenarioStep)
    )?.id ??
    results[0]?.id ??
    ""
  );
}

export function isResultQuarantined(result: TestResult): boolean {
  return result.muted || result.defectMute !== undefined || result.status === "muted";
}

function hasNestedScenarioStep(step: ScenarioStep): boolean {
  return (step.steps?.length ?? 0) > 0 || (step.attachments?.length ?? 0) > 0;
}
