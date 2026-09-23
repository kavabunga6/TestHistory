import { describe, expect, it } from "vitest";
import {
  M1_SURFACE_CONTRACT,
  assertM1SurfaceContract,
  mapLaunchDetailsToWorkspace
} from "./m1Workspace.js";
import { mapApiSteps } from "./m1WorkspaceMappers.js";

describe("m1 workspace mapping", () => {
  it("keeps an exception on the nested step where it occurred", () => {
    const steps = mapApiSteps([
      {
        name: "Authentication phase",
        status: "failed",
        steps: [
          {
            name: "Verify response",
            status: "failed",
            statusDetails: {
              message: "Expected HTTP 200, received 401",
              trace: "AssertionError: response mismatch\nat verifyResponse (auth.spec.ts:42:7)"
            }
          }
        ]
      }
    ]);

    expect(steps[0]?.trace).toBeUndefined();
    expect(steps[0]?.steps?.[0]?.trace).toEqual({
      message: "Expected HTTP 200, received 401",
      stack: ["AssertionError: response mismatch", "at verifyResponse (auth.spec.ts:42:7)"]
    });
  });

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
});
