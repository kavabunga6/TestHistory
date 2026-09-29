import type { LaunchDurationChartReadModel } from "@testhistory/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { requestJson } from "../apiHttp.js";
import { loadLaunchDurationChart } from "./LaunchDurationChartData.js";

vi.mock("../apiHttp.js", () => ({ requestJson: vi.fn() }));

const chart: LaunchDurationChartReadModel = {
  kind: "launch-duration-chart",
  launchId: "launch/one",
  projectId: "project-1",
  totalResults: 100,
  measuredResults: 100,
  averageDurationMs: 1_500,
  buckets: [
    { label: "<100ms", count: 25 },
    { label: "100ms-1s", count: 0 },
    { label: "1s-10s", count: 75 },
    { label: "10s-1m", count: 0 },
    { label: "1m-5m", count: 0 },
    { label: "5m-30m", count: 0 },
    { label: "30m-1h", count: 0 },
    { label: "1h+", count: 0 }
  ]
};

afterEach(() => vi.resetAllMocks());

describe("launch duration chart loader", () => {
  it("requests the aggregate for the selected launch", async () => {
    vi.mocked(requestJson).mockResolvedValue(chart);
    const signal = new AbortController().signal;
    await expect(loadLaunchDurationChart("launch/one", signal)).resolves.toEqual(chart);
    expect(requestJson).toHaveBeenCalledWith("/api/v1/launches/launch%2Fone/charts/duration", {
      signal
    });
  });

  it("rejects incomplete aggregates rather than showing misleading counts", async () => {
    vi.mocked(requestJson).mockResolvedValue({ ...chart, measuredResults: 99 });
    await expect(
      loadLaunchDurationChart("launch/one", new AbortController().signal)
    ).rejects.toThrow("неполные данные");
  });
});
