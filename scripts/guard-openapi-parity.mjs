import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import YAML from "yaml";

const workspace = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const staticOpenApiPath = path.join(workspace, "docs/openapi/openapi.yaml");
const runtimeAppPath = path.join(workspace, "apps/api/dist/app.js");
const allowedStaticOnlyPaths = new Set(["/docs", "/docs/json"]);

process.env.NODE_ENV ??= "test";

const staticOpenApi = readFileSync(staticOpenApiPath, "utf8");
const staticOpenApiDocument = YAML.parse(staticOpenApi);
const { createApiApp } = await import(pathToFileURL(runtimeAppPath).href);
const app = await createApiApp();

try {
  const response = await app.inject({ method: "GET", url: "/docs/json" });
  if (response.statusCode !== 200) {
    throw new Error(`/docs/json returned ${response.statusCode}`);
  }

  const runtimeOpenApi = JSON.parse(response.body);
  assertRuntimeShape(runtimeOpenApi);
  assertStaticDocumentBasics(staticOpenApi);
  const paritySummary = assertPathParity(runtimeOpenApi, staticOpenApiDocument);

  console.log(
    `OpenAPI parity passed: ${Object.keys(runtimeOpenApi.paths).length} runtime paths are documented; ${paritySummary.allowedStaticOnlyPaths.length} static-only docs paths are explicitly allowed.`
  );
} finally {
  await app.close();
}

function assertRuntimeShape(openApi) {
  if (typeof openApi.openapi !== "string" || !openApi.openapi.startsWith("3.")) {
    throw new Error("Runtime OpenAPI document must declare openapi 3.x");
  }

  if (openApi.info?.title !== "TestHistory API") {
    throw new Error("Runtime OpenAPI document title drifted from TestHistory API");
  }

  if (openApi.paths === undefined || typeof openApi.paths !== "object") {
    throw new Error("Runtime OpenAPI document has no paths object");
  }
}

function assertStaticDocumentBasics(source) {
  for (const snippet of [
    "openapi: 3.",
    "title: TestHistory API",
    "/docs/json:",
    "operationId: getRuntimeOpenApiJson"
  ]) {
    if (!source.includes(snippet)) {
      throw new Error(`Static OpenAPI document is missing ${snippet}`);
    }
  }
}

function assertPathParity(runtimeOpenApi, staticOpenApiDocument) {
  const missing = [];
  const staticOnly = [];
  const allowedStaticOnly = [];
  const staticPaths = staticOpenApiDocument?.paths;
  if (staticPaths === null || typeof staticPaths !== "object" || Array.isArray(staticPaths)) {
    throw new Error("Static OpenAPI document has no paths object");
  }

  for (const staticPath of Object.keys(staticPaths)) {
    if (runtimeOpenApi.paths[staticPath] !== undefined) {
      continue;
    }
    if (allowedStaticOnlyPaths.has(staticPath)) {
      allowedStaticOnly.push(staticPath);
    } else {
      staticOnly.push(`${staticPath} path`);
    }
  }

  for (const [runtimePath, operations] of Object.entries(runtimeOpenApi.paths)) {
    const staticPathItem = staticPaths[runtimePath];
    if (staticPathItem === undefined) {
      missing.push(`${runtimePath} path`);
      continue;
    }

    for (const [method, operation] of Object.entries(operations)) {
      const staticOperation = staticPathItem?.[method];
      if (staticOperation === undefined) {
        missing.push(`${method.toUpperCase()} ${runtimePath} method`);
        continue;
      }

      const staticOperationId =
        staticOperation !== null && typeof staticOperation === "object"
          ? staticOperation.operationId
          : undefined;
      if (typeof staticOperationId !== "string" || staticOperationId.length === 0) {
        missing.push(`${method.toUpperCase()} ${runtimePath} static operationId`);
        continue;
      }

      const operationId =
        operation !== null && typeof operation === "object" ? operation.operationId : undefined;
      if (
        typeof operationId === "string" &&
        operationId.length > 0 &&
        operationId !== staticOperationId
      ) {
        missing.push(`${method.toUpperCase()} ${runtimePath} operationId ${operationId}`);
      }

      compareParameters(method, runtimePath, operation, staticOperation, missing);
      compareRequestBody(method, runtimePath, operation, staticOperation, missing);
      compareResponses(method, runtimePath, operation, staticOperation, missing);
    }
  }

  if (staticOnly.length > 0) {
    missing.push(`Static-only OpenAPI paths without runtime route:\n- ${staticOnly.join("\n- ")}`);
  }

  if (missing.length > 0) {
    throw new Error(`Static OpenAPI drift:\n- ${missing.join("\n- ")}`);
  }

  return { allowedStaticOnlyPaths: allowedStaticOnly };
}

