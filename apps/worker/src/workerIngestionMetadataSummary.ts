import type { AllureStatus, IngestionParseJobPayload } from "@testhistory/contracts";

import {
  buildArchiveIntakeExecutionPlan,
  getArchiveIntakeManifest
} from "./workerArchiveIntake.js";
import { safeAttachmentType } from "./workerAttachmentContent.js";
import type { IngestionParseMetadataSummary } from "./workerTypes.js";

export function buildIngestionParseMetadataSummary(
  payload: IngestionParseJobPayload
): IngestionParseMetadataSummary {
  const base = {
    projectId: payload.projectId,
    launchId: payload.launchId,
    sourceFormat: payload.source.format,
    hasImportId: payload.importId !== undefined,
    hasIdempotencyKey: payload.idempotencyKey !== undefined
  };
  const archiveManifest = getArchiveIntakeManifest(payload);
  const archiveSummary =
    archiveManifest === undefined
      ? undefined
      : buildArchiveIntakeExecutionPlan(payload, archiveManifest, "1970-01-01T00:00:00.000Z")
          .summary;

  if (payload.allure === undefined) {
    return archiveSummary === undefined ? base : { ...base, archiveManifest: archiveSummary };
  }

  return {
    ...base,
    ...(archiveSummary !== undefined ? { archiveManifest: archiveSummary } : {}),
    allure: {
      results: summarizeAllureResults(payload),
      attachments: summarizeAllureAttachments(payload)
    }
  };
}

function summarizeAllureResults(
  payload: IngestionParseJobPayload
): NonNullable<IngestionParseMetadataSummary["allure"]>["results"] {
  const results = payload.allure?.results ?? [];
  const statusCounts: Partial<Record<AllureStatus, number>> = {};

  for (const result of results) {
    if (result.status !== undefined) {
      statusCounts[result.status] = (statusCounts[result.status] ?? 0) + 1;
    }
  }

  return {
    total: results.length,
    withUuid: results.filter((result) => result.uuid !== undefined).length,
    withHistoryId: results.filter((result) => result.historyId !== undefined).length,
    withTestCaseId: results.filter((result) => result.testCaseId !== undefined).length,
    withContentDigest: results.filter((result) => result.contentDigest !== undefined).length,
    withDuration: results.filter(
      (result) => typeof result.start === "number" && typeof result.stop === "number"
    ).length,
    attachmentReferenceCount: results.reduce(
      (total, result) => total + (result.attachmentSources?.length ?? 0),
      0
    ),
    statusCounts
  };
}

function summarizeAllureAttachments(
  payload: IngestionParseJobPayload
): NonNullable<IngestionParseMetadataSummary["allure"]>["attachments"] {
  const attachments = payload.allure?.attachments ?? [];
  const typeCounts: Record<string, number> = {};

  for (const attachment of attachments) {
    const type = safeAttachmentType(attachment.type);
    typeCounts[type] = (typeCounts[type] ?? 0) + 1;
  }

  return {
    total: attachments.length,
    withContentDigest: attachments.filter((attachment) => attachment.contentDigest !== undefined)
      .length,
    withSizeBytes: attachments.filter((attachment) => attachment.sizeBytes !== undefined).length,
    totalSizeBytes: attachments.reduce(
      (total, attachment) =>
        typeof attachment.sizeBytes === "number" ? total + attachment.sizeBytes : total,
      0
    ),
    referencedByResultCount: attachments.filter(
      (attachment) => attachment.referencedByResultUuid !== undefined
    ).length,
    typeCounts
  };
}
