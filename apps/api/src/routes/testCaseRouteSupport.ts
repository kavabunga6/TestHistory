import { buildTestCaseSummaries, type Launch } from "@testhistory/domain";
import type { AuthTokenScope, ProjectRole } from "@testhistory/contracts";
import type { FastifyRequest } from "fastify";
import type { AppStore, TestCaseRecord, TestCaseWorkflowStatus } from "../store.js";
import { authorizeProjectVisibilityRead, hasProjectAuthSignals } from "./project-auth.js";
import type { HistoryPoint } from "./testCaseHistory.js";

export type HistoryQuery = {
  projectId?: string;
  limit?: number | string;
  cursor?: string;
};

export type HistoryCompareQuery = HistoryQuery & {
  baseResultUuid?: string;
  targetResultUuid?: string;
  includeUnchanged?: boolean | string;
};

export type HistoryComparePermissionAuditQuery = HistoryQuery & {
  baseResultUuid?: string;
  targetResultUuid?: string;
};

export type HistoryComparePermissionAuditInvariantQuery = HistoryComparePermissionAuditQuery;

export type HistoryComparePermissionAuditPersistedInvariantQuery =
  HistoryComparePermissionAuditInvariantQuery;

export type TestCaseListQuery = {
  projectId?: string;
  limit?: number | string;
  cursor?: string;
  offset?: number | string;
  q?: string;
  search?: string;
  status?: Launch["results"][number]["status"];
  workflowStatus?: TestCaseWorkflowStatus;
  tag?: string;
  sort?: string;
  order?: "asc" | "desc";
};

export type HistoryPage = {
  limit: number;
  cursor: string | null;
  offset: number;
  returned: number;
  total: number;
  nextCursor: string | null;
  hasMore: boolean;
};

export type TestCasePatch = {
  allureId?: string;
  workflowStatus?: TestCaseWorkflowStatus;
  tags?: string[];
  layer?: string;
  description?: string;
  customFields?: Record<string, string>;
  members?: string[];
  links?: Array<{ name?: string; url: string; type?: string }>;
  issues?: string[];
  testKeys?: string[];
  relations?: string[];
  scenario?: string;
  expectedResult?: string;
};

const defaultHistoryLimit = 100;
export const maxHistoryLimit = 500;
const defaultListLimit = 100;
export const maxListLimit = 500;
export const historyCompareReadScope = "test-cases:read";
const testCaseReadScope: AuthTokenScope = "test-cases:read";
export const testCaseWriteScope: AuthTokenScope = "test-cases:write";
export const testCaseWriteRoles: readonly ProjectRole[] = ["owner", "maintainer", "editor"];
export const unsafePermissionAuditInvariantMarkers = [
  "Bearer",
  "token=",
  "Authorization",
  "storageKey",
  "signedUrl",
  "storage://",
  "minio://",
  "blob://",
  "C:\\",
  "Downloads",
  "secret"
];

export function findScopedLaunches(store: AppStore, projectId?: string): Launch[] {
  return Array.from(store.launches.values()).filter(
    (launch) => projectId === undefined || launch.projectId === projectId
  );
}

export function authorizeTestCaseReadQuery(
  store: AppStore,
  request: FastifyRequest,
  projectId: string | undefined
) {
  if (projectId !== undefined) {
    const project = store.projects.get(projectId);
    if (project === undefined) {
      return { statusCode: 404, body: { message: "Project not found" } };
    }
    const denial = authorizeProjectVisibilityRead(request, project, testCaseReadScope);
    if (denial !== undefined) {
      return { statusCode: 403, body: denial };
    }
    return undefined;
  }

  if (!hasProjectAuthSignals(request)) {
    return undefined;
  }

  const firstProject = store.projects.values().next().value;
  if (firstProject === undefined) {
    return undefined;
  }
  const denial = authorizeProjectVisibilityRead(request, firstProject, testCaseReadScope);
  if (denial?.message.includes("API token") || denial?.message.includes("Missing required")) {
    return { statusCode: 403, body: denial };
  }

  return undefined;
}

export function filterTestCaseReadLaunches(
  store: AppStore,
  request: FastifyRequest,
  launches: Launch[]
): Launch[] {
  if (!hasProjectAuthSignals(request)) {
    return launches;
  }

  return launches.filter((launch) => {
    const project = store.projects.get(launch.projectId);
    return (
      project !== undefined &&
      authorizeProjectVisibilityRead(request, project, testCaseReadScope) === undefined
    );
  });
}

export function enrichTestCaseSummary(
  store: AppStore,
  summary: ReturnType<typeof buildTestCaseSummaries>[number]
) {
  const record = store.testCases.get(summary.id);
  return record === undefined ? summary : { ...summary, testCase: record };
}

export function applyTestCasePatch(record: TestCaseRecord, patch: TestCasePatch) {
  if (patch.allureId !== undefined) {
    record.allureId = patch.allureId;
  }
  if (patch.workflowStatus !== undefined) {
    record.workflowStatus = patch.workflowStatus;
  }
  if (patch.tags !== undefined) {
    record.tags = unique(patch.tags);
  }
  if (patch.layer !== undefined) {
    record.layer = patch.layer;
  }
  if (patch.description !== undefined) {
    record.description = patch.description;
  }
  if (patch.customFields !== undefined) {
    record.customFields = patch.customFields;
  }
  if (patch.members !== undefined) {
    record.members = unique(patch.members);
  }
  if (patch.links !== undefined) {
    record.links = patch.links;
  }
  if (patch.issues !== undefined) {
    record.issues = unique(patch.issues);
  }
  if (patch.testKeys !== undefined) {
    record.testKeys = unique(patch.testKeys);
  }
  if (patch.relations !== undefined) {
    record.relations = unique(patch.relations);
  }
  if (patch.scenario !== undefined) {
    record.scenario = patch.scenario;
  }
  if (patch.expectedResult !== undefined) {
    record.expectedResult = patch.expectedResult;
  }
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values)).sort((left, right) => left.localeCompare(right));
}

