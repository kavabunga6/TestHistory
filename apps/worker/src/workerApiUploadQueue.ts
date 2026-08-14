import type {
  ApiUploadQueueFetch,
  ApiUploadQueueWorkerOptions,
  ApiUploadQueueWorkerResult
} from "./workerTypes.js";
import { isRecord } from "./workerValueUtils.js";

export async function processApiUploadQueue(
  options: ApiUploadQueueWorkerOptions
): Promise<ApiUploadQueueWorkerResult> {
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const limit = normalizeApiUploadQueueLimit(options.limit ?? 25);
  const maxJobs = normalizeApiUploadQueueLimit(options.maxJobs ?? limit);
  const baseUrl = normalizeApiBaseUrl(options.baseUrl);
  const headers = options.headers ?? {};
  const requestedLimit = Math.min(limit, maxJobs);

  try {
    const claimUrl = new URL("/api/v1/uploads/jobs/claim", baseUrl);
    const claimResponse = await fetchImpl(claimUrl, {
      method: "POST",
      headers: {
        ...headers,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        source: "chunked-session",
        limit: requestedLimit,
        workerId: options.workerId ?? "testhistory-api-upload-worker",
        ...(options.leaseMs !== undefined ? { leaseMs: options.leaseMs } : {})
      })
    });
    const queueResponse =
      claimResponse.ok || claimResponse.status !== 404
        ? claimResponse
        : await fetchLegacyApiUploadQueue(fetchImpl, baseUrl, headers, requestedLimit);
    if (!queueResponse.ok) {
      const body = await safeReadText(queueResponse);
      return {
        status: "failed",
        polledJobs: 0,
        processedJobs: 0,
        failedJobs: 1,
        jobIds: [],
        errors: [
          {
            status: queueResponse.status,
            message: `Upload queue polling failed${body.length > 0 ? `: ${body}` : ""}`
          }
        ]
      };
    }

    const queuePayload = await queueResponse.json();
    const items = parseApiUploadQueueItems(queuePayload).slice(0, maxJobs);
    if (items.length === 0) {
      return {
        status: "idle",
        polledJobs: 0,
        processedJobs: 0,
        failedJobs: 0,
        jobIds: [],
        errors: []
      };
    }

    let processedJobs = 0;
    const errors: ApiUploadQueueWorkerResult["errors"] = [];
    const jobIds: string[] = [];

    for (const item of items) {
      jobIds.push(item.jobId);
      const processUrl = new URL(item.processPath, baseUrl);
      try {
        const processResponse = await fetchImpl(processUrl, {
          method: "POST",
          headers: {
            ...headers,
            ...(item.claimToken !== undefined ? { "content-type": "application/json" } : {})
          },
          ...(item.claimToken !== undefined
            ? { body: JSON.stringify({ claimToken: item.claimToken }) }
            : {})
        });
        if (processResponse.ok) {
          processedJobs += 1;
          continue;
        }

        errors.push({
          jobId: item.jobId,
          status: processResponse.status,
          message: await safeReadText(processResponse)
        });
      } catch (error) {
        errors.push({
          jobId: item.jobId,
          message: error instanceof Error ? error.message : String(error)
        });
      }
    }

    return {
      status: errors.length === 0 ? "processed" : processedJobs > 0 ? "partial_failure" : "failed",
      polledJobs: items.length,
      processedJobs,
      failedJobs: errors.length,
      jobIds,
      errors
    };
  } catch (error) {
    return {
      status: "failed",
      polledJobs: 0,
      processedJobs: 0,
      failedJobs: 1,
      jobIds: [],
      errors: [
        {
          message: error instanceof Error ? error.message : String(error)
        }
      ]
    };
  }
}

function normalizeApiBaseUrl(baseUrl: string): URL {
  const normalized = baseUrl.trim();
  if (normalized.length === 0) {
    throw new Error("TESTHISTORY_API_URL must not be empty");
  }

  return new URL(normalized.endsWith("/") ? normalized : `${normalized}/`);
}

function normalizeApiUploadQueueLimit(limit: number): number {
  return Number.isInteger(limit) && limit > 0 ? Math.min(limit, 100) : 25;
}

function fetchLegacyApiUploadQueue(
  fetchImpl: ApiUploadQueueFetch,
  baseUrl: URL,
  headers: Record<string, string>,
  limit: number
): ReturnType<ApiUploadQueueFetch> {
  const queueUrl = new URL("/api/v1/uploads/jobs", baseUrl);
  queueUrl.searchParams.set("status", "queued");
  queueUrl.searchParams.set("source", "chunked-session");
  queueUrl.searchParams.set("limit", String(limit));

  return fetchImpl(queueUrl, {
    method: "GET",
    headers
  });
}

function parseApiUploadQueueItems(
  payload: unknown
): Array<{ jobId: string; processPath: string; claimToken?: string }> {
  if (!isRecord(payload) || !Array.isArray(payload.items)) {
    return [];
  }

  return payload.items.flatMap((item) => {
    if (!isRecord(item) || !isRecord(item.job) || !isRecord(item.links)) {
      return [];
    }

    const jobId = item.job.id;
    const processPath = item.links.process;
    const status = item.job.status;
    const source = isRecord(item.source) ? item.source.mode : undefined;
    const payloadAvailable = isRecord(item.source) ? item.source.payloadAvailable : undefined;
    const claimToken =
      isRecord(item.claim) && typeof item.claim.token === "string" ? item.claim.token : undefined;

    if (
      typeof jobId !== "string" ||
      typeof processPath !== "string" ||
      (status !== "queued" && !(status === "processing" && claimToken !== undefined)) ||
      source !== "chunked-session" ||
      payloadAvailable !== true
    ) {
      return [];
    }

    return [{ jobId, processPath, ...(claimToken !== undefined ? { claimToken } : {}) }];
  });
}

async function safeReadText(response: Pick<Response, "text">): Promise<string> {
  try {
    return await response.text();
  } catch {
    return "";
  }
}
