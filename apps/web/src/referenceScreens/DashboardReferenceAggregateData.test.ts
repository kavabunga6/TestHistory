import type { LaunchDashboardAggregateReadModel } from "@testhistory/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";

import { loadLaunchDashboardAggregate } from "./DashboardReferenceAggregateData.js";
import { defaultDashboardWidgets } from "./DashboardReferenceModel.js";

afterEach(() => vi.restoreAllMocks());

describe("dashboard aggregation request", () => {
  it("requests one full-launch aggregate without paging results into the browser", async () => {
    const aggregate = responseModel(10_000, "launch/one");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(aggregate));
    const signal = new AbortController().signal;

    await expect(
      loadLaunchDashboardAggregate("launch/one", defaultDashboardWidgets, signal)
    ).resolves.toEqual(aggregate);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/v1/launches/launch%2Fone/dashboard/aggregate");
    expect(init).toMatchObject({ method: "POST", signal });
    expect(JSON.parse(String(init?.body))).toEqual({
      widgets: defaultDashboardWidgets.map(({ id, kind, metric, groupBy, thql, entity }) => ({
        id,
        kind,
        metric,
        groupBy,
        thql,
        entity
      }))
    });
  });

  it("rejects incomplete summaries rather than displaying wrong widget values", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ ...responseModel(100), widgets: [] })
    );
    await expect(
      loadLaunchDashboardAggregate(
        "launch-1",
        defaultDashboardWidgets,
        new AbortController().signal
      )
    ).rejects.toThrow("неполную сводку");
  });

  it("splits larger saved dashboards into supported batches", async () => {
    const widgets = Array.from({ length: 25 }, (_, index) => ({
      ...defaultDashboardWidgets[0]!,
      id: `metric-${index}`
    }));
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
      const request = JSON.parse(String(init?.body)) as { widgets: Array<{ id: string }> };
      return jsonResponse({
        ...responseModel(10_000),
        widgets: request.widgets.map(({ id }) => ({
          id,
          status: "unsupported",
          reason: "Тестовый виджет"
        }))
      });
    });

    const aggregate = await loadLaunchDashboardAggregate(
      "launch-1",
      widgets,
      new AbortController().signal
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(aggregate.widgets.map((widget) => widget.id)).toEqual(
      widgets.map((widget) => widget.id)
    );
    expect(
      fetchMock.mock.calls.map(
        ([, init]) => (JSON.parse(String(init?.body)) as { widgets: unknown[] }).widgets.length
      )
    ).toEqual([24, 1]);
  });

  it("passes cancellation to the active request", async () => {
    const controller = new AbortController();
    let requestSignal: AbortSignal | undefined;
    vi.spyOn(globalThis, "fetch").mockImplementation(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          requestSignal = init?.signal ?? undefined;
          requestSignal?.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError"))
          );
        })
    );

    const loading = loadLaunchDashboardAggregate(
      "launch-1",
      defaultDashboardWidgets,
      controller.signal
    );
    controller.abort();

    await expect(loading).rejects.toMatchObject({ name: "AbortError" });
    expect(requestSignal).toBe(controller.signal);
  });
});

function responseModel(
  totalResults: number,
  launchId = "launch-1"
): LaunchDashboardAggregateReadModel {
  return {
    kind: "launch-dashboard-aggregate",
    launchId,
    projectId: "project-1",
    totalResults,
    widgets: defaultDashboardWidgets.map(({ id }) => ({
      id,
      status: "unsupported",
      reason: "Тестовый виджет"
    }))
  };
}

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
}
