import type {
  ApiDefectClusterReadModel,
  ApiDefectListReadModel,
  ApiLaunchDetailsReadModel,
  ApiLaunchReadModel,
  ApiTestCaseSummaryReadModel
} from "./m1WorkspaceApiTypes.js";
import {
  mapApiDefectCluster,
  mapApiLaunch,
  mapApiLaunchListItem,
  mapApiTestCaseSummary
} from "./m1WorkspaceMappers.js";
import type { M1Workspace, WorkspaceListPage } from "./m1WorkspaceTypes.js";

export function listPageParameters(
  limit: number,
  cursor?: string,
  query?: string,
  projectId?: string
): string {
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
    throw new Error("List page size must be between 1 and 500");
  }
  const parameters = new URLSearchParams();
  if (projectId !== undefined) {
    parameters.set("projectId", projectId);
  }
  parameters.set("limit", String(limit));
  if (cursor !== undefined) {
    parameters.set("cursor", cursor);
  }
  if (query !== undefined && query !== "") {
    parameters.set("q", query);
  }
  return parameters.toString();
}

export function emptyLaunchDetails(projectId: string): ApiLaunchDetailsReadModel {
  return {
    id: "",
    projectId,
    name: "No launches",
    status: "closed",
    counters: { passed: 0, failed: 0, broken: 0, skipped: 0, unknown: 0 },
    results: []
  };
}

export function mapTestCaseSummariesToWorkspace({
  launchDetails,
  launches,
  testCases,
  page,
  selectedTestCase
}: {
  launchDetails: ApiLaunchDetailsReadModel;
  launches: ApiLaunchReadModel[];
  testCases: ApiTestCaseSummaryReadModel[];
  page?: WorkspaceListPage | undefined;
  selectedTestCase?: ApiTestCaseSummaryReadModel | undefined;
}): M1Workspace {
  return {
    projectId: launchDetails.projectId,
    launch: mapApiLaunch(launchDetails),
    launchItems: launches.map(mapApiLaunchListItem),
    results: testCases.map((testCase) =>
      mapApiTestCaseSummary(testCase.id === selectedTestCase?.id ? selectedTestCase : testCase)
    ),
    ...(page !== undefined ? { testCasePage: page } : {}),
    ...(selectedTestCase !== undefined
      ? { selectedTestCaseDetail: mapApiTestCaseSummary(selectedTestCase) }
      : {})
  };
}

export function mapDefectClustersToWorkspace({
  launchDetails,
  launches,
  defects,
  page,
  selectedDefect
}: {
  launchDetails: ApiLaunchDetailsReadModel;
  launches: ApiLaunchReadModel[];
  defects: ApiDefectListReadModel["items"];
  page?: WorkspaceListPage | undefined;
  selectedDefect?: ApiDefectClusterReadModel | undefined;
}): M1Workspace {
  return {
    projectId: launchDetails.projectId,
    launch: mapApiLaunch(launchDetails),
    launchItems: launches.map(mapApiLaunchListItem),
    results: defects.map((defect) =>
      mapApiDefectCluster(defect.id === selectedDefect?.id ? selectedDefect : defect)
    ),
    ...(page !== undefined ? { defectPage: page } : {}),
    ...(selectedDefect !== undefined
      ? { selectedDefectDetail: mapApiDefectCluster(selectedDefect) }
      : {})
  };
}

export function defectReadHeaders(projectId: string) {
  return {
    "x-testhistory-actor-id": "defects-ui",
    "x-testhistory-project-scope": projectId,
    "x-testhistory-scopes": "defects:read"
  };
}
