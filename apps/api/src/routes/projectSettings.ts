import { defaultArtifactPolicy, normalizeArtifactPolicy } from "@testhistory/artifacts";
import type { AuthTokenScope } from "@testhistory/contracts";
import type {
  SecurityAuditEvent,
  Project,
  ProjectAccessSettings,
  ProjectApiTokenRecord,
  ProjectArtifactRetentionSettings,
  ProjectCustomFieldMapping,
  ProjectIntegrationLinkProvider,
  ProjectMembership,
  ProjectVisibilityPolicy
} from "@testhistory/domain";
import { appendSecurityAuditEvent, createSecurityAuditEvent } from "@testhistory/domain";
import type { AppStore } from "../store.js";

export type ArtifactSettingsPatch = Partial<
  Pick<
    ProjectArtifactRetentionSettings,
    | "attachmentRetentionDays"
    | "cleanupGraceDays"
    | "compressRetainedTextArtifacts"
    | "deleteBinaryArtifactsAfterRetention"
    | "retentionPolicies"
  >
>;

export type AccessSettingsPatch = Partial<{
  visibility: ProjectAccessSettings["visibility"];
  memberships: ProjectMembership[];
  visibilityPolicies: ProjectVisibilityPolicy[];
  integrationProviders: ProjectIntegrationLinkProvider[];
  customFieldMappings: ProjectCustomFieldMapping[];
}>;

export type ApiTokenCreateRequest = {
  name: string;
  ownerSubject: string;
  scopes: AuthTokenScope[];
  expiresAt?: string;
};

export function defaultProjectArtifactRetentionSettings(
  updatedAt: string
): ProjectArtifactRetentionSettings {
  const policy = defaultArtifactPolicy();
  return {
    attachmentRetentionDays: policy.retentionDays,
    cleanupGraceDays: policy.cleanupGraceDays,
    compressRetainedTextArtifacts: true,
    deleteBinaryArtifactsAfterRetention: true,
    retentionPolicies: defaultRetentionPolicies(),
    updatedAt
  };
}

export function serializeProjectArtifactSettings(project: Project) {
  const effective =
    project.artifactRetention ?? defaultProjectArtifactRetentionSettings(project.createdAt);
  const normalizedPolicy = normalizeArtifactPolicy({
    ...defaultArtifactPolicy(),
    retentionDays: effective.attachmentRetentionDays,
    cleanupGraceDays: effective.cleanupGraceDays
  });

  return {
    kind: "project-artifact-settings",
    projectId: project.id,
    source: project.artifactRetention === undefined ? "default" : "project",
    retention: effective,
    retentionPolicies: effective.retentionPolicies ?? defaultRetentionPolicies(),
    effectivePolicy: normalizedPolicy,
    cleanup: {
      dryRunEndpoint: "/api/v1/artifacts/retention/preview",
      defaultRetentionDays: 14,
      stagedBeforeDelete: true,
      deleteBinaryArtifactsAfterRetention: effective.deleteBinaryArtifactsAfterRetention,
      compressRetainedTextArtifacts: effective.compressRetainedTextArtifacts
    }
  };
}

function defaultRetentionPolicies(): NonNullable<
  ProjectArtifactRetentionSettings["retentionPolicies"]
> {
  return [
    {
      artifact: "Скриншоты",
      failedDays: 90,
      id: "screenshots",
      maxSizeMb: 25,
      passedDays: 14,
      quarantinedDays: 120
    },
    {
      artifact: "Видео и trace",
      failedDays: 60,
      id: "video-trace",
      maxSizeMb: 250,
      passedDays: 7,
      quarantinedDays: 120
    },
    {
      artifact: "Логи и JSON",
      failedDays: 180,
      id: "logs-json",
      maxSizeMb: 100,
      passedDays: 30,
      quarantinedDays: 180
    }
  ];
}

