import { describe, expect, it } from "vitest";
import type { NormalizedTestResult } from "@testhistory/contracts";
import {
  buildDefectClusters,
  buildTestCaseHistoryCompareDecision,
  type Launch,
  type TestCaseHistoryCompareSnapshotInput
} from "./index.js";

describe("test case history compare decisions", () => {
  it("detects label, executor, branch, build, and defect changes without changing REST shapes", () => {
    const before = snapshot({
      launch: {
        id: "launch-before",
        projectId: "project-history",
        name: "main #10",
        createdAt: "2026-05-01T00:00:00Z",
        branch: "main",
        buildNumber: "10",
        commitSha: "aaa111"
      },
      result: result({
        uuid: "result-before",
        status: "passed",
        labels: {
          component: ["checkout"],
          layer: ["api"]
        }
      }),
      executor: {
        name: "github-actions",
        type: "ci",
        buildName: "checkout-main-10",
        buildUrl: "https://ci.example.test/builds/10?token=before-secret"
      }
    });
    const after = snapshot({
      launch: {
        id: "launch-after",
        projectId: "project-history",
        name: "release #11",
        createdAt: "2026-05-02T00:00:00Z",
        branch: "release/1.2",
        buildNumber: "11",
        commitSha: "bbb222"
      },
      result: result({
        uuid: "result-after",
        status: "failed",
        labels: {
          component: ["checkout", "payments"],
          feature: ["refunds"]
        },
        statusMessage: "Payment gateway rejected request token=after-secret"
      }),
      executor: {
        name: "github-actions",
        type: "ci",
        buildName: "checkout-release-11",
        buildUrl: "https://ci.example.test/builds/11?token=after-secret"
      }
    });
    const defectClusters = buildDefectClusters([
      launchFromSnapshot(before),
      launchFromSnapshot(after)
    ]);

    const compare = buildTestCaseHistoryCompareDecision({
      before,
      after,
      defectClusters
    });

    expect(compare.projectId).toBe("project-history");
    expect(compare.testCaseId).toBe("case-checkout");
    expect(compare.redaction).toEqual({
      rawResultsIncluded: false,
      rawStatusDetailsIncluded: false,
      hiddenOrMaskedValuesIncluded: false
    });
    expect(compare.decisions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "label",
          subject: "component",
          change: "changed",
          before: ["checkout"],
          after: ["checkout", "payments"]
        }),
        expect.objectContaining({
          kind: "label",
          subject: "feature",
          change: "added",
          after: ["refunds"]
        }),
        expect.objectContaining({
          kind: "label",
          subject: "layer",
          change: "removed",
          before: ["api"]
        }),
        expect.objectContaining({
          kind: "executor",
          subject: "executor.buildName",
          change: "changed",
          before: ["checkout-main-10"],
          after: ["checkout-release-11"]
        }),
        expect.objectContaining({
          kind: "branch",
          subject: "branch",
          change: "changed",
          before: ["main"],
          after: ["release/1.2"]
        }),
        expect.objectContaining({
          kind: "build",
          subject: "buildNumber",
          change: "changed",
          before: ["10"],
          after: ["11"]
        }),
        expect.objectContaining({
          kind: "defect",
          subject: "failure-signature",
          change: "added",
          severity: "risk"
        })
      ])
    );
    expect(compare.summary.risk).toBe(1);
    expect(compare.summary.added).toBeGreaterThanOrEqual(2);
  });

  it("recomputes deterministic decisions from shuffled labels and defect clusters", () => {
    const before = snapshot({
      launch: {
        id: "launch-stable-before",
        projectId: "project-history",
        name: "main #20",
        createdAt: "2026-05-03T00:00:00Z"
      },
      result: result({
        uuid: "result-stable-before",
        status: "failed",
        labels: {
          tag: ["slow", "api"],
          component: ["billing"]
        },
        statusMessage: "Timeout while creating invoice"
      })
    });
    const after = snapshot({
      launch: {
        id: "launch-stable-after",
        projectId: "project-history",
        name: "main #21",
        createdAt: "2026-05-04T00:00:00Z"
      },
      result: result({
        uuid: "result-stable-after",
        status: "failed",
        labels: {
          component: ["billing"],
          tag: ["api", "slow"]
        },
        statusMessage: "Timeout while creating invoice"
      })
    });
    const defectClusters = buildDefectClusters([
      launchFromSnapshot(after),
      launchFromSnapshot(before)
    ]);

    const first = buildTestCaseHistoryCompareDecision({
      before,
      after,
      defectClusters
    });
    const second = buildTestCaseHistoryCompareDecision({
      before: snapshot({
        ...before,
        result: {
          ...before.result,
          labels: {
            component: ["billing"],
            tag: ["api", "slow"]
          }
        }
      }),
      after: snapshot({
        ...after,
        result: {
          ...after.result,
          labels: {
            tag: ["slow", "api"],
            component: ["billing"]
          }
        }
      }),
      defectClusters: [...defectClusters].reverse()
    });

    expect(second).toEqual(first);
    expect(first.decisions).toEqual([
      expect.objectContaining({
        kind: "defect",
        change: "unchanged",
        severity: "risk"
      })
    ]);
  });

  it("redacts labels, executor metadata, branches, and defect reasons recursively", () => {
    const before = snapshot({
      launch: {
        id: "launch-redact-before",
        projectId: "project-history",
        name: "main #30",
        createdAt: "2026-05-05T00:00:00Z",
        branch: "feature/password=before-secret"
      },
      result: result({
        uuid: "result-redact-before",
        status: "failed",
        labels: {
          token: ["plain-token-value"],
          component: ["auth"]
        },
        statusMessage: "Bearer secret-token failed at C:\\Users\\example-user\\Downloads\\token.txt"
      }),
      executor: {
        name: "runner token=before-secret",
        reportUrl: "https://ci.example.test/report?password=before-secret"
      }
    });
    const after = snapshot({
      launch: {
        id: "launch-redact-after",
        projectId: "project-history",
        name: "main #31",
        createdAt: "2026-05-06T00:00:00Z",
        branch: "feature/password=after-secret"
      },
      result: result({
        uuid: "result-redact-after",
        status: "broken",
        labels: {
          token: ["another-token-value"],
          component: ["auth"]
        },
        statusMessage: "Authorization: Bearer after-secret failed at /home/ci/work/auth/spec.ts"
      }),
      executor: {
        name: "runner token=after-secret",
        reportUrl: "https://ci.example.test/report?password=after-secret"
      }
    });

    const compare = buildTestCaseHistoryCompareDecision({ before, after });
    const serialized = JSON.stringify(compare);

    expect(serialized).not.toContain("before-secret");
    expect(serialized).not.toContain("after-secret");
    expect(serialized).not.toContain("plain-token-value");
    expect(serialized).not.toContain("another-token-value");
    expect(serialized).not.toContain("C:\\Users\\example-user");
    expect(serialized).not.toContain("/home/ci/work");
    expect(serialized).not.toContain("statusDetails");
    expect(serialized).not.toContain('"raw"');
    expect(compare.decisions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "label",
          subject: "[redacted-key]",
          change: "changed",
          before: ["[redacted]"],
          after: ["[redacted]"]
        })
      ])
    );
  });

  it("rejects cross-project snapshots so comparisons stay project-scoped", () => {
    const before = snapshot({
      launch: {
        id: "launch-project-a",
        projectId: "project-a",
        name: "main #1",
        createdAt: "2026-05-07T00:00:00Z"
      },
      result: result({ uuid: "result-project-a", status: "passed" })
    });
    const after = snapshot({
      launch: {
        id: "launch-project-b",
        projectId: "project-b",
        name: "main #2",
        createdAt: "2026-05-08T00:00:00Z"
      },
      result: result({ uuid: "result-project-b", status: "passed" })
    });

    expect(() => buildTestCaseHistoryCompareDecision({ before, after })).toThrow(
      "History compare snapshots must belong to one project."
    );
  });
});

