import { describe, expect, it } from "vitest";

import { demoM1Workspace } from "../m1Workspace.js";
import { resultReportTabs } from "./LaunchesReferenceModel.js";

describe("result defect tab", () => {
  it("counts each active defect once when it appears as issue and defect", () => {
    const result = {
      ...demoM1Workspace.results[0]!,
      defect: "PAY-337",
      issues: ["PAY-337"]
    };
    const count = resultReportTabs.find((tab) => tab.id === "defects")?.count;

    expect(count?.(result)).toBe(1);
  });
});
