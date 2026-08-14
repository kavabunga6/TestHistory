export const qualityGateRules = {
  version: "2026-05-30",
  defaultPolicy: {
    status: "failed when any blocking rule fails",
    blockingRules: [
      {
        id: "no-failed-tests",
        description: "Fail the gate when the launch contains one or more failed tests.",
        metric: "failed",
        operator: "equals",
        value: 0
      },
      {
        id: "no-broken-tests",
        description: "Fail the gate when the launch contains one or more broken tests.",
        metric: "broken",
        operator: "equals",
        value: 0
      }
    ],
    advisoryRules: [
      {
        id: "review-skipped-tests",
        description: "Review skipped tests because they can hide coverage loss.",
        metric: "skipped",
        operator: "lessThanOrEqual",
        value: 0
      },
      {
        id: "review-flaky-tests",
        description: "Review tests whose recent history alternates between passed and failed.",
        metric: "flakyScore",
        operator: "lessThanOrEqual",
        value: 0
      }
    ]
  },
  statusMapping: {
    passed: "Counts as successful.",
    failed: "Counts as product or assertion failure and blocks the default gate.",
    broken:
      "Counts as infrastructure, test code, or unexpected runtime failure and blocks the default gate.",
    skipped: "Does not block by default, but should be investigated when unexpected.",
    unknown: "Treat as inconclusive and avoid using the launch as a release signal."
  },
  agentGuidance: [
    "Prefer blocking on failed and broken tests before using trend-based signals.",
    "Report both raw counts and the final gate status.",
    "When a launch is incomplete or ingestion failed, do not report the quality gate as passed.",
    "Use historical flakiness as an explanation and triage signal, not as a reason to ignore a current failure."
  ],
  backendRequirement:
    "This discovery response is static and does not require a running TestHistory API."
};
