import { describe, expect, it } from "vitest";
import type {
  AllureLabel,
  AllureStatus,
  AllureStatusDetails,
  NormalizedTestResult
} from "@testhistory/contracts";
import {
  buildDefectClusters,
  buildLaunchResultDetails,
  buildTestCaseSummaries,
  createDefectMute,
  evaluateQualityGate,
  getTestCaseIdentityReadModel,
  getTestCaseHistory,
  normalizeFailureSignature,
  rebuildDefectMuteRecords,
  unmuteDefect,
  type Launch
} from "./index.js";

const launches: Launch[] = [
  {
    id: "launch-1",
    projectId: "project-1",
    name: "main #1",
    status: "closed",
    createdAt: "2026-01-01T00:00:00Z",
    results: [
      {
        uuid: "result-1",
        testCaseId: "case-login",
        historyId: "history-login",
        name: "login works",
        status: "failed",
        durationMs: 100,
        labels: {},
        parameters: [],
        attachments: [],
        steps: [],
        raw: { uuid: "result-1", name: "login works", status: "failed" }
      }
    ]
  },
  {
    id: "launch-2",
    projectId: "project-1",
    name: "main #2",
    status: "closed",
    createdAt: "2026-01-02T00:00:00Z",
    results: [
      {
        uuid: "result-2",
        testCaseId: "case-login",
        historyId: "history-login",
        name: "login works",
        status: "passed",
        durationMs: 80,
        labels: {},
        parameters: [],
        attachments: [],
        steps: [],
        raw: { uuid: "result-2", name: "login works", status: "passed" }
      }
    ]
  }
];