export function serializeProjectAccessSettings(project: Project) {
  const settings = getProjectAccessSettings(project, project.createdAt);

  return {
    kind: "project-access-settings",
    project: {
      id: project.id,
      key: project.key,
      name: project.name,
      visibility: settings.visibility
    },
    schemaVersion: settings.schemaVersion,
    updatedAt: settings.updatedAt,
    memberships: settings.memberships,
    apiTokens: settings.apiTokens.map(serializeApiToken),
    visibilityPolicies: settings.visibilityPolicies,
    integrationProviders: settings.integrationProviders,
    customFieldMappings: settings.customFieldMappings,
    oidcProviders: settings.oidcProviders ?? [],
    scimProvisioning:
      settings.scimProvisioning === undefined
        ? undefined
        : {
            enabled: settings.scimProvisioning.enabled,
            tokenPrefix: settings.scimProvisioning.tokenPrefix,
            defaultRole: settings.scimProvisioning.defaultRole,
            createdAt: settings.scimProvisioning.createdAt,
            updatedAt: settings.scimProvisioning.updatedAt,
            lastUsedAt: settings.scimProvisioning.lastUsedAt
          }
  };
}

export async function appendStoreSecurityAuditEvents(
  store: AppStore,
  events: SecurityAuditEvent[]
) {
  for (const event of events) {
    const nextEvents = appendSecurityAuditEvent(store.securityAuditEvents, event);
    store.securityAuditEvents.splice(0, store.securityAuditEvents.length, ...nextEvents);
    if (store.driver === "postgres") {
      await store.repositories.securityAudit.append({
        ...event,
        createdAt: event.occurredAt,
        updatedAt: event.occurredAt,
        version: 1
      });
    }
  }
}

export function buildRoleChangedEvents(input: {
  actorId: string;
  nextMemberships: ProjectMembership[] | undefined;
  now: string;
  previousMemberships: ProjectMembership[];
  projectId: string;
  route: string;
}): SecurityAuditEvent[] {
  if (input.nextMemberships === undefined) {
    return [];
  }

  const previousBySubject = new Map(
    input.previousMemberships.map((membership) => [membership.subject, membership])
  );

  return input.nextMemberships
    .filter((membership) => {
      const previous = previousBySubject.get(membership.subject);
      return (
        previous === undefined ||
        previous.role !== membership.role ||
        previous.status !== membership.status
      );
    })
    .map((membership) =>
      createSecurityAuditEvent({
        actor: { type: "actor", actorId: input.actorId },
        metadata: {
          displayName: membership.displayName,
          nextRole: membership.role,
          previousRole: previousBySubject.get(membership.subject)?.role ?? null,
          status: membership.status
        },
        occurredAt: input.now,
        outcome: "allowed",
        projectId: input.projectId,
        request: {
          method: "PATCH",
          route: input.route
        },
        resource: {
          type: "project-membership",
          id: membership.subject,
          name: membership.displayName
        },
        type: "auth.role.changed"
      })
    );
}

export function getProjectAccessSettings(
  project: Project,
  updatedAt: string
): ProjectAccessSettings {
  if (project.accessSettings !== undefined) {
    return project.accessSettings;
  }

  return {
    apiTokens: [],
    customFieldMappings: [
      {
        field: "owner",
        id: "owner",
        required: true,
        source: "label:owner",
        updatedAt
      },
      {
        field: "severity",
        id: "severity",
        required: true,
        source: "label:severity",
        updatedAt
      }
    ],
    integrationProviders: [],
    memberships: [
      {
        createdAt: updatedAt,
        displayName: "Project owner",
        id: "bootstrap-owner",
        role: "owner",
        source: "manual",
        status: "active",
        subject: "project-owner",
        updatedAt
      }
    ],
    schemaVersion: 1,
    updatedAt,
    visibility: "private",
    visibilityPolicies: [
      {
        description: "Passwords, tokens, signed URLs, storage refs, and local paths stay redacted.",
        id: "redact-sensitive",
        label: "Sensitive data redaction",
        mode: "enabled",
        owner: "Security",
        updatedAt
      },
      {
        description: "Raw payloads are hidden from project UI and public API reads.",
        id: "raw-payloads",
        label: "Raw payload isolation",
        mode: "blocked",
        owner: "Platform",
        updatedAt
      }
    ]
  };
}

export function serializeApiToken(token: ProjectApiTokenRecord) {
  return {
    createdAt: token.createdAt,
    createdBy: token.createdBy,
    expiresAt: token.expiresAt,
    fingerprint: token.fingerprint,
    id: token.id,
    lastUsedAt: token.lastUsedAt,
    name: token.name,
    ownerSubject: token.ownerSubject,
    prefix: token.prefix,
    revokedAt: token.revokedAt,
    revokedBy: token.revokedBy,
    scopes: token.scopes,
    status: token.status,
    updatedAt: token.updatedAt
  };
}

