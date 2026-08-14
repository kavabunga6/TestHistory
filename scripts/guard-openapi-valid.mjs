import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

const workspace = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const openApiPath = path.join(workspace, "docs/openapi/openapi.yaml");
const apiDocsPath = path.join(workspace, "docs/api.md");
const source = readFileSync(openApiPath, "utf8");
const apiDocs = readFileSync(apiDocsPath, "utf8");
const document = YAML.parse(source);
const endpointCatalog = buildEndpointCatalog(document);

assertObject(document, "OpenAPI document");

if (typeof document.openapi !== "string" || !document.openapi.startsWith("3.")) {
  throw new Error("Static OpenAPI document must declare openapi 3.x");
}

if (document.info?.title !== "TestHistory API") {
  throw new Error("Static OpenAPI title must be TestHistory API");
}

if (typeof document.info?.version !== "string" || document.info.version.length === 0) {
  throw new Error("Static OpenAPI document must declare info.version");
}

assertObject(document.paths, "OpenAPI paths");
assertObject(document.components, "OpenAPI components");
assertObject(document.components.securitySchemes, "OpenAPI components.securitySchemes");

const bearerAuth = document.components.securitySchemes.bearerAuth;
assertObject(bearerAuth, "OpenAPI bearerAuth security scheme");
if (bearerAuth.type !== "http" || bearerAuth.scheme !== "bearer") {
  throw new Error("OpenAPI bearerAuth must be an HTTP bearer security scheme");
}

if (!hasBearerSecurity(document.security)) {
  throw new Error("Static OpenAPI document must declare root bearerAuth security");
}

const operationIds = new Map();
let operationCount = 0;
const publicOperationIds = new Set([
  "getHealth",
  "getSwaggerUi",
  "getRuntimeOpenApiJson",
  "getCapabilities",
  "registerUser",
  "loginUser",
  "validateQuery",
  "receiveCiWebhook"
]);

for (const [routePath, pathItem] of Object.entries(document.paths)) {
  if (!routePath.startsWith("/")) {
    throw new Error(`OpenAPI path must start with "/": ${routePath}`);
  }
  assertObject(pathItem, `OpenAPI path item ${routePath}`);

  for (const [method, operation] of Object.entries(pathItem)) {
    if (!isHttpMethod(method)) {
      continue;
    }
    operationCount += 1;
    assertObject(operation, `${method.toUpperCase()} ${routePath}`);

    const operationId = operation.operationId;
    if (typeof operationId !== "string" || operationId.length === 0) {
      throw new Error(`${method.toUpperCase()} ${routePath} must declare operationId`);
    }
    const previous = operationIds.get(operationId);
    if (previous !== undefined) {
      throw new Error(
        `Duplicate operationId ${operationId}: ${previous} and ${method.toUpperCase()} ${routePath}`
      );
    }
    operationIds.set(operationId, `${method.toUpperCase()} ${routePath}`);
    if (typeof operation.description !== "string" || operation.description.trim().length < 20) {
      throw new Error(
        `${method.toUpperCase()} ${routePath} must declare a useful operation description`
      );
    }

    const catalogEntry = `\`${method.toUpperCase()} ${routePath}\` - \`${operationId}\``;
    if (!apiDocs.includes(catalogEntry)) {
      throw new Error(`docs/api.md endpoint catalog is missing ${catalogEntry}`);
    }

    assertObject(operation.responses, `${method.toUpperCase()} ${routePath} responses`);
    if (Object.keys(operation.responses).length === 0) {
      throw new Error(`${method.toUpperCase()} ${routePath} must declare at least one response`);
    }
    if (!Object.keys(operation.responses).some((status) => /^2\d\d$/.test(status))) {
      throw new Error(`${method.toUpperCase()} ${routePath} must declare a 2xx success response`);
    }
    for (const [status, response] of Object.entries(operation.responses)) {
      assertObject(response, `${method.toUpperCase()} ${routePath} response ${status}`);
      if (typeof response.description !== "string" || response.description.trim().length === 0) {
        throw new Error(
          `${method.toUpperCase()} ${routePath} response ${status} must declare description`
        );
      }
      const jsonContent = response.content?.["application/json"];
      if (jsonContent !== undefined && jsonContent?.schema === undefined) {
        throw new Error(
          `${method.toUpperCase()} ${routePath} response ${status} application/json must declare schema`
        );
      }
    }

    const isPublic = publicOperationIds.has(operationId);
    if (isPublic) {
      if (!Array.isArray(operation.security) || operation.security.length !== 0) {
        throw new Error(
          `${method.toUpperCase()} ${routePath} is public and must explicitly declare security: []`
        );
      }
    } else if (Array.isArray(operation.security) && operation.security.length === 0) {
      throw new Error(
        `${method.toUpperCase()} ${routePath} disables bearerAuth but is not in the public operation allowlist`
      );
    }
  }
}

if (operationCount === 0) {
  throw new Error("Static OpenAPI document must contain at least one operation");
}

if (!apiDocs.endsWith(`${endpointCatalog}\n`)) {
  throw new Error(
    "docs/api.md endpoint catalog is stale; run `npm run api:docs:catalog` after OpenAPI path, tag, or operationId changes."
  );
}

console.log(
  `OpenAPI static validation passed: ${Object.keys(document.paths).length} paths, ${operationCount} operations.`
);

function assertObject(value, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
}

function isHttpMethod(value) {
  return ["get", "post", "put", "patch", "delete", "head", "options", "trace"].includes(value);
}

function hasBearerSecurity(security) {
  return (
    Array.isArray(security) &&
    security.some(
      (entry) => entry !== null && typeof entry === "object" && Array.isArray(entry.bearerAuth)
    )
  );
}

function buildEndpointCatalog(document) {
  const groups = new Map();

  for (const [routePath, pathItem] of Object.entries(document.paths)) {
    for (const [method, operation] of Object.entries(pathItem)) {
      if (!isHttpMethod(method)) {
        continue;
      }

      const tag = operation.tags?.[0] ?? "untagged";
      const entries = groups.get(tag) ?? [];
      entries.push({ method: method.toUpperCase(), operationId: operation.operationId, routePath });
      groups.set(tag, entries);
    }
  }

  const lines = [
    "## Endpoint Catalog",
    "",
    "The catalog below is generated from the committed OpenAPI tags and should stay in sync with",
    "`docs/openapi/openapi.yaml`.",
    "",
    "Regenerate it with `npm run api:docs:catalog` after changing paths, tags, or operation IDs."
  ];

  for (const tag of [...groups.keys()].sort((left, right) => left.localeCompare(right))) {
    lines.push("", `### ${tag}`, "");
    for (const entry of groups
      .get(tag)
      .sort((left, right) =>
        `${left.routePath} ${left.method}`.localeCompare(`${right.routePath} ${right.method}`)
      )) {
      lines.push(`- \`${entry.method} ${entry.routePath}\` - \`${entry.operationId}\``);
    }
  }

  return lines.join("\n");
}
