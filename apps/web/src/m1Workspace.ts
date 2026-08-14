export type {
  ArtifactPreviewDescriptor,
  ArtifactPreviewFlavor,
  ArtifactPreviewImageBody,
  ArtifactPreviewKind,
  ArtifactPreviewMetadataOnlyBody,
  ArtifactPreviewReason,
  ArtifactPreviewSupport,
  ArtifactPreviewTextBody,
  DefectMuteAudit,
  Launch,
  LaunchListItem,
  M1SurfaceContract,
  M1Workspace,
  M1WorkspaceResponse,
  ResultAttachment,
  ResultParameter,
  ResultStatus,
  ResultTrace,
  ScenarioStep,
  TestCaseHistoryCompareAvailability,
  TestCaseHistoryCompareChange,
  TestCaseHistoryComparePage,
  TestCaseHistoryComparePermissionAudit,
  TestCaseHistoryComparePermissionAuditInvariant,
  TestCaseHistoryComparePermissionAuditInvariantItem,
  TestCaseHistoryComparePermissionAuditRecord,
  TestCaseHistoryComparePoint,
  TestCaseHistoryCompareScope,
  TestCaseHistoryCompareValue,
  TestCaseHistoryPoint,
  TestCaseIdentityAudit,
  TestCaseIdentityState,
  TestResult,
  TestResultAttempt
} from "./m1WorkspaceTypes.js";
export { assertM1SurfaceContract, M1_SURFACE_CONTRACT } from "./m1WorkspaceTypes.js";
export { mergeHistoryComparePermissionAuditRead } from "./m1WorkspacePermissionAudit.js";
import { getJson } from "./apiHttp.js";
import type { M1Workspace, M1WorkspaceResponse } from "./m1WorkspaceTypes.js";
import { mockM1WorkspaceResponse } from "./m1WorkspaceMock.js";
import { defaultResultSteps } from "./m1WorkspaceMockPreview.js";
import type {
  ApiDefectClusterReadModel,
  ApiDefectListReadModel,
  ApiHistoryComparePermissionAuditInvariantReadModel,
  ApiHistoryComparePermissionAuditReadModel,
  ApiLaunchDetailsReadModel,
  ApiLaunchReadModel,
  ApiLaunchResultListReadModel,
  ApiNormalizedResultReadModel,
  ApiPagedList,
  ApiProjectReadModel,
  ApiResultDetailsReadModel,
  ApiTestCaseHistoryPageReadModel,
  ApiTestCaseListReadModel,
  ApiTestCaseSummaryReadModel
} from "./m1WorkspaceApiTypes.js";
import {
  mapApiLaunch,
  mapApiLaunchListItem,
  mapApiDefectCluster,
  mapApiResult,
  mapApiTestCaseSummary
} from "./m1WorkspaceMappers.js";

export function mapM1WorkspaceResponse(response: M1WorkspaceResponse): M1Workspace {
  return {
    launch: response.launch,
    launchItems: response.launches,
    results: response.results.map((result) => ({
      ...result,
      steps: response.resultSteps[result.id] ?? defaultResultSteps
    }))
  };
}

export const emptyM1Workspace: M1Workspace = {
  launch: {
    branch: "",
    build: "",
    environment: "",
    name: "No launches",
    owner: "",
    started: ""
  },
  launchItems: [],
  results: []
};
export const demoM1Workspace = import.meta.env.PROD
  ? emptyM1Workspace
  : mapM1WorkspaceResponse(mockM1WorkspaceResponse);

export const workspaceInitialLaunchLimit = 25;
export const workspaceInitialResultHydrationLimit = 25;
export const workspaceInitialHistoryLimit = 50;
export const workspaceInitialTestCaseLimit = 50;
export const workspaceInitialDefectLimit = 50;

export type M1WorkspaceRouteScope =
  | "defect-list"
  | "defect-detail"
  | "launch-list"
  | "launch-detail"
  | "result-detail"
  | "test-case-list"
  | "test-case-detail";

export type LoadM1WorkspaceOptions = {
  preferredLaunchId?: string | undefined;
  preferredResultId?: string | undefined;
  preferredTestCaseId?: string | undefined;
  preferredDefectId?: string | undefined;
  routeScope?: M1WorkspaceRouteScope | undefined;
};

export async function loadM1Workspace(options: LoadM1WorkspaceOptions = {}): Promise<M1Workspace> {
  return fetchM1Workspace(options);
}

