import type {
  ApiTokenScope,
  ApiTokenStatus,
  CustomFieldMapping,
  IntegrationLinkProvider,
  ProjectApiToken,
  ProjectArtifactRetention,
  ProjectMember,
  ProjectMemberStatus,
  ProjectRole,
  ProjectSettings,
  ProjectSettingsAccess,
  RetentionPolicy,
  VisibilityPolicy
} from "./projectSettingsTypes.js";
export type * from "./projectSettingsTypes.js";
export { roleLabels, tokenScopeLabels } from "./projectSettingsTypes.js";
export const demoProjectSettings: ProjectSettings = {
  project: {
    id: "project-1",
    key: "WS",
    name: "Web Sandbox",
    visibility: "private"
  },
  owners: ["Анна QA", "Platform Admin"],
  members: [
    {
      email: "anna.qa@example.test",
      id: "user-anna",
      lastActive: "сегодня, 12:10",
      name: "Анна QA",
      role: "owner",
      source: "manual",
      status: "active"
    },
    {
      email: "checkout-lead@example.test",
      id: "user-checkout",
      lastActive: "сегодня, 11:42",
      name: "Лид Checkout",
      role: "maintainer",
      source: "sso",
      status: "active"
    },
    {
      email: "ci-regression@example.test",
      id: "svc-ci",
      lastActive: "3 мин назад",
      name: "CI регрессия",
      role: "ci",
      source: "token",
      status: "active"
    },
    {
      email: "observer@example.test",
      id: "user-observer",
      lastActive: "вчера, 18:20",
      name: "Наблюдатель",
      role: "viewer",
      source: "scim",
      status: "active"
    }
  ],
  apiTokens: [
    {
      createdAt: "30 мая, 05:40",
      expiresAt: "30 августа, 05:40",
      id: "tok-live-regression",
      lastUsedAt: "3 мин назад",
      name: "Загрузка регрессии",
      owner: "CI регрессия",
      prefix: "th_live_83f4",
      scopes: ["launches:write", "results:write", "artifacts:read"],
      status: "active"
    },
    {
      createdAt: "28 мая, 15:22",
      expiresAt: "28 июня, 15:22",
      id: "tok-analytics-read",
      lastUsedAt: "сегодня, 10:14",
      name: "Экспорт аналитики",
      owner: "Лид Checkout",
      prefix: "th_live_71aa",
      scopes: ["launches:read", "results:read", "exports:read"],
      status: "active"
    }
  ],
  visibilityPolicies: [
    {
      description: "Скрывает параметры с паролями, токенами, storage refs и signed URL.",
      id: "redact-sensitive",
      label: "Редакция чувствительных данных",
      mode: "enabled",
      owner: "Security"
    },
    {
      description:
        "История сравнений доступна участникам проекта и сервисным токенам с project scope.",
      id: "history-compare",
      label: "История и сравнение результатов",
      mode: "limited",
      owner: "QA Platform"
    },
    {
      description: "Сырые payload, локальные пути и диагностические токены не отображаются в UI.",
      id: "raw-payloads",
      label: "Raw payload и системные ссылки",
      mode: "blocked",
      owner: "Platform"
    }
  ],
  integrationProviders: [
    {
      baseUrl: "https://jira.example.test/browse/",
      enabled: true,
      encodeSuffix: true,
      id: "jira-defects",
      name: "Дефекты Jira",
      preset: "jira",
      previewValue: "AUTH-912",
      source: { kind: "issue", matchMode: "all", name: "issue" },
      suffixTemplate: "{value}"
    },
    {
      baseUrl: "https://testrail.example.test/index.php?/cases/view/",
      enabled: true,
      encodeSuffix: true,
      id: "testrail-cases",
      name: "Кейсы TestRail",
      preset: "testrail",
      previewValue: "1042",
      source: { kind: "testKey", matchMode: "all", name: "tms" },
      suffixTemplate: "{value}"
    },
    {
      baseUrl: "https://docs.example.test/requirements/",
      enabled: false,
      encodeSuffix: true,
      id: "requirements-custom",
      name: "Требования",
      preset: "custom",
      previewValue: "REQ-84",
      source: { kind: "customField", matchMode: "regex", name: "Requirement", regex: "REQ-\\d+" },
      suffixTemplate: "{value}"
    }
  ],
  retentionPolicies: [
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
  ],
  artifactRetention: {
    attachmentRetentionDays: 14,
    cleanupGraceDays: 3,
    compressRetainedTextArtifacts: true,
    deleteBinaryArtifactsAfterRetention: true,
    retentionPolicies: []
  },
  customFieldMappings: [
    {
      fallback: "unknown",
      field: "owner",
      id: "owner",
      required: true,
      source: "label:owner"
    },
    {
      fallback: "normal",
      field: "severity",
      id: "severity",
      required: true,
      source: "label:severity"
    },
    {
      fallback: "default",
      field: "team",
      id: "team",
      required: false,
      source: "custom_field:Team"
    }
  ]
};

