import type { AuthTokenScope, ProjectRole } from "@testhistory/contracts";
import type {
  ProjectIssueTrackerIntegration,
  ProjectNotificationIntegration
} from "./integrations.js";

export type ProjectArtifactRetentionSettings = {
  attachmentRetentionDays: number;
  cleanupGraceDays: number;
  compressRetainedTextArtifacts: boolean;
  deleteBinaryArtifactsAfterRetention: boolean;
  retentionPolicies?: ProjectArtifactRetentionPolicy[];
  updatedAt?: string;
};

export type ProjectArtifactRetentionPolicy = {
  id: string;
  artifact: string;
  passedDays: number;
  failedDays: number;
  quarantinedDays: number;
  maxSizeMb: number;
};

export type ProjectMemberStatus = "active" | "invited" | "disabled";

export type ProjectMembership = {
  id: string;
  subject: string;
  displayName: string;
  email?: string;
  role: ProjectRole;
  source: "manual" | "sso" | "scim" | "token";
  status: ProjectMemberStatus;
  createdAt: string;
  updatedAt: string;
  lastActiveAt?: string;
};

export type ProjectApiTokenStatus = "active" | "expired" | "revoked";

export type ProjectApiTokenRecord = {
  id: string;
  name: string;
  prefix: string;
  fingerprint: string;
  secretHash: string;
  ownerSubject: string;
  createdBy: string;
  scopes: AuthTokenScope[];
  status: ProjectApiTokenStatus;
  createdAt: string;
  updatedAt: string;
  expiresAt?: string;
  lastUsedAt?: string;
  revokedAt?: string;
  revokedBy?: string;
};

export type ProjectVisibilityMode = "private" | "internal" | "public-demo";

export type ProjectVisibilityPolicy = {
  id: string;
  label: string;
  description: string;
  mode: "enabled" | "limited" | "blocked";
  owner: string;
  updatedAt: string;
};

export type ProjectIntegrationLinkProvider = {
  id: string;
  enabled: boolean;
  name: string;
  preset: "jira" | "youtrack" | "github" | "linear" | "testrail" | "custom";
  source: {
    kind:
      | "label"
      | "customField"
      | "issue"
      | "testKey"
      | "link"
      | "testCaseId"
      | "historyId"
      | "fullName"
      | "name";
    name?: string;
    matchMode: "first" | "all" | "regex";
    regex?: string;
  };
  baseUrl: string;
  suffixTemplate: string;
  encodeSuffix: boolean;
  updatedAt: string;
};

export type ProjectCustomFieldMapping = {
  id: string;
  field: string;
  source: string;
  fallback?: string;
  required: boolean;
  updatedAt: string;
};

export type ProjectCiIntegration = {
  id: string;
  name: string;
  provider: "gitlab" | "github" | "jenkins" | "teamcity" | "generic";
  enabled: boolean;
  secretPrefix: string;
  secretHash: string;
  secretCiphertext?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export type ProjectOidcProvider = {
  id: string;
  name: string;
  issuer: string;
  clientId: string;
  clientSecretEnvVar: string;
  scopes: string[];
  defaultRole: ProjectRole;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ProjectScimProvisioning = {
  enabled: boolean;
  tokenPrefix: string;
  tokenHash: string;
  defaultRole: ProjectRole;
  createdAt: string;
  updatedAt: string;
  lastUsedAt?: string;
};

export type ProjectAccessSettings = {
  schemaVersion: 1;
  visibility: ProjectVisibilityMode;
  memberships: ProjectMembership[];
  apiTokens: ProjectApiTokenRecord[];
  visibilityPolicies: ProjectVisibilityPolicy[];
  integrationProviders: ProjectIntegrationLinkProvider[];
  customFieldMappings: ProjectCustomFieldMapping[];
  ciIntegrations?: ProjectCiIntegration[];
  notificationIntegrations?: ProjectNotificationIntegration[];
  issueTrackerIntegrations?: ProjectIssueTrackerIntegration[];
  oidcProviders?: ProjectOidcProvider[];
  scimProvisioning?: ProjectScimProvisioning;
  updatedAt: string;
};

export type Project = {
  id: string;
  key: string;
  name: string;
  createdAt: string;
  artifactRetention?: ProjectArtifactRetentionSettings;
  accessSettings?: ProjectAccessSettings;
};
