import type {
  AllureAttachment,
  AllureStatus,
  AllureStep,
  LaunchResultAttachmentReadModel,
  LaunchResultDetailsReadModel,
  NormalizedTestResult
} from "@testhistory/contracts";

const DURATION_REGRESSION_THRESHOLD_RATIO = 1.5;
const DURATION_REGRESSION_MIN_DELTA_MS = 100;
const FAILURE_STATUSES = new Set<AllureStatus>(["failed", "broken"]);

export type Launch = {
  id: string;
  projectId: string;
  name: string;
  status: "open" | "closed";
  branch?: string;
  commitSha?: string;
  buildNumber?: string;
  createdAt: string;
  closedAt?: string;
  results: NormalizedTestResult[];
};

export type TestCaseSummary = {
  id: string;
  identity: TestCaseIdentityReadModel;
  name: string;
  fullName?: string;
  historyIds: string[];
  totalResults: number;
  lastStatus: AllureStatus;
  passRate: number;
  flakyScore: number;
  flaky: TestCaseFlakyReadModel;
  failureClassification: TestCaseFailureClassification;
  failure: TestCaseFailureReadModel;
  durationRegression?: TestCaseDurationRegressionReadModel;
  lastGreen?: TestCaseHistoryPoint;
  firstFailed?: TestCaseHistoryPoint;
  medianDurationMs?: number;
  p95DurationMs?: number;
  firstSeenAt?: string;
  lastSeenAt?: string;
};

export type TestCaseIdentitySource = "testCaseId" | "fullName" | "historyId" | "name";

export type TestCaseIdentityConfidence = "high" | "medium" | "low";

export type TestCaseIdentityReadModel = {
  value: string;
  source: TestCaseIdentitySource;
  confidence: TestCaseIdentityConfidence;
  explanation: string;
};

export type TestCaseFailureClassification = "none" | "new" | "recurring";

export type TestCaseFailureReadModel = {
  classification: TestCaseFailureClassification;
  isFailing: boolean;
  failureCount: number;
  previousFailureCount: number;
  currentFailureStreak: number;
  explanation: string;
};

export type TestCaseFlakyReadModel = {
  isFlaky: boolean;
  score: number;
  inputs: {
    statuses: AllureStatus[];
    observedStatuses: AllureStatus[];
    transitionCount: number;
    passCount: number;
    failureCount: number;
    markedFlakyCount: number;
  };
};

export type TestCaseDurationRegressionReadModel = {
  isRegressed: boolean;
  latestDurationMs: number;
  baselineMedianDurationMs: number;
  deltaMs: number;
  ratio: number;
  thresholdRatio: number;
  minDeltaMs: number;
  sampleSize: number;
  explanation: string;
};

export type TestCaseHistoryPoint = {
  launchId: string;
  launchName: string;
  launchCreatedAt: string;
  status: AllureStatus;
  durationMs?: number;
  historyId?: string;
};

export function createEmptyCounters(): Record<AllureStatus, number> {
  return {
    failed: 0,
    broken: 0,
    passed: 0,
    skipped: 0,
    unknown: 0
  };
}

export function summarizeLaunch(launch: Launch) {
  const counters = createEmptyCounters();

  for (const result of launch.results) {
    counters[result.status] = (counters[result.status] ?? 0) + 1;
  }

  return {
    id: launch.id,
    projectId: launch.projectId,
    name: launch.name,
    status: launch.status,
    counters
  };
}

export function getTestCaseIdentity(result: NormalizedTestResult): string {
  return getTestCaseIdentityReadModel(result).value;
}

export function getTestCaseIdentityReadModel(
  result: NormalizedTestResult
): TestCaseIdentityReadModel {
  if (result.testCaseId !== undefined) {
    return {
      value: result.testCaseId,
      source: "testCaseId",
      confidence: "high",
      explanation: "Matched by testCaseId because it is the strongest stable test identity."
    };
  }

  if (result.fullName !== undefined) {
    return {
      value: result.fullName,
      source: "fullName",
      confidence: "high",
      explanation: "Matched by fullName because testCaseId is unavailable."
    };
  }

  if (result.historyId !== undefined) {
    return {
      value: result.historyId,
      source: "historyId",
      confidence: "medium",
      explanation: "Matched by historyId because testCaseId and fullName are unavailable."
    };
  }

  return {
    value: result.name,
    source: "name",
    confidence: "low",
    explanation: "Matched by name only because no stable Allure identity fields are available."
  };
}

