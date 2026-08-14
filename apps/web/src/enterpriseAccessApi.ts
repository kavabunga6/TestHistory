import { getJson, requestJson } from "./apiHttp.js";

export type EnterpriseRole = "owner" | "maintainer" | "editor" | "viewer" | "ci";

export type OidcProviderRead = {
  id: string;
  name: string;
  issuer: string;
  clientId: string;
  clientSecretEnvVar: string;
  scopes: string[];
  defaultRole: EnterpriseRole;
  enabled: boolean;
  updatedAt: string;
};

export type EnterpriseAccessRead = {
  kind: "enterprise-access";
  projectId: string;
  oidcProviders: OidcProviderRead[];
  scimProvisioning?: {
    enabled: boolean;
    tokenPrefix: string;
    defaultRole: EnterpriseRole;
    updatedAt: string;
    lastUsedAt?: string;
  };
  scimUsers: number;
};

export type OidcProviderInput = {
  name: string;
  issuer: string;
  clientId: string;
  clientSecretEnvVar: string;
  defaultRole: EnterpriseRole;
};

export function loadEnterpriseAccess(projectId: string) {
  return getJson<EnterpriseAccessRead>(
    `/api/v1/projects/${encodeURIComponent(projectId)}/enterprise-access`
  );
}

export function createOidcProvider(projectId: string, input: OidcProviderInput) {
  return requestJson<{ provider: OidcProviderRead }>(
    `/api/v1/projects/${encodeURIComponent(projectId)}/enterprise-access/oidc`,
    jsonRequest("POST", input)
  );
}

export function toggleOidcProvider(projectId: string, providerId: string, enabled: boolean) {
  return requestJson<{ provider: OidcProviderRead }>(
    `/api/v1/projects/${encodeURIComponent(projectId)}/enterprise-access/oidc/${encodeURIComponent(providerId)}`,
    jsonRequest("PATCH", { enabled })
  );
}

export function discoverOidcProvider(projectId: string, providerId: string) {
  return requestJson<{ discovery: { issuer: string } }>(
    `/api/v1/projects/${encodeURIComponent(projectId)}/enterprise-access/oidc/${encodeURIComponent(providerId)}/discover`,
    { method: "POST" }
  );
}

export function rotateScimToken(projectId: string, defaultRole: EnterpriseRole) {
  return requestJson<{
    secret: string;
    endpoint: string;
    provisioning: EnterpriseAccessRead["scimProvisioning"];
  }>(
    `/api/v1/projects/${encodeURIComponent(projectId)}/enterprise-access/scim/token`,
    jsonRequest("POST", { defaultRole })
  );
}

function jsonRequest(method: string, body: unknown): RequestInit {
  return {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  };
}