export async function resolveLaunchResultId(
  launchId: string,
  resultId: string,
  testCaseId?: string
): Promise<string> {
  const resultsPayload = await getJson<ApiLaunchResultListReadModel>(
    `/api/v1/launches/${encodeURIComponent(
      launchId
    )}/results?limit=${workspaceInitialResultHydrationLimit}`
  );
  const exactResult = resultsPayload.items.find((result) => result.uuid === resultId);
  if (exactResult !== undefined) {
    return exactResult.uuid;
  }

  const normalizedTestCaseId = testCaseId?.trim();
  if (normalizedTestCaseId === undefined || normalizedTestCaseId === "") {
    return resultId;
  }

  return (
    resultsPayload.items.find((result) => result.testCaseId === normalizedTestCaseId)?.uuid ??
    resultId
  );
}

export async function fetchM1Workspace(options: LoadM1WorkspaceOptions = {}): Promise<M1Workspace> {
  const routeScope = resolveM1WorkspaceRouteScope(options);
  const projects = await getJson<ApiProjectReadModel[]>("/api/v1/projects");
  const project = projects[0];
  if (project === undefined) {
    throw new Error("No API projects available");
  }

  const launchesPayload = await getJson<ApiLaunchReadModel[] | ApiPagedList<ApiLaunchReadModel>>(
    `/api/v1/projects/${encodeURIComponent(project.id)}/launches?limit=${workspaceInitialLaunchLimit}`
  );
  const launches = (Array.isArray(launchesPayload) ? launchesPayload : launchesPayload.items)
    .slice()
    .sort((left, right) => Date.parse(right.createdAt ?? "") - Date.parse(left.createdAt ?? ""));
  const selectedLaunch =
    options.preferredLaunchId !== undefined
      ? (launches.find((launch) => launch.id === options.preferredLaunchId) ?? launches[0])
      : launches[0];
  if (selectedLaunch === undefined) {
    throw new Error("No API launches available");
  }

  if (routeScope === "defect-list") {
    const defectsPayload = await getJson<ApiDefectListReadModel>(
      `/api/v1/defects?projectId=${encodeURIComponent(
        project.id
      )}&limit=${workspaceInitialDefectLimit}`,
      { headers: defectReadHeaders(project.id) }
    );

    return mapDefectClustersToWorkspace({
      launchDetails: launchSummaryToDetails(selectedLaunch, []),
      launches,
      defects: defectsPayload.items
    });
  }

  if (routeScope === "defect-detail") {
    const preferredDefectId = options.preferredDefectId;
    if (preferredDefectId === undefined || preferredDefectId.trim().length === 0) {
      throw new Error("No API defect selected");
    }

    const [defectsPayload, selectedDefectPayload] = await Promise.all([
      getJson<ApiDefectListReadModel>(
        `/api/v1/defects?projectId=${encodeURIComponent(
          project.id
        )}&limit=${workspaceInitialDefectLimit}`,
        { headers: defectReadHeaders(project.id) }
      ),
      getJson<ApiDefectListReadModel>(
        `/api/v1/defects?projectId=${encodeURIComponent(project.id)}&q=${encodeURIComponent(
          preferredDefectId
        )}&limit=1`,
        { headers: defectReadHeaders(project.id) }
      )
    ]);
    const selectedDefect =
      selectedDefectPayload.items.find((defect) => defect.id === preferredDefectId) ??
      selectedDefectPayload.items[0];

    return mapDefectClustersToWorkspace({
      launchDetails: launchSummaryToDetails(selectedLaunch, []),
      launches,
      defects:
        selectedDefect === undefined
          ? defectsPayload.items
          : mergeSelectedDefectIntoPage(defectsPayload.items, selectedDefect)
    });
  }

  if (routeScope === "test-case-list") {
    const testCasesPayload = await getJson<ApiTestCaseListReadModel>(
      `/api/v1/test-cases?projectId=${encodeURIComponent(
        project.id
      )}&limit=${workspaceInitialTestCaseLimit}`
    );

    return mapTestCaseSummariesToWorkspace({
      launchDetails: launchSummaryToDetails(selectedLaunch, []),
      launches,
      testCases: testCasesPayload.items
    });
  }

  if (routeScope === "test-case-detail") {
    const preferredTestCaseId = options.preferredTestCaseId;
    if (preferredTestCaseId === undefined || preferredTestCaseId.trim().length === 0) {
      throw new Error("No API test case selected");
    }

    const [testCasesPayload, testCase, history] = await Promise.all([
      getJson<ApiTestCaseListReadModel>(
        `/api/v1/test-cases?projectId=${encodeURIComponent(
          project.id
        )}&limit=${workspaceInitialTestCaseLimit}`
      ),
      getJson<ApiTestCaseSummaryReadModel>(
        `/api/v1/test-cases/${encodeURIComponent(
          preferredTestCaseId
        )}?projectId=${encodeURIComponent(project.id)}`
      ),
      getJson<ApiTestCaseHistoryPageReadModel>(
        `/api/v1/test-cases/${encodeURIComponent(
          preferredTestCaseId
        )}/history?projectId=${encodeURIComponent(project.id)}&limit=${workspaceInitialHistoryLimit}`
      )
    ]);
    const hydratedTestCase =
      history.points.length > 0 ? { ...testCase, history: history.points } : testCase;

    return mapTestCaseSummariesToWorkspace({
      launchDetails: launchSummaryToDetails(selectedLaunch, []),
      launches,
      testCases: mergeSelectedTestCaseIntoPage(testCasesPayload.items, hydratedTestCase)
    });
  }

  if (routeScope === "launch-list") {
    return mapLaunchDetailsToWorkspace({
      launchDetails: launchSummaryToDetails(selectedLaunch, []),
      launches,
      resultDetails: []
    });
  }

  if (routeScope === "result-detail") {
    const preferredResultId = options.preferredResultId;
    if (preferredResultId === undefined || preferredResultId.trim().length === 0) {
      throw new Error("No API result selected");
    }

    const resultsPayload = await getJson<ApiLaunchResultListReadModel>(
      `/api/v1/launches/${encodeURIComponent(
        selectedLaunch.id
      )}/results?limit=${workspaceInitialResultHydrationLimit}`
    );
    const listedResult = resultsPayload.items.find((result) => result.uuid === preferredResultId);
    const selectedResultDetails = await loadSelectedResultDetails(
      selectedLaunch.id,
      preferredResultId,
      listedResult
    );
    const mergedResults =
      selectedResultDetails === undefined
        ? resultsPayload.items
        : mergeSelectedResultIntoPage(resultsPayload.items, selectedResultDetails);
    const prefetchedDetails = mergedResults.map((result) =>
      result.uuid === selectedResultDetails?.uuid ? selectedResultDetails : undefined
    );
    const hydrationReads = await hydrateInitialResults(
      project.id,
      selectedLaunch.id,
      mergedResults,
      prefetchedDetails
    );

    return mapLaunchDetailsToWorkspace({
      ...hydrationReads,
      launchDetails: launchSummaryToDetails(selectedLaunch, mergedResults),
      launches,
      resultDetails: hydrationReads.resultDetails
    });
  }

  const resultsPayload = await getJson<ApiLaunchResultListReadModel>(
    `/api/v1/launches/${encodeURIComponent(
      selectedLaunch.id
    )}/results?limit=${workspaceInitialResultHydrationLimit}`
  );
  const launchDetails = launchSummaryToDetails(selectedLaunch, resultsPayload.items);
  if (launchDetails.results.length === 0) {
    throw new Error("No API launch results available");
  }

  const hydrationReads = await hydrateInitialResults(
    project.id,
    selectedLaunch.id,
    launchDetails.results
  );

  return mapLaunchDetailsToWorkspace({
    ...hydrationReads,
    launchDetails,
    launches
  });
}

