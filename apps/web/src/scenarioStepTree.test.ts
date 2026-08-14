import { describe, expect, it } from "vitest";

import type { ScenarioStep } from "./m1Workspace.js";
import { containsFailedScenarioStep, shouldExpandScenarioStep } from "./scenarioStepTree.js";

function step(
  name: string,
  status: ScenarioStep["status"],
  steps: ScenarioStep[] = [],
  attachments: ScenarioStep["attachments"] = []
): ScenarioStep {
  return { attachments, duration: "10ms", name, status, steps };
}

describe("scenario step tree expansion", () => {
  it("keeps a completely green branch collapsed", () => {
    const green = step("level 1", "passed", [
      step("level 2", "passed", [step("level 3", "passed")])
    ]);

    expect(containsFailedScenarioStep(green)).toBe(false);
    expect(shouldExpandScenarioStep(green)).toBe(false);
  });

  it("expands every parent on the path to a failed level-five step", () => {
    const failedLeaf = step("level 5", "failed");
    const level4 = step(
      "level 4",
      "passed",
      [failedLeaf],
      [
        {
          mediaType: "text/plain",
          name: "diagnostic.log",
          retained: true,
          size: "12 B",
          source: "diagnostic.log"
        }
      ]
    );
    const level3 = step("level 3", "passed", [level4]);
    const level2 = step("level 2", "passed", [level3]);
    const level1 = step("level 1", "passed", [level2]);

    for (const parent of [level1, level2, level3, level4]) {
      expect(shouldExpandScenarioStep(parent)).toBe(true);
    }
    expect(shouldExpandScenarioStep(failedLeaf)).toBe(false);
  });
});
