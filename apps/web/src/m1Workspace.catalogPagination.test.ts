import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchM1Workspace, workspaceInitialHistoryLimit } from "./m1Workspace.js";
import { mapApiDefectCluster } from "./m1WorkspaceMappers.js";
import { jsonResponse, notFoundResponse } from "./m1Workspace.testResponses.js";

const projectId = "project-paged";
const launchesPath = `/api/v1/projects/${projectId}/launches?limit=25`;
const launch = {
  id: "launch-1",
  projectId,
  name: "Nightly",
  status: "closed",
  counters: { passed: 1, failed: 0, broken: 0, skipped: 0, unknown: 0 }
};

afterEach(() => vi.restoreAllMocks());

describe("workspace catalog pagination", () => {
  it("keeps a defect title and lifecycle separate from a passed result", () => {
    const defect = mapApiDefectCluster({
      id: "defect:checkout",
      status: "open",
      title: "Checkout times out",
      occurrenceCount: 2,
      firstSeenAt: "2026-09-01T00:00:00Z",
      lastSeenAt: "2026-09-02T00:00:00Z",
      affectedTestIds: ["case-checkout"],
      results: [
        {
          launchId: "launch-1",
          launchName: "Nightly",
          launchCreatedAt: "2026-09-02T00:00:00Z",
          resultUuid: "result-passed",
          testId: "case-checkout",
          status: "passed"
        }
      ]
    });

    expect(defect.name).toBe("Checkout times out");
    expect(defect.testKeys).toEqual(["case-checkout"]);
    expect(defect.defectStatus).toBe("open");
    expect(defect.status).toBe("passed");
    const resolved = mapApiDefectCluster({
      ...{
        id: "defect:checkout",
        title: "Checkout times out",
        occurrenceCount: 2,
        firstSeenAt: "2026-09-01T00:00:00Z",
        lastSeenAt: "2026-09-02T00:00:00Z"
      },
      status: "closed",
      results: [
        {
          launchId: "launch-1",
          launchName: "Nightly",
          launchCreatedAt: "2026-09-02T00:00:00Z",
          resultUuid: "result-failed",
          testId: "case-checkout",
          status: "failed"
        }
      ]
    });
    expect(resolved.defectStatus).toBe("closed");
    expect(resolved.status).toBe("failed");
  });

  it("loads only the requested launch page and preserves the API total", async () => {
    const requested = `/api/v1/projects/${projectId}/launches?limit=25&cursor=25&q=Nightly`;
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url === requested) {
        return jsonResponse({
          items: [{ ...launch, id: "launch-26" }],
          page: page(25, 25, 1, 70)
        });
      }
      return notFoundResponse();
    });

    const workspace = await fetchM1Workspace({
      projectId,
      routeScope: "launch-list",
      launchPageSize: 25,
      launchPageCursor: "25",
      listQuery: "Nightly"
    });

    expect(workspace.launchItems.map((item) => item.id)).toEqual(["launch-26"]);
    expect(workspace.launchPage).toEqual(page(25, 25, 1, 70));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("loads a later case page and keeps an off-page deep link out of its rows", async () => {
    const requested = `/api/v1/test-cases?projectId=${projectId}&limit=25&cursor=25&q=checkout`;
    const caseSummary = {
      id: "case-26",
      name: "checkout case",
      totalResults: 1,
      lastStatus: "passed",
      historyIds: []
    };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url === launchesPath) {
        return jsonResponse({ items: [launch] });
      }
      if (url === requested) {
        return jsonResponse({
          kind: "test-case-list",
          items: [caseSummary],
          page: page(25, 25, 1, 68)
        });
      }
      return notFoundResponse();
    });

    const workspace = await fetchM1Workspace({
      projectId,
      routeScope: "test-case-list",
      listPageSize: 25,
      listPageCursor: "25",
      listQuery: "checkout"
    });

    expect(workspace.results.map((item) => item.id)).toEqual(["case-26"]);
    expect(workspace.testCasePage?.total).toBe(68);
    expect(workspace.testCasePage?.offset).toBe(25);
    expect(fetchMock.mock.calls.map(([input]) => String(input))).toEqual([launchesPath, requested]);
  });

  it("keeps an off-page case detail separate from the counted list", async () => {
    const listPath = `/api/v1/test-cases?projectId=${projectId}&limit=25`;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url === launchesPath) return jsonResponse({ items: [launch] });
      if (url === listPath) {
        return jsonResponse({
          kind: "test-case-list",
          items: [
            { id: "case-1", name: "First", totalResults: 1, lastStatus: "passed", historyIds: [] }
          ],
          page: page(25, 0, 1, 90)
        });
      }
      if (url === `/api/v1/test-cases/case-90?projectId=${projectId}`) {
        return jsonResponse({
          id: "case-90",
          name: "Deep case",
          totalResults: 1,
          lastStatus: "failed",
          historyIds: []
        });
      }
      if (
        url ===
        `/api/v1/test-cases/case-90/history?projectId=${projectId}&limit=${workspaceInitialHistoryLimit}`
      ) {
        return jsonResponse({ points: [] });
      }
      return notFoundResponse();
    });

    const workspace = await fetchM1Workspace({
      projectId,
      routeScope: "test-case-detail",
      preferredTestCaseId: "case-90"
    });

    expect(workspace.results.map((item) => item.id)).toEqual(["case-1"]);
    expect(workspace.selectedTestCaseDetail?.id).toBe("case-90");
    expect(workspace.testCasePage?.returned).toBe(1);
    expect(workspace.testCasePage?.total).toBe(90);
  });

  it("loads a later defect page with scoped auth and the real total", async () => {
    const requested = `/api/v1/defects?projectId=${projectId}&limit=25&cursor=25`;
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (url === launchesPath) return jsonResponse({ items: [launch] });
      if (url === requested) {
        expect(new Headers(init?.headers).get("x-testhistory-scopes")).toBe("defects:read");
        return jsonResponse({
          kind: "defect-list",
          items: [
            {
              id: "defect:26",
              status: "open",
              title: "Checkout failure",
              occurrenceCount: 1,
              firstSeenAt: "2026-09-01T00:00:00Z",
              lastSeenAt: "2026-09-01T00:00:00Z",
              results: []
            }
          ],
          page: page(25, 25, 1, 60)
        });
      }
      return notFoundResponse();
    });

    const workspace = await fetchM1Workspace({
      projectId,
      routeScope: "defect-list",
      listPageSize: 25,
      listPageCursor: "25"
    });

    expect(workspace.results.map((item) => item.id)).toEqual(["defect:26"]);
    expect(workspace.defectPage).toEqual(page(25, 25, 1, 60));
    expect(fetchMock.mock.calls.map(([input]) => String(input))).toEqual([launchesPath, requested]);
  });

  it("shows catalog records even when the project has no launches", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url === launchesPath) return jsonResponse({ items: [] });
      if (url === `/api/v1/test-cases?projectId=${projectId}&limit=25`) {
        return jsonResponse({
          kind: "test-case-list",
          items: [
            { id: "manual-case", name: "Manual case", totalResults: 0, lastStatus: "unknown" }
          ],
          page: page(25, 0, 1, 1)
        });
      }
      if (url === `/api/v1/defects?projectId=${projectId}&limit=25`) {
        return jsonResponse({
          kind: "defect-list",
          items: [
            {
              id: "manual-defect",
              status: "open",
              title: "Manual defect",
              occurrenceCount: 0,
              firstSeenAt: "2026-09-01T00:00:00Z",
              lastSeenAt: "2026-09-01T00:00:00Z",
              results: []
            }
          ],
          page: page(25, 0, 1, 1)
        });
      }
      return notFoundResponse();
    });

    const [cases, defects] = await Promise.all([
      fetchM1Workspace({ projectId, routeScope: "test-case-list" }),
      fetchM1Workspace({ projectId, routeScope: "defect-list" })
    ]);

    expect(cases.launchItems).toEqual([]);
    expect(cases.results.map((item) => item.id)).toEqual(["manual-case"]);
    expect(cases.testCasePage?.total).toBe(1);
    expect(defects.launchItems).toEqual([]);
    expect(defects.results.map((item) => item.id)).toEqual(["manual-defect"]);
    expect(defects.defectPage?.total).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
});

function page(limit: number, offset: number, returned: number, total: number) {
  const next = offset + returned;
  return {
    limit,
    cursor: offset === 0 ? null : String(offset),
    offset,
    returned,
    total,
    nextCursor: next < total ? String(next) : null,
    hasMore: next < total
  };
}
