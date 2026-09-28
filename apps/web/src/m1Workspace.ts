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
  LaunchResultPage,
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
  TestResultAttempt,
  WorkspaceListPage
} from "./m1WorkspaceTypes.js";
export { assertM1SurfaceContract, M1_SURFACE_CONTRACT } from "./m1WorkspaceTypes.js";
export { mergeHistoryComparePermissionAuditRead } from "./m1WorkspacePermissionAudit.js";
import { getJson } from "./apiHttp.js";
import type {
  LaunchResultPage,
  M1Workspace,
  M1WorkspaceResponse,
  ResultStatus,
  TestResult,
  WorkspaceListPage
} from "./m1WorkspaceTypes.js";
import { mockM1WorkspaceResponse } from "./m1WorkspaceMock.js";
import { defaultResultSteps } from "./m1WorkspaceMockPreview.js";
import {
  loadHistoryComparePermissionAuditInvariantRead,
  loadHistoryComparePermissionAuditRead,
  loadTestCaseHistoryRead,
  workspaceInitialHistoryLimit
} from "./m1WorkspaceHistoryReads.js";
import {
  defectReadHeaders,
  emptyLaunchDetails,
  listPageParameters,
  mapDefectClustersToWorkspace,
  mapTestCaseSummariesToWorkspace
} from "./m1WorkspaceCatalog.js";
import type {
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
import { mapApiLaunch, mapApiLaunchListItem, mapApiResult } from "./m1WorkspaceMappers.js";

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
export const workspaceResultListLimit = 100;
export const workspaceDefaultResultPageSize = 25;
export { workspaceInitialHistoryLimit };
export const workspaceInitialTestCaseLimit = 25;
export const workspaceInitialDefectLimit = 25;

export type M1WorkspaceRouteScope =
  | "defect-list"
  | "defect-detail"
  | "launch-list"
  | "launch-detail"
  | "result-detail"
  | "test-case-list"
  | "test-case-detail";

export type LoadM1WorkspaceOptions = {
  launchPageSize?: number | undefined;
  launchPageCursor?: string | undefined;
  listQuery?: string | undefined;
  listPageSize?: number | undefined;
  listPageCursor?: string | undefined;
  projectId?: string | undefined;
  preferredLaunchId?: string | undefined;
  preferredResultId?: string | undefined;
  preferredTestCaseId?: string | undefined;
  preferredDefectId?: string | undefined;
  resultPageSize?: number | undefined;
  resultPageCursor?: string | undefined;
  resultQuery?: string | undefined;
  resultStatusFilter?: ResultStatus | undefined;
  routeScope?: M1WorkspaceRouteScope | undefined;
};

export async function loadM1Workspace(options: LoadM1WorkspaceOptions = {}): Promise<M1Workspace> {
  return fetchM1Workspace(options);
}

export async function loadLaunchResultDetail(
  launchId: string,
  resultId: string
): Promise<TestResult> {
  const details = await getJson<ApiResultDetailsReadModel>(
    `/api/v1/launches/${encodeURIComponent(launchId)}/results/${encodeURIComponent(resultId)}`
  );
  return { ...mapApiResult(details, details, undefined, undefined, undefined), launchId };
}

export async function resolveLaunchResultId(
  launchId: string,
  resultId: string,
  testCaseId?: string
): Promise<string> {
  const normalizedTestCaseId = testCaseId?.trim();
  let cursor: string | undefined;
  const visitedCursors = new Set<string>();
  do {
    const resultsPayload = await fetchLaunchResultPage(launchId, workspaceResultListLimit, cursor);
    const exactResult = resultsPayload.items.find((result) => result.uuid === resultId);
    if (exactResult !== undefined) {
      return exactResult.uuid;
    }
    if (normalizedTestCaseId !== undefined && normalizedTestCaseId !== "") {
      const matchingTestCase = resultsPayload.items.find(
        (result) => result.testCaseId === normalizedTestCaseId
      );
      if (matchingTestCase !== undefined) {
        return matchingTestCase.uuid;
      }
    }
    cursor = resultsPayload.page?.nextCursor ?? undefined;
    if (cursor === undefined || visitedCursors.has(cursor)) {
      break;
    }
    visitedCursors.add(cursor);
  } while (true);

  return resultId;
}

export async function fetchM1Workspace(options: LoadM1WorkspaceOptions = {}): Promise<M1Workspace> {
  const routeScope = resolveM1WorkspaceRouteScope(options);
  const listPageCursor = options.listPageCursor;
  const listQuery = options.listQuery?.trim();
  const resultPageSize = options.resultPageSize ?? workspaceResultListLimit;
  const resultPageCursor = options.resultPageCursor;
  const resultQuery = options.resultQuery;
  const resultStatusFilter = options.resultStatusFilter;
  const project =
    options.projectId !== undefined
      ? { id: options.projectId }
      : (await getJson<ApiProjectReadModel[]>("/api/v1/projects"))[0];
  if (project === undefined) {
    throw new Error("No API projects available");
  }

  const launchPageSize =
    routeScope === "launch-list"
      ? (options.launchPageSize ?? workspaceInitialLaunchLimit)
      : workspaceInitialLaunchLimit;
  const launchPageCursor = routeScope === "launch-list" ? options.launchPageCursor : undefined;
  const launchListQuery = routeScope === "launch-list" ? listQuery : undefined;
  const launchesPayload = await getJson<ApiLaunchReadModel[] | ApiPagedList<ApiLaunchReadModel>>(
    `/api/v1/projects/${encodeURIComponent(project.id)}/launches?${listPageParameters(
      launchPageSize,
      launchPageCursor,
      launchListQuery
    )}`
  );
  const launchPage = Array.isArray(launchesPayload) ? undefined : launchesPayload.page;
  const launches = (Array.isArray(launchesPayload) ? launchesPayload : launchesPayload.items)
    .slice()
    .sort((left, right) => Date.parse(right.createdAt ?? "") - Date.parse(left.createdAt ?? ""));
  let selectedLaunch =
    options.preferredLaunchId !== undefined
      ? (launches.find((launch) => launch.id === options.preferredLaunchId) ?? launches[0])
      : launches[0];
  if (
    options.preferredLaunchId !== undefined &&
    selectedLaunch?.id !== options.preferredLaunchId &&
    (routeScope === "launch-detail" || routeScope === "result-detail")
  ) {
    const requestedLaunch = await getJson<ApiLaunchDetailsReadModel>(
      `/api/v1/launches/${encodeURIComponent(options.preferredLaunchId)}`
    );
    if (requestedLaunch.projectId !== project.id) {
      throw new Error("Requested launch is outside the selected project");
    }
    launches.unshift(requestedLaunch);
    selectedLaunch = requestedLaunch;
  }
  const catalogRoute =
    routeScope === "test-case-list" ||
    routeScope === "test-case-detail" ||
    routeScope === "defect-list" ||
    routeScope === "defect-detail";
  if (selectedLaunch === undefined && !catalogRoute) {
    return {
      ...emptyM1Workspace,
      projectId: project.id,
      ...(launchPage !== undefined ? { launchPage } : {})
    };
  }
  const catalogLaunchDetails =
    selectedLaunch === undefined
      ? emptyLaunchDetails(project.id)
      : launchSummaryToDetails(selectedLaunch, []);

  if (routeScope === "defect-list") {
    const listPageSize = options.listPageSize ?? workspaceInitialDefectLimit;
    const defectsPayload = await getJson<ApiDefectListReadModel>(
      `/api/v1/defects?${listPageParameters(listPageSize, listPageCursor, listQuery, project.id)}`,
      { headers: defectReadHeaders(project.id) }
    );

    return mapDefectClustersToWorkspace({
      launchDetails: catalogLaunchDetails,
      launches,
      defects: defectsPayload.items,
      page: defectsPayload.page
    });
  }

  if (routeScope === "defect-detail") {
    const preferredDefectId = options.preferredDefectId;
    if (preferredDefectId === undefined || preferredDefectId.trim().length === 0) {
      throw new Error("No API defect selected");
    }

    const listPageSize = options.listPageSize ?? workspaceInitialDefectLimit;
    const [defectsPayload, selectedDefectPayload] = await Promise.all([
      getJson<ApiDefectListReadModel>(
        `/api/v1/defects?${listPageParameters(listPageSize, listPageCursor, listQuery, project.id)}`,
        { headers: defectReadHeaders(project.id) }
      ),
      getJson<ApiDefectListReadModel>(
        `/api/v1/defects?projectId=${encodeURIComponent(project.id)}&q=${encodeURIComponent(
          preferredDefectId
        )}&limit=1`,
        { headers: defectReadHeaders(project.id) }
      )
    ]);
    const selectedDefect = selectedDefectPayload.items.find(
      (defect) => defect.id === preferredDefectId
    );

    return mapDefectClustersToWorkspace({
      launchDetails: catalogLaunchDetails,
      launches,
      defects: defectsPayload.items,
      page: defectsPayload.page,
      selectedDefect
    });
  }

  if (routeScope === "test-case-list") {
    const listPageSize = options.listPageSize ?? workspaceInitialTestCaseLimit;
    const testCasesPayload = await getJson<ApiTestCaseListReadModel>(
      `/api/v1/test-cases?${listPageParameters(listPageSize, listPageCursor, listQuery, project.id)}`
    );

    return mapTestCaseSummariesToWorkspace({
      launchDetails: catalogLaunchDetails,
      launches,
      testCases: testCasesPayload.items,
      page: testCasesPayload.page
    });
  }

  if (routeScope === "test-case-detail") {
    const preferredTestCaseId = options.preferredTestCaseId;
    if (preferredTestCaseId === undefined || preferredTestCaseId.trim().length === 0) {
      throw new Error("No API test case selected");
    }

    const listPageSize = options.listPageSize ?? workspaceInitialTestCaseLimit;
    const [testCasesPayload, testCase, history] = await Promise.all([
      getJson<ApiTestCaseListReadModel>(
        `/api/v1/test-cases?${listPageParameters(listPageSize, listPageCursor, listQuery, project.id)}`
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
      launchDetails: catalogLaunchDetails,
      launches,
      testCases: testCasesPayload.items,
      page: testCasesPayload.page,
      selectedTestCase: hydratedTestCase
    });
  }

  if (selectedLaunch === undefined) {
    return { ...emptyM1Workspace, projectId: project.id };
  }

  if (routeScope === "launch-list") {
    return mapLaunchDetailsToWorkspace({
      launchDetails: launchSummaryToDetails(selectedLaunch, []),
      launches,
      launchPage,
      resultDetails: []
    });
  }

  if (routeScope === "result-detail") {
    const preferredResultId = options.preferredResultId;
    if (preferredResultId === undefined || preferredResultId.trim().length === 0) {
      throw new Error("No API result selected");
    }

    const resultsPayload = await fetchLaunchResultPage(
      selectedLaunch.id,
      resultPageSize,
      resultPageCursor,
      resultQuery,
      resultStatusFilter
    );
    const listedResult = resultsPayload.items.find((result) => result.uuid === preferredResultId);
    const selectedResultDetails = await loadSelectedResultDetails(
      selectedLaunch.id,
      preferredResultId,
      listedResult
    );
    const prefetchedDetails = resultsPayload.items.map((result) =>
      result.uuid === selectedResultDetails?.uuid ? selectedResultDetails : undefined
    );
    const hydrationReads = await hydrateInitialResults(
      project.id,
      selectedLaunch.id,
      resultsPayload.items.slice(0, workspaceInitialResultHydrationLimit),
      prefetchedDetails.slice(0, workspaceInitialResultHydrationLimit)
    );
    const selectedIsHydrated = resultsPayload.items
      .slice(0, workspaceInitialResultHydrationLimit)
      .some((result) => result.uuid === selectedResultDetails?.uuid);

    return mapLaunchDetailsToWorkspace({
      ...hydrationReads,
      launchDetails: launchSummaryToDetails(selectedLaunch, resultsPayload.items),
      launches,
      resultPage: normalizeLaunchResultPage(resultsPayload, resultPageSize, resultPageCursor),
      resultDetails:
        selectedResultDetails !== undefined && listedResult !== undefined && !selectedIsHydrated
          ? [...hydrationReads.resultDetails, selectedResultDetails]
          : hydrationReads.resultDetails,
      ...(selectedResultDetails !== undefined
        ? {
            selectedResultDetail: {
              ...mapApiResult(
                selectedResultDetails,
                selectedResultDetails,
                undefined,
                undefined,
                undefined
              ),
              launchId: selectedLaunch.id
            }
          }
        : {})
    });
  }

  const resultsPayload = await fetchLaunchResultPage(
    selectedLaunch.id,
    resultPageSize,
    resultPageCursor,
    resultQuery,
    resultStatusFilter
  );
  const launchDetails = launchSummaryToDetails(selectedLaunch, resultsPayload.items);
  const resultPage = normalizeLaunchResultPage(resultsPayload, resultPageSize, resultPageCursor);
  if (launchDetails.results.length === 0) {
    return mapLaunchDetailsToWorkspace({ launchDetails, launches, resultDetails: [], resultPage });
  }

  const hydrationReads = await hydrateInitialResults(
    project.id,
    selectedLaunch.id,
    launchDetails.results.slice(0, workspaceInitialResultHydrationLimit)
  );

  return mapLaunchDetailsToWorkspace({
    ...hydrationReads,
    launchDetails,
    launches,
    resultPage
  });
}

async function fetchLaunchResultPage(
  launchId: string,
  limit: number,
  cursor?: string,
  query?: string,
  status?: ResultStatus
): Promise<ApiLaunchResultListReadModel> {
  if (!Number.isInteger(limit) || limit < 1 || limit > workspaceResultListLimit) {
    throw new Error(`Result page size must be between 1 and ${workspaceResultListLimit}`);
  }

  const cursorQuery = cursor === undefined ? "" : `&cursor=${encodeURIComponent(cursor)}`;
  const searchQuery = query?.trim() ? `&q=${encodeURIComponent(query.trim())}` : "";
  const apiStatus = status === "broken" ? "broken,unknown" : status;
  const statusQuery = apiStatus === undefined ? "" : `&status=${encodeURIComponent(apiStatus)}`;
  return getJson<ApiLaunchResultListReadModel>(
    `/api/v1/launches/${encodeURIComponent(launchId)}/results?limit=${limit}${cursorQuery}${searchQuery}${statusQuery}`
  );
}

function normalizeLaunchResultPage(
  payload: ApiLaunchResultListReadModel,
  requestedLimit: number,
  requestedCursor?: string
): LaunchResultPage {
  const offset = payload.page?.offset ?? Number(requestedCursor ?? 0);
  const returned = payload.page?.returned ?? payload.items.length;
  const total = payload.page?.total ?? offset + returned;
  const nextCursor =
    payload.page?.nextCursor ?? (offset + returned < total ? String(offset + returned) : null);
  return {
    limit: payload.page?.limit ?? requestedLimit,
    cursor: payload.page?.cursor ?? (offset > 0 ? String(offset) : null),
    offset,
    returned,
    total,
    nextCursor,
    hasMore: payload.page?.hasMore ?? nextCursor !== null
  };
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
  launchPage,
  historyReads,
  permissionAuditInvariantReads,
  permissionAuditReads,
  resultPage,
  selectedResultDetail,
  resultDetails
}: {
  launchDetails: ApiLaunchDetailsReadModel;
  launches: ApiLaunchReadModel[];
  launchPage?: WorkspaceListPage | undefined;
  historyReads?: Array<ApiTestCaseHistoryPageReadModel | undefined>;
  permissionAuditInvariantReads?: Array<
    ApiHistoryComparePermissionAuditInvariantReadModel | undefined
  >;
  permissionAuditReads?: Array<ApiHistoryComparePermissionAuditReadModel | undefined>;
  resultPage?: LaunchResultPage;
  selectedResultDetail?: TestResult;
  resultDetails: Array<ApiResultDetailsReadModel | undefined>;
}): M1Workspace {
  const detailsByUuid = new Map(
    resultDetails
      .filter((details): details is ApiResultDetailsReadModel => details !== undefined)
      .map((details) => [details.uuid, details])
  );

  return {
    projectId: launchDetails.projectId,
    launch: mapApiLaunch(launchDetails),
    launchItems: launches.map(mapApiLaunchListItem),
    ...(launchPage !== undefined ? { launchPage } : {}),
    ...(resultPage !== undefined ? { resultPage } : {}),
    ...(selectedResultDetail !== undefined ? { selectedResultDetail } : {}),
    results: launchDetails.results.map((result, index) => ({
      ...mapApiResult(
        result,
        detailsByUuid.get(result.uuid),
        permissionAuditReads?.[index],
        permissionAuditInvariantReads?.[index],
        historyReads?.[index]
      ),
      launchId: launchDetails.id
    }))
  };
}
