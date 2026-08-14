import type { FastifyRequest } from "fastify";

import { getRequestUserPrincipal } from "../requestAuthContext.js";
import type { AppStore } from "../store.js";
import {
  authorizeProjectMutation,
  authorizeProjectScope,
  hasProjectAuthSignals,
  parseHeaderList,
  requiresProjectAuth
} from "./project-auth.js";
import type { Project } from "@testhistory/domain";

export const artifactRetentionReadScope = "artifacts:read";

export function authorizeArtifactRetentionRequest(
  request: FastifyRequest,
  store: AppStore,
  projectId: string | undefined,
  mutation: boolean
) {
  const requiredScope = mutation ? "artifacts:write" : artifactRetentionReadScope;
  if (projectId !== undefined) {
    const project = store.projects.get(projectId);
    if (project === undefined) {
      return undefined;
    }

    return mutation
      ? authorizeProjectMutation(
          request,
          project,
          requiredScope,
          ["owner", "maintainer"],
          "Actor is not allowed to execute artifact retention cleanup for this project"
        )
      : authorizeArtifactRetentionRead(request, project);
  }

  if (!hasProjectAuthSignals(request)) {
    return requiresProjectAuth()
      ? globalArtifactRetentionDenial(requiredScope, mutation)
      : undefined;
  }

  const principal = getRequestUserPrincipal(request);
  if (principal?.user.role === "admin") {
    return undefined;
  }

  const scopes = parseHeaderList(request.headers["x-testhistory-scopes"]);
  const projectScopes = parseHeaderList(request.headers["x-testhistory-project-scope"]);
  if (scopes.includes(requiredScope) && projectScopes.includes("*")) {
    return undefined;
  }

  return globalArtifactRetentionDenial(requiredScope, mutation);
}

export function authorizeArtifactRetentionRead(request: FastifyRequest, project: Project) {
  if (!hasProjectAuthSignals(request) && !requiresProjectAuth()) {
    return undefined;
  }

  const denial = authorizeProjectScope(request, project, artifactRetentionReadScope);
  if (denial === undefined) {
    return undefined;
  }

  return {
    ...denial,
    message:
      denial.message === `Missing required ${artifactRetentionReadScope} scope`
        ? "Missing required artifact preview retention read scope"
        : denial.message === "API token is invalid"
          ? denial.message
          : "Actor is not allowed to preview attachment retention for this project"
  };
}

function globalArtifactRetentionDenial(
  scope: "artifacts:read" | "artifacts:write",
  mutation: boolean
) {
  return {
    error: "PermissionDeniedError",
    message: mutation
      ? "Administrator access is required for global artifact retention cleanup"
      : "Administrator access is required for global artifact retention preview",
    redacted: true,
    requiredScopes: [scope]
  };
}