function mergeSelectedResultIntoPage(
  results: ApiNormalizedResultReadModel[],
  selectedResult: ApiResultDetailsReadModel
): ApiNormalizedResultReadModel[] {
  if (results.some((result) => result.uuid === selectedResult.uuid)) {
    return results;
  }

  return [...results, selectedResult];
}

function resultSummaryToDetails(result: ApiNormalizedResultReadModel): ApiResultDetailsReadModel {
  return {
    ...result,
    labels: result.labels ?? {}
  };
}

async function loadSelectedResultDetails(
  launchId: string,
  resultId: string,
  listedResult: ApiNormalizedResultReadModel | undefined
): Promise<ApiResultDetailsReadModel | undefined> {
  try {
    return await getJson<ApiResultDetailsReadModel>(
      `/api/v1/launches/${encodeURIComponent(launchId)}/results/${encodeURIComponent(resultId)}`
    );
  } catch {
    if (listedResult === undefined) {
      return undefined;
    }

    return resultSummaryToDetails(listedResult);
  }
}

function mergeSelectedTestCaseIntoPage(
  testCases: ApiTestCaseSummaryReadModel[],
  selectedTestCase: ApiTestCaseSummaryReadModel
): ApiTestCaseSummaryReadModel[] {
  let selectedIncluded = false;
  const merged = testCases.map((testCase) => {
    if (testCase.id !== selectedTestCase.id) {
      return testCase;
    }

    selectedIncluded = true;
    return selectedTestCase;
  });

  return selectedIncluded ? merged : [...merged, selectedTestCase];
}