export function buildTestCaseSummaries(launches: Launch[]): TestCaseSummary[] {
  const grouped = new Map<string, Array<{ launch: Launch; result: NormalizedTestResult }>>();

  for (const launch of launches) {
    for (const result of launch.results) {
      const id = getTestCaseIdentity(result);
      const group = grouped.get(id) ?? [];
      group.push({ launch, result });
      grouped.set(id, group);
    }
  }

  return Array.from(grouped.entries())
    .map(([id, items]) => buildTestCaseSummary(id, items))
    .sort((left, right) => left.name.localeCompare(right.name));
}

export function getTestCaseHistory(launches: Launch[], testCaseId: string): TestCaseHistoryPoint[] {
  return launches
    .flatMap((launch) =>
      launch.results
        .filter((result) => getTestCaseIdentity(result) === testCaseId)
        .map((result) => toHistoryPoint(launch, result))
    )
    .sort((left, right) => left.launchCreatedAt.localeCompare(right.launchCreatedAt));
}

export function buildLaunchResultDetails(
  launch: Launch,
  resultUuid: string
): LaunchResultDetailsReadModel | undefined {
  const result = launch.results.find((item) => item.uuid === resultUuid);
  if (result === undefined) {
    return undefined;
  }

  return {
    launchId: launch.id,
    projectId: launch.projectId,
    uuid: result.uuid,
    ...(result.historyId !== undefined ? { historyId: result.historyId } : {}),
    ...(result.testCaseId !== undefined ? { testCaseId: result.testCaseId } : {}),
    ...(result.fullName !== undefined ? { fullName: result.fullName } : {}),
    name: result.name,
    status: result.status,
    ...(result.durationMs !== undefined ? { durationMs: result.durationMs } : {}),
    ...(result.raw.stage !== undefined ? { stage: result.raw.stage } : {}),
    ...(result.raw.statusDetails !== undefined ? { statusDetails: result.raw.statusDetails } : {}),
    ...(result.raw.description !== undefined ? { description: result.raw.description } : {}),
    ...(result.raw.descriptionHtml !== undefined
      ? { descriptionHtml: result.raw.descriptionHtml }
      : {}),
    labels: result.labels,
    parameters: result.parameters,
    links: result.raw.links ?? [],
    attachments: collectLaunchResultAttachments(result),
    artifacts: [],
    checksumDuplicates: [],
    steps: result.steps,
    raw: result.raw
  };
}