function snapshot(input: TestCaseHistoryCompareSnapshotInput): TestCaseHistoryCompareSnapshotInput {
  return input;
}

function launchFromSnapshot(snapshot: TestCaseHistoryCompareSnapshotInput): Launch {
  return {
    id: snapshot.launch.id,
    projectId: snapshot.launch.projectId,
    name: snapshot.launch.name,
    status: "closed",
    createdAt: snapshot.launch.createdAt,
    ...(snapshot.launch.branch !== undefined ? { branch: snapshot.launch.branch } : {}),
    ...(snapshot.launch.buildNumber !== undefined
      ? { buildNumber: snapshot.launch.buildNumber }
      : {}),
    ...(snapshot.launch.commitSha !== undefined ? { commitSha: snapshot.launch.commitSha } : {}),
    results: [snapshot.result]
  };
}

function result(input: {
  uuid: string;
  status: NormalizedTestResult["status"];
  labels?: Record<string, string[]>;
  statusMessage?: string;
}): NormalizedTestResult {
  const statusDetails =
    input.statusMessage === undefined
      ? undefined
      : {
          message: input.statusMessage,
          trace: input.statusMessage
        };

  return {
    uuid: input.uuid,
    testCaseId: "case-checkout",
    historyId: "history-checkout",
    name: "checkout works",
    fullName: "tests.checkout.works",
    status: input.status,
    durationMs: 100,
    labels: input.labels ?? {},
    parameters: [
      { name: "visible", value: "true" },
      { name: "masked", value: "secret-parameter", mode: "masked" },
      { name: "hidden", value: "hidden-parameter", mode: "hidden" }
    ],
    attachments: [],
    steps: [],
    raw: {
      uuid: input.uuid,
      testCaseId: "case-checkout",
      historyId: "history-checkout",
      name: "checkout works",
      fullName: "tests.checkout.works",
      status: input.status,
      ...(statusDetails !== undefined ? { statusDetails } : {})
    }
  };
}