export function emptyProjectSettings(project: {
  id: string;
  key?: string | undefined;
  name?: string | undefined;
}): ProjectSettings {
  return {
    project: {
      id: project.id,
      key: project.key ?? project.id,
      name: project.name ?? project.key ?? project.id,
      visibility: "private"
    },
    owners: [],
    members: [],
    apiTokens: [],
    visibilityPolicies: [],
    integrationProviders: [],
    retentionPolicies: [],
    artifactRetention: {
      attachmentRetentionDays: 0,
      cleanupGraceDays: 0,
      compressRetainedTextArtifacts: false,
      deleteBinaryArtifactsAfterRetention: false,
      retentionPolicies: []
    },
    customFieldMappings: []
  };
}

export function buildProviderPreview(provider: IntegrationLinkProvider): string {
  return buildProviderLink(provider, provider.previewValue);
}

export function buildProviderLink(provider: IntegrationLinkProvider, value: string): string {
  const suffix = provider.suffixTemplate.replaceAll("{value}", value);
  return `${provider.baseUrl}${provider.encodeSuffix ? encodeURIComponent(suffix) : suffix}`;
}

export function resolveIssueTrackerLink(
  providers: IntegrationLinkProvider[],
  value: string
): string | undefined {
  const provider = providers.find(
    (candidate) =>
      candidate.enabled &&
      (candidate.source.kind === "issue" ||
        (candidate.source.kind === "label" && candidate.preset === "jira"))
  );

  return provider === undefined ? undefined : buildProviderLink(provider, value);
}

type ApiProjectReadModel = {
  id: string;
  key: string;
  name: string;
};

type ApiProjectAccessSettingsReadModel = {
  kind: "project-access-settings";
  project: {
    id: string;
    key: string;
    name: string;
    visibility: ProjectSettings["project"]["visibility"];
  };
  memberships: Array<{
    id: string;
    displayName: string;
    subject: string;
    email?: string;
    role: ProjectRole;
    source: ProjectMember["source"];
    status: ProjectMemberStatus;
    lastActiveAt?: string;
  }>;
  apiTokens: Array<{
    id: string;
    name: string;
    prefix: string;
    ownerSubject: string;
    status: ApiTokenStatus;
    scopes: ApiTokenScope[];
    createdAt: string;
    lastUsedAt?: string;
    expiresAt?: string;
  }>;
  visibilityPolicies: VisibilityPolicy[];
  integrationProviders: Array<Omit<IntegrationLinkProvider, "previewValue">>;
  customFieldMappings: CustomFieldMapping[];
};

type ApiProjectArtifactSettingsReadModel = {
  kind: "project-artifact-settings";
  projectId: string;
  retention: ProjectArtifactRetention;
  retentionPolicies?: RetentionPolicy[];
};

type ApiTokenCreateResponse = {
  secret: string;
  token: ApiProjectAccessSettingsReadModel["apiTokens"][number];
};

export async function loadProjectSettingsFromApi(projectId?: string): Promise<ProjectSettings> {
  const project =
    projectId !== undefined
      ? { id: projectId }
      : (await getProjectSettingsJson<ApiProjectReadModel[]>("/api/v1/projects"))[0];
  if (project === undefined) {
    throw new Error("Нет доступных проектов. Сначала создайте проект.");
  }

  const payload = await getProjectSettingsJson<ApiProjectAccessSettingsReadModel>(
    `/api/v1/projects/${encodeURIComponent(project.id)}/settings/access`,
    {
      headers: projectSettingsHeaders(project.id, "settings:read")
    }
  );
  const artifactPayload = await getProjectSettingsJson<ApiProjectArtifactSettingsReadModel>(
    `/api/v1/projects/${encodeURIComponent(project.id)}/settings/artifacts`,
    {
      headers: projectSettingsHeaders(project.id, "settings:read")
    }
  );

  return mapApiProjectSettings(payload, {
    ...artifactPayload.retention,
    retentionPolicies:
      artifactPayload.retentionPolicies ?? artifactPayload.retention.retentionPolicies ?? []
  });
}

