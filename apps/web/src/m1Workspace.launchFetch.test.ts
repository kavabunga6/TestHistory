import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchM1Workspace,
  resolveLaunchResultId,
  workspaceInitialLaunchLimit,
  workspaceInitialResultHydrationLimit,
  workspaceResultListLimit
} from "./m1Workspace.js";
import { jsonResponse, notFoundResponse } from "./m1Workspace.testResponses.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("m1 workspace mapping", () => {
  it("keeps API bootstrap from loading unbounded launch or result details", async () => {
    const results = Array.from({ length: workspaceInitialResultHydrationLimit + 7 }, (_, index) => {
      const number = index + 1;
      return {
        uuid: `result-${number}`,
        testCaseId: `case-${number}`,
        fullName: `suite.result${number}`,
        name: `enterprise result ${number}`,
        status: "passed" as const,
        durationMs: 100 + index,
        labels: { tag: ["enterprise"] }
      };
    });
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
              name: "Enterprise bootstrap",
              status: "closed",
              createdAt: "2026-05-30T10:00:00.000Z",
              counters: {
                passed: results.length,
                failed: 0,
                broken: 0,
                skipped: 0,
                unknown: 0
              }
            }
          ]
        });
      }

      return notFoundResponse();
    });

    const workspace = await fetchM1Workspace();
    const calls = fetchMock.mock.calls.map(([input]) => String(input));

    expect(workspace.results).toHaveLength(0);
    expect(calls).toContain(
      `/api/v1/projects/project-heavy/launches?limit=${workspaceInitialLaunchLimit}`
    );
    expect(calls).not.toContain("/api/v1/launches/launch-heavy");
    expect(calls).not.toContain(
      `/api/v1/launches/launch-heavy/results?limit=${workspaceResultListLimit}`
    );
    expect(calls.some((url) => /^\/api\/v1\/launches\/launch-heavy\/results\//.test(url))).toBe(
      false
    );
  });

  it("keeps an empty project available to analytics before its first launch", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url === "/api/v1/projects") {
        return jsonResponse([{ id: "project-empty", key: "EMPTY", name: "Empty project" }]);
      }
      if (url === `/api/v1/projects/project-empty/launches?limit=${workspaceInitialLaunchLimit}`) {
        return jsonResponse({ items: [] });
      }
      return notFoundResponse();
    });

    const workspace = await fetchM1Workspace();

    expect(workspace.projectId).toBe("project-empty");
    expect(workspace.launchItems).toEqual([]);
    expect(workspace.results).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("uses the selected project directly and keeps an empty launch usable", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url === `/api/v1/projects/project-two/launches?limit=${workspaceInitialLaunchLimit}`) {
        return jsonResponse({
          items: [
            {
              id: "launch-two",
              projectId: "project-two",
              name: "New launch",
              status: "open",
              counters: { passed: 0, failed: 0, broken: 0, skipped: 0, unknown: 0 }
            }
          ]
        });
      }
      if (url === `/api/v1/launches/launch-two/results?limit=${workspaceResultListLimit}`) {
        return jsonResponse({ items: [] });
      }
      return notFoundResponse();
    });

    const workspace = await fetchM1Workspace({
      projectId: "project-two",
      routeScope: "launch-detail"
    });
    const calls = fetchMock.mock.calls.map(([input]) => String(input));

    expect(workspace.projectId).toBe("project-two");
    expect(workspace.launchItems.map((launch) => launch.id)).toEqual(["launch-two"]);
    expect(workspace.results).toEqual([]);
    expect(calls).not.toContain("/api/v1/projects");
  });

  it("lists 100 launch results while hydrating only the first 25", async () => {
    const results = Array.from({ length: workspaceResultListLimit }, (_, index) => {
      const number = index + 1;
      return {
        uuid: `result-${number}`,
        testCaseId: `case-${number}`,
        fullName: `suite.result${number}`,
        name: `launch detail result ${number}`,
        status: "passed" as const,
        durationMs: 100 + index,
        labels: { tag: ["launch-detail"] }
      };
    });
    const firstPage = results.slice(0, workspaceInitialResultHydrationLimit);
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
              name: "Enterprise launch detail",
              status: "closed",
              createdAt: "2026-05-30T10:00:00.000Z",
              counters: {
                passed: results.length,
                failed: 0,
                broken: 0,
                skipped: 0,
                unknown: 0
              }
            }
          ]
        });
      }

      if (url === `/api/v1/launches/launch-heavy/results?limit=${workspaceResultListLimit}`) {
        return jsonResponse({
          kind: "launch-result-list",
          items: results,
          page: {
            limit: workspaceResultListLimit,
            offset: 0,
            returned: results.length,
            total: results.length
          }
        });
      }

      const resultMatch = url.match(/^\/api\/v1\/launches\/launch-heavy\/results\/(.+)$/);
      if (resultMatch !== null) {
        const result = firstPage.find((item) => item.uuid === decodeURIComponent(resultMatch[1]!));
        return result === undefined ? notFoundResponse() : jsonResponse(result);
      }

      return notFoundResponse();
    });

    const workspace = await fetchM1Workspace({ preferredLaunchId: "launch-heavy" });
    const calls = fetchMock.mock.calls.map(([input]) => String(input));

    expect(workspace.results).toHaveLength(workspaceResultListLimit);
    expect(workspace.results.at(-1)?.id).toBe(`result-${workspaceResultListLimit}`);
    expect(workspace.results.every((result) => result.launchId === "launch-heavy")).toBe(true);
    expect(calls).not.toContain("/api/v1/launches/launch-heavy");
    expect(calls).toContain(
      `/api/v1/launches/launch-heavy/results?limit=${workspaceResultListLimit}`
    );
    expect(
      calls.filter((url) => /^\/api\/v1\/launches\/launch-heavy\/results\//.test(url))
    ).toHaveLength(workspaceInitialResultHydrationLimit);
    expect(calls).not.toContain(
      `/api/v1/launches/launch-heavy/results/result-${workspaceInitialResultHydrationLimit + 1}`
    );
  });

  it("requests the selected result page and preserves filtered pagination metadata", async () => {
    const pageItems = Array.from({ length: 25 }, (_, index) => ({
      uuid: `result-${index + 101}`,
      name: `Critical Checkout ${index + 101}`,
      status: "failed" as const,
      labels: { tag: ["checkout"] }
    }));
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url === "/api/v1/projects") {
        return jsonResponse([{ id: "project-heavy" }]);
      }
      if (url === `/api/v1/projects/project-heavy/launches?limit=${workspaceInitialLaunchLimit}`) {
        return jsonResponse({
          items: [
            {
              id: "launch-heavy",
              projectId: "project-heavy",
              name: "Heavy launch",
              status: "closed",
              counters: { passed: 0, failed: 125, broken: 0, skipped: 0, unknown: 0 }
            }
          ]
        });
      }
      if (
        url ===
        "/api/v1/launches/launch-heavy/results?limit=25&cursor=100&q=Critical%20Checkout&status=failed"
      ) {
        return jsonResponse({
          items: pageItems,
          page: {
            limit: 25,
            cursor: "100",
            offset: 100,
            returned: 25,
            total: 125,
            nextCursor: null,
            hasMore: false
          }
        });
      }
      if (url === "/api/v1/launches/launch-heavy/results/result-outside") {
        return jsonResponse({
          uuid: "result-outside",
          name: "Selected outside page",
          status: "failed",
          labels: {},
          steps: [{ name: "Deep link step", status: "failed", start: 1, stop: 10 }]
        });
      }
      const resultId = url.match(/^\/api\/v1\/launches\/launch-heavy\/results\/(result-\d+)$/)?.[1];
      const result = pageItems.find((item) => item.uuid === resultId);
      return result === undefined ? notFoundResponse() : jsonResponse(result);
    });

    const workspace = await fetchM1Workspace({
      preferredLaunchId: "launch-heavy",
      resultPageSize: 25,
      resultPageCursor: "100",
      resultQuery: "Critical Checkout",
      resultStatusFilter: "failed"
    });

    expect(workspace.results).toHaveLength(25);
    expect(workspace.results[0]).toEqual(
      expect.objectContaining({ id: "result-101", launchId: "launch-heavy" })
    );
    expect(workspace.results.at(-1)?.id).toBe("result-125");
    expect(workspace.resultPage).toEqual({
      limit: 25,
      cursor: "100",
      offset: 100,
      returned: 25,
      total: 125,
      nextCursor: null,
      hasMore: false
    });
    expect(fetchMock.mock.calls.map(([input]) => String(input))).toContain(
      "/api/v1/launches/launch-heavy/results?limit=25&cursor=100&q=Critical%20Checkout&status=failed"
    );

    const deepLinkWorkspace = await fetchM1Workspace({
      preferredLaunchId: "launch-heavy",
      preferredResultId: "result-outside",
      resultPageSize: 25,
      resultPageCursor: "100",
      resultQuery: "Critical Checkout",
      resultStatusFilter: "failed"
    });
    expect(deepLinkWorkspace.results).toHaveLength(25);
    expect(deepLinkWorkspace.resultPage?.returned).toBe(25);
    expect(deepLinkWorkspace.results.some((result) => result.id === "result-outside")).toBe(false);
    expect(deepLinkWorkspace.selectedResultDetail).toEqual(
      expect.objectContaining({
        id: "result-outside",
        launchId: "launch-heavy",
        steps: [expect.objectContaining({ name: "Deep link step" })]
      })
    );
  });

  it("hydrates a selected result beyond the initial detail window", async () => {
    const results = Array.from({ length: workspaceResultListLimit }, (_, index) => ({
      uuid: `result-${index + 1}`,
      testCaseId: `case-${index + 1}`,
      name: `result ${index + 1}`,
      status: "passed" as const,
      labels: { layer: ["api"] }
    }));
    const selectedId = `result-${workspaceResultListLimit}`;
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url === "/api/v1/projects") return jsonResponse([{ id: "project-heavy" }]);
      if (url === `/api/v1/projects/project-heavy/launches?limit=${workspaceInitialLaunchLimit}`) {
        return jsonResponse({
          items: [
            {
              id: "launch-heavy",
              projectId: "project-heavy",
              name: "100 results",
              status: "closed",
              counters: { passed: results.length, failed: 0, broken: 0, skipped: 0, unknown: 0 }
            }
          ]
        });
      }
      if (url === `/api/v1/launches/launch-heavy/results?limit=${workspaceResultListLimit}`) {
        return jsonResponse({ items: results });
      }
      const resultId = url.match(/^\/api\/v1\/launches\/launch-heavy\/results\/(.+)$/)?.[1];
      const result = results.find((item) => item.uuid === resultId);
      if (result === undefined) return notFoundResponse();
      return jsonResponse({
        ...result,
        steps: result.uuid === selectedId ? [{ name: "deep selected step", status: "passed" }] : []
      });
    });

    const workspace = await fetchM1Workspace({
      preferredLaunchId: "launch-heavy",
      preferredResultId: selectedId
    });
    const detailCalls = fetchMock.mock.calls
      .map(([input]) => String(input))
      .filter((url) => /^\/api\/v1\/launches\/launch-heavy\/results\//.test(url));

    expect(workspace.results).toHaveLength(workspaceResultListLimit);
    expect(workspace.results.at(-1)).toEqual(
      expect.objectContaining({
        id: selectedId,
        steps: [expect.objectContaining({ name: "deep selected step" })]
      })
    );
    expect(detailCalls).toHaveLength(workspaceInitialResultHydrationLimit + 1);
    expect(detailCalls).not.toContain(
      `/api/v1/launches/launch-heavy/results/result-${workspaceInitialResultHydrationLimit + 1}`
    );
  });

  it("keeps the launch result list visible while loading the selected result detail", async () => {
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
              name: "Enterprise result detail",
              status: "closed",
              createdAt: "2026-05-30T10:00:00.000Z",
              counters: {
                passed: 9,
                failed: 1,
                broken: 0,
                skipped: 0,
                unknown: 0
              }
            }
          ]
        });
      }

      if (url === `/api/v1/launches/launch-heavy/results?limit=${workspaceResultListLimit}`) {
        return jsonResponse({
          items: [
            {
              uuid: "result-other",
              testCaseId: "case-other",
              fullName: "suite.other",
              name: "other result",
              status: "passed",
              durationMs: 120,
              labels: { tag: ["result-detail"] }
            },
            {
              uuid: "result-selected",
              testCaseId: "case-selected",
              fullName: "suite.selected",
              name: "selected result",
              status: "failed",
              durationMs: 250,
              labels: { issue: ["BUG-SELECTED"], tag: ["result-detail"] }
            }
          ],
          page: { limit: workspaceInitialResultHydrationLimit, offset: 0, returned: 2, total: 2 }
        });
      }

      if (url === "/api/v1/launches/launch-heavy/results/result-selected") {
        return jsonResponse({
          uuid: "result-selected",
          testCaseId: "case-selected",
          fullName: "suite.selected",
          name: "selected result",
          status: "failed",
          durationMs: 250,
          labels: { issue: ["BUG-SELECTED"], tag: ["result-detail"] },
          steps: [{ name: "Open selected detail", status: "failed", start: 10, stop: 40 }]
        });
      }

      return notFoundResponse();
    });

    const workspace = await fetchM1Workspace({
      preferredLaunchId: "launch-heavy",
      preferredResultId: "result-selected"
    });
    const calls = fetchMock.mock.calls.map(([input]) => String(input));

    expect(workspace.results).toHaveLength(2);
    expect(workspace.results.map((result) => result.id)).toEqual([
      "result-other",
      "result-selected"
    ]);
    expect(workspace.results[1]).toEqual(
      expect.objectContaining({
        id: "result-selected",
        status: "failed",
        issues: ["BUG-SELECTED"],
        steps: [
          expect.objectContaining({
            name: "Open selected detail",
            status: "failed",
            duration: "30ms"
          })
        ]
      })
    );
    expect(calls).not.toContain("/api/v1/launches/launch-heavy");
    expect(calls).toContain(
      `/api/v1/launches/launch-heavy/results?limit=${workspaceResultListLimit}`
    );
    expect(calls).toContain("/api/v1/launches/launch-heavy/results/result-selected");
  });

  it("falls back to the listed result when its detail endpoint returns 404", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);

      if (url === "/api/v1/projects") {
        return jsonResponse([{ id: "project-fallback", key: "FALLBACK", name: "Fallback" }]);
      }

      if (
        url === `/api/v1/projects/project-fallback/launches?limit=${workspaceInitialLaunchLimit}`
      ) {
        return jsonResponse({
          items: [
            {
              id: "launch-fallback",
              projectId: "project-fallback",
              name: "Fallback launch",
              status: "closed",
              createdAt: "2026-05-30T10:00:00.000Z",
              counters: {
                passed: 1,
                failed: 0,
                broken: 0,
                skipped: 0,
                unknown: 0
              }
            }
          ]
        });
      }

      if (url === `/api/v1/launches/launch-fallback/results?limit=${workspaceResultListLimit}`) {
        return jsonResponse({
          items: [
            {
              uuid: "result-fallback",
              testCaseId: "case-fallback",
              fullName: "suite.fallback",
              name: "listed fallback result",
              status: "passed",
              durationMs: 180,
              labels: { tag: ["fallback"] }
            }
          ]
        });
      }

      return notFoundResponse();
    });

    const workspace = await fetchM1Workspace({
      preferredLaunchId: "launch-fallback",
      preferredResultId: "result-fallback"
    });
    const resolvedHistoryResultId = await resolveLaunchResultId(
      "launch-fallback",
      "stale-attempt-result",
      "case-fallback"
    );
    const detailUrl = "/api/v1/launches/launch-fallback/results/result-fallback";
    const calls = fetchMock.mock.calls.map(([input]) => String(input));

    expect(workspace.results).toContainEqual(
      expect.objectContaining({
        id: "result-fallback",
        name: "listed fallback result",
        status: "passed",
        tags: ["fallback"]
      })
    );
    expect(resolvedHistoryResultId).toBe("result-fallback");
    expect(calls.filter((url) => url === detailUrl)).toHaveLength(1);
  });
});
