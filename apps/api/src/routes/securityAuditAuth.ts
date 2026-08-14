import type { Project } from "@testhistory/domain";
import type { FastifyRequest } from "fastify";
import { authorizeProjectScope, parseHeaderList } from "./project-auth.js";

const securityAuditReadScope = "security:audit:read";

export function authorizeSecurityAuditRead(request: FastifyRequest, project: Project | string) {
  if (typeof project === "string") {
    const scopes = parseHeaderList(request.headers["x-testhistory-scopes"]);
    const projectScopes = parseHeaderList(request.headers["x-testhistory-project-scope"]);
    if (!scopes.includes(securityAuditReadScope)) {
      return {
        error: "PermissionDeniedError",
        message: "Missing required security audit read scope",
        requiredScopes: [securityAuditReadScope],
        projectId: project,
        redacted: true
      };
    }
    if (!projectScopes.includes(project) && !projectScopes.includes("*")) {
      return {
        error: "PermissionDeniedError",
        message: "Actor is not allowed to read security audit events for this project",
        requiredScopes: [securityAuditReadScope],
        projectId: project,
        redacted: true
      };
    }

    return undefined;
  }

  const denial = authorizeProjectScope(request, project, securityAuditReadScope);
  if (denial === undefined) {
    return undefined;
  }

  return {
    ...denial,
    message:
      denial.message === `Missing required ${securityAuditReadScope} scope`
        ? "Missing required security audit read scope"
        : denial.message === "API token is invalid"
          ? denial.message
          : "Actor is not allowed to read security audit events for this project"
  };
}

export function authorizeSecurityAuditExportEvaluation(
  request: FastifyRequest,
  project: Project,
  actorId: string
) {
  const readDenial = authorizeSecurityAuditRead(request, project);
  if (readDenial !== undefined) {
    return {
      ...readDenial,
      message:
        readDenial.message === "Missing required security audit read scope"
          ? "Missing required security audit export evaluation read scope"
          : readDenial.message === "API token is invalid"
            ? readDenial.message
            : "Actor is not allowed to evaluate security audit export policy for this project"
    };
  }

  const actorScopes = parseHeaderList(request.headers["x-testhistory-actor-id"]);
  if (!actorScopes.includes(actorId)) {
    return {
      error: "PermissionDeniedError",
      message: "Actor is not allowed to evaluate security audit export policy for this actorId",
      requiredScopes: [securityAuditReadScope],
      projectId: project.id,
      redacted: true
    };
  }

  return undefined;
}

export function authorizeSecurityAuditExportLifecycleReplay(
  request: FastifyRequest,
  project: Project,
  actorId: string
) {
  const readDenial = authorizeSecurityAuditRead(request, project);
  if (readDenial !== undefined) {
    return {
      ...readDenial,
      message:
        readDenial.message === "Missing required security audit read scope"
          ? "Missing required security audit export lifecycle replay read scope"
          : readDenial.message === "API token is invalid"
            ? readDenial.message
            : "Actor is not allowed to read security audit export lifecycle replay for this project"
    };
  }

  const actorScopes = parseHeaderList(request.headers["x-testhistory-actor-id"]);
  if (!actorScopes.includes(actorId)) {
    return {
      error: "PermissionDeniedError",
      message:
        "Actor is not allowed to read security audit export lifecycle replay for this actorId",
      requiredScopes: [securityAuditReadScope],
      projectId: project.id,
      redacted: true
    };
  }

  return undefined;
}

export function authorizeSecurityAuditExportLifecycleMaterializedRead(
  request: FastifyRequest,
  project: Project,
  actorId: string
) {
  const replayDenial = authorizeSecurityAuditExportLifecycleReplay(request, project, actorId);
  if (replayDenial === undefined) {
    return undefined;
  }

  return {
    ...replayDenial,
    kind: "security-audit-export-lifecycle-replay-invariant-materialized-read",
    message:
      replayDenial.message === "Missing required security audit export lifecycle replay read scope"
        ? "Missing required security audit export lifecycle materialized invariant read scope"
        : replayDenial.message === "API token is invalid"
          ? replayDenial.message
          : replayDenial.message ===
              "Actor is not allowed to read security audit export lifecycle replay for this project"
            ? "Actor is not allowed to read security audit export lifecycle materialized invariants for this project"
            : "Actor is not allowed to read security audit export lifecycle materialized invariants for this actorId",
    availability: {
      status: "denied" as const,
      reason:
        replayDenial.message ===
        "Missing required security audit export lifecycle replay read scope"
          ? "missing_scope"
          : replayDenial.message === "API token is invalid"
            ? "invalid_token"
            : replayDenial.message ===
                "Actor is not allowed to read security audit export lifecycle replay for this project"
              ? "project_scope_denied"
              : "actor_scope_denied",
      projectScoped: true,
      actorScoped: true,
      redacted: true,
      partial: false,
      unavailable: ["security-audit-export-lifecycle-replay-invariant-materialized-read"]
    }
  };
}
