import { getJson } from "./apiHttp.js";
import type {
  ApiHistoryComparePermissionAuditInvariantReadModel,
  ApiHistoryComparePermissionAuditReadModel,
  ApiNormalizedResultReadModel,
  ApiTestCaseHistoryPageReadModel
} from "./m1WorkspaceApiTypes.js";

export const workspaceInitialHistoryLimit = 50;

export async function loadTestCaseHistoryRead(
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

export async function loadHistoryComparePermissionAuditRead(
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

export async function loadHistoryComparePermissionAuditInvariantRead(
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