describe("domain analytics", () => {
  it("builds test case summaries with flaky signal", () => {
    const summaries = buildTestCaseSummaries(launches);
    expect(summaries).toHaveLength(1);
    expect(summaries[0]?.id).toBe("case-login");
    expect(summaries[0]?.identity).toEqual(
      expect.objectContaining({
        value: "case-login",
        source: "testCaseId",
        confidence: "high"
      })
    );
    expect(summaries[0]?.lastStatus).toBe("passed");
    expect(summaries[0]?.passRate).toBe(50);
    expect(summaries[0]?.flakyScore).toBe(100);
  });

  it("returns chronological history", () => {
    const history = getTestCaseHistory(launches, "case-login");
    expect(history.map((point) => point.status)).toEqual(["failed", "passed"]);
  });

  it("evaluates quality gates", () => {
    const evaluation = evaluateQualityGate(launches[0]!);
    expect(evaluation.status).toBe("failed");
    expect(evaluation.metrics.failed).toBe(1);
    expect(evaluation.statusCounters.failed).toBe(1);
    expect(evaluation.reasons.some((reason) => reason.code === "quality_gate.newFailures")).toBe(
      true
    );
  });

  it("returns machine-readable passed quality gate reasons", () => {
    const evaluation = evaluateQualityGate(
      multiLaunch("launch-green", "main #10", "2026-03-02T00:00:00Z", [
        testResult({
          uuid: "green-login",
          testCaseId: "case-green-login",
          historyId: "history-green-login",
          name: "green login",
          status: "passed",
          durationMs: 120
        }),
        testResult({
          uuid: "green-checkout",
          testCaseId: "case-green-checkout",
          historyId: "history-green-checkout",
          name: "green checkout",
          status: "passed",
          durationMs: 140
        })
      ]),
      {
        historyLaunches: [
          multiLaunch("launch-green-baseline", "main #9", "2026-03-01T00:00:00Z", [
            testResult({
              uuid: "green-login-prev",
              testCaseId: "case-green-login",
              historyId: "history-green-login",
              name: "green login",
              status: "passed",
              durationMs: 110
            }),
            testResult({
              uuid: "green-checkout-prev",
              testCaseId: "case-green-checkout",
              historyId: "history-green-checkout",
              name: "green checkout",
              status: "passed",
              durationMs: 130
            })
          ])
        ]
      }
    );

    expect(evaluation).toEqual(
      expect.objectContaining({
        status: "passed",
        metrics: expect.objectContaining({
          total: 2,
          passed: 2,
          passRate: 100,
          newFailures: 0,
          failedBrokenTotal: 0,
          criticalFailures: 0,
          flakyTests: 0,
          durationRegressions: 0
        })
      })
    );
    expect(evaluation.reasons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "quality_gate.failedBrokenTotal",
          passed: true,
          actual: 0,
          threshold: 0
        }),
        expect.objectContaining({
          code: "quality_gate.passRate",
          passed: true,
          actual: 100,
          op: "gte",
          threshold: 95
        })
      ])
    );
  });

  it("fails quality gate with deterministic explanations for critical new regressions", () => {
    const evaluation = evaluateQualityGate(
      multiLaunch("launch-red", "main #12", "2026-03-02T00:00:00Z", [
        testResult({
          uuid: "critical-failure",
          testCaseId: "case-critical",
          historyId: "history-critical",
          name: "critical checkout",
          status: "failed",
          durationMs: 280,
          labels: { severity: ["critical"], layer: ["api"] }
        }),
        testResult({
          uuid: "broken-payment",
          testCaseId: "case-payment",
          historyId: "history-payment",
          name: "payment is broken",
          status: "broken",
          durationMs: 90
        })
      ]),
      {
        historyLaunches: [
          multiLaunch("launch-red-baseline", "main #11", "2026-03-01T00:00:00Z", [
            testResult({
              uuid: "critical-before",
              testCaseId: "case-critical",
              historyId: "history-critical",
              name: "critical checkout",
              status: "passed",
              durationMs: 100
            }),
            testResult({
              uuid: "payment-before",
              testCaseId: "case-payment",
              historyId: "history-payment",
              name: "payment is broken",
              status: "passed",
              durationMs: 85
            })
          ])
        ]
      }
    );

    expect(evaluation.status).toBe("failed");
    expect(evaluation.metrics).toEqual(
      expect.objectContaining({
        failed: 1,
        broken: 1,
        failedBrokenTotal: 2,
        newFailures: 2,
        criticalFailures: 1,
        durationRegressions: 1
      })
    );
    expect(evaluation.reasons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "quality_gate.newFailures",
          severity: "fail",
          passed: false,
          actual: 2,
          affectedTestCaseIds: ["case-critical", "case-payment"]
        }),
        expect.objectContaining({
          code: "quality_gate.criticalFailures",
          severity: "fail",
          passed: false,
          actual: 1,
          affectedTestCaseIds: ["case-critical"],
          affectedResultUuids: ["critical-failure"]
        }),
        expect.objectContaining({
          code: "quality_gate.durationRegressions",
          severity: "warn",
          passed: false,
          actual: 1,
          affectedTestCaseIds: ["case-critical"]
        })
      ])
    );
  });

  it("warns quality gate when flaky budget is exceeded without current failures", () => {
    const evaluation = evaluateQualityGate(
      multiLaunch("launch-flaky", "main #23", "2026-03-03T00:00:00Z", [
        testResult({
          uuid: "flaky-now",
          testCaseId: "case-flaky-budget",
          historyId: "history-flaky-budget",
          name: "sometimes passes",
          status: "passed",
          durationMs: 100,
          flaky: true
        })
      ]),
      {
        historyLaunches: [
          multiLaunch("launch-flaky-1", "main #21", "2026-03-01T00:00:00Z", [
            testResult({
              uuid: "flaky-before-failed",
              testCaseId: "case-flaky-budget",
              historyId: "history-flaky-budget",
              name: "sometimes passes",
              status: "failed",
              durationMs: 95
            })
          ]),
          multiLaunch("launch-flaky-2", "main #22", "2026-03-02T00:00:00Z", [
            testResult({
              uuid: "flaky-before-passed",
              testCaseId: "case-flaky-budget",
              historyId: "history-flaky-budget",
              name: "sometimes passes",
              status: "passed",
              durationMs: 90
            })
          ])
        ]
      }
    );

    expect(evaluation.status).toBe("warning");
    expect(evaluation.metrics).toEqual(
      expect.objectContaining({
        failedBrokenTotal: 0,
        newFailures: 0,
        flakyTests: 1
      })
    );
    expect(evaluation.reasons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "quality_gate.flakyTests",
          severity: "warn",
          passed: false,
          actual: 1,
          affectedTestCaseIds: ["case-flaky-budget"]
        })
      ])
    );
  });

  it("builds launch result details with flattened attachments and raw metadata", () => {
    const launch: Launch = {
      id: "launch-details",
      projectId: "project-1",
      name: "main #3",
      status: "closed",
      createdAt: "2026-01-03T00:00:00Z",
      results: [
        {
          uuid: "result-details",
          testCaseId: "case-details",
          historyId: "history-details",
          fullName: "shop.checkout.details",
          name: "checkout exposes details",
          status: "broken",
          durationMs: 42,
          labels: { tag: ["smoke"] },
          parameters: [{ name: "browser", value: "chrome" }],
          attachments: [
            {
              name: "top-level log",
              source: "synthetic-log-attachment.txt",
              type: "text/plain"
            }
          ],
          steps: [
            {
              name: "Open checkout",
              status: "passed",
              attachments: [
                {
                  name: "screen",
                  source: "synthetic-screen-attachment.png",
                  type: "image/png"
                }
              ],
              steps: [
                {
                  name: "Read summary",
                  attachments: [
                    {
                      name: "summary dom",
                      source: "synthetic-summary-attachment.xml",
                      type: "application/xml"
                    }
                  ]
                }
              ]
            }
          ],
          raw: {
            uuid: "result-details",
            testCaseId: "case-details",
            historyId: "history-details",
            fullName: "shop.checkout.details",
            name: "checkout exposes details",
            status: "broken",
            stage: "finished",
            statusDetails: { message: "Synthetic failure" },
            description: "Synthetic detail fixture",
            labels: [{ name: "tag", value: "smoke" }],
            links: [{ name: "Spec", url: "https://example.test/spec", type: "spec" }]
          }
        }
      ]
    };

    const details = buildLaunchResultDetails(launch, "result-details");

    expect(details).toEqual(
      expect.objectContaining({
        launchId: "launch-details",
        projectId: "project-1",
        uuid: "result-details",
        testCaseId: "case-details",
        historyId: "history-details",
        fullName: "shop.checkout.details",
        status: "broken",
        durationMs: 42,
        stage: "finished",
        statusDetails: { message: "Synthetic failure" },
        description: "Synthetic detail fixture",
        labels: { tag: ["smoke"] },
        parameters: [{ name: "browser", value: "chrome" }],
        links: [{ name: "Spec", url: "https://example.test/spec", type: "spec" }]
      })
    );
    expect(details?.attachments).toEqual([
      {
        name: "top-level log",
        source: "synthetic-log-attachment.txt",
        type: "text/plain",
        scope: "result"
      },
      {
        name: "screen",
        source: "synthetic-screen-attachment.png",
        type: "image/png",
        scope: "step",
        stepPath: ["Open checkout"]
      },
      {
        name: "summary dom",
        source: "synthetic-summary-attachment.xml",
        type: "application/xml",
        scope: "step",
        stepPath: ["Open checkout", "Read summary"]
      }
    ]);
    expect(details?.raw).toEqual(
      expect.objectContaining({
        uuid: "result-details",
        stage: "finished",
        statusDetails: { message: "Synthetic failure" }
      })
    );
  });

  it("documents identity precedence: testCaseId -> fullName -> historyId -> name", () => {
    const base = testResult({
      uuid: "identity",
      name: "identity name",
      status: "passed",
      testCaseId: "identity-case",
      fullName: "suite.identity",
      historyId: "identity-history"
    });

    expect(getTestCaseIdentityReadModel(base)).toEqual(
      expect.objectContaining({
        value: "identity-case",
        source: "testCaseId",
        confidence: "high"
      })
    );
    const withoutTestCaseId = omit(base, "testCaseId");
    expect(getTestCaseIdentityReadModel(withoutTestCaseId)).toEqual(
      expect.objectContaining({
        value: "suite.identity",
        source: "fullName",
        confidence: "high"
      })
    );
    const withoutFullName = omit(withoutTestCaseId, "fullName");
    expect(getTestCaseIdentityReadModel(withoutFullName)).toEqual(
      expect.objectContaining({
        value: "identity-history",
        source: "historyId",
        confidence: "medium"
      })
    );
    const withoutHistoryId = omit(withoutFullName, "historyId");
    expect(getTestCaseIdentityReadModel(withoutHistoryId)).toEqual(
      expect.objectContaining({
        value: "identity name",
        source: "name",
        confidence: "low"
      })
    );
  });

  it("classifies multi-launch new, recurring, flaky, and duration-regressed cases", () => {
    const summaries = buildTestCaseSummaries([
      multiLaunch("launch-m1", "main #1", "2026-02-01T00:00:00Z", [
        testResult({
          uuid: "new-1",
          testCaseId: "case-new",
          historyId: "history-new",
          name: "new failure",
          status: "passed",
          durationMs: 100
        }),
        testResult({
          uuid: "recurring-1",
          testCaseId: "case-recurring",
          historyId: "history-recurring",
          name: "recurring failure",
          status: "failed",
          durationMs: 100
        }),
        testResult({
          uuid: "flaky-1",
          testCaseId: "case-flaky",
          historyId: "history-flaky",
          name: "flaky failure",
          status: "failed",
          durationMs: 100
        }),
        testResult({
          uuid: "slow-1",
          testCaseId: "case-duration",
          historyId: "history-duration",
          name: "duration regression",
          status: "passed",
          durationMs: 100
        })
      ]),
      multiLaunch("launch-m2", "main #2", "2026-02-02T00:00:00Z", [
        testResult({
          uuid: "new-2",
          testCaseId: "case-new",
          historyId: "history-new",
          name: "new failure",
          status: "failed",
          durationMs: 110
        }),
        testResult({
          uuid: "recurring-2",
          testCaseId: "case-recurring",
          historyId: "history-recurring",
          name: "recurring failure",
          status: "failed",
          durationMs: 105
        }),
        testResult({
          uuid: "flaky-2",
          testCaseId: "case-flaky",
          historyId: "history-flaky",
          name: "flaky failure",
          status: "passed",
          durationMs: 90
        }),
        testResult({
          uuid: "slow-2",
          testCaseId: "case-duration",
          historyId: "history-duration",
          name: "duration regression",
          status: "passed",
          durationMs: 100
        })
      ]),
      multiLaunch("launch-m3", "main #3", "2026-02-03T00:00:00Z", [
        testResult({
          uuid: "flaky-3",
          testCaseId: "case-flaky",
          historyId: "history-flaky",
          name: "flaky failure",
          status: "failed",
          durationMs: 95
        }),
        testResult({
          uuid: "slow-3",
          testCaseId: "case-duration",
          historyId: "history-duration",
          name: "duration regression",
          status: "passed",
          durationMs: 260
        })
      ])
    ]);

    const byId = new Map(summaries.map((summary) => [summary.id, summary]));

    const newFailure = byId.get("case-new");
    expect(newFailure?.failureClassification).toBe("new");
    expect(newFailure?.failure).toEqual(
      expect.objectContaining({
        isFailing: true,
        previousFailureCount: 0,
        currentFailureStreak: 1
      })
    );
    expect(newFailure?.lastGreen?.launchId).toBe("launch-m1");
    expect(newFailure?.firstFailed?.launchId).toBe("launch-m2");

    const recurringFailure = byId.get("case-recurring");
    expect(recurringFailure?.failureClassification).toBe("recurring");
    expect(recurringFailure?.failure.previousFailureCount).toBe(1);
    expect(recurringFailure?.firstFailed?.launchId).toBe("launch-m1");

    const flakyFailure = byId.get("case-flaky");
    expect(flakyFailure?.failureClassification).toBe("recurring");
    expect(flakyFailure?.flaky).toEqual(
      expect.objectContaining({
        isFlaky: true,
        inputs: expect.objectContaining({
          statuses: ["failed", "passed", "failed"],
          observedStatuses: ["failed", "passed"],
          transitionCount: 2,
          passCount: 1,
          failureCount: 2
        })
      })
    );
    expect(flakyFailure?.lastGreen?.launchId).toBe("launch-m2");
    expect(flakyFailure?.firstFailed?.launchId).toBe("launch-m3");

    const durationRegressed = byId.get("case-duration");
    expect(durationRegressed?.failureClassification).toBe("none");
    expect(durationRegressed?.durationRegression).toEqual(
      expect.objectContaining({
        isRegressed: true,
        latestDurationMs: 260,
        baselineMedianDurationMs: 100,
        deltaMs: 160,
        ratio: 2.6,
        sampleSize: 2
      })
    );
  });

  it("normalizes deterministic failure signatures across launch noise", () => {
    const first = testResult({
      uuid: "failure-a",
      testCaseId: "case-a",
      name: "checkout totals",
      status: "failed",
      statusDetails: {
        message: "AssertionError: expected total 41 to equal 42",
        trace:
          "AssertionError: expected total 41 to equal 42\n    at CheckoutPage.assertTotal (C:\\work\\run-123\\checkout.spec.ts:77:11)"
      }
    });
    const second = testResult({
      uuid: "failure-b",
      testCaseId: "case-b",
      name: "checkout totals in firefox",
      status: "failed",
      statusDetails: {
        message: "AssertionError: expected total 99 to equal 100",
        trace:
          "AssertionError: expected total 99 to equal 100\n    at CheckoutPage.assertTotal (/tmp/ci/run-999/checkout.spec.ts:88:12)"
      }
    });

    expect(normalizeFailureSignature(first)).toEqual(normalizeFailureSignature(second));

    const clusters = buildDefectClusters([
      multiLaunch("launch-sig-1", "main #31", "2026-04-01T00:00:00Z", [first]),
      multiLaunch("launch-sig-2", "main #32", "2026-04-02T00:00:00Z", [second])
    ]);

    expect(clusters).toHaveLength(1);
    expect(clusters[0]).toEqual(
      expect.objectContaining({
        state: "recurring",
        affectedTestIds: ["case-a", "case-b"],
        currentAffectedTestIds: ["case-b"],
        occurrenceCount: 2
      })
    );
  });

  it("keeps unrelated failure causes in separate defect clusters", () => {
    const clusters = buildDefectClusters([
      multiLaunch("launch-separation", "main #41", "2026-04-03T00:00:00Z", [
        testResult({
          uuid: "timeout-failure",
          testCaseId: "case-timeout",
          name: "checkout timeout",
          status: "broken",
          statusDetails: {
            message: "TimeoutError: waiting for selector #submit"
          }
        }),
        testResult({
          uuid: "assertion-failure",
          testCaseId: "case-assertion",
          name: "checkout status code",
          status: "failed",
          statusDetails: {
            message: "AssertionError: expected status 200 to equal 500"
          }
        })
      ])
    ]);

    expect(clusters).toHaveLength(2);
    expect(clusters.map((cluster) => cluster.affectedTestIds)).toEqual([
      ["case-assertion"],
      ["case-timeout"]
    ]);
  });

  it("redacts credentials, URLs, storage keys, and masked parameters from cluster output", () => {
    const clusters = buildDefectClusters([
      multiLaunch("launch-redaction", "main #51", "2026-04-04T00:00:00Z", [
        testResult({
          uuid: "sensitive-failure",
          testCaseId: "case-sensitive",
          name: "sensitive failure",
          status: "failed",
          parameters: [
            { name: "token", value: "visible-token-secret", mode: "masked" },
            { name: "apiKey", value: "hidden-api-key-secret", mode: "hidden" }
          ],
          statusDetails: {
            message:
              "FetchError: https://user:pass@example.test/private?token=query-secret returned 500 token=inline-secret",
            trace:
              "Error: s3://bucket/private/raw-storage-key-secret/log.txt\n    at read (C:\\tmp\\raw-secret\\result.log:12:2)"
          }
        })
      ])
    ]);
    const serialized = JSON.stringify(clusters);

    expect(serialized).not.toContain("user:pass");
    expect(serialized).not.toContain("query-secret");
    expect(serialized).not.toContain("inline-secret");
    expect(serialized).not.toContain("raw-storage-key-secret");
    expect(serialized).not.toContain("visible-token-secret");
    expect(serialized).not.toContain("hidden-api-key-secret");
    expect(clusters[0]?.signature.normalizedReason).toContain("https://example.test/private");
    expect(clusters[0]?.signature.normalizedReason).toContain("[storage-url]");
  });

  it("recomputes defect cluster lifecycle deterministically and marks resolved-ish clusters", () => {
    const input = [
      multiLaunch("launch-cluster-1", "main #61", "2026-04-05T00:00:00Z", [
        testResult({
          uuid: "cluster-failed-first",
          testCaseId: "case-cluster",
          name: "clustered test",
          status: "failed",
          statusDetails: {
            message: "TypeError: Cannot read properties of undefined reading total"
          }
        })
      ]),
      multiLaunch("launch-cluster-2", "main #62", "2026-04-06T00:00:00Z", [
        testResult({
          uuid: "cluster-passed-latest",
          testCaseId: "case-cluster",
          name: "clustered test",
          status: "passed"
        })
      ])
    ];

    const first = buildDefectClusters(input);
    const recomputed = buildDefectClusters([...input].reverse());

    expect(recomputed).toEqual(first);
    expect(first).toEqual([
      expect.objectContaining({
        state: "resolved-ish",
        affectedTestIds: ["case-cluster"],
        currentAffectedTestIds: [],
        occurrenceCount: 1,
        firstSeenLaunchId: "launch-cluster-1",
        lastSeenLaunchId: "launch-cluster-1"
      })
    ]);
  });

  it("records reversible defect mute audit without leaking reason or origin secrets", () => {
    const clusters = buildDefectClusters([
      multiLaunch("launch-mute-audit", "main #71", "2026-04-07T00:00:00Z", [
        testResult({
          uuid: "muted-failure",
          testCaseId: "case-muted",
          name: "muted checkout failure",
          status: "failed",
          statusDetails: {
            message: "AssertionError: expected status 200 to equal 500"
          }
        })
      ])
    ]);
    const signatureHash = clusters[0]!.signature.hash;

    const mute = createDefectMute({
      id: "mute-1",
      scope: { signatureHashes: [signatureHash] },
      reason:
        "Known provider outage token=raw-mute-secret storageKey=raw-storage-secret hidden=raw-hidden-secret",
      origin: { type: "actor", actorId: "qa-user token=raw-actor-secret" },
      occurredAt: "2026-04-07T01:00:00Z",
      clusters
    });
    const unmuted = unmuteDefect({
      record: mute,
      reason: "Provider fixed password=raw-unmute-secret",
      origin: { type: "system", systemId: "scheduler secret=raw-system-secret" },
      occurredAt: "2026-04-07T02:00:00Z"
    });
    const rebuilt = rebuildDefectMuteRecords([...unmuted.auditEvents].reverse());
    const serialized = JSON.stringify(unmuted);

    expect(mute).toEqual(
      expect.objectContaining({
        id: "mute-1",
        status: "active",
        mutedAt: "2026-04-07T01:00:00Z",
        affectedSignatureHashes: [signatureHash],
        affectedTestIds: ["case-muted"],
        auditEvents: [
          expect.objectContaining({
            type: "defect.muted",
            affectedSignatureHashes: [signatureHash],
            affectedTestIds: ["case-muted"]
          })
        ]
      })
    );
    expect(unmuted).toEqual(
      expect.objectContaining({
        status: "inactive",
        unmutedAt: "2026-04-07T02:00:00Z",
        auditEvents: [
          expect.objectContaining({ type: "defect.muted" }),
          expect.objectContaining({ type: "defect.unmuted" })
        ]
      })
    );
    expect(rebuilt).toEqual([unmuted]);
    expect(serialized).not.toContain("raw-mute-secret");
    expect(serialized).not.toContain("raw-storage-secret");
    expect(serialized).not.toContain("raw-hidden-secret");
    expect(serialized).not.toContain("raw-actor-secret");
    expect(serialized).not.toContain("raw-unmute-secret");
    expect(serialized).not.toContain("raw-system-secret");
  });

  it("applies defect mutes to quality gate reasons only through explicit rules", () => {
    const historyLaunch = multiLaunch("launch-gate-before", "main #80", "2026-04-08T00:00:00Z", [
      testResult({
        uuid: "before-muted",
        testCaseId: "case-muted-gate",
        name: "muted gate case",
        status: "passed"
      })
    ]);
    const currentLaunch = multiLaunch("launch-gate-current", "main #81", "2026-04-09T00:00:00Z", [
      testResult({
        uuid: "current-muted",
        testCaseId: "case-muted-gate",
        name: "muted gate case",
        status: "failed",
        statusDetails: {
          message: "AssertionError: expected account balance 10 to equal 20"
        }
      })
    ]);
    const clusters = buildDefectClusters([historyLaunch, currentLaunch]);
    const mute = createDefectMute({
      id: "mute-gate-1",
      scope: { testCaseIds: ["case-muted-gate"] },
      reason: "Temporarily muted by incident INC-123",
      origin: { type: "actor", actorId: "qa-lead" },
      occurredAt: "2026-04-09T01:00:00Z",
      clusters
    });

    const rawEvaluation = evaluateQualityGate(currentLaunch, {
      rules: [],
      thresholds: {
        passRate: { op: "gte", value: 0, severity: "warn" }
      },
      historyLaunches: [historyLaunch],
      defectMutes: [mute],
      defectMuteRules: [
        {
          code: "mute-new-failures-only",
          reasonCode: "quality_gate.newFailures",
          mode: "exclude_muted_affected_tests"
        }
      ]
    });
    const effectiveEvaluation = evaluateQualityGate(currentLaunch, {
      rules: [],
      thresholds: {
        passRate: { op: "gte", value: 0, severity: "warn" }
      },
      historyLaunches: [historyLaunch],
      defectMutes: [mute],
      defectMuteRules: [
        {
          code: "mute-new-failures",
          reasonCode: "quality_gate.newFailures",
          mode: "exclude_muted_affected_tests"
        },
        {
          code: "mute-failed-broken-total",
          reasonCode: "quality_gate.failedBrokenTotal",
          mode: "exclude_muted_affected_tests"
        }
      ]
    });

    expect(rawEvaluation.rawStatus).toBe("failed");
    expect(rawEvaluation.status).toBe("failed");
    expect(rawEvaluation.metrics).toEqual(
      expect.objectContaining({
        failed: 1,
        newFailures: 1,
        failedBrokenTotal: 1
      })
    );
    expect(rawEvaluation.reasons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "quality_gate.newFailures",
          passed: false,
          effectivePassed: true,
          actual: 1,
          effectiveActual: 0
        }),
        expect.objectContaining({
          code: "quality_gate.failedBrokenTotal",
          passed: false,
          effectivePassed: false,
          actual: 1,
          effectiveActual: 1,
          effects: []
        })
      ])
    );
    expect(effectiveEvaluation.rawStatus).toBe("failed");
    expect(effectiveEvaluation.status).toBe("passed");
    expect(effectiveEvaluation.metrics.failed).toBe(1);
    expect(effectiveEvaluation.statusCounters.failed).toBe(1);
    expect(effectiveEvaluation.effects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "defect_mute",
          ruleCode: "mute-new-failures",
          reasonCode: "quality_gate.newFailures",
          muteIds: ["mute-gate-1"],
          affectedTestCaseIds: ["case-muted-gate"],
          effectiveActual: 0
        }),
        expect.objectContaining({
          ruleCode: "mute-failed-broken-total",
          reasonCode: "quality_gate.failedBrokenTotal",
          effectiveActual: 0
        })
      ])
    );
  });

  it("keeps unmuted defect records from changing gate effects on recomputation", () => {
    const historyLaunch = multiLaunch(
      "launch-gate-unmuted-before",
      "main #82",
      "2026-04-10T00:00:00Z",
      [
        testResult({
          uuid: "before-unmuted",
          testCaseId: "case-unmuted-gate",
          name: "unmuted gate case",
          status: "passed"
        })
      ]
    );
    const currentLaunch = multiLaunch(
      "launch-gate-unmuted-current",
      "main #83",
      "2026-04-11T00:00:00Z",
      [
        testResult({
          uuid: "current-unmuted",
          testCaseId: "case-unmuted-gate",
          name: "unmuted gate case",
          status: "broken",
          statusDetails: {
            message: "TimeoutError: waiting for profile"
          }
        })
      ]
    );
    const mute = createDefectMute({
      id: "mute-gate-closed",
      scope: { testCaseIds: ["case-unmuted-gate"] },
      reason: "Mute during migration",
      origin: { type: "actor", actorId: "qa-lead" },
      occurredAt: "2026-04-11T01:00:00Z",
      clusters: buildDefectClusters([historyLaunch, currentLaunch])
    });
    const unmuted = unmuteDefect({
      record: mute,
      reason: "Migration completed",
      origin: { type: "system", systemId: "release-bot" },
      occurredAt: "2026-04-11T02:00:00Z"
    });

    const first = evaluateQualityGate(currentLaunch, {
      rules: [],
      historyLaunches: [historyLaunch],
      defectMutes: [unmuted],
      defectMuteRules: [
        {
          code: "mute-unmuted-failed-broken-total",
          reasonCode: "quality_gate.failedBrokenTotal",
          mode: "exclude_muted_affected_tests"
        }
      ]
    });
    const recomputed = evaluateQualityGate(currentLaunch, {
      rules: [],
      historyLaunches: [historyLaunch],
      defectMutes: rebuildDefectMuteRecords([...unmuted.auditEvents].reverse()),
      defectMuteRules: [
        {
          code: "mute-unmuted-failed-broken-total",
          reasonCode: "quality_gate.failedBrokenTotal",
          mode: "exclude_muted_affected_tests"
        }
      ]
    });

    expect(recomputed).toEqual(first);
    expect(first.status).toBe("failed");
    expect(first.effects).toEqual([]);
    expect(first.reasons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "quality_gate.failedBrokenTotal",
          passed: false,
          effectivePassed: false,
          actual: 1,
          effectiveActual: 1
        })
      ])
    );
  });
});

