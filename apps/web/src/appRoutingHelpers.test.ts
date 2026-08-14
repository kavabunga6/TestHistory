import { describe, expect, it } from "vitest";

import { getWorkspaceRouteScope } from "./appRoutingHelpers.js";

describe("workspace route scope", () => {
  it("hydrates launch results for dashboard and analytics screens", () => {
    expect(getWorkspaceRouteScope({ mode: "dashboard" })).toBe("launch-detail");
    expect(getWorkspaceRouteScope({ mode: "analytics" })).toBe("launch-detail");
  });

  it("keeps list and detail routes narrowly scoped", () => {
    expect(getWorkspaceRouteScope({ mode: "launch" })).toBe("launch-list");
    expect(getWorkspaceRouteScope({ launchId: "launch-1", mode: "launch" })).toBe("launch-detail");
    expect(
      getWorkspaceRouteScope({ launchId: "launch-1", mode: "launch", resultId: "result-1" })
    ).toBe("result-detail");
    expect(getWorkspaceRouteScope({ mode: "settings" })).toBeUndefined();
  });
});
