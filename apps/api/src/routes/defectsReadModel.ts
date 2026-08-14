import { redactSensitiveText, type DefectClusterReadModel, type Launch } from "@testhistory/domain";
import type { Project } from "@testhistory/domain";
import type { FastifyRequest } from "fastify";
import type { AppStore } from "../store.js";
import { authorizeProjectScope } from "./project-auth.js";

export type DefectMuteProjectionQuery = {
  actorId?: string;
  launchId?: string;
  status?: "active" | "inactive";
  limit?: number | string;
  cursor?: string;
};

export type DefectListQuery = {
  projectId?: string;
  status?: "open" | "closed" | "resolved-ish" | "new" | "recurring";
  q?: string;
  search?: string;
  limit?: number | string;
  cursor?: string;
};

export type DefectMuteReplayInvariantQuery = {
  actorId?: string;
  limit?: number | string;
  cursor?: string;
};

export type DefectMuteReplayInvariantMaterializedQuery = DefectMuteReplayInvariantQuery;

type DefectMuteProjectionPage = {
  limit: number;
  cursor: string | null;
  offset: number;
  returned: number;
  total: number;
  nextCursor: string | null;
  hasMore: boolean;
};

export const defectMuteProjectionReadScope = "defects:read";
export const defaultProjectionLimit = 100;
export const maxProjectionLimit = 500;
export const unsafeReplayInvariantMarkers = [
  "Bearer",
  "token=",
  "Authorization",
  "storageKey",
  "signedUrl",
  "storage://",
  "minio://",
  "blob://",
  "C:\\",
  "Downloads"
];

export function authorizeDefectMuteProjectionRead(
  store: AppStore,
  request: FastifyRequest,
  projectId: string,
  actorId: string | undefined
) {
  const project = store.projects.get(projectId);
  if (project === undefined) {
    return defectMuteProjectionDenied(
      projectId,
      actorId,
      "project_scope_denied",
      "Actor is not allowed to read defect mute projection for this project"
    );
  }

  const denial = authorizeDefectMuteProjectionReadForProject(request, project);
  if (denial === undefined) {
    return undefined;
  }

  if (denial.message === `Missing required ${defectMuteProjectionReadScope} scope`) {
    return defectMuteProjectionDenied(
      projectId,
      actorId,
      "missing_scope",
      "Missing required defect projection read scope"
    );
  }
  if (denial.message === "API token is invalid") {
    return defectMuteProjectionDenied(projectId, actorId, "invalid_token", "API token is invalid");
  }

  return defectMuteProjectionDenied(
    projectId,
    actorId,
    "project_scope_denied",
    "Actor is not allowed to read defect mute projection for this project"
  );
}

export function selectDefectListLaunches(
  store: AppStore,
  projectIds: string[] | undefined
): Launch[] {
  const allowedProjects = projectIds === undefined ? undefined : new Set(projectIds);
  return Array.from(store.launches.values())
    .filter((launch) => allowedProjects === undefined || allowedProjects.has(launch.projectId))
    .sort((left, right) => {
      const createdAt = left.createdAt.localeCompare(right.createdAt);
      return createdAt === 0 ? left.id.localeCompare(right.id) : createdAt;
    }) as Launch[];
}

export function serializeDefectCluster(cluster: DefectClusterReadModel) {
  const status = cluster.state === "resolved-ish" ? "closed" : "open";
  return {
    id: cluster.id,
    status,
    lifecycleState: cluster.state,
    title: redactSensitiveText(cluster.signature.normalizedReason).split("\n")[0] ?? cluster.id,
    signature: {
      hash: cluster.signature.hash,
      reason: redactSensitiveText(cluster.signature.normalizedReason),
      sources: cluster.signature.sources
    },
    affectedTestIds: cluster.affectedTestIds,
    currentAffectedTestIds: cluster.currentAffectedTestIds,
    occurrenceCount: cluster.occurrenceCount,
    firstSeenAt: cluster.firstSeenAt,
    lastSeenAt: cluster.lastSeenAt,
    firstSeenLaunchId: cluster.firstSeenLaunchId,
    lastSeenLaunchId: cluster.lastSeenLaunchId,
    results: cluster.occurrences.map((occurrence) => ({
      launchId: occurrence.launchId,
      launchName: occurrence.launchName,
      launchCreatedAt: occurrence.launchCreatedAt,
      resultUuid: occurrence.resultUuid,
      testId: occurrence.testId,
      status: occurrence.status
    }))
  };
}