export async function loadIntegrationLinkProvidersFromApi(
  projectId?: string
): Promise<IntegrationLinkProvider[]> {
  const project =
    projectId !== undefined
      ? { id: projectId }
      : (await getProjectSettingsJson<ApiProjectReadModel[]>("/api/v1/projects"))[0];
  if (project === undefined) {
    return [];
  }

  const payload = await getProjectSettingsJson<ApiProjectAccessSettingsReadModel>(
    `/api/v1/projects/${encodeURIComponent(project.id)}/settings/access`,
    { headers: projectSettingsHeaders(project.id, "settings:read") }
  );

  return payload.integrationProviders.map((provider) => ({
    ...provider,
    previewValue:
      provider.preset === "testrail" ? "1042" : provider.preset === "custom" ? "REQ-84" : "AUTH-912"
  }));
}

export async function createProjectSettingsApiToken(input: {
  projectId: string;
  name: string;
  ownerSubject: string;
  scopes: ApiTokenScope[];
  expiresAt: string;
}): Promise<{ secret: string; token: ProjectApiToken }> {
  const payload = await getProjectSettingsJson<ApiTokenCreateResponse>(
    `/api/v1/projects/${encodeURIComponent(input.projectId)}/settings/access/tokens`,
    {
      body: JSON.stringify({
        expiresAt: normalizeTokenExpiry(input.expiresAt),
        name: input.name,
        ownerSubject: input.ownerSubject,
        scopes: input.scopes
      }),
      headers: {
        ...projectSettingsHeaders(input.projectId, "settings:write"),
        "content-type": "application/json"
      },
      method: "POST"
    }
  );

  return {
    secret: payload.secret,
    token: mapApiToken(payload.token)
  };
}

export async function revokeProjectSettingsApiToken(
  projectId: string,
  tokenId: string
): Promise<ProjectApiToken> {
  const payload = await getProjectSettingsJson<{ token: ApiTokenCreateResponse["token"] }>(
    `/api/v1/projects/${encodeURIComponent(
      projectId
    )}/settings/access/tokens/${encodeURIComponent(tokenId)}`,
    {
      headers: projectSettingsHeaders(projectId, "settings:write"),
      method: "DELETE"
    }
  );

  return mapApiToken(payload.token);
}

export async function saveProjectAccessSettings(
  settings: ProjectSettings
): Promise<ProjectSettings> {
  const payload = await getProjectSettingsJson<ApiProjectAccessSettingsReadModel>(
    `/api/v1/projects/${encodeURIComponent(settings.project.id)}/settings/access`,
    {
      body: JSON.stringify({
        customFieldMappings: settings.customFieldMappings,
        integrationProviders: settings.integrationProviders.map(
          ({ previewValue: _previewValue, ...provider }) => provider
        ),
        memberships: settings.members.map((member) => ({
          displayName: member.name,
          email: member.email,
          id: member.id,
          role: member.role,
          source: member.source,
          status: member.status,
          subject: member.subject ?? member.email
        })),
        visibility: settings.project.visibility,
        visibilityPolicies: settings.visibilityPolicies
      }),
      headers: {
        ...projectSettingsHeaders(settings.project.id, "settings:write"),
        "content-type": "application/json"
      },
      method: "PATCH"
    }
  );

  return mapApiProjectSettings(payload, settings.artifactRetention);
}

export async function saveProjectArtifactSettings(
  projectId: string,
  retention: ProjectArtifactRetention
): Promise<ProjectArtifactRetention> {
  const payload = await getProjectSettingsJson<ApiProjectArtifactSettingsReadModel>(
    `/api/v1/projects/${encodeURIComponent(projectId)}/settings/artifacts`,
    {
      body: JSON.stringify(retention),
      headers: {
        ...projectSettingsHeaders(projectId, "settings:write"),
        "content-type": "application/json"
      },
      method: "PATCH"
    }
  );

  return {
    ...payload.retention,
    retentionPolicies: payload.retentionPolicies ?? payload.retention.retentionPolicies ?? []
  };
}