function compareParameters(method, runtimePath, runtimeOperation, staticOperation, missing) {
  const runtimeParameters = Array.isArray(runtimeOperation?.parameters)
    ? runtimeOperation.parameters
    : [];
  const staticParameters = Array.isArray(staticOperation?.parameters)
    ? staticOperation.parameters
    : [];
  const staticKeys = new Set(
    staticParameters
      .filter((parameter) => parameter !== null && typeof parameter === "object")
      .map((parameter) => `${parameter.in}:${parameter.name}`)
  );

  for (const parameter of runtimeParameters) {
    if (parameter === null || typeof parameter !== "object") {
      continue;
    }
    if (typeof parameter.in !== "string" || typeof parameter.name !== "string") {
      continue;
    }
    if (parameter.in === "path" && !pathTemplateParameterNames(runtimePath).has(parameter.name)) {
      continue;
    }
    const key = `${parameter.in}:${parameter.name}`;
    if (!staticKeys.has(key)) {
      missing.push(`${method.toUpperCase()} ${runtimePath} parameter ${key}`);
    }
  }
}

function compareRequestBody(method, runtimePath, runtimeOperation, staticOperation, missing) {
  if (runtimeOperation?.requestBody !== undefined && staticOperation?.requestBody === undefined) {
    missing.push(`${method.toUpperCase()} ${runtimePath} requestBody`);
  }
}

function compareResponses(method, runtimePath, runtimeOperation, staticOperation, missing) {
  const runtimeResponses = runtimeOperation?.responses;
  const staticResponses = staticOperation?.responses;
  if (
    runtimeResponses === null ||
    typeof runtimeResponses !== "object" ||
    staticResponses === null ||
    typeof staticResponses !== "object"
  ) {
    return;
  }

  for (const [status, runtimeResponse] of Object.entries(runtimeResponses)) {
    const staticResponse = staticResponses[status];
    const runtimeSchemaRef = readJsonResponseSchemaRef(runtimeResponse);
    const runtimeHasJsonSchema = readJsonResponseSchema(runtimeResponse) !== undefined;
    if (isDefaultRuntimeResponse(runtimeResponse) && !runtimeHasJsonSchema) {
      continue;
    }
    if (staticResponse === undefined) {
      missing.push(`${method.toUpperCase()} ${runtimePath} response ${status}`);
      continue;
    }

    if (runtimeSchemaRef === undefined) {
      continue;
    }

    const staticSchemaRef = readJsonResponseSchemaRef(staticResponse);
    if (staticSchemaRef === undefined) {
      missing.push(`${method.toUpperCase()} ${runtimePath} response ${status} schema`);
    } else if (runtimeSchemaRef !== staticSchemaRef) {
      missing.push(
        `${method.toUpperCase()} ${runtimePath} response ${status} schema ${runtimeSchemaRef}`
      );
    }
  }
}

function readJsonResponseSchemaRef(response) {
  const schema = readJsonResponseSchema(response);
  return schema !== null && typeof schema === "object" && typeof schema.$ref === "string"
    ? schema.$ref
    : undefined;
}

function readJsonResponseSchema(response) {
  return response?.content?.["application/json"]?.schema;
}

function isDefaultRuntimeResponse(response) {
  return response?.description === "Default Response";
}

function pathTemplateParameterNames(runtimePath) {
  return new Set([...runtimePath.matchAll(/\{([^}]+)\}/g)].map((match) => match[1]));
}
