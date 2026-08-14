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