function multiLaunch(
  id: string,
  name: string,
  createdAt: string,
  results: NormalizedTestResult[]
): Launch {
  return {
    id,
    projectId: "project-1",
    name,
    status: "closed",
    createdAt,
    results
  };
}

function testResult(input: {
  uuid: string;
  name: string;
  status: AllureStatus;
  testCaseId?: string;
  fullName?: string;
  historyId?: string;
  durationMs?: number;
  flaky?: boolean;
  labels?: Record<string, string[]>;
  parameters?: NormalizedTestResult["parameters"];
  statusDetails?: AllureStatusDetails;
}): NormalizedTestResult {
  return {
    uuid: input.uuid,
    ...(input.testCaseId !== undefined ? { testCaseId: input.testCaseId } : {}),
    ...(input.fullName !== undefined ? { fullName: input.fullName } : {}),
    ...(input.historyId !== undefined ? { historyId: input.historyId } : {}),
    name: input.name,
    status: input.status,
    ...(input.durationMs !== undefined ? { durationMs: input.durationMs } : {}),
    labels: input.labels ?? {},
    parameters: input.parameters ?? [],
    attachments: [],
    steps: [],
    raw: {
      uuid: input.uuid,
      ...(input.testCaseId !== undefined ? { testCaseId: input.testCaseId } : {}),
      ...(input.fullName !== undefined ? { fullName: input.fullName } : {}),
      ...(input.historyId !== undefined ? { historyId: input.historyId } : {}),
      name: input.name,
      status: input.status,
      ...(input.labels !== undefined ? { labels: toAllureLabels(input.labels) } : {}),
      ...(input.flaky !== undefined || input.statusDetails !== undefined
        ? {
            statusDetails: {
              ...input.statusDetails,
              ...(input.flaky !== undefined ? { flaky: input.flaky } : {})
            }
          }
        : {})
    }
  };
}

function toAllureLabels(labels: Record<string, string[]>): AllureLabel[] {
  return Object.entries(labels).flatMap(([name, values]) =>
    values.map((value) => ({ name, value }))
  );
}

function omit<T extends object, K extends keyof T>(value: T, key: K): Omit<T, K> {
  const copy = { ...value };
  delete copy[key];
  return copy;
}
