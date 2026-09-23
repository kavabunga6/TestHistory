import { describe, expect, it } from "vitest";

import { demoM1Workspace } from "./m1Workspace.js";
import { findWorkspaceResult, updateWorkspaceResults } from "./workspaceResultState.js";

describe("workspace result updates", () => {
  it("updates the selected detail and a partial page without changing launch counters", () => {
    const result = demoM1Workspace.results[0]!;
    const launch = demoM1Workspace.launchItems[0]!;
    const workspace = {
      ...demoM1Workspace,
      launchItems: [
        {
          ...launch,
          counters: { broken: 8, failed: 20, muted: 0, passed: 62, skipped: 10 }
        }
      ],
      resultPage: {
        cursor: null,
        hasMore: true,
        limit: 25,
        nextCursor: "25",
        offset: 0,
        returned: 1,
        total: 100
      },
      results: [{ ...result, muted: false }],
      selectedResultDetail: { ...result, muted: false }
    };

    const updated = updateWorkspaceResults(workspace, (candidate) =>
      candidate.id === result.id ? { ...candidate, muted: true } : candidate
    );

    expect(updated.results[0]?.muted).toBe(true);
    expect(updated.selectedResultDetail?.muted).toBe(true);
    expect(updated.launchItems[0]?.counters).toEqual(workspace.launchItems[0]?.counters);
    expect(workspace.selectedResultDetail.muted).toBe(false);
  });

  it("finds a routed result that is outside the current page", () => {
    const result = demoM1Workspace.results[0]!;
    const workspace = {
      ...demoM1Workspace,
      results: [],
      selectedResultDetail: result
    };

    expect(findWorkspaceResult(workspace, result.id)).toBe(result);
  });
});
