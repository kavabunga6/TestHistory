import { requestJson } from "./apiHttp.js";

export type LaunchDeletionReceipt = {
  kind: "launch-deletion";
  launchId: string;
  projectId: string;
  removed: {
    artifacts: number;
    historyVersions: number;
    launches: number;
    uploadJobs: number;
    uploadSessions: number;
  };
};

export async function deleteLaunchFromApi(launchId: string): Promise<LaunchDeletionReceipt> {
  return requestJson<LaunchDeletionReceipt>(`/api/v1/launches/${encodeURIComponent(launchId)}`, {
    method: "DELETE"
  });
}

export type DeprecatedTestCaseReceipt = {
  id: string;
  updatedAt: string;
  workflowStatus: "deprecated";
};

export async function deprecateTestCaseFromApi(
  testCaseId: string
): Promise<DeprecatedTestCaseReceipt> {
  return requestJson<DeprecatedTestCaseReceipt>(
    `/api/v1/test-cases/${encodeURIComponent(testCaseId)}`,
    {
      body: JSON.stringify({ workflowStatus: "deprecated" }),
      headers: { "content-type": "application/json" },
      method: "PATCH"
    }
  );
}

export type ResultQuarantineReceipt = {
  kind: "result-quarantine";
  mute: {
    id: string;
    status: "active" | "inactive";
    reason: string;
    mutedAt: string;
    origin: { type: "actor"; actorId: string } | { type: "system"; systemId: string };
    affectedTestIds: string[];
  };
  defectId?: string;
  taskId?: string;
};

export async function quarantineResultFromApi(
  launchId: string,
  resultId: string,
  input: { reason: string; defectId?: string; taskId?: string }
): Promise<ResultQuarantineReceipt> {
  return requestJson<ResultQuarantineReceipt>(
    `/api/v1/launches/${encodeURIComponent(launchId)}/results/${encodeURIComponent(resultId)}/quarantine`,
    {
      body: JSON.stringify(input),
      headers: { "content-type": "application/json" },
      method: "POST"
    }
  );
}

export async function removeResultFromQuarantineApi(
  projectId: string,
  muteId: string,
  reason = "Removed from quarantine in UI"
): Promise<ResultQuarantineReceipt["mute"]> {
  return requestJson<ResultQuarantineReceipt["mute"]>(
    `/api/v1/projects/${encodeURIComponent(projectId)}/defect-mutes/${encodeURIComponent(muteId)}`,
    {
      body: JSON.stringify({ reason }),
      headers: { "content-type": "application/json" },
      method: "DELETE"
    }
  );
}

export type DefectDispositionReceipt = {
  kind: "defect-disposition";
  event: {
    id: string;
    projectId: string;
    defectId: string;
    action: "archived" | "result_unlinked";
    occurrences: Array<{ launchId: string; resultUuid: string }>;
    actorId: string;
    reason: string;
    occurredAt: string;
  };
};

export async function deleteDefectFromApi(
  projectId: string,
  defectId: string,
  reason = "Defect removed from active links in UI"
): Promise<DefectDispositionReceipt> {
  return requestJson<DefectDispositionReceipt>(
    `/api/v1/projects/${encodeURIComponent(projectId)}/defects/${encodeURIComponent(defectId)}`,
    {
      body: JSON.stringify({ reason }),
      headers: { "content-type": "application/json" },
      method: "DELETE"
    }
  );
}

export async function unlinkResultFromDefectApi(
  projectId: string,
  defectId: string,
  resultId: string,
  launchId: string,
  reason = "Result unlinked from defect in UI"
): Promise<DefectDispositionReceipt> {
  return requestJson<DefectDispositionReceipt>(
    `/api/v1/projects/${encodeURIComponent(projectId)}/defects/${encodeURIComponent(defectId)}/results/${encodeURIComponent(resultId)}`,
    {
      body: JSON.stringify({ launchId, reason }),
      headers: { "content-type": "application/json" },
      method: "DELETE"
    }
  );
}
