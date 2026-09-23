import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchM1Workspace,
  resolveLaunchResultId,
  workspaceInitialDefectLimit,
  workspaceInitialHistoryLimit,
  workspaceInitialLaunchLimit,
  workspaceResultListLimit,
  workspaceInitialTestCaseLimit
} from "./m1Workspace.js";
import { jsonResponse, notFoundResponse } from "./m1Workspace.testResponses.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("m1 workspace mapping", () => {
  it("opens a routed launch outside the first launch list page", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url === `/api/v1/projects/project-heavy/launches?limit=${workspaceInitialLaunchLimit}`) {
        return jsonResponse({
          items: [
            {
              id: "launch-new",
              projectId: "project-heavy",
              name: "Newest launch",
              status: "closed",
              counters: { passed: 1, failed: 0, broken: 0, skipped: 0, unknown: 0 }
            }
          ]
        });
      }
      if (url === "/api/v1/launches/launch-old") {
        return jsonResponse({
          id: "launch-old",
          projectId: "project-heavy",
          name: "Older routed launch",
          status: "closed",
          counters: { passed: 3, failed: 1, broken: 0, skipped: 0, unknown: 0 },
          results: []
        });
      }
      if (url === "/api/v1/launches/launch-old/results?limit=25") {
        return jsonResponse({
          items: [],
          page: {
            limit: 25,
            cursor: null,
            offset: 0,
            returned: 0,
            total: 0,
            nextCursor: null,
            hasMore: false
          }
        });
      }
      return notFoundResponse();
    });

    const workspace = await fetchM1Workspace({
      projectId: "project-heavy",
      preferredLaunchId: "launch-old",
      resultPageSize: 25,
      routeScope: "launch-detail"
    });

    expect(workspace.launchItems.map((launch) => launch.id)).toEqual(["launch-old", "launch-new"]);
    expect(workspace.launchItems[0]?.counters.failed).toBe(1);
    expect(fetchMock.mock.calls.map(([input]) => String(input))).toContain(
      "/api/v1/launches/launch-old"
    );
  });

  it("does not open a routed launch from another selected project", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url === `/api/v1/projects/project-heavy/launches?limit=${workspaceInitialLaunchLimit}`) {
        return jsonResponse({ items: [] });
      }
      if (url === "/api/v1/launches/launch-other-project") {
        return jsonResponse({
          id: "launch-other-project",
          projectId: "another-project",
          name: "Foreign launch",
          status: "closed",
          counters: { passed: 1, failed: 0, broken: 0, skipped: 0, unknown: 0 },
          results: []
        });
      }
      return notFoundResponse();
    });

    await expect(
      fetchM1Workspace({
        projectId: "project-heavy",
        preferredLaunchId: "launch-other-project",
        routeScope: "launch-detail"
      })
    ).rejects.toThrow("outside the selected project");
  });

  it("includes unknown results when filtering the normalized broken status", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url === `/api/v1/projects/project-heavy/launches?limit=${workspaceInitialLaunchLimit}`) {
        return jsonResponse({
          items: [
            {
              id: "launch-heavy",
              projectId: "project-heavy",
              name: "Launch with unknown results",
              status: "closed",
              counters: { passed: 0, failed: 0, broken: 0, skipped: 0, unknown: 1 }
            }
          ]
        });
      }
      if (url === "/api/v1/launches/launch-heavy/results?limit=25&status=broken%2Cunknown") {
        return jsonResponse({ items: [] });
      }
      return notFoundResponse();
    });

    const workspace = await fetchM1Workspace({
      projectId: "project-heavy",
      preferredLaunchId: "launch-heavy",
      resultPageSize: 25,
      resultStatusFilter: "broken",
      routeScope: "launch-detail"
    });

    expect(workspace.launchItems[0]?.counters.broken).toBe(1);
    expect(fetchMock.mock.calls.map(([input]) => String(input))).toContain(
      "/api/v1/launches/launch-heavy/results?limit=25&status=broken%2Cunknown"
    );
  });

  it("resolves a test case result beyond the first 100 launch results", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url === "/api/v1/launches/launch-heavy/results?limit=100") {
        return jsonResponse({
          items: [{ uuid: "result-first", testCaseId: "case-first" }],
          page: { nextCursor: "100" }
        });
      }
      if (url === "/api/v1/launches/launch-heavy/results?limit=100&cursor=100") {
        return jsonResponse({
          items: [{ uuid: "result-target", testCaseId: "case-target" }],
          page: { nextCursor: null }
        });
      }
      return notFoundResponse();
    });

    expect(await resolveLaunchResultId("launch-heavy", "stale-result", "case-target")).toBe(
      "result-target"
    );
    expect(fetchMock.mock.calls.map(([input]) => String(input))).toEqual([
      "/api/v1/launches/launch-heavy/results?limit=100",
      "/api/v1/launches/launch-heavy/results?limit=100&cursor=100"
    ]);
  });

  it("loads the test case route from the bounded test case list without hydrating launch results", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);

      if (url === "/api/v1/projects") {
        return jsonResponse([{ id: "project-heavy", key: "HEAVY", name: "Heavy project" }]);
      }

      if (url === `/api/v1/projects/project-heavy/launches?limit=${workspaceInitialLaunchLimit}`) {
        return jsonResponse({
          items: [
            {
              id: "launch-heavy",
              projectId: "project-heavy",
              name: "Enterprise case list",
              status: "closed",
              createdAt: "2026-05-30T10:00:00.000Z",
              counters: {
                passed: 1,
                failed: 1,
                broken: 0,
                skipped: 0,
                unknown: 0
              }
            }
          ]
        });
      }

      if (
        url === `/api/v1/test-cases?projectId=project-heavy&limit=${workspaceInitialTestCaseLimit}`
      ) {
        return jsonResponse({
          kind: "test-case-list",
          items: [
            {
              id: "case-1",
              name: "case from summary",
              fullName: "suite.case",
              historyIds: ["history-1"],
              totalResults: 3,
              lastStatus: "failed",
              medianDurationMs: 320,
              flakyScore: 50,
              testCase: {
                id: "case-1",
                projectId: "project-heavy",
                allureId: "A-1",
                name: "case from metadata",
                workflowStatus: "active",
                tags: ["enterprise"],
                members: ["QA"],
                issues: ["BUG-CASE"],
                testKeys: ["TMS-1"],
                customFields: { component: "Checkout" }
              }
            }
          ]
        });
      }

      return notFoundResponse();
    });

    const workspace = await fetchM1Workspace({ routeScope: "test-case-list" });
    const calls = fetchMock.mock.calls.map(([input]) => String(input));

    expect(workspace.results).toHaveLength(1);
    expect(workspace.results[0]).toEqual(
      expect.objectContaining({
        id: "case-1",
        allureId: "A-1",
        name: "case from metadata",
        status: "failed",
        owner: "QA",
        issues: ["BUG-CASE"],
        testKeys: ["TMS-1"]
      })
    );
    expect(calls).toContain(
      `/api/v1/test-cases?projectId=project-heavy&limit=${workspaceInitialTestCaseLimit}`
    );
    expect(calls).not.toContain(
      `/api/v1/launches/launch-heavy/results?limit=${workspaceResultListLimit}`
    );
    expect(calls.some((url) => /^\/api\/v1\/launches\/launch-heavy\/results\//.test(url))).toBe(
      false
    );
  });

  it("keeps the test case list while hydrating the selected test case detail", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);

      if (url === "/api/v1/projects") {
        return jsonResponse([{ id: "project-heavy", key: "HEAVY", name: "Heavy project" }]);
      }

      if (url === `/api/v1/projects/project-heavy/launches?limit=${workspaceInitialLaunchLimit}`) {
        return jsonResponse({
          items: [
            {
              id: "launch-heavy",
              projectId: "project-heavy",
              name: "Enterprise case detail",
              status: "closed",
              createdAt: "2026-05-30T10:00:00.000Z",
              counters: {
                passed: 4,
                failed: 0,
                broken: 0,
                skipped: 0,
                unknown: 0
              }
            }
          ]
        });
      }

      if (url === "/api/v1/test-cases/case-selected?projectId=project-heavy") {
        return jsonResponse({
          id: "case-selected",
          name: "selected case",
          fullName: "suite.selected",
          historyIds: ["history-selected"],
          totalResults: 2,
          lastStatus: "passed",
          medianDurationMs: 240
        });
      }

      if (
        url ===
        `/api/v1/test-cases/case-selected/history?projectId=project-heavy&limit=${workspaceInitialHistoryLimit}`
      ) {
        return jsonResponse({
          kind: "test-case-history",
          testCaseId: "case-selected",
          totalPoints: 1,
          returnedPoints: 1,
          omittedPoints: 0,
          points: [
            {
              launchId: "launch-heavy",
              launchName: "Enterprise case detail",
              launchCreatedAt: "2026-05-30T10:00:00.000Z",
              resultUuid: "result-selected",
              testCaseId: "case-selected",
              status: "passed",
              durationMs: 240,
              retry: false,
              flaky: false,
              attemptNumber: 1
            }
          ]
        });
      }

      if (
        url === `/api/v1/test-cases?projectId=project-heavy&limit=${workspaceInitialTestCaseLimit}`
      ) {
        return jsonResponse({
          items: [
            {
              id: "case-other",
              name: "other case",
              fullName: "suite.other",
              historyIds: ["history-other"],
              totalResults: 1,
              lastStatus: "failed",
              medianDurationMs: 180,
              history: []
            },
            {
              id: "case-selected",
              name: "selected case summary",
              fullName: "suite.selected",
              historyIds: ["history-selected"],
              totalResults: 2,
              lastStatus: "broken",
              medianDurationMs: 220,
              history: []
            }
          ]
        });
      }

      return notFoundResponse();
    });

    const workspace = await fetchM1Workspace({
      preferredTestCaseId: "case-selected",
      routeScope: "test-case-detail"
    });
    const calls = fetchMock.mock.calls.map(([input]) => String(input));

    expect(workspace.results).toHaveLength(2);
    expect(workspace.results).toContainEqual(
      expect.objectContaining({
        id: "case-other",
        name: "other case",
        status: "failed"
      })
    );
    expect(workspace.results).toContainEqual(
      expect.objectContaining({
        id: "case-selected",
        name: "selected case",
        status: "passed",
        historyPoints: [
          expect.objectContaining({
            launchId: "launch-heavy",
            resultUuid: "result-selected",
            status: "passed"
          })
        ]
      })
    );
    expect(calls).toContain("/api/v1/test-cases/case-selected?projectId=project-heavy");
    expect(calls).toContain(
      `/api/v1/test-cases/case-selected/history?projectId=project-heavy&limit=${workspaceInitialHistoryLimit}`
    );
    expect(calls).toContain(
      `/api/v1/test-cases?projectId=project-heavy&limit=${workspaceInitialTestCaseLimit}`
    );
    expect(calls).not.toContain(
      `/api/v1/launches/launch-heavy/results?limit=${workspaceResultListLimit}`
    );
    expect(calls.some((url) => /^\/api\/v1\/launches\/launch-heavy\/results\//.test(url))).toBe(
      false
    );
  });

  it("loads the defects route from the bounded defects read model", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);

      if (url === "/api/v1/projects") {
        return jsonResponse([{ id: "project-heavy", key: "HEAVY", name: "Heavy project" }]);
      }

      if (url === `/api/v1/projects/project-heavy/launches?limit=${workspaceInitialLaunchLimit}`) {
        return jsonResponse({
          items: [
            {
              id: "launch-heavy",
              projectId: "project-heavy",
              name: "Enterprise defects",
              status: "closed",
              createdAt: "2026-05-30T10:00:00.000Z",
              counters: {
                passed: 1,
                failed: 1,
                broken: 0,
                skipped: 0,
                unknown: 0
              }
            }
          ]
        });
      }

      if (url === `/api/v1/defects?projectId=project-heavy&limit=${workspaceInitialDefectLimit}`) {
        expect(new Headers(init?.headers).get("x-testhistory-scopes")).toBe("defects:read");
        return jsonResponse({
          kind: "defect-list",
          items: [
            {
              id: "defect:checkout",
              status: "open",
              lifecycleState: "new",
              title: "checkout failed",
              signature: {
                hash: "checkout",
                reason: "checkout failed",
                sources: ["statusDetails.message"]
              },
              affectedTestIds: ["case-checkout"],
              currentAffectedTestIds: ["case-checkout"],
              occurrenceCount: 1,
              firstSeenAt: "2026-05-30T10:00:00.000Z",
              lastSeenAt: "2026-05-30T10:00:00.000Z",
              firstSeenLaunchId: "launch-heavy",
              lastSeenLaunchId: "launch-heavy",
              results: [
                {
                  launchId: "launch-heavy",
                  launchName: "Enterprise defects",
                  launchCreatedAt: "2026-05-30T10:00:00.000Z",
                  resultUuid: "result-checkout",
                  testId: "case-checkout",
                  status: "failed"
                }
              ]
            }
          ]
        });
      }

      return notFoundResponse();
    });

    const workspace = await fetchM1Workspace({ routeScope: "defect-list" });
    const calls = fetchMock.mock.calls.map(([input]) => String(input));

    expect(workspace.results).toHaveLength(1);
    expect(workspace.results[0]).toEqual(
      expect.objectContaining({
        id: "defect:checkout",
        defect: "defect:checkout",
        issues: ["defect:checkout"],
        status: "failed"
      })
    );
    expect(calls).toContain(
      `/api/v1/defects?projectId=project-heavy&limit=${workspaceInitialDefectLimit}`
    );
    expect(calls).not.toContain(
      `/api/v1/launches/launch-heavy/results?limit=${workspaceResultListLimit}`
    );
    expect(calls.some((url) => /^\/api\/v1\/launches\/launch-heavy\/results\//.test(url))).toBe(
      false
    );
  });

  it("keeps the complete defect page when a defect detail route is selected", async () => {
    const selectedDefectId = "defect:runtime";
    const defectItems = [
      createDefectReadModel("defect:checkout", "checkout failed", "result-checkout"),
      createDefectReadModel(selectedDefectId, "runtime crashed", "result-runtime", false)
    ];
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);

      if (url === "/api/v1/projects") {
        return jsonResponse([{ id: "project-heavy", key: "HEAVY", name: "Heavy project" }]);
      }

      if (url === `/api/v1/projects/project-heavy/launches?limit=${workspaceInitialLaunchLimit}`) {
        return jsonResponse({
          items: [
            {
              id: "launch-heavy",
              projectId: "project-heavy",
              name: "Enterprise defects",
              status: "closed",
              createdAt: "2026-05-30T10:00:00.000Z",
              counters: { passed: 0, failed: 2, broken: 0, skipped: 0, unknown: 0 }
            }
          ]
        });
      }

      if (url === `/api/v1/defects?projectId=project-heavy&limit=${workspaceInitialDefectLimit}`) {
        return jsonResponse({ kind: "defect-list", items: defectItems });
      }

      if (
        url ===
        `/api/v1/defects?projectId=project-heavy&q=${encodeURIComponent(selectedDefectId)}&limit=1`
      ) {
        return jsonResponse({ kind: "defect-list", items: [defectItems[1]] });
      }

      return notFoundResponse();
    });

    const workspace = await fetchM1Workspace({
      preferredDefectId: selectedDefectId,
      routeScope: "defect-detail"
    });
    const calls = fetchMock.mock.calls.map(([input]) => String(input));

    expect(workspace.results.map((result) => result.defect)).toEqual([
      "defect:checkout",
      selectedDefectId
    ]);
    expect(workspace.results[1]?.testKeys).toEqual(["case-result-runtime"]);
    expect(calls).toContain(
      `/api/v1/defects?projectId=project-heavy&limit=${workspaceInitialDefectLimit}`
    );
    expect(calls).toContain(
      `/api/v1/defects?projectId=project-heavy&q=${encodeURIComponent(selectedDefectId)}&limit=1`
    );
  });
});

function createDefectReadModel(
  id: string,
  title: string,
  resultUuid: string,
  includeAffectedTests = true
) {
  return {
    id,
    status: "open",
    lifecycleState: "new",
    title,
    occurrenceCount: 1,
    firstSeenAt: "2026-05-30T10:00:00.000Z",
    lastSeenAt: "2026-05-30T10:00:00.000Z",
    firstSeenLaunchId: "launch-heavy",
    lastSeenLaunchId: "launch-heavy",
    affectedTestIds: includeAffectedTests ? [`case-${resultUuid}`] : [],
    currentAffectedTestIds: includeAffectedTests ? [`case-${resultUuid}`] : [],
    results: [
      {
        launchId: "launch-heavy",
        launchName: "Enterprise defects",
        launchCreatedAt: "2026-05-30T10:00:00.000Z",
        resultUuid,
        testId: `case-${resultUuid}`,
        status: "failed"
      }
    ]
  };
}
