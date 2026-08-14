import type { AuthTokenScope, ProjectRole } from "@testhistory/contracts";
import type { Project } from "@testhistory/domain";
import type { FastifyRequest } from "fastify";
import { createHash } from "node:crypto";
import { getRequestUserPrincipal, trustedHeaderAuthEnabled } from "../requestAuthContext.js";

export type ProjectAuthDenial = {
  error: "PermissionDeniedError";
  message: string;
  projectId: string;
  redacted: true;
  requiredRoles?: ProjectRole[];
  requiredScopes: AuthTokenScope[];
};

const projectReadRoles: readonly ProjectRole[] = ["owner", "maintainer", "editor", "viewer", "ci"];

export function authorizeProjectScope(
  request: FastifyRequest,
  project: Project,
  requiredScope: AuthTokenScope
): ProjectAuthDenial | undefined {
  const principal = getRequestUserPrincipal(request);
  if (principal !== undefined) {
    if (principal.user.role === "admin") {
      return undefined;
    }

    const membership = principalMembership(project, principal.user.id, principal.user.email);
    if (membership === undefined) {
      return permissionDenied(
        "Actor is not allowed to access this project",
        project.id,
        requiredScope
      );
    }
    if (requiredScope.endsWith(":write") && membership.role === "viewer") {
      return permissionDenied(`Missing required ${requiredScope} scope`, project.id, requiredScope);
    }
    return undefined;
  }

  const bearerToken = parseBearerToken(request.headers.authorization);
  if (bearerToken !== undefined) {
    const now = new Date().toISOString();
    const token = project.accessSettings?.apiTokens.find(
      (item) => item.secretHash === hashApiTokenSecret(bearerToken)
    );
    if (token !== undefined) {
      if (token.status !== "active" || (token.expiresAt !== undefined && token.expiresAt <= now)) {
        return permissionDenied("API token is not active", project.id, requiredScope);
      }
      if (!token.scopes.includes(requiredScope)) {
        return permissionDenied(
          `Missing required ${requiredScope} scope`,
          project.id,
          requiredScope
        );
      }

      token.lastUsedAt = now;
      token.updatedAt = now;
      return undefined;
    }

    return permissionDenied("API token is invalid", project.id, requiredScope);
  }

  const scopes = parseHeaderList(request.headers["x-testhistory-scopes"]);
  const projectScopes = parseHeaderList(request.headers["x-testhistory-project-scope"]);
  if (!scopes.includes(requiredScope)) {
    return permissionDenied(`Missing required ${requiredScope} scope`, project.id, requiredScope);
  }
  if (
    !projectScopes.includes(project.id) &&
    !projectScopes.includes("*") &&
    !projectScopes.some((scope) => scope.toLowerCase() === project.key.toLowerCase())
  ) {
    return permissionDenied(
      "Actor is not allowed to access this project",
      project.id,
      requiredScope
    );
  }

  return undefined;
}

export function authorizeProjectVisibilityRead(
  request: FastifyRequest,
  project: Project,
  requiredScope: AuthTokenScope
): ProjectAuthDenial | undefined {
  if (!hasProjectAuthSignals(request)) {
    return requiresProjectAuth()
      ? permissionDenied(
          "Authentication is required to read this project",
          project.id,
          requiredScope
        )
      : undefined;
  }

  const scopeDenial = authorizeProjectScope(request, project, requiredScope);
  if (scopeDenial !== undefined) {
    return scopeDenial;
  }

  const principal = getRequestUserPrincipal(request);
  if (principal?.user.role === "admin" || request.headers.authorization !== undefined) {
    return undefined;
  }

  const visibility = project.accessSettings?.visibility ?? "private";
  if (visibility === "public-demo") {
    return undefined;
  }

  const actorId = actorIdHeader(request);
  if (visibility === "internal" && actorId !== undefined) {
    return undefined;
  }

  const membership =
    principal === undefined
      ? projectMemberships(project).find(
          (item) => item.subject === actorId && item.status === "active"
        )
      : principalMembership(project, principal.user.id, principal.user.email);
  if (membership !== undefined) {
    return undefined;
  }

  return {
    error: "PermissionDeniedError",
    message: "Actor is not allowed to read this project by visibility policy",
    projectId: project.id,
    redacted: true,
    ...(visibility === "private" ? { requiredRoles: [...projectReadRoles] } : {}),
    requiredScopes: [requiredScope]
  };
}