export function validateApiTokenCreateRequest(body: ApiTokenCreateRequest): string | undefined {
  if (body.name.trim().length === 0) {
    return "name is required";
  }
  if (body.ownerSubject.trim().length === 0) {
    return "ownerSubject is required";
  }
  if (body.scopes.length === 0 || !body.scopes.every(isAuthTokenScope)) {
    return "scopes must contain known API scopes";
  }
  if (body.expiresAt !== undefined && Number.isNaN(Date.parse(body.expiresAt))) {
    return "expiresAt must be an ISO date time";
  }

  return undefined;
}

export function validateAccessSettingsPatch(body: AccessSettingsPatch): string | undefined {
  for (const membership of body.memberships ?? []) {
    if (membership.subject.trim().length === 0 || membership.displayName.trim().length === 0) {
      return "membership subject and displayName are required";
    }
  }
  for (const provider of body.integrationProviders ?? []) {
    const urlError = validateProviderBaseUrl(provider.baseUrl);
    if (urlError !== undefined) {
      return urlError;
    }
    if (!provider.suffixTemplate.includes("{value}")) {
      return "integration provider suffixTemplate must include {value}";
    }
    if (provider.source.matchMode === "regex" && provider.source.regex !== undefined) {
      try {
        new RegExp(provider.source.regex);
      } catch {
        return "integration provider regex must compile";
      }
    }
  }

  return undefined;
}

function validateProviderBaseUrl(baseUrl: string): string | undefined {
  try {
    const url = new URL(baseUrl);
    if (url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
      return "integration provider baseUrl must use https";
    }
    if (url.username.length > 0 || url.password.length > 0) {
      return "integration provider baseUrl must not include credentials";
    }
    if (/token|secret|signature|password|api[-_]?key/i.test(url.search)) {
      return "integration provider baseUrl must not include token-like query parameters";
    }
  } catch {
    return "integration provider baseUrl must be a valid URL";
  }

  return undefined;
}

function isAuthTokenScope(value: unknown): value is AuthTokenScope {
  return (
    typeof value === "string" &&
    [
      "mcp:discover",
      "projects:read",
      "projects:write",
      "launches:read",
      "launches:write",
      "uploads:read",
      "uploads:write",
      "results:read",
      "results:write",
      "test-cases:read",
      "test-cases:write",
      "artifacts:read",
      "artifacts:write",
      "analytics:read",
      "dashboards:read",
      "dashboards:write",
      "defects:read",
      "defects:write",
      "quarantine:write",
      "settings:read",
      "settings:write",
      "exports:read",
      "security:audit:read",
      "quality-gates:evaluate"
    ].includes(value)
  );
}

export function validateArtifactSettingsPatch(body: ArtifactSettingsPatch): string | undefined {
  if (
    body.attachmentRetentionDays !== undefined &&
    (!Number.isInteger(body.attachmentRetentionDays) ||
      body.attachmentRetentionDays < 1 ||
      body.attachmentRetentionDays > 3650)
  ) {
    return "attachmentRetentionDays must be an integer between 1 and 3650";
  }
  if (
    body.cleanupGraceDays !== undefined &&
    (!Number.isInteger(body.cleanupGraceDays) ||
      body.cleanupGraceDays < 0 ||
      body.cleanupGraceDays > 365)
  ) {
    return "cleanupGraceDays must be an integer between 0 and 365";
  }
  if (body.retentionPolicies !== undefined) {
    if (!Array.isArray(body.retentionPolicies)) {
      return "retentionPolicies must be an array";
    }
    for (const policy of body.retentionPolicies) {
      if (policy.id.trim().length === 0 || policy.artifact.trim().length === 0) {
        return "retention policy id and artifact are required";
      }
      for (const [field, value] of [
        ["passedDays", policy.passedDays],
        ["failedDays", policy.failedDays],
        ["quarantinedDays", policy.quarantinedDays]
      ] as const) {
        if (!Number.isInteger(value) || value < 0 || value > 3650) {
          return `retention policy ${field} must be an integer between 0 and 3650`;
        }
      }
      if (
        !Number.isInteger(policy.maxSizeMb) ||
        policy.maxSizeMb < 1 ||
        policy.maxSizeMb > 102400
      ) {
        return "retention policy maxSizeMb must be an integer between 1 and 102400";
      }
    }
  }

  return undefined;
}