function mapApiProjectSettings(
  payload: ApiProjectAccessSettingsReadModel,
  artifactRetention: ProjectArtifactRetention
): ProjectSettings {
  return {
    apiTokens: payload.apiTokens.map(mapApiToken),
    artifactRetention: {
      ...artifactRetention,
      retentionPolicies:
        artifactRetention.retentionPolicies.length > 0
          ? artifactRetention.retentionPolicies
          : demoProjectSettings.retentionPolicies
    },
    customFieldMappings: payload.customFieldMappings,
    integrationProviders: payload.integrationProviders.map((provider) => ({
      ...provider,
      previewValue:
        provider.preset === "testrail"
          ? "1042"
          : provider.preset === "custom"
            ? "REQ-84"
            : "AUTH-912"
    })),
    members: payload.memberships.map((member) => ({
      email: member.email ?? member.subject,
      id: member.id,
      lastActive: member.lastActiveAt ?? "нет данных",
      name: member.displayName,
      role: member.role,
      source: member.source,
      status: member.status,
      subject: member.subject
    })),
    owners: payload.memberships
      .filter((member) => member.role === "owner" && member.status === "active")
      .map((member) => member.displayName),
    project: payload.project,
    retentionPolicies:
      artifactRetention.retentionPolicies.length > 0
        ? artifactRetention.retentionPolicies
        : demoProjectSettings.retentionPolicies,
    visibilityPolicies: payload.visibilityPolicies
  };
}

function mapApiToken(
  token: ApiProjectAccessSettingsReadModel["apiTokens"][number]
): ProjectApiToken {
  return {
    createdAt: token.createdAt,
    expiresAt: token.expiresAt ?? "без срока",
    id: token.id,
    lastUsedAt: token.lastUsedAt ?? "не использовался",
    name: token.name,
    owner: token.ownerSubject,
    prefix: token.prefix,
    scopes: token.scopes,
    status: token.status
  };
}

function projectSettingsHeaders(projectId: string, scope: "settings:read" | "settings:write") {
  const token = getStoredSessionToken();
  return {
    ...(token !== undefined ? { authorization: `Bearer ${token}` } : {}),
    "x-testhistory-actor-id": resolveProjectSettingsActorId(),
    "x-testhistory-project-scope": projectId,
    "x-testhistory-scopes": scope
  };
}

export function getProjectSettingsAccess(
  settings: ProjectSettings,
  actorId = resolveProjectSettingsActorId()
): ProjectSettingsAccess {
  if (resolveCurrentUserRole() === "admin") {
    return {
      actorId,
      role: "owner",
      canManageTokens: true,
      canReadSettings: true,
      canWriteSettings: true,
      state: "write"
    };
  }

  const member = settings.members.find(
    (item) =>
      item.status === "active" &&
      (item.id === actorId || item.email === actorId || item.subject === actorId)
  );
  const role = member?.role;
  const canReadSettings = role === "owner" || role === "maintainer";
  const canWriteSettings = role === "owner";

  return {
    actorId,
    ...(role !== undefined ? { role } : {}),
    canManageTokens: canWriteSettings,
    canReadSettings,
    canWriteSettings,
    state: canWriteSettings ? "write" : canReadSettings ? "read-only" : "denied"
  };
}

function getStoredSessionToken(): string | undefined {
  try {
    return globalThis.localStorage?.getItem("testhistory.sessionToken") ?? undefined;
  } catch {
    return undefined;
  }
}

function resolveCurrentUserRole(): string | undefined {
  try {
    return globalThis.localStorage?.getItem("testhistory.userRole") ?? undefined;
  } catch {
    return undefined;
  }
}

export function resolveProjectSettingsActorId(): string {
  try {
    const configured = globalThis.localStorage?.getItem("testhistory.actorId")?.trim();
    if (configured !== undefined && configured.length > 0) {
      return configured;
    }
  } catch {
    // localStorage may be unavailable in server-side rendering or locked-down browsers.
  }

  return "project-owner";
}

function normalizeTokenExpiry(value: string): string {
  const now = Date.now();
  if (value.includes("30")) {
    return new Date(now + 30 * 24 * 60 * 60 * 1000).toISOString();
  }
  if (value.includes("180")) {
    return new Date(now + 180 * 24 * 60 * 60 * 1000).toISOString();
  }
  if (Number.isNaN(Date.parse(value))) {
    return new Date(now + 90 * 24 * 60 * 60 * 1000).toISOString();
  }

  return value;
}

async function getProjectSettingsJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    throw new Error(`${url} returned ${response.status}`);
  }

  return (await response.json()) as T;
}
