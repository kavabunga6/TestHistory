import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const sourceRoots = ["apps", "packages", "scripts"];
const sourceExtensions = new Set([".ts", ".tsx", ".js", ".mjs"]);
const ignoredSegments = new Set([
  ".git",
  "coverage",
  "dist",
  "dist-types",
  "node_modules",
  ".turbo",
  ".vite"
]);

const defaultLimits = {
  productionLines: 700,
  testLines: 1200,
  scriptLines: 650,
  referenceScreenLines: 1100
};

const debtAllowlist = new Map(
  [
    [
      "apps/mcp/src/server.ts",
      ["MCP bootstrap, tools, schemas, and API client are still bundled together.", 16250]
    ],
    [
      "apps/api/src/app.test.ts",
      ["API route regression matrix must be split by route group.", 14750]
    ],
    [
      "apps/mcp/src/server.test.ts",
      ["MCP tool/resource regression matrix must be split by feature group.", 12250]
    ],
    [
      "apps/worker/src/index.ts",
      ["Worker bootstrap and job pipelines must move into feature job modules.", 7150]
    ],
    ["apps/worker/src/index.test.ts", ["Worker tests must be split by job pipeline.", 5450]],
    [
      "apps/web/src/surfaceReadiness.test.tsx",
      ["UI surface readiness tests must be split by screen/feature.", 5200]
    ],
    ["apps/api/src/routes/uploads.ts", ["Upload route handlers and schemas must be split.", 4950]],
    [
      "apps/api/src/routes/artifacts.ts",
      ["Artifact routes must split schemas/handlers/mappers.", 1300]
    ],
    [
      "apps/api/src/routes/launches.ts",
      ["Launch routes must split schemas/handlers/mappers.", 1300]
    ],
    [
      "apps/api/src/routes/projects.ts",
      ["Project routes must split schemas/handlers/mappers.", 1100]
    ],
    [
      "apps/api/src/routes/security-audit.ts",
      ["Security audit routes must split schemas/handlers/mappers.", 1200]
    ],
    [
      "apps/api/src/store.ts",
      ["In-memory store must split feature fixtures and repositories.", 1150]
    ],
    [
      "packages/artifacts/src/index.ts",
      ["Artifact parsing, descriptors, retention, and policy helpers must be split.", 3900]
    ],
    ["packages/artifacts/src/index.test.ts", ["Artifact tests must be split by concern.", 3200]],
    [
      "scripts/smoke-api.mjs",
      ["Operations/API smoke checks must be split by contract area.", 2700]
    ],
    ["apps/web/src/api.ts", ["Web API client must be split by feature endpoint group.", 1200]],
    [
      "apps/web/src/apiState.ts",
      ["Web API state loading must split by feature endpoint group.", 1000]
    ],
    [
      "apps/web/src/referenceScreens/LaunchesReferenceScreen.tsx",
      ["Launches reference screen must be split into panels and list/detail components.", 2950]
    ],
    [
      "apps/web/src/m1Workspace.ts",
      ["Archive workspace helpers must be split by diagnostics, fixtures, and mapping.", 2750]
    ],
    [
      "apps/api/src/routes/test-cases.ts",
      ["Test case routes must split handlers/schemas/mappers.", 2250]
    ],
    [
      "apps/api/src/persistence/postgres.ts",
      ["PostgreSQL repositories must move into feature repository modules.", 2200]
    ],
    [
      "apps/web/src/referenceScreens/ProjectSettingsReferenceScreen.tsx",
      ["Project settings screen must split tabs, dialogs, and tables.", 2100]
    ],
    [
      "apps/web/src/analyticsQuery.ts",
      ["Analytics query helpers must split parser/filter/sort.", 800]
    ],
    [
      "apps/web/src/projectSettings.ts",
      ["Project settings client helpers must split by tab.", 760]
    ],
    [
      "apps/web/src/referenceScreens/DashboardReferenceScreen.tsx",
      ["Dashboard reference screen must split widgets, dialogs, and layout.", 1300]
    ],
    [
      "apps/web/src/referenceScreens/TestCaseDetailReferenceScreen.tsx",
      ["Test case detail screen must split overview, side facts, tabs, and lists.", 1250]
    ],
    [
      "packages/allure-parser/src/index.test.ts",
      ["Allure parser tests must split fixtures by input shape.", 1900]
    ],
    [
      "packages/allure-parser/src/index.ts",
      ["Allure parser must split model, parser, and normalizer.", 1400]
    ],
    [
      "apps/api/src/persistence/postgres.test.ts",
      ["PostgreSQL tests must split by repository.", 1700]
    ],
    ["packages/contracts/src/index.ts", ["Contracts must split by API feature group.", 1400]],
    [
      "packages/domain/src/audit-export.ts",
      ["Audit export domain must split policy and DTO helpers.", 1100]
    ],
    [
      "packages/domain/src/defect-mutes.ts",
      ["Defect mute domain must split projection and actions.", 1000]
    ],
    [
      "packages/domain/src/history-compare-permission-audit.ts",
      ["History compare audit domain must split rules and summaries.", 900]
    ],
    ["packages/domain/src/index.ts", ["Domain barrel must split exports by feature.", 1250]],
    [
      "scripts/seed-synthetic-allure-results.mjs",
      ["Synthetic fixture seed script must split data builders and writer.", 850]
    ]
  ].map(([file, [reason, lineLimit]]) => [normalizePath(file), { reason, lineLimit }])
);

