import type { FastifyRequest } from "fastify";
import { type AppStore } from "../store.js";
import { authorizeProjectScope, requiresProjectAuth } from "./project-auth.js";

import {
  archiveStatusReadScopes,
  defaultArchiveDiagnosticLimit,
  defaultArchiveStatusLimit,
  defaultUploadJobQueueLimit,
  maxArchiveDiagnosticLimit,
  maxArchiveStatusLimit,
  maxUploadJobQueueLimit,
  type ArchiveDiagnosticsQuery,
  type ArchivePageMetadata,
  type ArchiveStatusQuery,
  type UploadJobQueueQuery
} from "./uploadTypes.js";

export function authorizeArchiveStatusRead(
  store: AppStore,
  request: FastifyRequest,
  projectId: string
) {
  const scopes = parseHeaderList(request.headers["x-testhistory-scopes"]);
  const projectScopes = parseHeaderList(request.headers["x-testhistory-project-scope"]);
  const actorId = actorIdHeader(request);
  const scopedReadRequested =
    scopes.length > 0 ||
    projectScopes.length > 0 ||
    actorId !== undefined ||
    request.headers.authorization !== undefined;

  if (!scopedReadRequested) {
    return requiresProjectAuth()
      ? archiveStatusDenied(
          projectId,
          actorId,
          "missing_scope",
          "Authentication is required to read archive status"
        )
      : undefined;
  }

  const denialReason = authorizeArchiveProjectScopes(store, request, projectId);
  if (denialReason === "missing_scope") {
    return archiveStatusDenied(
      projectId,
      actorId,
      "missing_scope",
      "Missing required archive status read scope"
    );
  }
  if (denialReason === "invalid_token") {
    return archiveStatusDenied(projectId, actorId, "invalid_token", "API token is invalid");
  }
  if (denialReason === "project_scope_denied") {
    return archiveStatusDenied(
      projectId,
      actorId,
      "project_scope_denied",
      "Actor is not allowed to read archive status for this project"
    );
  }

  return undefined;
}

export function authorizeArchiveDiagnosticReplayRead(
  store: AppStore,
  request: FastifyRequest,
  projectId: string
) {
  const scopes = parseHeaderList(request.headers["x-testhistory-scopes"]);
  const projectScopes = parseHeaderList(request.headers["x-testhistory-project-scope"]);
  const actorId = actorIdHeader(request);
  const scopedReadRequested =
    scopes.length > 0 ||
    projectScopes.length > 0 ||
    actorId !== undefined ||
    request.headers.authorization !== undefined;

  if (!scopedReadRequested) {
    return requiresProjectAuth()
      ? archiveDiagnosticReplayDenied(
          projectId,
          actorId,
          "missing_scope",
          "Authentication is required to read archive diagnostics"
        )
      : undefined;
  }

  const denialReason = authorizeArchiveProjectScopes(store, request, projectId);
  if (denialReason === "missing_scope") {
    return archiveDiagnosticReplayDenied(
      projectId,
      actorId,
      "missing_scope",
      "Missing required archive diagnostic replay read scope"
    );
  }
  if (denialReason === "invalid_token") {
    return archiveDiagnosticReplayDenied(
      projectId,
      actorId,
      "invalid_token",
      "API token is invalid"
    );
  }
  if (denialReason === "project_scope_denied") {
    return archiveDiagnosticReplayDenied(
      projectId,
      actorId,
      "project_scope_denied",
      "Actor is not allowed to read archive diagnostic replay for this project"
    );
  }

  return undefined;
}

export function authorizeArchiveDiagnosticReplayFixtureRead(
  store: AppStore,
  request: FastifyRequest,
  projectId: string
) {
  const scopes = parseHeaderList(request.headers["x-testhistory-scopes"]);
  const projectScopes = parseHeaderList(request.headers["x-testhistory-project-scope"]);
  const actorId = actorIdHeader(request);
  const scopedReadRequested =
    scopes.length > 0 ||
    projectScopes.length > 0 ||
    actorId !== undefined ||
    request.headers.authorization !== undefined;

  if (!scopedReadRequested) {
    return requiresProjectAuth()
      ? archiveDiagnosticReplayFixtureDenied(
          projectId,
          actorId,
          "missing_scope",
          "Authentication is required to read archive diagnostic fixtures"
        )
      : undefined;
  }

  const denialReason = authorizeArchiveProjectScopes(store, request, projectId);
  if (denialReason === "missing_scope") {
    return archiveDiagnosticReplayFixtureDenied(
      projectId,
      actorId,
      "missing_scope",
      "Missing required archive diagnostic replay fixture read scope"
    );
  }
  if (denialReason === "invalid_token") {
    return archiveDiagnosticReplayFixtureDenied(
      projectId,
      actorId,
      "invalid_token",
      "API token is invalid"
    );
  }
  if (denialReason === "project_scope_denied") {
    return archiveDiagnosticReplayFixtureDenied(
      projectId,
      actorId,
      "project_scope_denied",
      "Actor is not allowed to read archive diagnostic replay fixtures for this project"
    );
  }

  return undefined;
}

