import type { ApiProjectReadModel } from "./apiStateModels.js";
import type {
  SecurityAuditExportLifecycleInvariantApiState,
  SecurityAuditExportLifecycleReplayInvariantRead
} from "./apiTypes.js";
import { getJson } from "./apiHttp.js";
import { PermissionDeniedHttpError, getSafeDeniedMessage } from "./apiPermissions.js";

export async function loadSecurityAuditExportLifecycleInvariantState(): Promise<SecurityAuditExportLifecycleInvariantApiState> {
  try {
    const projects = await getJson<ApiProjectReadModel[]>("/api/v1/projects");
    const project = projects[0];
    if (project === undefined) {
      return {
        data: emptySecurityAuditExportLifecycleInvariants("no-api-project", "no-api-actor"),
        state: "empty"
      };
    }

    const actorId = "security-audit-actor";
    const data = await getJson<SecurityAuditExportLifecycleReplayInvariantRead>(
      `/api/v1/projects/${encodeURIComponent(
        project.id
      )}/security/audit/export/lifecycle/replay/invariants?actorId=${encodeURIComponent(
        actorId
      )}&limit=3`,
      {
        headers: {
          "x-testhistory-scopes": "security:audit:read",
          "x-testhistory-project-scope": project.id,
          "x-testhistory-actor-id": actorId
        }
      }
    );

    return {
      data,
      state:
        data.replay.requestCount === 0 && data.items.length === 0
          ? "empty"
          : data.page.hasMore || !securityAuditExportLifecycleInvariantsPassed(data)
            ? "partial"
            : "ready"
    };
  } catch (error) {
    if (error instanceof PermissionDeniedHttpError) {
      return {
        message: getSafeDeniedMessage(error.denied),
        state: "denied"
      };
    }

    return {
      message: error instanceof Error ? error.message : String(error),
      state: "error"
    };
  }
}

function emptySecurityAuditExportLifecycleInvariants(
  projectId: string,
  actorId: string
): SecurityAuditExportLifecycleReplayInvariantRead {
  return {
    kind: "security-audit-export-lifecycle-replay-invariants",
    project: {
      id: projectId,
      scoped: true
    },
    actor: {
      id: actorId,
      scoped: true
    },
    access: {
      scope: "security:audit:read",
      projectScoped: true,
      actorScoped: true,
      mutation: false,
      redacted: true
    },
    replay: {
      status: "empty",
      eventCount: 0,
      requestCount: 0,
      duplicateCount: 0,
      ignoredCount: 0,
      projectionDigest: "empty",
      appendOnly: true,
      deterministic: true,
      recomputable: true,
      rawEventsExposed: false,
      rawRequestsExposed: false,
      providerNeutral: true
    },
    execution: {
      exportStarted: false,
      providerIntegration: false,
      providerEndpointContacted: false,
      credentialsResolved: false,
      signedUrlsIssued: false,
      destinationResolved: false
    },
    page: {
      limit: 3,
      cursor: null,
      offset: 0,
      returned: 0,
      total: 0,
      nextCursor: null,
      hasMore: false
    },
    summary: {
      totalRequests: 0,
      requested: 0,
      evaluated: 0,
      approved: 0,
      denied: 0,
      cancelled: 0,
      expired: 0
    },
    invariants: {
      appendOnly: true,
      deterministic: true,
      projectScoped: true,
      actorScoped: true,
      redacted: true,
      mutationFree: true,
      providerNeutral: true,
      rawEventsExposed: false,
      rawRequestsExposed: false,
      providerEndpointsContacted: false,
      signedUrlsIssued: false,
      secretsExposed: false
    },
    items: []
  };
}

function securityAuditExportLifecycleInvariantsPassed(
  data: SecurityAuditExportLifecycleReplayInvariantRead
): boolean {
  return (
    data.replay.appendOnly &&
    data.replay.deterministic &&
    data.replay.recomputable &&
    !data.replay.rawEventsExposed &&
    !data.replay.rawRequestsExposed &&
    data.replay.providerNeutral &&
    !data.execution.exportStarted &&
    !data.execution.providerIntegration &&
    !data.execution.providerEndpointContacted &&
    !data.execution.credentialsResolved &&
    !data.execution.signedUrlsIssued &&
    !data.execution.destinationResolved &&
    data.invariants.appendOnly &&
    data.invariants.deterministic &&
    data.invariants.projectScoped &&
    data.invariants.actorScoped &&
    data.invariants.redacted &&
    data.invariants.mutationFree &&
    data.invariants.providerNeutral &&
    !data.invariants.rawEventsExposed &&
    !data.invariants.rawRequestsExposed &&
    !data.invariants.providerEndpointsContacted &&
    !data.invariants.signedUrlsIssued &&
    !data.invariants.secretsExposed
  );
}