function buildTestCaseSummary(
  id: string,
  items: Array<{ launch: Launch; result: NormalizedTestResult }>
): TestCaseSummary {
  const sorted = [...items].sort((left, right) =>
    left.launch.createdAt.localeCompare(right.launch.createdAt)
  );
  const last = sorted[sorted.length - 1]!;
  const history = sorted.map((item) => toHistoryPoint(item.launch, item.result));
  const durations = history
    .map((point) => point.durationMs)
    .filter((duration): duration is number => duration !== undefined)
    .sort((left, right) => left - right);
  const statuses = sorted.map((item) => item.result.status);
  const passed = statuses.filter((status) => status === "passed").length;
  const transitionCount = countStatusTransitions(statuses);
  const failureCount = statuses.filter(isFailureStatus).length;
  const markedFlakyCount = sorted.filter((item) => item.result.raw.statusDetails?.flaky).length;
  const flakyScore = Math.round((transitionCount / Math.max(1, sorted.length - 1)) * 10000) / 100;
  const flaky = buildFlakyReadModel(
    statuses,
    transitionCount,
    passed,
    failureCount,
    markedFlakyCount
  );
  const failure = buildFailureReadModel(history);
  const durationRegression = buildDurationRegressionReadModel(history);
  const historyIds = Array.from(
    new Set(
      sorted
        .map((item) => item.result.historyId)
        .filter((historyId): historyId is string => historyId !== undefined)
    )
  );
  const firstSeenAt = sorted[0]?.launch.createdAt;
  const identity = getTestCaseIdentityReadModel(last.result);
  const lastGreen = getLastGreenPoint(history);
  const firstFailed = getFirstFailedPoint(history);

  return {
    id,
    identity,
    name: last.result.name,
    ...(last.result.fullName !== undefined ? { fullName: last.result.fullName } : {}),
    historyIds,
    totalResults: sorted.length,
    lastStatus: last.result.status,
    passRate: Math.round((passed / sorted.length) * 10000) / 100,
    flakyScore,
    flaky,
    failureClassification: failure.classification,
    failure,
    ...(durationRegression !== undefined ? { durationRegression } : {}),
    ...(lastGreen !== undefined ? { lastGreen } : {}),
    ...(firstFailed !== undefined ? { firstFailed } : {}),
    ...(durations.length > 0 ? { medianDurationMs: percentile(durations, 0.5) } : {}),
    ...(durations.length > 0 ? { p95DurationMs: percentile(durations, 0.95) } : {}),
    ...(firstSeenAt !== undefined ? { firstSeenAt } : {}),
    lastSeenAt: last.launch.createdAt
  };
}

function toHistoryPoint(launch: Launch, result: NormalizedTestResult): TestCaseHistoryPoint {
  return {
    launchId: launch.id,
    launchName: launch.name,
    launchCreatedAt: launch.createdAt,
    status: result.status,
    ...(result.durationMs !== undefined ? { durationMs: result.durationMs } : {}),
    ...(result.historyId !== undefined ? { historyId: result.historyId } : {})
  };
}

function countStatusTransitions(statuses: AllureStatus[]): number {
  return statuses.reduce((count, status, index) => {
    if (index === 0) {
      return count;
    }
    return status === statuses[index - 1] ? count : count + 1;
  }, 0);
}

function buildFlakyReadModel(
  statuses: AllureStatus[],
  transitionCount: number,
  passCount: number,
  failureCount: number,
  markedFlakyCount: number
): TestCaseFlakyReadModel {
  const observedStatuses = Array.from(new Set(statuses));
  const score = Math.round((transitionCount / Math.max(1, statuses.length - 1)) * 10000) / 100;

  return {
    isFlaky: (passCount > 0 && failureCount > 0 && transitionCount >= 2) || markedFlakyCount > 0,
    score,
    inputs: {
      statuses,
      observedStatuses,
      transitionCount,
      passCount,
      failureCount,
      markedFlakyCount
    }
  };
}

function buildFailureReadModel(history: TestCaseHistoryPoint[]): TestCaseFailureReadModel {
  const latest = history[history.length - 1];
  const failureCount = history.filter((point) => isFailureStatus(point.status)).length;
  if (latest === undefined || !isFailureStatus(latest.status)) {
    return {
      classification: "none",
      isFailing: false,
      failureCount,
      previousFailureCount: failureCount,
      currentFailureStreak: 0,
      explanation: "Latest result is not failed or broken."
    };
  }

  const previous = history.slice(0, -1);
  const previousFailureCount = previous.filter((point) => isFailureStatus(point.status)).length;
  const currentFailureStreak = countTrailingFailures(history);
  const classification = previousFailureCount > 0 ? "recurring" : "new";
  const explanation =
    classification === "new"
      ? "Latest result is failing and no earlier failed or broken result was observed."
      : "Latest result is failing and earlier failed or broken results were observed.";

  return {
    classification,
    isFailing: true,
    failureCount,
    previousFailureCount,
    currentFailureStreak,
    explanation
  };
}

