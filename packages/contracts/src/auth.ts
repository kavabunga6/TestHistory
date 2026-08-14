export type AuthTokenScope =
  | "mcp:discover"
  | "projects:read"
  | "projects:write"
  | "launches:read"
  | "launches:write"
  | "uploads:read"
  | "uploads:write"
  | "results:read"
  | "results:write"
  | "test-cases:read"
  | "test-cases:write"
  | "artifacts:read"
  | "artifacts:write"
  | "analytics:read"
  | "dashboards:read"
  | "dashboards:write"
  | "defects:read"
  | "defects:write"
  | "quarantine:write"
  | "settings:read"
  | "settings:write"
  | "exports:read"
  | "security:audit:read"
  | "quality-gates:evaluate";

export type ProjectRole = "owner" | "maintainer" | "editor" | "viewer" | "ci";

export type ProjectPermission =
  | "project.read"
  | "project.manage"
  | "launch.read"
  | "launch.create"
  | "launch.update"
  | "result.read"
  | "result.mutate"
  | "test-case.read"
  | "test-case.mutate"
  | "artifact.read"
  | "artifact.upload"
  | "analytics.read"
  | "defect.read"
  | "defect.mutate"
  | "quarantine.mutate"
  | "settings.read"
  | "settings.manage"
  | "token.manage"
  | "export.read"
  | "security-audit.read"
  | "quality-gate.evaluate";

export type AuthenticatedPrincipal = {
  subject: string;
  tokenId?: string;
  scopes: AuthTokenScope[];
  projectRoles: Record<string, ProjectRole>;
};

export type PermissionDeniedReason =
  | "missing_token"
  | "invalid_token"
  | "insufficient_scope"
  | "project_access_denied"
  | "permission_denied";

export type PermissionDeniedError = {
  error: "permission_denied";
  message: string;
  reason: PermissionDeniedReason;
  requiredScopes?: AuthTokenScope[];
  requiredRoles?: ProjectRole[];
  requiredPermissions?: ProjectPermission[];
  projectId?: string;
  resource?: {
    type: "project" | "launch" | "test-case" | "test-result" | "artifact" | "analytics" | "defect";
    id?: string;
  };
  traceId?: string;
};
