import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { evaluateQualityGate } from "@testhistory/domain";

const args = new Set(process.argv.slice(2));

if (args.has("--failing-fixture")) {
  const evaluation = evaluateQualityGate(failingLaunch(), {
    historyLaunches: [baselineLaunch()]
  });

  assertQualityGateFailure(evaluation);
  printQualityGate("synthetic-failing-launch", evaluation, console.error);
  console.error("quality_gate.exit=1 reason=synthetic_failing_launch");
  process.exit(1);
}

const passingEvaluation = evaluateQualityGate(passingLaunch());
assertQualityGatePass(passingEvaluation);
printQualityGate("synthetic-passing-launch", passingEvaluation, console.log);

const failureProbe = spawnSync(
  process.execPath,
  [fileURLToPath(import.meta.url), "--failing-fixture"],
  {
    encoding: "utf8",
    env: process.env
  }
);
const failureOutput = `${failureProbe.stdout}${failureProbe.stderr}`;

if (failureProbe.status !== 1) {
  throw new Error(`Expected failing fixture to exit 1, got ${failureProbe.status ?? "null"}.`);
}

expectIncludes(failureOutput, "quality_gate.scenario=synthetic-failing-launch status=failed");
expectIncludes(
  failureOutput,
  'code=quality_gate.newFailures severity=fail passed=false actual=1 op=lte threshold=0 explanation="New failures failed: actual 1 lte threshold 0." affectedTestCaseIds=case-checkout'
);
expectIncludes(failureOutput, "quality_gate.exit=1 reason=synthetic_failing_launch");

console.log("quality_gate.failure_probe=passed expectedExit=1");
console.log("Quality gate smoke passed");

function assertQualityGatePass(evaluation) {
  assertEqual(evaluation.status, "passed", "passing status");
  assertEqual(evaluation.score, 100, "passing score");
  assertEqual(evaluation.metrics.total, 2, "passing total");
  assertEqual(evaluation.metrics.passed, 2, "passing passed count");
  assertEqual(evaluation.metrics.passRate, 100, "passing pass rate");
  assertEqual(evaluation.reasons.filter((reason) => !reason.passed).length, 0, "passing reasons");
  assertReason(evaluation, "quality_gate.passRate", {
    passed: true,
    actual: 100,
    explanation: "Pass rate passed: actual 100 gte threshold 95."
  });
}

function assertQualityGateFailure(evaluation) {
  assertEqual(evaluation.status, "failed", "failing status");
  assertEqual(evaluation.metrics.total, 2, "failing total");
  assertEqual(evaluation.metrics.failed, 1, "failing failed count");
  assertEqual(evaluation.metrics.failedBrokenTotal, 1, "failing failed/broken count");
  assertEqual(evaluation.metrics.newFailures, 1, "failing new failures");
  assertEqual(evaluation.metrics.criticalFailures, 1, "failing critical failures");
  assertEqual(evaluation.metrics.passRate, 50, "failing pass rate");
  assertReason(evaluation, "quality_gate.newFailures", {
    passed: false,
    actual: 1,
    explanation: "New failures failed: actual 1 lte threshold 0.",
    affectedTestCaseIds: ["case-checkout"]
  });
  assertReason(evaluation, "quality_gate.failedBrokenTotal", {
    passed: false,
    actual: 1,
    explanation: "Failed and broken total failed: actual 1 lte threshold 0."
  });
  assertReason(evaluation, "quality_gate.criticalFailures", {
    passed: false,
    actual: 1,
    explanation: "Critical labelled failures failed: actual 1 lte threshold 0.",
    affectedTestCaseIds: ["case-checkout"],
    affectedResultUuids: ["result-checkout-failed"]
  });
}

function assertReason(evaluation, code, expected) {
  const reason = evaluation.reasons.find((candidate) => candidate.code === code);
  if (reason === undefined) {
    throw new Error(`Expected quality gate reason ${code}.`);
  }

  for (const [field, value] of Object.entries(expected)) {
    if (Array.isArray(value)) {
      assertEqual(reason[field].join(","), value.join(","), `${code}.${field}`);
    } else {
      assertEqual(reason[field], value, `${code}.${field}`);
    }
  }
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(
      `Expected ${label} to be ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}.`
    );
  }
}

function expectIncludes(text, snippet) {
  if (!text.includes(snippet)) {
    throw new Error(`Expected failing fixture output to include ${JSON.stringify(snippet)}.`);
  }
}

function printQualityGate(scenario, evaluation, write) {
  write(
    `quality_gate.scenario=${scenario} status=${evaluation.status} score=${evaluation.score} total=${evaluation.metrics.total} passRate=${evaluation.metrics.passRate}`
  );

  for (const reason of evaluation.reasons) {
    write(
      [
        `quality_gate.reason`,
        `code=${reason.code}`,
        `severity=${reason.severity}`,
        `passed=${reason.passed}`,
        `actual=${reason.actual}`,
        `op=${reason.op}`,
        `threshold=${reason.threshold}`,
        `explanation=${JSON.stringify(reason.explanation)}`,
        `affectedTestCaseIds=${reason.affectedTestCaseIds.join(",")}`,
        `affectedResultUuids=${reason.affectedResultUuids.join(",")}`
      ].join(" ")
    );
  }
}

function passingLaunch() {
  return launch("launch-pass", "main #101", "2026-05-01T00:00:00Z", [
    testResult({
      uuid: "result-login-passed",
      testCaseId: "case-login",
      historyId: "history-login",
      name: "login accepts valid credentials",
      status: "passed",
      durationMs: 42
    }),
    testResult({
      uuid: "result-checkout-passed",
      testCaseId: "case-checkout",
      historyId: "history-checkout",
      name: "checkout submits order",
      status: "passed",
      durationMs: 80,
      labels: { severity: ["critical"] }
    })
  ]);
}

function baselineLaunch() {
  return launch("launch-baseline", "main #100", "2026-04-30T00:00:00Z", [
    testResult({
      uuid: "result-checkout-baseline",
      testCaseId: "case-checkout",
      historyId: "history-checkout",
      name: "checkout submits order",
      status: "passed",
      durationMs: 80,
      labels: { severity: ["critical"] }
    })
  ]);
}

function failingLaunch() {
  return launch("launch-fail", "main #102", "2026-05-02T00:00:00Z", [
    testResult({
      uuid: "result-login-passed",
      testCaseId: "case-login",
      historyId: "history-login",
      name: "login accepts valid credentials",
      status: "passed",
      durationMs: 40
    }),
    testResult({
      uuid: "result-checkout-failed",
      testCaseId: "case-checkout",
      historyId: "history-checkout",
      name: "checkout submits order",
      status: "failed",
      durationMs: 90,
      labels: { severity: ["critical"] },
      statusDetails: { message: "Synthetic checkout assertion failed" }
    })
  ]);
}

function launch(id, name, createdAt, results) {
  return {
    id,
    projectId: "project-quality-gate-smoke",
    name,
    status: "closed",
    createdAt,
    closedAt: createdAt,
    results
  };
}

function testResult({
  uuid,
  testCaseId,
  historyId,
  name,
  status,
  durationMs,
  labels = {},
  statusDetails
}) {
  return {
    uuid,
    testCaseId,
    historyId,
    name,
    status,
    durationMs,
    labels,
    parameters: [],
    attachments: [],
    steps: [],
    raw: {
      uuid,
      testCaseId,
      historyId,
      name,
      status,
      ...(statusDetails !== undefined ? { statusDetails } : {}),
      labels: Object.entries(labels).flatMap(([labelName, values]) =>
        values.map((value) => ({ name: labelName, value }))
      )
    }
  };
}