function buildDurationRegressionReadModel(
  history: TestCaseHistoryPoint[]
): TestCaseDurationRegressionReadModel | undefined {
  const latest = history[history.length - 1];
  if (latest?.durationMs === undefined) {
    return undefined;
  }

  const baselineDurations = history
    .slice(0, -1)
    .map((point) => point.durationMs)
    .filter((duration): duration is number => duration !== undefined)
    .sort((left, right) => left - right);

  if (baselineDurations.length === 0) {
    return undefined;
  }

  const baselineMedianDurationMs = percentile(baselineDurations, 0.5);
  const deltaMs = latest.durationMs - baselineMedianDurationMs;
  const ratio =
    baselineMedianDurationMs === 0
      ? latest.durationMs === 0
        ? 1
        : Number.POSITIVE_INFINITY
      : latest.durationMs / baselineMedianDurationMs;
  const roundedRatio = Math.round(ratio * 100) / 100;
  const isRegressed =
    ratio >= DURATION_REGRESSION_THRESHOLD_RATIO && deltaMs >= DURATION_REGRESSION_MIN_DELTA_MS;

  return {
    isRegressed,
    latestDurationMs: latest.durationMs,
    baselineMedianDurationMs,
    deltaMs,
    ratio: roundedRatio,
    thresholdRatio: DURATION_REGRESSION_THRESHOLD_RATIO,
    minDeltaMs: DURATION_REGRESSION_MIN_DELTA_MS,
    sampleSize: baselineDurations.length,
    explanation: isRegressed
      ? "Latest duration exceeds the historical median by the configured ratio and delta."
      : "Latest duration does not exceed the configured regression threshold."
  };
}

function getLastGreenPoint(history: TestCaseHistoryPoint[]): TestCaseHistoryPoint | undefined {
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const point = history[index];
    if (point?.status === "passed") {
      return point;
    }
  }
  return undefined;
}

function getFirstFailedPoint(history: TestCaseHistoryPoint[]): TestCaseHistoryPoint | undefined {
  const latest = history[history.length - 1];
  if (latest === undefined || !isFailureStatus(latest.status)) {
    return undefined;
  }

  const lastGreenIndex = findLastIndex(history, (point) => point.status === "passed");
  const searchStart = lastGreenIndex === -1 ? 0 : lastGreenIndex + 1;
  return history.slice(searchStart).find((point) => isFailureStatus(point.status));
}

function findLastIndex<T>(items: T[], predicate: (item: T) => boolean): number {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index];
    if (item !== undefined && predicate(item)) {
      return index;
    }
  }
  return -1;
}

function countTrailingFailures(history: TestCaseHistoryPoint[]): number {
  let count = 0;
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const point = history[index];
    if (point === undefined || !isFailureStatus(point.status)) {
      break;
    }
    count += 1;
  }
  return count;
}

export function isFailureStatus(status: AllureStatus): boolean {
  return FAILURE_STATUSES.has(status);
}

export function uniqueSortedStrings(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

function percentile(sortedValues: number[], percentileValue: number): number {
  if (sortedValues.length === 0) {
    return 0;
  }
  const index = Math.min(
    sortedValues.length - 1,
    Math.ceil(sortedValues.length * percentileValue) - 1
  );
  return sortedValues[index] ?? 0;
}

function collectLaunchResultAttachments(
  result: NormalizedTestResult
): LaunchResultAttachmentReadModel[] {
  return [
    ...result.attachments.map((attachment) => attachToResult(attachment)),
    ...collectStepAttachments(result.steps)
  ];
}

function collectStepAttachments(
  steps: AllureStep[],
  parentPath: string[] = []
): LaunchResultAttachmentReadModel[] {
  return steps.flatMap((step) => {
    const stepPath = [...parentPath, step.name];
    return [
      ...(step.attachments ?? []).map((attachment) => attachToStep(attachment, stepPath)),
      ...collectStepAttachments(step.steps ?? [], stepPath)
    ];
  });
}

function attachToResult(attachment: AllureAttachment): LaunchResultAttachmentReadModel {
  return {
    ...attachment,
    scope: "result"
  };
}

function attachToStep(
  attachment: AllureAttachment,
  stepPath: string[]
): LaunchResultAttachmentReadModel {
  return {
    ...attachment,
    scope: "step",
    stepPath
  };
}