export function matchesDefectStatus(
  cluster: DefectClusterReadModel,
  status: DefectListQuery["status"]
): boolean {
  if (status === undefined) {
    return true;
  }

  if (status === "open") {
    return cluster.state !== "resolved-ish";
  }

  if (status === "closed" || status === "resolved-ish") {
    return cluster.state === "resolved-ish";
  }

  return cluster.state === status;
}

export function matchesDefectSearch(
  cluster: DefectClusterReadModel,
  query: string | undefined
): boolean {
  const needle = query?.trim().toLowerCase();
  if (!needle) {
    return true;
  }

  return [
    cluster.id,
    cluster.signature.hash,
    cluster.signature.normalizedReason,
    ...cluster.affectedTestIds,
    ...cluster.currentAffectedTestIds,
    ...cluster.occurrences.flatMap((occurrence) => [
      occurrence.launchId,
      occurrence.launchName,
      occurrence.resultUuid,
      occurrence.testId,
      occurrence.status
    ])
  ].some((value) => value.toLowerCase().includes(needle));
}

export function actorIdHeader(request: FastifyRequest): string | undefined {
  const [actorId] = parseHeaderList(request.headers["x-testhistory-actor-id"]);
  return actorId;
}

export function parseProjectionPagination(query: {
  limit?: number | string;
  cursor?: string;
}): { limit: number; offset: number } | string {
  const limit = query.limit === undefined ? defaultProjectionLimit : Number(query.limit);
  if (!Number.isInteger(limit) || limit < 1 || limit > maxProjectionLimit) {
    return `limit must be an integer between 1 and ${maxProjectionLimit}`;
  }

  const offset = query.cursor === undefined ? 0 : Number(query.cursor);
  if (!Number.isInteger(offset) || offset < 0) {
    return "cursor must be a non-negative integer offset";
  }

  return { limit, offset };
}

export function paginateProjection<T>(
  items: T[],
  limit: number,
  offset: number
): { metadata: DefectMuteProjectionPage; items: T[] } {
  const boundedOffset = Math.min(offset, items.length);
  const pageItems = items.slice(boundedOffset, boundedOffset + limit);
  const nextOffset = boundedOffset + pageItems.length;
  const nextCursor = nextOffset < items.length ? String(nextOffset) : null;

  return {
    metadata: {
      limit,
      cursor: boundedOffset === 0 ? null : String(boundedOffset),
      offset: boundedOffset,
      returned: pageItems.length,
      total: items.length,
      nextCursor,
      hasMore: nextCursor !== null
    },
    items: pageItems
  };
}

function authorizeDefectMuteProjectionReadForProject(request: FastifyRequest, project: Project) {
  const denial = authorizeProjectScope(request, project, defectMuteProjectionReadScope);
  if (denial === undefined) {
    return undefined;
  }

  const hasBearer = request.headers.authorization !== undefined;
  if (hasBearer && denial.message !== `Missing required ${defectMuteProjectionReadScope} scope`) {
    return defectMuteProjectionDenied(
      project.id,
      undefined,
      denial.message === "API token is invalid" ? "invalid_token" : "project_scope_denied",
      denial.message
    );
  }

  return denial;
}

function defectMuteProjectionDenied(
  projectId: string,
  actorId: string | undefined,
  reason: "invalid_token" | "missing_scope" | "project_scope_denied",
  message: string
) {
  return {
    kind: "defect-mute-projection",
    error: "PermissionDeniedError",
    message,
    requiredScopes: [defectMuteProjectionReadScope],
    projectId,
    ...(actorId !== undefined ? { actor: { type: "actor", actorId, scoped: true } } : {}),
    access: {
      scope: defectMuteProjectionReadScope,
      projectScoped: true,
      actorScoped: actorId !== undefined,
      mutation: false,
      redacted: true
    },
    availability: {
      status: "denied",
      reason,
      projectScoped: true,
      actorScoped: actorId !== undefined,
      redacted: true,
      partial: false,
      unavailable: []
    },
    redacted: true
  };
}

function parseHeaderList(value: string | string[] | undefined): string[] {
  const raw = Array.isArray(value) ? value.join(",") : (value ?? "");
  return raw
    .split(/[,\s]+/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}