export function authorizeArchiveDiagnosticReplayMaterializedFixtureRead(
  store: AppStore,
  request: FastifyRequest,
  projectId: string,
  actorId: string | undefined
) {
  const scopes = parseHeaderList(request.headers["x-testhistory-scopes"]);
  const projectScopes = parseHeaderList(request.headers["x-testhistory-project-scope"]);
  const scopedReadRequested =
    scopes.length > 0 ||
    projectScopes.length > 0 ||
    actorId !== undefined ||
    request.headers.authorization !== undefined;

  if (!scopedReadRequested) {
    return requiresProjectAuth()
      ? archiveDiagnosticReplayMaterializedFixtureDenied(
          projectId,
          actorId,
          "missing_scope",
          "Authentication is required to read archive diagnostic materialized fixtures"
        )
      : undefined;
  }

  const denialReason = authorizeArchiveProjectScopes(store, request, projectId);
  if (denialReason === "missing_scope") {
    return archiveDiagnosticReplayMaterializedFixtureDenied(
      projectId,
      actorId,
      "missing_scope",
      "Missing required archive diagnostic replay materialized fixture read scope"
    );
  }
  if (denialReason === "invalid_token") {
    return archiveDiagnosticReplayMaterializedFixtureDenied(
      projectId,
      actorId,
      "invalid_token",
      "API token is invalid"
    );
  }
  if (denialReason === "project_scope_denied") {
    return archiveDiagnosticReplayMaterializedFixtureDenied(
      projectId,
      actorId,
      "project_scope_denied",
      "Actor is not allowed to read archive diagnostic replay materialized fixtures for this project"
    );
  }

  return undefined;
}

function authorizeArchiveProjectScopes(
  store: AppStore,
  request: FastifyRequest,
  projectId: string
): "invalid_token" | "missing_scope" | "project_scope_denied" | undefined {
  const project = store.projects.get(projectId);
  if (project === undefined) {
    return "project_scope_denied";
  }

  for (const scope of archiveStatusReadScopes) {
    const denial = authorizeProjectScope(request, project, scope);
    if (denial !== undefined) {
      if (denial.message === "API token is invalid") {
        return "invalid_token";
      }
      return denial.message.startsWith("Missing required")
        ? "missing_scope"
        : "project_scope_denied";
    }
  }

  return undefined;
}

