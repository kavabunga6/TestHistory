export type ProjectRole = "owner" | "maintainer" | "editor" | "viewer" | "ci";

export type ProjectMemberStatus = "active" | "invited" | "disabled";

export type ApiTokenStatus = "active" | "expired" | "revoked";

export type LinkProviderPreset = "jira" | "youtrack" | "github" | "linear" | "testrail" | "custom";

export type LinkProviderSourceKind =
  | "label"
  | "customField"
  | "issue"
  | "testKey"
  | "link"
  | "testCaseId"
  | "historyId"
  | "fullName"
  | "name";

export type ProjectMember = {
  id: string;
  name: string;
  email: string;
  role: ProjectRole;
  source: "manual" | "sso" | "scim" | "token";
  status: ProjectMemberStatus;
  lastActive: string;
  subject?: string;
};

export type ApiTokenScope =
  | "launches:read"
  | "launches:write"
  | "uploads:read"
  | "uploads:write"
  | "results:read"
  | "results:write"
  | "artifacts:read"
  | "defects:read"
  | "defects:write"
  | "quarantine:write"
  | "settings:read"
  | "settings:write"
  | "exports:read"
  | "security:audit:read";

export type ProjectApiToken = {
  id: string;
  name: string;
  prefix: string;
  owner: string;
  status: ApiTokenStatus;
  scopes: ApiTokenScope[];
  createdAt: string;
  lastUsedAt: string;
  expiresAt: string;
};

export type VisibilityPolicy = {
  id: string;
  label: string;
  description: string;
  owner: string;
  mode: "enabled" | "limited" | "blocked";
};

export type IntegrationLinkProvider = {
  id: string;
  enabled: boolean;
  name: string;
  preset: LinkProviderPreset;
  source: {
    kind: LinkProviderSourceKind;
    name?: string;
    matchMode: "first" | "all" | "regex";
    regex?: string;
  };
  baseUrl: string;
  suffixTemplate: string;
  encodeSuffix: boolean;
  previewValue: string;
};

export type RetentionPolicy = {
  id: string;
  artifact: string;
  passedDays: number;
  failedDays: number;
  quarantinedDays: number;
  maxSizeMb: number;
};

export type CustomFieldMapping = {
  id: string;
  field: string;
  source: string;
  fallback: string;
  required: boolean;
};

export type ProjectSettings = {
  project: {
    id: string;
    key: string;
    name: string;
    visibility: "private" | "internal" | "public-demo";
  };
  owners: string[];
  members: ProjectMember[];
  apiTokens: ProjectApiToken[];
  visibilityPolicies: VisibilityPolicy[];
  integrationProviders: IntegrationLinkProvider[];
  retentionPolicies: RetentionPolicy[];
  artifactRetention: ProjectArtifactRetention;
  customFieldMappings: CustomFieldMapping[];
};

export type ProjectArtifactRetention = {
  attachmentRetentionDays: number;
  cleanupGraceDays: number;
  compressRetainedTextArtifacts: boolean;
  deleteBinaryArtifactsAfterRetention: boolean;
  retentionPolicies: RetentionPolicy[];
  updatedAt?: string;
};

export type ProjectSettingsAccess = {
  actorId: string;
  role?: ProjectRole;
  canReadSettings: boolean;
  canWriteSettings: boolean;
  canManageTokens: boolean;
  state: "denied" | "read-only" | "write";
};

export const roleLabels: Record<ProjectRole, string> = {
  ci: "CI",
  editor: "Редактор",
  maintainer: "Мейнтейнер",
  owner: "Владелец",
  viewer: "Наблюдатель"
};

export const tokenScopeLabels: Record<ApiTokenScope, string> = {
  "uploads:read": "Загрузки: чтение",
  "uploads:write": "Загрузки: запись",
  "artifacts:read": "Артефакты: чтение",
  "defects:read": "Дефекты: чтение",
  "defects:write": "Дефекты: запись",
  "exports:read": "Экспорт: чтение",
  "launches:read": "Запуски: чтение",
  "launches:write": "Запуски: запись",
  "quarantine:write": "Карантин: запись",
  "results:read": "Результаты: чтение",
  "results:write": "Результаты: запись",
  "security:audit:read": "Аудит: чтение",
  "settings:read": "Настройки: чтение",
  "settings:write": "Настройки: запись"
};
