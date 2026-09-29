import type { ScenarioStep } from "./m1Workspace.js";

export function containsFailedScenarioStep(step: ScenarioStep): boolean {
  return (
    step.status === "failed" ||
    step.status === "broken" ||
    (step.steps ?? []).some(containsFailedScenarioStep)
  );
}

export function shouldExpandScenarioStep(step: ScenarioStep): boolean {
  const expandable = (step.steps?.length ?? 0) > 0 || (step.attachments?.length ?? 0) > 0;
  return expandable && containsFailedScenarioStep(step);
}

export function collectTerminalFailurePaths(steps: ScenarioStep[], parentPath = ""): string[] {
  return steps.flatMap((step, index) => {
    const path = parentPath ? `${parentPath}.${index + 1}` : `${index + 1}`;
    const childFailures = collectTerminalFailurePaths(step.steps ?? [], path);
    return childFailures.length === 0 && (step.status === "failed" || step.status === "broken")
      ? [path]
      : childFailures;
  });
}
