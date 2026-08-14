import type { ApiState } from "./apiCoreTypes.js";
import type { PermissionDeniedError } from "./apiPermissionTypes.js";

export const m5DeniedPermissionDeniedError: PermissionDeniedError = {
  error: "permission_denied",
  message: "Доступ к проекту закрыт",
  reason: "project_access_denied",
  requiredScopes: ["projects:read", "launches:read", "artifacts:read"],
  requiredRoles: ["viewer"],
  requiredPermissions: ["project.read", "launch.read", "artifact.read", "test-case.mutate"],
  projectId: "project-internal-7421",
  resource: {
    type: "project",
    id: "launch-internal-8421"
  },
  traceId: "trace-internal-9421"
};

export const m5DeniedApiState: ApiState = {
  loading: false,
  denied: m5DeniedPermissionDeniedError
};