function mergeSelectedDefectIntoPage(
  defects: ApiDefectClusterReadModel[],
  selectedDefect: ApiDefectClusterReadModel
): ApiDefectClusterReadModel[] {
  let selectedIncluded = false;
  const merged = defects.map((defect) => {
    if (defect.id !== selectedDefect.id) {
      return defect;
    }

    selectedIncluded = true;
    return selectedDefect;
  });

  return selectedIncluded ? merged : [...merged, selectedDefect];
}

function resolveM1WorkspaceRouteScope(options: LoadM1WorkspaceOptions): M1WorkspaceRouteScope {
  if (options.routeScope !== undefined) {
    return options.routeScope;
  }

  if (options.preferredResultId !== undefined) {
    return "result-detail";
  }

  if (options.preferredDefectId !== undefined) {
    return "defect-detail";
  }

  if (options.preferredTestCaseId !== undefined) {
    return "test-case-detail";
  }

  if (options.preferredLaunchId !== undefined) {
    return "launch-detail";
  }

  return "launch-list";
}

function launchSummaryToDetails(
  launch: ApiLaunchReadModel,
  results: ApiNormalizedResultReadModel[]
): ApiLaunchDetailsReadModel {
  return {
    ...launch,
    results
  };
}

function mapTestCaseSummariesToWorkspace({
  launchDetails,
  launches,
  testCases
}: {
  launchDetails: ApiLaunchDetailsReadModel;
  launches: ApiLaunchReadModel[];
  testCases: ApiTestCaseSummaryReadModel[];
}): M1Workspace {
  return {
    launch: mapApiLaunch(launchDetails),
    launchItems: launches.map(mapApiLaunchListItem),
    results: testCases.map(mapApiTestCaseSummary)
  };
}

function mapDefectClustersToWorkspace({
  launchDetails,
  launches,
  defects
}: {
  launchDetails: ApiLaunchDetailsReadModel;
  launches: ApiLaunchReadModel[];
  defects: ApiDefectListReadModel["items"];
}): M1Workspace {
  return {
    launch: mapApiLaunch(launchDetails),
    launchItems: launches.map(mapApiLaunchListItem),
    results: defects.map(mapApiDefectCluster)
  };
}

function defectReadHeaders(projectId: string) {
  return {
    "x-testhistory-actor-id": "defects-ui",
    "x-testhistory-project-scope": projectId,
    "x-testhistory-scopes": "defects:read"
  };
}

async function hydrateInitialResults(
  projectId: string,
  launchId: string,
  initialResults: ApiNormalizedResultReadModel[],
  prefetchedResultDetails: Array<ApiResultDetailsReadModel | undefined> = []
): Promise<{
  historyReads: Array<ApiTestCaseHistoryPageReadModel | undefined>;
  permissionAuditInvariantReads: Array<
    ApiHistoryComparePermissionAuditInvariantReadModel | undefined
  >;
  permissionAuditReads: Array<ApiHistoryComparePermissionAuditReadModel | undefined>;
  resultDetails: Array<ApiResultDetailsReadModel | undefined>;
}> {
  const resultDetails = await Promise.all(
    initialResults.map((result, index) => {
      const prefetchedDetails = prefetchedResultDetails[index];
      if (prefetchedDetails !== undefined) {
        return prefetchedDetails;
      }

      return getJson<ApiResultDetailsReadModel>(
        `/api/v1/launches/${encodeURIComponent(launchId)}/results/${encodeURIComponent(result.uuid)}`
      ).catch(() => undefined);
    })
  );
  const permissionAuditReads = await Promise.all(
    initialResults.map((result) =>
      loadHistoryComparePermissionAuditRead(projectId, result).catch(() => undefined)
    )
  );
  const permissionAuditInvariantReads = await Promise.all(
    initialResults.map((result) =>
      loadHistoryComparePermissionAuditInvariantRead(projectId, result).catch(() => undefined)
    )
  );
  const historyReads = await Promise.all(
    initialResults.map((result) =>
      loadTestCaseHistoryRead(projectId, result).catch(() => undefined)
    )
  );

  return {
    historyReads,
    permissionAuditInvariantReads,
    permissionAuditReads,
    resultDetails
  };
}

