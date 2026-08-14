import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

const workspace = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const openApiPath = path.join(workspace, "docs/openapi/openapi.yaml");
const apiDocsPath = path.join(workspace, "docs/api.md");
const httpMethods = new Set(["get", "post", "put", "patch", "delete", "head", "options", "trace"]);

const openApi = YAML.parse(readFileSync(openApiPath, "utf8"));
const apiDocs = readFileSync(apiDocsPath, "utf8");
const marker = "## Endpoint Catalog";
const markerIndex = apiDocs.indexOf(marker);

if (markerIndex === -1) {
  throw new Error(`docs/api.md is missing ${marker}`);
}

const preamble = apiDocs.slice(0, markerIndex).trimEnd();
const catalog = buildCatalog(openApi);
writeFileSync(apiDocsPath, `${preamble}\n\n${catalog}\n`, "utf8");

console.log(`Updated docs/api.md endpoint catalog: ${catalogOperationCount(openApi)} operations.`);

function buildCatalog(document) {
  const groups = new Map();

  for (const [routePath, pathItem] of Object.entries(document.paths ?? {})) {
    for (const [method, operation] of Object.entries(pathItem ?? {})) {
      if (!httpMethods.has(method)) {
        continue;
      }

      const tag = operation.tags?.[0] ?? "untagged";
      const entries = groups.get(tag) ?? [];
      entries.push({
        method: method.toUpperCase(),
        operationId: operation.operationId,
        routePath
      });
      groups.set(tag, entries);
    }
  }

  const lines = [
    marker,
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

function catalogOperationCount(document) {
  let count = 0;
  for (const pathItem of Object.values(document.paths ?? {})) {
    for (const method of Object.keys(pathItem ?? {})) {
      if (httpMethods.has(method)) {
        count += 1;
      }
    }
  }
  return count;
}
