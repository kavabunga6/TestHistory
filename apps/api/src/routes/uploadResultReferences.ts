import type { UploadResultReferenceReadModel } from "@testhistory/contracts";

export function uploadResultReference(
  launchId: string,
  path: string,
  resultId: string,
  status: UploadResultReferenceReadModel["status"]
): UploadResultReferenceReadModel {
  return {
    path,
    resultId,
    resultUrl: `/api/v1/launches/${encodeURIComponent(launchId)}/results/${encodeURIComponent(resultId)}`,
    status
  };
}