export function parseHistoryPagination(
  query: HistoryQuery
): { limit: number; offset: number } | string {
  const limit = query.limit === undefined ? defaultHistoryLimit : Number(query.limit);
  if (!Number.isInteger(limit) || limit < 1 || limit > maxHistoryLimit) {
    return `limit must be an integer between 1 and ${maxHistoryLimit}`;
  }

  if (query.cursor === undefined) {
    return { limit, offset: 0 };
  }

  const offset = Number(query.cursor);
  if (!Number.isInteger(offset) || offset < 0) {
    return "cursor must be a non-negative integer offset";
  }

  return { limit, offset };
}

export function parseListPagination(
  query: TestCaseListQuery
): { limit: number; offset: number } | string {
  const limit = query.limit === undefined ? defaultListLimit : Number(query.limit);
  if (!Number.isInteger(limit) || limit < 1 || limit > maxListLimit) {
    return `limit must be an integer between 1 and ${maxListLimit}`;
  }

  const offsetCandidate = query.cursor ?? query.offset;
  if (offsetCandidate === undefined) {
    return { limit, offset: 0 };
  }

  const offset = Number(offsetCandidate);
  if (!Number.isInteger(offset) || offset < 0) {
    return "cursor/offset must be a non-negative integer offset";
  }

  return { limit, offset };
}

export function paginate<T>(items: T[], limit: number, offset: number) {
  const boundedOffset = Math.min(offset, items.length);
  const pageItems = items.slice(boundedOffset, boundedOffset + limit);
  const nextOffset = boundedOffset + pageItems.length;
  const nextCursor = nextOffset < items.length ? String(nextOffset) : null;
  const metadata: HistoryPage = {
    limit,
    cursor: boundedOffset > 0 ? String(boundedOffset) : null,
    offset: boundedOffset,
    returned: pageItems.length,
    total: items.length,
    nextCursor,
    hasMore: nextCursor !== null
  };

  return { items: pageItems, metadata };
}

export function paginateHistory(points: HistoryPoint[], limit: number, offset: number) {
  const boundedOffset = Math.min(offset, points.length);
  const items = points.slice(boundedOffset, boundedOffset + limit);
  const nextOffset = boundedOffset + items.length;
  const nextCursor = nextOffset < points.length ? String(nextOffset) : null;
  const metadata: HistoryPage = {
    limit,
    cursor: boundedOffset > 0 ? String(boundedOffset) : null,
    offset: boundedOffset,
    returned: items.length,
    total: points.length,
    nextCursor,
    hasMore: nextCursor !== null
  };

  return { items, metadata };
}

export function matchesTestCaseFilters(
  summary: ReturnType<typeof enrichTestCaseSummary>,
  query: TestCaseListQuery
): boolean {
  if (query.status !== undefined && summary.lastStatus !== query.status) {
    return false;
  }

  const metadata = "testCase" in summary ? summary.testCase : undefined;
  if (query.workflowStatus !== undefined && metadata?.workflowStatus !== query.workflowStatus) {
    return false;
  }
  if (query.tag !== undefined && metadata?.tags.includes(query.tag) !== true) {
    return false;
  }

  const needle = (query.q ?? query.search)?.trim().toLowerCase();
  if (!needle) {
    return true;
  }

  return [
    summary.id,
    summary.name,
    summary.fullName,
    summary.lastStatus,
    ...(summary.historyIds ?? []),
    metadata?.allureId,
    metadata?.workflowStatus,
    ...(metadata?.tags ?? []),
    ...(metadata?.issues ?? []),
    ...(metadata?.testKeys ?? [])
  ].some((value) => value?.toLowerCase().includes(needle));
}

export function compareTestCases(sort = "lastSeenAt", order: "asc" | "desc" = "desc") {
  return (
    left: ReturnType<typeof enrichTestCaseSummary>,
    right: ReturnType<typeof enrichTestCaseSummary>
  ) => {
    const direction = order === "asc" ? 1 : -1;
    const valueOrder = compareValues(testCaseSortValue(left, sort), testCaseSortValue(right, sort));
    return valueOrder !== 0 ? valueOrder * direction : left.id.localeCompare(right.id);
  };
}

function testCaseSortValue(
  summary: ReturnType<typeof enrichTestCaseSummary>,
  sort: string
): string | number {
  switch (sort) {
    case "name":
      return summary.name;
    case "lastStatus":
      return summary.lastStatus;
    case "passRate":
      return summary.passRate;
    case "flakyScore":
      return summary.flakyScore;
    case "totalResults":
      return summary.totalResults;
    case "lastSeenAt":
    default:
      return summary.lastSeenAt ?? "";
  }
}

function compareValues(left: string | number, right: string | number): number {
  if (typeof left === "number" && typeof right === "number") {
    return left - right;
  }

  return String(left).localeCompare(String(right));
}
