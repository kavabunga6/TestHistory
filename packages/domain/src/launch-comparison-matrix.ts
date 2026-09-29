import type { AllureStatus, NormalizedTestResult } from "@testhistory/contracts";
import {
  indexFinalResults,
  launchMetrics,
  launchPoint,
  toPoint,
  type ComparableLaunch,
  type LaunchComparisonLaunch,
  type LaunchComparisonPoint
} from "./launch-comparison.js";

const failureStatuses = new Set<AllureStatus>(["failed", "broken"]);

export type LaunchMatrixFocus = "all" | "problems" | "changed";

export type LaunchComparisonMatrixRow = {
  testCaseId: string;
  name: string;
  points: Array<LaunchComparisonPoint | null>;
  changed: boolean;
  currentProblem: boolean;
};

export type LaunchComparisonMatrix = {
  kind: "launch-comparison-matrix";
  projectId: string;
  launches: LaunchComparisonLaunch[];
  summary: {
    testCases: number;
    currentProblems: number;
    changed: number;
    new: number;
    removed: number;
  };
  rows: LaunchComparisonMatrixRow[];
};

export function compareLaunchMatrix(launches: ComparableLaunch[]): LaunchComparisonMatrix {
  if (launches.length < 2 || launches.length > 5) {
    throw new Error("Compare between two and five launches.");
  }
  const projectId = launches[0]!.projectId;
  if (launches.some((launch) => launch.projectId !== projectId)) {
    throw new Error("Compared launches must belong to one project.");
  }
  if (new Set(launches.map((launch) => launch.id)).size !== launches.length) {
    throw new Error("Compared launches must be different.");
  }

  const indexed = launches.map((launch) => indexFinalResults(launch.results));
  const identities = new Set(indexed.flatMap((results) => [...results.keys()]));
  const rows = [...identities].map((testCaseId): LaunchComparisonMatrixRow => {
    const results = indexed.map((results) => results.get(testCaseId));
    const points = results.map((result) => (result === undefined ? null : toPoint(result)));
    const latest = results.at(-1);
    return {
      testCaseId,
      name:
        latest?.name ??
        results.find((result): result is NormalizedTestResult => result !== undefined)?.name ??
        testCaseId,
      points,
      changed: new Set(points.map((point) => point?.status ?? "absent")).size > 1,
      currentProblem: latest !== undefined && failureStatuses.has(latest.status)
    };
  });
  rows.sort(
    (left, right) =>
      Number(right.currentProblem) - Number(left.currentProblem) ||
      Number(right.changed) - Number(left.changed) ||
      left.name.localeCompare(right.name, "ru", { numeric: true })
  );

  return {
    kind: "launch-comparison-matrix",
    projectId,
    launches: launches.map((launch, index) =>
      launchPoint(launch, launchMetrics([...indexed[index]!.values()]))
    ),
    summary: {
      testCases: rows.length,
      currentProblems: rows.filter((row) => row.currentProblem).length,
      changed: rows.filter((row) => row.changed).length,
      new: rows.filter(
        (row) =>
          row.points.slice(0, -1).every((point) => point === null) && row.points.at(-1) !== null
      ).length,
      removed: rows.filter(
        (row) =>
          row.points.slice(0, -1).some((point) => point !== null) && row.points.at(-1) === null
      ).length
    },
    rows
  };
}