function archiveStatusDenied(
  projectId: string,
  actorId: string | undefined,
  reason: "invalid_token" | "missing_scope" | "project_scope_denied",
  message: string
) {
  return {
    kind: "archive-upload-status",
    error: "PermissionDeniedError",
    message,
    requiredScopes: archiveStatusReadScopes,
    projectId,
    ...(actorId !== undefined ? { actor: { type: "actor", actorId, scoped: true } } : {}),
    access: archiveStatusAccess(actorId),
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

function archiveDiagnosticReplayDenied(
  projectId: string,
  actorId: string | undefined,
  reason: "invalid_token" | "missing_scope" | "project_scope_denied",
  message: string
) {
  return {
    kind: "archive-diagnostic-replay-summary-list",
    error: "PermissionDeniedError",
    message,
    requiredScopes: archiveStatusReadScopes,
    projectId,
    ...(actorId !== undefined ? { actor: { type: "actor", actorId, scoped: true } } : {}),
    access: archiveStatusAccess(actorId),
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

function archiveDiagnosticReplayFixtureDenied(
  projectId: string,
  actorId: string | undefined,
  reason: "invalid_token" | "missing_scope" | "project_scope_denied",
  message: string
) {
  return {
    kind: "archive-diagnostic-replay-fixture-list",
    error: "PermissionDeniedError",
    message,
    requiredScopes: archiveStatusReadScopes,
    projectId,
    ...(actorId !== undefined ? { actor: { type: "actor", actorId, scoped: true } } : {}),
    access: archiveStatusAccess(actorId),
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

function archiveDiagnosticReplayMaterializedFixtureDenied(
  projectId: string,
  actorId: string | undefined,
  reason: "invalid_token" | "missing_scope" | "project_scope_denied",
  message: string
) {
  return {
    kind: "archive-diagnostic-replay-fixture-materialized-list",
    error: "PermissionDeniedError",
    message,
    requiredScopes: archiveStatusReadScopes,
    projectId,
    ...(actorId !== undefined ? { actor: { type: "actor", actorId, scoped: true } } : {}),
    access: archiveStatusAccess(actorId),
    availability: {
      status: "denied",
      reason,
      projectScoped: true,
      actorScoped: actorId !== undefined,
      redacted: true,
      partial: false,
      unavailable: ["archive-diagnostic-replay-fixture-materialized-read"]
    },
    redacted: true
  };
}

export function archiveStatusAccess(actorId: string | undefined) {
  return {
    scope: "uploads:read",
    requiredScopes: archiveStatusReadScopes,
    projectScoped: true,
    actorScoped: actorId !== undefined,
    mutation: false,
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

export function actorIdHeader(request: FastifyRequest): string | undefined {
  const [actorId] = parseHeaderList(request.headers["x-testhistory-actor-id"]);
  return actorId;
}

export function parseArchiveStatusPagination(
  query: ArchiveStatusQuery
): { limit: number; offset: number } | string {
  return parseArchivePagination(
    query.limit,
    query.cursor,
    defaultArchiveStatusLimit,
    maxArchiveStatusLimit,
    "status"
  );
}

export function parseArchiveDiagnosticPagination(
  query: ArchiveDiagnosticsQuery | { limit?: number | string; cursor?: string }
): { limit: number; offset: number } | string {
  return parseArchivePagination(
    query.limit,
    query.cursor,
    defaultArchiveDiagnosticLimit,
    maxArchiveDiagnosticLimit,
    "diagnostics"
  );
}

export function parseUploadJobQueuePagination(
  query: UploadJobQueueQuery
): { limit: number; offset: number } | string {
  return parseArchivePagination(
    query.limit,
    query.cursor,
    defaultUploadJobQueueLimit,
    maxUploadJobQueueLimit,
    "upload job queue"
  );
}

export function parseArchivePagination(
  requestedLimit: number | string | undefined,
  requestedCursor: string | undefined,
  defaultLimit: number,
  maxLimit: number,
  label: string
): { limit: number; offset: number } | string {
  const limit = requestedLimit === undefined ? defaultLimit : Number(requestedLimit);
  if (!Number.isInteger(limit) || limit < 1 || limit > maxLimit) {
    return `${label} limit must be an integer between 1 and ${maxLimit}`;
  }

  if (requestedCursor === undefined) {
    return { limit, offset: 0 };
  }

  const offset = Number(requestedCursor);
  if (!Number.isInteger(offset) || offset < 0) {
    return `${label} cursor must be a non-negative integer offset`;
  }

  return { limit, offset };
}

export function paginate<T>(
  items: T[],
  limit: number,
  offset: number
): { metadata: ArchivePageMetadata; items: T[] } {
  const boundedOffset = Math.min(offset, items.length);
  const pageItems = items.slice(boundedOffset, boundedOffset + limit);
  const nextOffset = boundedOffset + pageItems.length;
  const nextCursor = nextOffset < items.length ? String(nextOffset) : null;

  return {
    metadata: {
      limit,
      cursor: boundedOffset > 0 ? String(boundedOffset) : null,
      offset: boundedOffset,
      returned: pageItems.length,
      total: items.length,
      nextCursor,
      hasMore: nextCursor !== null
    },
    items: pageItems
  };
}

export function redactDiagnosticText(text: string): string {
  return text
    .replace(/authorization:\s*bearer\s+[^\s,;]+/gi, "authorization: bearer [redacted]")
    .replace(/\b(token|secret|password|storageKey|signedUrl)=([^\s,;]+)/gi, "$1=[redacted]")
    .replace(/[A-Za-z]:[\\/][^\s,;]+/g, "[redacted-path]")
    .replace(/\/(?:home|users|var|tmp)\/[^\s,;]+/gi, "[redacted-path]")
    .slice(0, 500);
}
