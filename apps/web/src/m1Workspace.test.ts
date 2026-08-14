import { afterEach, describe, expect, it, vi } from "vitest";
import {
  M1_SURFACE_CONTRACT,
  assertM1SurfaceContract,
  fetchM1Workspace,
  resolveLaunchResultId,
  workspaceInitialDefectLimit,
  workspaceInitialHistoryLimit,
  workspaceInitialLaunchLimit,
  workspaceInitialResultHydrationLimit,
  workspaceInitialTestCaseLimit,
  mapLaunchDetailsToWorkspace
} from "./m1Workspace.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("m1 workspace mapping", () => {
  it("keeps the m1 surface constrained to the batch 3 tabs", () => {
    expect(assertM1SurfaceContract(M1_SURFACE_CONTRACT)).toEqual({
      testCases: ["list", "selected-case"],
      launches: ["launch", "results", "details"],
      jobs: ["queues", "runtime"]
    });

    expect(() =>
      assertM1SurfaceContract({
        testCases: ["list", "selected-case"],
        launches: ["launch", "results", "details-extra"],
        jobs: ["queues", "runtime"]
      } as never)
    ).toThrow("M1 surface contract drifted for launches");
  });

  it("maps launch details and result details into the UI workspace", () => {
    const workspace = mapLaunchDetailsToWorkspace({
      launches: [
        {
          id: "launch-1",
          projectId: "project-1",
          name: "API Launch",
          status: "open",
          branch: "main",
          buildNumber: "42",
          createdAt: "2026-05-30T06:00:00.000Z",
          counters: {
            passed: 1,
            failed: 0,
            broken: 0,
            skipped: 0,
            unknown: 1
          }
        }
      ],
      launchDetails: {
        id: "launch-1",
        projectId: "project-1",
        name: "API Launch",
        status: "open",
        branch: "main",
        buildNumber: "42",
        createdAt: "2026-05-30T06:00:00.000Z",
        counters: {
          passed: 1,
          failed: 0,
          broken: 0,
          skipped: 0,
          unknown: 1
        },
        results: [
          {
            uuid: "result-1",
            testCaseId: "TC-1",
            fullName: "suite.result",
            name: "loads dashboard",
            status: "unknown",
            durationMs: 1250,
            labels: {
              owner: ["QA"],
              layer: ["UI"],
              severity: ["critical"],
              tag: ["smoke"]
            }
          }
        ]
      },
      resultDetails: [
        {
          uuid: "result-1",
          testCaseId: "TC-1",
          fullName: "suite.result",
          name: "loads dashboard",
          status: "failed",
          durationMs: 1250,
          labels: {
            owner: ["QA"],
            layer: ["UI"],
            severity: ["critical"],
            tag: ["smoke"],
            issue: ["BUG-1"]
          },
          links: [{ name: "Spec", url: "https://example.test/spec" }],
          steps: [{ name: "Open dashboard", status: "passed", start: 10, stop: 30 }]
        }
      ]
    });

    expect(workspace.launch).toEqual(
      expect.objectContaining({
        name: "API Launch",
        build: "42",
        branch: "main",
        owner: "project-1"
      })
    );
    expect(workspace.launchItems[0]?.counters).toEqual({
      passed: 1,
      failed: 0,
      broken: 1,
      skipped: 0,
      muted: 0
    });
    expect(workspace.results[0]).toEqual(
      expect.objectContaining({
        id: "result-1",
        allureId: "TC-1",
        status: "failed",
        duration: "1.25s",
        owner: "QA",
        layer: "UI",
        severity: "critical",
        tags: ["smoke"],
        links: ["Spec"],
        linkDetails: [{ label: "Spec", url: "https://example.test/spec" }],
        issues: ["BUG-1"],
        defect: "BUG-1",
        history: ["failed"],
        historyPoints: [
          expect.objectContaining({
            launchName: "Текущий запуск",
            resultUuid: "result-1",
            status: "failed",
            duration: "1.25s",
            retry: false,
            flaky: false,
            attempt: 1
          })
        ],
        steps: [
          expect.objectContaining({ name: "Open dashboard", status: "passed", duration: "20ms" })
        ]
      })
    );
  });

  it("maps API history reads into result history by testCaseId and historyId", () => {
    const workspace = mapLaunchDetailsToWorkspace({
      launches: [
        {
          id: "launch-current",
          projectId: "project-history",
          name: "Synthetic current launch",
          status: "closed",
          branch: "main",
          buildNumber: "100",
          createdAt: "2026-05-31T08:00:00.000Z",
          counters: { passed: 1, failed: 1, broken: 0, skipped: 0, unknown: 0 }
        }
      ],
      launchDetails: {
        id: "launch-current",
        projectId: "project-history",
        name: "Synthetic current launch",
        status: "closed",
        branch: "main",
        buildNumber: "100",
        createdAt: "2026-05-31T08:00:00.000Z",
        counters: { passed: 1, failed: 1, broken: 0, skipped: 0, unknown: 0 },
        results: [
          {
            uuid: "result-by-test-case",
            testCaseId: "case-stable-login",
            fullName: "synthetic.LoginTest.stable",
            name: "stable login",
            status: "failed",
            durationMs: 750,
            labels: { owner: ["Synthetic QA"], severity: ["normal"] }
          },
          {
            uuid: "result-by-history",
            historyId: "history.synthetic.checkout.saved-card",
            fullName: "synthetic.CheckoutTest.savedCard",
            name: "saved-card checkout",
            status: "passed",
            durationMs: 1250,
            labels: { owner: ["Synthetic QA"], severity: ["critical"] }
          }
        ]
      },
      resultDetails: [],
      historyReads: [
        {
          kind: "test-case-history",
          testCaseId: "case-stable-login",
          projectId: "project-history",
          totalPoints: 3,
          returnedPoints: 3,
          omittedPoints: 0,
          points: [
            {
              launchId: "launch-shadow",
              launchName: "Shadow launch",
              launchCreatedAt: "2026-05-29T08:00:00.000Z",
              resultUuid: "shadow-result",
              testCaseId: "case-other",
              status: "failed",
              durationMs: 300
            },
            {
              launchId: "launch-1",
              launchName: "Synthetic launch 1",
              launchCreatedAt: "2026-05-30T08:00:00.000Z",
              resultUuid: "result-by-test-case-1",
              testCaseId: "case-stable-login",
              status: "passed",
              durationMs: 640,
              retry: false,
              flaky: false,
              attemptNumber: 1
            },
            {
              launchId: "launch-2",
              launchName: "Synthetic launch 2",
              launchCreatedAt: "2026-05-31T08:00:00.000Z",
              resultUuid: "result-by-test-case-2",
              identity: { source: "testCaseId", value: "case-stable-login" },
              status: "unknown",
              durationMs: 780,
              retry: true,
              flaky: true,
              attemptNumber: 2
            }
          ]
        },
        {
          kind: "test-case-history",
          testCaseId: "history.synthetic.checkout.saved-card",
          projectId: "project-history",
          totalPoints: 3,
          returnedPoints: 3,
          omittedPoints: 0,
          points: [
            {
              launchId: "launch-shadow",
              launchName: "Shadow launch",
              launchCreatedAt: "2026-05-29T08:00:00.000Z",
              resultUuid: "shadow-result",
              historyId: "history.synthetic.other",
              status: "broken",
              durationMs: 200
            },
            {
              launchId: "launch-1",
              launchName: "Synthetic launch 1",
              launchCreatedAt: "2026-05-30T08:00:00.000Z",
              resultUuid: "result-by-history-1",
              historyId: "history.synthetic.checkout.saved-card",
              status: "failed",
              durationMs: 980,
              attemptNumber: 1
            },
            {
              launchId: "launch-2",
              launchName: "Synthetic launch 2",
              launchCreatedAt: "2026-05-31T08:00:00.000Z",
              resultUuid: "result-by-history-2",
              identity: { source: "historyId", value: "history.synthetic.checkout.saved-card" },
              status: "passed",
              durationMs: 1250,
              attemptNumber: 2
            }
          ]
        }
      ]
    });

    expect(workspace.results[0]?.history).toEqual(["passed", "broken"]);
    expect(workspace.results[0]?.historyPoints).toEqual([
      expect.objectContaining({
        launchId: "launch-1",
        resultUuid: "result-by-test-case-1",
        status: "passed",
        duration: "640ms",
        retry: false,
        flaky: false,
        attempt: 1
      }),
      expect.objectContaining({
        launchId: "launch-2",
        resultUuid: "result-by-test-case-2",
        status: "broken",
        duration: "780ms",
        retry: true,
        flaky: true,
        attempt: 2
      })
    ]);

    expect(workspace.results[1]?.history).toEqual(["failed", "passed"]);
    expect(workspace.results[1]?.historyPoints?.map((point) => point.resultUuid)).toEqual([
      "result-by-history-1",
      "result-by-history-2"
    ]);
  });

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
      `/api/v1/launches/launch-heavy/results?limit=${workspaceInitialResultHydrationLimit}`
    );
    expect(calls.some((url) => /^\/api\/v1\/launches\/launch-heavy\/results\//.test(url))).toBe(
      false
    );
  });

  it("loads launch detail through the bounded launch results page", async () => {
    const results = Array.from({ length: workspaceInitialResultHydrationLimit + 3 }, (_, index) => {
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

      if (
        url ===
        `/api/v1/launches/launch-heavy/results?limit=${workspaceInitialResultHydrationLimit}`
      ) {
        return jsonResponse({ kind: "launch-result-list", items: firstPage });
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

    expect(workspace.results).toHaveLength(workspaceInitialResultHydrationLimit);
    expect(calls).not.toContain("/api/v1/launches/launch-heavy");
    expect(calls).toContain(
      `/api/v1/launches/launch-heavy/results?limit=${workspaceInitialResultHydrationLimit}`
    );
    expect(
      calls.filter((url) => /^\/api\/v1\/launches\/launch-heavy\/results\//.test(url))
    ).toHaveLength(workspaceInitialResultHydrationLimit);
    expect(calls).not.toContain(
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

      if (
        url ===
        `/api/v1/launches/launch-heavy/results?limit=${workspaceInitialResultHydrationLimit}`
      ) {
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
      `/api/v1/launches/launch-heavy/results?limit=${workspaceInitialResultHydrationLimit}`
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

      if (
        url ===
        `/api/v1/launches/launch-fallback/results?limit=${workspaceInitialResultHydrationLimit}`
      ) {
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
      `/api/v1/launches/launch-heavy/results?limit=${workspaceInitialResultHydrationLimit}`
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
      `/api/v1/launches/launch-heavy/results?limit=${workspaceInitialResultHydrationLimit}`
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
      `/api/v1/launches/launch-heavy/results?limit=${workspaceInitialResultHydrationLimit}`
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

function jsonResponse(value: unknown): Response {
  return {
    ok: true,
    json: async () => value
  } as Response;
}

function notFoundResponse(): Response {
  return {
    ok: false,
    status: 404,
    json: async () => ({ message: "not found" })
  } as Response;
}