const files = sourceRoots.flatMap((root) => listSourceFiles(path.join(repoRoot, root)));
const violations = [];
const warnings = [];

for (const absolutePath of files) {
  const relativePath = normalizePath(path.relative(repoRoot, absolutePath));
  const text = readFileSync(absolutePath, "utf8");
  const lineCount = countLines(text);
  const limit = limitFor(relativePath);
  const debt = debtAllowlist.get(relativePath);

  if (debt) {
    if (lineCount > debt.lineLimit) {
      violations.push(
        `${relativePath}: ${lineCount} lines exceeds allowlist ceiling ${debt.lineLimit}. ${debt.reason}`
      );
    } else if (lineCount > limit) {
      warnings.push(
        `${relativePath}: ${lineCount} lines is allowed debt, target <= ${limit}. ${debt.reason}`
      );
    }
    continue;
  }

  if (lineCount > limit) {
    violations.push(
      `${relativePath}: ${lineCount} lines exceeds ${limit}. Split by feature/package before adding more code.`
    );
  }
}

for (const [relativePath] of debtAllowlist) {
  if (!files.some((file) => normalizePath(path.relative(repoRoot, file)) === relativePath)) {
    violations.push(`${relativePath}: stale module-size allowlist entry; remove it.`);
  }
}

if (violations.length > 0) {
  console.error(["Module size guard failed:", ...violations.map((item) => `- ${item}`)].join("\n"));
  process.exit(1);
}

console.log(
  `Module size guard passed: ${files.length} files checked, ${warnings.length} debt files tracked.`
);

if (warnings.length > 0) {
  console.log(["Tracked refactoring debt:", ...warnings.map((item) => `- ${item}`)].join("\n"));
}

function listSourceFiles(root) {
  if (!statSafe(root)?.isDirectory()) {
    return [];
  }

  const found = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (ignoredSegments.has(entry.name)) {
      continue;
    }

    const absolutePath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      found.push(...listSourceFiles(absolutePath));
      continue;
    }

    if (entry.isFile() && sourceExtensions.has(path.extname(entry.name))) {
      found.push(absolutePath);
    }
  }
  return found;
}

function limitFor(relativePath) {
  if (relativePath.startsWith("scripts/")) {
    return defaultLimits.scriptLines;
  }
  if (relativePath.includes(".test.") || relativePath.endsWith(".spec.ts")) {
    return defaultLimits.testLines;
  }
  if (relativePath.includes("/referenceScreens/")) {
    return defaultLimits.referenceScreenLines;
  }
  return defaultLimits.productionLines;
}

function countLines(text) {
  if (text.length === 0) {
    return 0;
  }
  return text.split(/\r\n|\r|\n/).length;
}

function normalizePath(filePath) {
  return filePath.split(path.sep).join("/");
}

function statSafe(filePath) {
  try {
    return statSync(filePath);
  } catch {
    return undefined;
  }
}
