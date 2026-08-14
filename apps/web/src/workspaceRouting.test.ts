import { describe, expect, it } from "vitest";

import { getHashFromRoute, getRouteFromHash } from "./workspaceRouting.js";

describe("workspace launch search routing", () => {
  it("round-trips a current-launch tag query", () => {
    const hash = getHashFromRoute({
      launchId: "launch-114",
      launchQuery: 'tag = "negative"',
      launchTab: "results",
      mode: "launch"
    });

    expect(hash).toBe("#launch/launch-114/results?query=tag+%3D+%22negative%22");
    expect(getRouteFromHash(hash)).toEqual({
      launchId: "launch-114",
      launchQuery: 'tag = "negative"',
      launchTab: "results",
      mode: "launch",
      resultId: undefined
    });
  });

  it("preserves a query on a result detail route", () => {
    expect(
      getRouteFromHash(
        "#launch/launch-114/result/result-1/overview?query=tag%20%3D%20%22evidence%22"
      )
    ).toMatchObject({
      launchId: "launch-114",
      launchQuery: 'tag = "evidence"',
      resultId: "result-1",
      resultTab: "overview"
    });
  });
});
