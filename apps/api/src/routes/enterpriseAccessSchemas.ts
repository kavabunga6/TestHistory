const projectRoles = ["owner", "maintainer", "editor", "viewer", "ci"] as const;

export const projectParams = {
  type: "object",
  additionalProperties: false,
  required: ["projectId"],
  properties: { projectId: { type: "string", minLength: 1, maxLength: 200 } }
} as const;

export const providerParams = {
  type: "object",
  additionalProperties: false,
  required: ["projectId", "providerId"],
  properties: {
    projectId: { type: "string", minLength: 1, maxLength: 200 },
    providerId: { type: "string", minLength: 1, maxLength: 200 }
  }
} as const;

export const scimUserParams = {
  type: "object",
  additionalProperties: false,
  required: ["projectId", "userId"],
  properties: {
    projectId: { type: "string", minLength: 1, maxLength: 200 },
    userId: { type: "string", minLength: 1, maxLength: 200 }
  }
} as const;

const roleSchema = { type: "string", enum: projectRoles } as const;

export const oidcBodySchema = {
  type: "object",
  additionalProperties: false,
  required: ["name", "issuer", "clientId", "clientSecretEnvVar"],
  properties: {
    name: { type: "string", minLength: 1, maxLength: 200 },
    issuer: { type: "string", minLength: 1, maxLength: 2_000 },
    clientId: { type: "string", minLength: 1, maxLength: 300 },
    clientSecretEnvVar: { type: "string", minLength: 3, maxLength: 128 },
    scopes: {
      type: "array",
      maxItems: 20,
      items: { type: "string", minLength: 1, maxLength: 100 }
    },
    defaultRole: roleSchema,
    enabled: { type: "boolean" }
  }
} as const;

export const oidcPatchSchema = { ...oidcBodySchema, required: [] } as const;

export const scimTokenBodySchema = {
  type: "object",
  additionalProperties: false,
  properties: { defaultRole: roleSchema }
} as const;

export const scimListQuerySchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    startIndex: { type: "integer", minimum: 1 },
    count: { type: "integer", minimum: 1, maximum: 500 },
    filter: { type: "string", maxLength: 500 }
  }
} as const;

export const scimUserBodySchema = {
  type: "object",
  additionalProperties: true,
  required: ["userName"],
  properties: {
    userName: { type: "string", minLength: 1, maxLength: 320 },
    externalId: { type: "string", maxLength: 320 },
    displayName: { type: "string", maxLength: 320 },
    active: { type: "boolean" },
    emails: { type: "array", maxItems: 10, items: { type: "object", additionalProperties: true } },
    roles: { type: "array", maxItems: 10 }
  }
} as const;

export const scimPatchBodySchema = {
  type: "object",
  additionalProperties: true,
  properties: {
    Operations: {
      type: "array",
      maxItems: 20,
      items: { type: "object", additionalProperties: true }
    }
  }
} as const;
