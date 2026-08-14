import {
  attachmentArray,
  attachmentPreviewPolicy,
  compactAttachmentPreview,
  compactLaunchIdentity,
  compactResult,
  rawRedactionMetadata,
  summarizeHistoryArray
} from "./mcpCompactReadModels.js";
import { paginateItems } from "./mcpPagination.js";
import { compactFailureStatuses } from "./mcpPreviewConstants.js";
import type { ResourceReadOptions } from "./mcpReadOptions.js";
import {
  arrayField,
  isApiStatusPayload,
  isRecord,
  omitKeys,
  pickDefined,
  stringField
} from "./mcpValueUtils.js";

export function summarizeLaunchRead(value: unknown, options: ResourceReadOptions): unknown {
  if (isApiStatusPayload(value) || !isRecord(value)) {
    return value;
  }

  if (options.includeRaw) {
    return {
      summary: buildLaunchSummary(value, options),
      ...rawRedactionMetadata()
    };
  }

  return buildLaunchSummary(value, options);
}

export function summarizeLaunchResultsRead(value: unknown, options: ResourceReadOptions): unknown {
  if (isApiStatusPayload(value) || !isRecord(value)) {
    return value;
  }

  const results = arrayField(value, "results");
  const resultPage = paginateItems(results, options);
  return {
    kind: "launch-results",
    compact: !options.includeRaw,
    launch: compactLaunchIdentity(value),
    totalResults: results.length,
    returnedResults: resultPage.items.length,
    omittedResults: resultPage.omittedAfter,
    page: resultPage.metadata,
    results: resultPage.items.map((result) => compactResult(result, options)),
    ...(options.includeRaw ? rawRedactionMetadata() : {})
  };
}

export function summarizeResultDetailRead(value: unknown, options: ResourceReadOptions): unknown {
  if (isApiStatusPayload(value) || !isRecord(value)) {
    return value;
  }

  return {
    kind: "launch-result",
    compact: !options.includeRaw,
    result: compactResult(value, { ...options, includeDetails: true }),
    ...(options.includeRaw ? rawRedactionMetadata() : {})
  };
}

export function summarizeAttachmentPreviewsRead(
  value: unknown,
  options: ResourceReadOptions
): unknown {
  if (isApiStatusPayload(value) || !isRecord(value)) {
    return value;
  }

  const attachments = attachmentArray(value);
  const page = paginateItems(attachments, options);
  return {
    kind: "attachment-previews",
    compact: true,
    result: pickDefined(value, [
      "launchId",
      "projectId",
      "uuid",
      "id",
      "testCaseId",
      "fullName",
      "name",
      "status"
    ]),
    totalAttachments: attachments.length,
    returnedAttachments: page.items.length,
    omittedAttachments: page.omittedAfter,
    page: page.metadata,
    attachments: page.items.map((attachment) => compactAttachmentPreview(attachment)),
    policy: attachmentPreviewPolicy()
  };
}

export function summarizeTestCaseRead(value: unknown, options: ResourceReadOptions): unknown {
  if (isApiStatusPayload(value) || !isRecord(value)) {
    return value;
  }

  const history = arrayField(value, "history");
  const base = omitKeys(value, ["history"]);
  return {
    kind: "test-case",
    compact: !options.includeRaw,
    testCase: base,
    history: summarizeHistoryArray(history, options),
    ...(options.includeRaw ? rawRedactionMetadata() : {})
  };
}

export function summarizeHistoryRead(value: unknown, options: ResourceReadOptions): unknown {
  if (isApiStatusPayload(value) || !Array.isArray(value)) {
    return value;
  }

  return {
    kind: "test-case-history",
    compact: !options.includeRaw,
    history: summarizeHistoryArray(value, options),
    ...(options.includeRaw ? rawRedactionMetadata() : {})
  };
}

function buildLaunchSummary(value: Record<string, unknown>, options: ResourceReadOptions) {
  const results = arrayField(value, "results");
  const failures = results.filter((result) =>
    compactFailureStatuses.has(stringField(result, "status"))
  );
  const failurePage = paginateItems(failures, options);
  const resultPage = paginateItems(results, options);

  return {
    kind: "launch",
    compact: !options.includeRaw,
    launch: compactLaunchIdentity(value),
    counters: value.counters,
    totalResults: results.length,
    failureCount: failures.length,
    failures: failurePage.items.map((result) => compactResult(result, options)),
    omittedFailures: failurePage.omittedAfter,
    page: failurePage.metadata,
    ...(options.includeDetails
      ? {
          results: resultPage.items.map((result) => compactResult(result, options)),
          omittedResults: resultPage.omittedAfter,
          resultsPage: resultPage.metadata
        }
      : {})
  };
}