export function mapLaunchDetailsToWorkspace({
  launchDetails,
  launches,
  historyReads,
  permissionAuditInvariantReads,
  permissionAuditReads,
  resultDetails
}: {
  launchDetails: ApiLaunchDetailsReadModel;
  launches: ApiLaunchReadModel[];
  historyReads?: Array<ApiTestCaseHistoryPageReadModel | undefined>;
  permissionAuditInvariantReads?: Array<
    ApiHistoryComparePermissionAuditInvariantReadModel | undefined
  >;
  permissionAuditReads?: Array<ApiHistoryComparePermissionAuditReadModel | undefined>;
  resultDetails: Array<ApiResultDetailsReadModel | undefined>;
}): M1Workspace {
  const detailsByUuid = new Map(
    resultDetails
      .filter((details): details is ApiResultDetailsReadModel => details !== undefined)
      .map((details) => [details.uuid, details])
  );

  return {
    launch: mapApiLaunch(launchDetails),
    launchItems: launches.map(mapApiLaunchListItem),
    results: launchDetails.results.map((result, index) =>
      mapApiResult(
        result,
        detailsByUuid.get(result.uuid),
        permissionAuditReads?.[index],
        permissionAuditInvariantReads?.[index],
        historyReads?.[index]
      )
    )
  };
}

async function loadTestCaseHistoryRead(
  projectId: string,
  result: ApiNormalizedResultReadModel
): Promise<ApiTestCaseHistoryPageReadModel | undefined> {
  const testCaseId = stableHistoryLookupId(result);
  if (testCaseId === undefined) {
    return undefined;
  }

  return getJson<ApiTestCaseHistoryPageReadModel>(
    `/api/v1/test-cases/${encodeURIComponent(testCaseId)}/history?projectId=${encodeURIComponent(
      projectId
    )}&limit=${workspaceInitialHistoryLimit}`
  );
}

function stableHistoryLookupId(result: ApiNormalizedResultReadModel): string | undefined {
  const testCaseId = result.testCaseId?.trim();
  if (testCaseId !== undefined && testCaseId.length > 0) {
    return testCaseId;
  }

  const historyId = result.historyId?.trim();
  if (historyId !== undefined && historyId.length > 0) {
    return historyId;
  }

  return undefined;
}

async function loadHistoryComparePermissionAuditRead(
  projectId: string,
  result: ApiNormalizedResultReadModel
): Promise<ApiHistoryComparePermissionAuditReadModel | undefined> {
  const testCaseId = result.testCaseId ?? result.historyId ?? result.uuid;
  if (testCaseId.trim().length === 0) {
    return undefined;
  }

  return getJson<ApiHistoryComparePermissionAuditReadModel>(
    `/api/v1/test-cases/${encodeURIComponent(
      testCaseId
    )}/history/compare/permission-audit?projectId=${encodeURIComponent(projectId)}&limit=3`,
    {
      headers: {
        "x-testhistory-scopes": "test-cases:read",
        "x-testhistory-project-scope": projectId,
        "x-testhistory-actor-id": "history-compare-ui"
      }
    }
  );
}

async function loadHistoryComparePermissionAuditInvariantRead(
  projectId: string,
  result: ApiNormalizedResultReadModel
): Promise<ApiHistoryComparePermissionAuditInvariantReadModel | undefined> {
  const testCaseId = result.testCaseId ?? result.historyId ?? result.uuid;
  if (testCaseId.trim().length === 0) {
    return undefined;
  }

  return getJson<ApiHistoryComparePermissionAuditInvariantReadModel>(
    `/api/v1/test-cases/${encodeURIComponent(
      testCaseId
    )}/history/compare/permission-audit/replay/invariants?projectId=${encodeURIComponent(
      projectId
    )}&limit=3`,
    {
      headers: {
        "x-testhistory-scopes": "test-cases:read",
        "x-testhistory-project-scope": projectId,
        "x-testhistory-actor-id": "history-compare-ui"
      }
    }
  );
}