export function authorizeProjectMutation(
  request: FastifyRequest,
  project: Project,
  requiredScope: AuthTokenScope,
  allowedRoles: readonly ProjectRole[],
  message: string
): ProjectAuthDenial | undefined {
  if (!hasProjectAuthSignals(request)) {
    return requiresProjectAuth()
      ? {
          ...permissionDenied(message, project.id, requiredScope),
          requiredRoles: [...allowedRoles]
        }
      : undefined;
  }

  const scopeDenial = authorizeProjectScope(request, project, requiredScope);
  if (scopeDenial !== undefined) {
    return scopeDenial;
  }

  const principal = getRequestUserPrincipal(request);
  if (principal?.user.role === "admin" || request.headers.authorization !== undefined) {
    return undefined;
  }

  const actorId = actorIdHeader(request);
  const membership =
    principal === undefined
      ? projectMemberships(project).find(
          (item) => item.subject === actorId && item.status === "active"
        )
      : principalMembership(project, principal.user.id, principal.user.email);
  if (membership !== undefined && allowedRoles.includes(membership.role)) {
    return undefined;
  }

  return {
    error: "PermissionDeniedError",
    message,
    projectId: project.id,
    redacted: true,
    requiredRoles: [...allowedRoles],
    requiredScopes: [requiredScope]
  };
}

export function hasProjectAuthSignals(request: FastifyRequest): boolean {
  return (
    getRequestUserPrincipal(request) !== undefined ||
    request.headers.authorization !== undefined ||
    (trustedHeaderAuthEnabled() &&
      (parseHeaderList(request.headers["x-testhistory-actor-id"]).length > 0 ||
        parseHeaderList(request.headers["x-testhistory-project-scope"]).length > 0 ||
        parseHeaderList(request.headers["x-testhistory-scopes"]).length > 0))
  );
}

export function actorIdHeader(request: FastifyRequest): string | undefined {
  return (
    getRequestUserPrincipal(request)?.user.email ??
    parseHeaderList(request.headers["x-testhistory-actor-id"])[0]
  );
}

export function parseHeaderList(value: FastifyRequest["headers"][string]): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => parseHeaderList(item));
  }
  if (typeof value !== "string") {
    return [];
  }

  return value
    .split(/[,\s]+/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function parseBearerToken(value: FastifyRequest["headers"]["authorization"]): string | undefined {
  if (Array.isArray(value)) {
    return parseBearerToken(value[0]);
  }
  if (typeof value !== "string") {
    return undefined;
  }
  const match = /^Bearer\s+(.+)$/i.exec(value.trim());
  return match?.[1];
}

function hashApiTokenSecret(secret: string): string {
  return `sha256:${createHash("sha256").update(secret).digest("hex")}`;
}

function projectMemberships(
  project: Project
): Array<{ role: ProjectRole; status: string; subject: string }> {
  return (
    project.accessSettings?.memberships ?? [
      {
        role: "owner",
        status: "active",
        subject: "project-owner"
      }
    ]
  );
}

function principalMembership(project: Project, userId: string, email: string) {
  return projectMemberships(project).find(
    (item) =>
      item.status === "active" && (item.subject === userId || item.subject.toLowerCase() === email)
  );
}

function permissionDenied(
  message: string,
  projectId: string,
  requiredScope: AuthTokenScope
): ProjectAuthDenial {
  return {
    error: "PermissionDeniedError",
    message,
    projectId,
    redacted: true,
    requiredScopes: [requiredScope]
  };
}

export function requiresProjectAuth(): boolean {
  return (
    process.env.TESTHISTORY_REQUIRE_PROJECT_AUTH === "true" || process.env.NODE_ENV === "production"
  );
}
