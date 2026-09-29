import { getJson } from "./apiHttp.js";
import type {
  ApiTestCaseHistoryPageReadModel,
  ApiTestCaseHistoryPointReadModel
} from "./m1WorkspaceApiTypes.js";
import { workspaceInitialHistoryLimit } from "./m1WorkspaceHistoryReads.js";

export async function loadLatestTestCaseHistoryPage(
  projectId: string,
  testCaseId: string,
  firstPage: ApiTestCaseHistoryPageReadModel
): Promise<ApiTestCaseHistoryPageReadModel> {
  const total = firstPage.page?.total ?? firstPage.totalPoints ?? firstPage.points.length;
  const lastOffset = Math.max(0, total - workspaceInitialHistoryLimit);
  if (lastOffset === 0) {
    return firstPage;
  }

  return getJson<ApiTestCaseHistoryPageReadModel>(
    `/api/v1/test-cases/${encodeURIComponent(testCaseId)}/history?projectId=${encodeURIComponent(projectId)}&limit=${workspaceInitialHistoryLimit}&cursor=${lastOffset}`
  ).catch(() => firstPage);
}

export function selectLatestTestCaseResultPoint(
  points: ApiTestCaseHistoryPointReadModel[]
): ApiTestCaseHistoryPointReadModel | undefined {
  const finalByLaunch = new Map<
    string,
    { point: ApiTestCaseHistoryPointReadModel; index: number }
  >();
  points.forEach((point, index) => {
    if (point.launchId.trim() === "" || point.resultUuid.trim() === "") {
      return;
    }
    const previous = finalByLaunch.get(point.launchId);
    if (
      previous === undefined ||
      (point.attemptNumber ?? 1) >= (previous.point.attemptNumber ?? 1)
    ) {
      finalByLaunch.set(point.launchId, { point, index });
    }
  });

  return [...finalByLaunch.values()].sort((left, right) => {
    const leftTime = Date.parse(left.point.launchCreatedAt);
    const rightTime = Date.parse(right.point.launchCreatedAt);
    const timeOrder =
      (Number.isFinite(rightTime) ? rightTime : 0) - (Number.isFinite(leftTime) ? leftTime : 0);
    return timeOrder || right.index - left.index;
  })[0]?.point;
}
