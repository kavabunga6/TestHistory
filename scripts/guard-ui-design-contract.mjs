import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const workspace = process.cwd();
const expectedScreenshotManifest = JSON.parse(read("docs/screenshots/expected-manifest.json"));

const sources = new Map([
  [".github/workflows/ci.yml", read(".github/workflows/ci.yml")],
  ["docs/screenshots/expected-manifest.json", read("docs/screenshots/expected-manifest.json")],
  ["docs/screenshots/README.md", read("docs/screenshots/README.md")],
  ["docs/ui-design-audit.md", read("docs/ui-design-audit.md")],
  [
    "apps/web/src/referenceScreens/AnalyticsReferenceScreen.css",
    read("apps/web/src/referenceScreens/AnalyticsReferenceScreen.css")
  ],
  [
    "apps/web/src/referenceScreens/DefectsReferenceScreen.css",
    read("apps/web/src/referenceScreens/DefectsReferenceScreen.css")
  ],
  [
    "apps/web/src/referenceScreens/DashboardReferenceScreen.css",
    read("apps/web/src/referenceScreens/DashboardReferenceScreen.css")
  ],
  [
    "apps/web/src/referenceScreens/LaunchesReferenceScreen.css",
    read("apps/web/src/referenceScreens/LaunchesReferenceScreen.css")
  ],
  [
    "apps/web/src/referenceScreens/LaunchesReferenceScreen.tsx",
    read("apps/web/src/referenceScreens/LaunchesReferenceScreen.tsx")
  ],
  [
    "apps/web/src/referenceScreens/LaunchesReferenceModel.ts",
    read("apps/web/src/referenceScreens/LaunchesReferenceModel.ts")
  ],
  [
    "apps/web/src/referenceScreens/LaunchesReferenceTabs.tsx",
    read("apps/web/src/referenceScreens/LaunchesReferenceTabs.tsx")
  ],
  [
    "apps/web/src/referenceScreens/ProjectSettingsReferenceScreen.css",
    read("apps/web/src/referenceScreens/ProjectSettingsReferenceScreen.css")
  ],
  [
    "apps/web/src/referenceScreens/TestCaseDetailReferenceScreen.css",
    read("apps/web/src/referenceScreens/TestCaseDetailReferenceScreen.css")
  ],
  [
    "apps/web/src/referenceScreens/TestCaseListReferenceScreen.css",
    read("apps/web/src/referenceScreens/TestCaseListReferenceScreen.css")
  ],
  [
    "apps/web/src/referenceScreens/ThqlSearchPanel.css",
    read("apps/web/src/referenceScreens/ThqlSearchPanel.css")
  ],
  [
    "apps/web/src/referenceScreens/ThqlSearchPanel.tsx",
    read("apps/web/src/referenceScreens/ThqlSearchPanel.tsx")
  ],
  [
    "apps/web/src/referenceScreens/ProjectsReferenceScreen.css",
    read("apps/web/src/referenceScreens/ProjectsReferenceScreen.css")
  ],
  [
    "apps/web/src/referenceScreens/TestCaseDetailReferenceScreen.tsx",
    read("apps/web/src/referenceScreens/TestCaseDetailReferenceScreen.tsx")
  ],
  ["apps/web/src/AuthPanel.tsx", read("apps/web/src/AuthPanel.tsx")],
  ["apps/web/package.json", read("apps/web/package.json")],
  ["apps/web/src/main.tsx", read("apps/web/src/main.tsx")],
  ["apps/web/src/WorkspaceSurface.tsx", read("apps/web/src/WorkspaceSurface.tsx")],
  ["apps/web/src/styles.css", read("apps/web/src/styles.css")],
  ["scripts/guard-button-overflow.mjs", read("scripts/guard-button-overflow.mjs")],
  ["scripts/capture-ui-screenshots.mjs", read("scripts/capture-ui-screenshots.mjs")],
  ["scripts/preview-server.mjs", read("scripts/preview-server.mjs")],
  ["scripts/ui-api-fixtures.mjs", read("scripts/ui-api-fixtures.mjs")]
]);

const requiredScreens = expectedScreenshotManifest.files.map((file) => file.name);
const overflowGuardExclusions = new Set(["dialog-dashboard-widget-delete"]);
const nonstandardFontWeight =
  /font-weight:\s*(?:430|520|550|620|650|680|720|740|750|760|780|800|820|850|900)\s*;/;
const likelyMojibake = /(?:(?:Р|С)[^\u0000-\u007f]){3,}/u;

for (const [relativePath, source] of sources) {
  if (relativePath.endsWith(".css") && nonstandardFontWeight.test(source)) {
    throw new Error(
      `${relativePath} uses a nonstandard font weight; use bundled Inter weights 400, 500, 600, or 700`
    );
  }
}

for (const relativePath of listUiSourceFiles("apps/web/src")) {
  if (likelyMojibake.test(read(relativePath))) {
    throw new Error(`${relativePath} contains text that looks like mojibake`);
  }
}

if (expectedScreenshotManifest.viewport?.width !== 1440) {
  throw new Error("docs/screenshots/expected-manifest.json must keep viewport width 1440");
}

if (expectedScreenshotManifest.viewport?.height !== 1000) {
  throw new Error("docs/screenshots/expected-manifest.json must keep viewport height 1000");
}

if (new Set(requiredScreens).size !== requiredScreens.length) {
  throw new Error("docs/screenshots/expected-manifest.json contains duplicate screenshot names");
}

for (const screen of requiredScreens) {
  expectSnippet("docs/screenshots/expected-manifest.json", `"name": "${screen}"`);
  expectSnippet("docs/screenshots/README.md", `final/${screen}.png`);
  expectSnippet("scripts/capture-ui-screenshots.mjs", `name: "${screen}"`);
}

for (const snippet of [
  "expected-manifest.json",
  "final/manifest.json",
  "1440x1000",
  "`ui-screenshot-evidence` artifact"
]) {
  expectSnippet("docs/screenshots/README.md", snippet);
}

for (const snippet of [
  "expectedManifestPath",
  "validateExpectedManifest",
  "Screenshot expected manifest drift"
]) {
  expectSnippet("scripts/capture-ui-screenshots.mjs", snippet);
}

for (const snippet of [
  "expectedManifest",
  "validateExpectedManifest",
  "Button overflow expected manifest drift",
  'dialog: typeof screen.prepare === "function"'
]) {
  expectSnippet("scripts/guard-button-overflow.mjs", snippet);
}

for (const file of ["scripts/guard-button-overflow.mjs", "scripts/capture-ui-screenshots.mjs"]) {
  expectSnippet(file, 'from "./ui-api-fixtures.mjs"');
  expectSnippet(file, "createUiFixtureApiResponse(pathname, method)");
  expectSnippet(file, 'from "./preview-server.mjs"');
  expectSnippet(file, "await browser?.close().catch(() => undefined);");
  expectSnippet(file, "stopPreviewServer(server);");
}

for (const snippet of [
  "pathname === `/api/v1/projects/${project.id}/launches`",
  "pathname === `/api/v1/launches/${launch.id}/results/${result.uuid}`",
  "pathname === `/api/v1/test-cases/${testCase.id}`",
  'pathname === "/api/v1/defects"'
]) {
  expectSnippet("scripts/ui-api-fixtures.mjs", snippet);
}

for (const snippet of [
  'path.join(workspace, "node_modules", "vite", "bin", "vite.js")',
  'cwd: path.join(workspace, "apps", "web")',
  '"--strictPort"',
  "windowsHide: true",
  "child.stdout?.destroy()",
  "child.kill()"
]) {
  expectSnippet("scripts/preview-server.mjs", snippet);
}

for (const route of [
  "#settings/access",
  "#settings/tokens",
  "#settings/integrations",
  "#settings/retention",
  "#settings/fields",
  "#case/PAY-1042/history",
  "#case/PAY-1042/defects",
  "#launch/L-1289/result/PAY-1042/history",
  "#launch/L-1289/result/PAY-1042/defects"
]) {
  expectSnippet("docs/screenshots/expected-manifest.json", `"hash": "${route}"`);
}

for (const screen of requiredScreens.filter((screen) => !overflowGuardExclusions.has(screen))) {
  expectSnippet("scripts/guard-button-overflow.mjs", `name: "${screen}"`);
}

for (const screen of overflowGuardExclusions) {
  expectSnippet("scripts/guard-button-overflow.mjs", `"${screen}"`);
}

expectNoSnippet(
  "apps/web/src/referenceScreens/DashboardReferenceScreen.tsx",
  "globalThis.confirm("
);
expectNoSnippet("apps/web/src/styles.css", ".empty-chip");
expectNoSnippet("apps/web/src/styles.css", ".workspace-loading-bar");
expectNoSnippet("apps/web/src/WorkspaceSurface.tsx", "WorkspaceLoadingBar");
expectNoSnippet("apps/web/src/referenceScreens/TestCaseDetailReferenceScreen.css", ".thql-search");
expectNoSnippet("apps/web/src/referenceScreens/LaunchesReferenceScreen.tsx", "inferLaunchGroup");

for (const snippet of [
  ".workspace-loading-indicator {",
  "position: absolute;",
  "pointer-events: none;",
  "workspace-loading-indicator-reveal"
]) {
  expectSnippet("apps/web/src/styles.css", snippet);
}

for (const snippet of ["WorkspaceLoadingIndicator", "Обновляем данные", 'aria-live="polite"']) {
  expectSnippet("apps/web/src/WorkspaceSurface.tsx", snippet);
}

for (const snippet of ['import "./ThqlSearchPanel.css";', "export function ThqlSearchPanel"]) {
  expectSnippet("apps/web/src/referenceScreens/ThqlSearchPanel.tsx", snippet);
}

for (const snippet of [".thql-search", ".thql-dialog", "font-weight: 700;"]) {
  expectSnippet("apps/web/src/referenceScreens/ThqlSearchPanel.css", snippet);
}

for (const snippet of ["--thql-chip-active-bg: #059669", "--thql-chip-active-bg: #ea580c"]) {
  expectNoSnippet("apps/web/src/referenceScreens/ThqlSearchPanel.css", snippet);
}

for (const snippet of [
  ".launches-reference-list-frame > .thql-search",
  "padding: 10px 24px 9px;",
  "border-color: #aebdce;"
]) {
  expectSnippet("apps/web/src/referenceScreens/LaunchesReferenceScreen.css", snippet);
}

for (const snippet of [
  "grid-template-areas:",
  '"summary unresolved"',
  '"defects variables"',
  "gap: 16px;",
  "background: #f8fafc;",
  ".launches-reference-overview-summary-main",
  ".launches-reference-overview-donut",
  ".launches-reference-overview-legend",
  "@media (prefers-reduced-motion: reduce)",
  ".launches-reference-compact-results-head",
  ".launches-reference-variables-head",
  ".launches-reference-section-bar",
  ".launches-reference-quick-stats"
]) {
  expectSnippet("apps/web/src/referenceScreens/LaunchesReferenceScreen.css", snippet);
}

for (const snippet of [
  "launches-reference-overview-summary",
  "launches-reference-overview-donut-segment",
  "launches-reference-overview-legend-item",
  "Переменные окружения",
  "overviewStatusOrder",
  "overviewStatusLabels"
]) {
  expectSnippet("apps/web/src/referenceScreens/LaunchesReferenceTabs.tsx", snippet);
}

for (const snippet of [
  "launches-reference-section-bar",
  "launches-reference-quick-stats",
  "const primaryTabs = launchTabs;",
  "среднее время"
]) {
  expectSnippet("apps/web/src/referenceScreens/LaunchesReferenceScreen.tsx", snippet);
}

expectSnippet(
  "apps/web/src/referenceScreens/LaunchesReferenceScreen.tsx",
  "const effectiveSelectedLaunchId = routeLaunchId ?? selectedLaunchId;"
);
expectNoSnippet("apps/web/src/referenceScreens/LaunchesReferenceTabs.tsx", "collectRestartItems");
expectNoSnippet("apps/web/src/referenceScreens/LaunchesReferenceTabs.tsx", "Перезапуски тестов");
expectNoSnippet("apps/web/src/referenceScreens/LaunchesReferenceTabs.tsx", "Участники");
expectNoSnippet(
  "apps/web/src/referenceScreens/LaunchesReferenceScreen.css",
  '"copy identifier duration status"'
);
expectNoSnippet("apps/web/src/referenceScreens/LaunchesResultReport.tsx", 'title="Участники"');
expectNoSnippet(
  "apps/web/src/referenceScreens/TestCaseDetailReferenceScreen.tsx",
  'title="Участники"'
);

for (const snippet of [
  "Открыть отчёт",
  'name: "DATE_TIME"',
  'name: "GROUP"',
  'name: "CLOSED_AT"'
]) {
  expectNoSnippet(
    snippet === "Открыть отчёт"
      ? "apps/web/src/referenceScreens/LaunchesReferenceTabs.tsx"
      : "apps/web/src/referenceScreens/LaunchesReferenceModel.ts",
    snippet
  );
}

expectSnippet("apps/web/package.json", '"@fontsource/inter"');
for (const subset of ["cyrillic", "latin"]) {
  for (const weight of [400, 500, 600, 700]) {
    expectSnippet("apps/web/src/main.tsx", `@fontsource/inter/${subset}-${weight}.css`);
  }
}
expectNoSnippet("apps/web/src/AuthPanel.tsx", "Auth API недоступен");
expectNoSnippet("apps/web/src/main.tsx", "Open #case and select a case with History compare.");
expectNoSnippet(
  "apps/web/src/main.tsx",
  "Open a result attachment tab and confirm descriptor-only dry-run schedule evidence appears inside attachment details."
);
expectNoSnippet(
  "apps/web/src/main.tsx",
  "Open #defects and confirm only the defect list and selected defect details are visible."
);
expectNoSnippet("apps/web/src/referenceScreens/LaunchesReferenceScreen.tsx", 'empty="Нет ');
expectNoSnippet("apps/web/src/referenceScreens/TestCaseDetailReferenceScreen.tsx", 'empty="Нет ');

expectSnippet("apps/web/src/AuthPanel.tsx", "API авторизации недоступен");
expectSnippet(
  "apps/web/src/WorkspaceSurface.tsx",
  "Открыть #case и выбрать кейс со сравнением истории."
);
expectSnippet(
  "apps/web/src/WorkspaceSurface.tsx",
  "Открыть вкладку вложений результата и проверить, что dry-run расписание дескрипторов видно только в деталях вложений."
);
expectSnippet(
  "apps/web/src/WorkspaceSurface.tsx",
  "Открыть #defects и проверить, что видны только список дефектов и детали выбранного дефекта."
);

for (const snippet of [
  "Target UI Contract",
  "Use one application rhythm",
  "Use cards only for KPI widgets",
  "Make every section visually separable",
  "Keep UI copy Russian",
  "Use the same modal contract everywhere",
  "Use the same tab contract everywhere",
  "Evidence To Refresh",
  "`ui-screenshot-evidence` artifact"
]) {
  expectSnippet("docs/ui-design-audit.md", snippet);
}

for (const snippet of [
  "npm run guard:ui-design",
  "npm run guard:button-overflow",
  "npm run guard:ui-interactions",
  "npm run screenshots:capture",
  "path: docs/screenshots/final/*"
]) {
  expectSnippet(".github/workflows/ci.yml", snippet);
}

for (const snippet of [
  "writeScreenshotManifest",
  "viewport: { width: 1440, height: 1000 }",
  'dialog: typeof screen.prepare === "function"',
  "#settings/access",
  "#settings/tokens",
  "#settings/integrations",
  "#settings/retention",
  "#settings/fields",
  "#case/PAY-1042/history",
  "#case/PAY-1042/defects",
  "#launch/L-1289/result/PAY-1042/history",
  "#launch/L-1289/result/PAY-1042/defects"
]) {
  expectSnippet("scripts/capture-ui-screenshots.mjs", snippet);
}

for (const [relativePath, snippets] of [
  [
    "apps/web/src/referenceScreens/AnalyticsReferenceScreen.css",
    [
      ".analytics-reference-panel-title",
      "min-height: 50px;",
      ".analytics-reference-panel-title h3",
      "font-size: 16px;",
      "font-weight: 700;"
    ]
  ],
  [
    "apps/web/src/referenceScreens/LaunchesReferenceScreen.css",
    [
      ".launches-reference-card h2",
      "height: 32px;",
      "font-size: 12px;",
      "text-transform: uppercase;",
      ".launches-reference-card-spacer",
      "grid-template-rows: auto minmax(0, 1fr) auto;",
      ".launches-reference-result-rail h4",
      ".launches-reference-value-list span",
      "min-height: 30px;",
      "container-name: launches-result-report;",
      "@container launches-result-report (max-width: 760px)",
      '"status date"',
      ".launches-reference-history-date",
      ".launches-reference-result-main {",
      ".launches-reference-result-heading > strong",
      ".launches-reference-result-status-pill",
      ".launches-reference-trace-summary-copy",
      ".launches-reference-trace-stack",
      "white-space: pre-wrap;",
      "font-size: 14px;"
    ]
  ],
  [
    "apps/web/src/referenceScreens/ProjectSettingsReferenceScreen.css",
    [
      ".project-settings__panel-title",
      "min-height: calc(36px + var(--th-font-heading-delta));",
      "font-size: 16px;",
      "text-transform: none;"
    ]
  ],
  [
    "apps/web/src/referenceScreens/TestCaseDetailReferenceScreen.css",
    [
      ".tc-detail-reference-tab-panel section > h3",
      "min-height: 22px;",
      "font-size: 15px;",
      "text-transform: none;",
      ".tc-detail-reference-side-rail section.is-empty h3",
      "min-height: 26px;",
      ".tc-detail-reference-side-rail .tc-detail-reference-value-list span",
      "min-height: 30px;",
      "font-size: 14px;"
    ]
  ],
  [
    "apps/web/src/referenceScreens/DefectsReferenceScreen.css",
    [
      ".defects-reference-section > header",
      "min-height: 50px;",
      ".defects-reference-section h3",
      "font-size: 15px;",
      "font-weight: 700;"
    ]
  ]
]) {
  for (const snippet of snippets) {
    expectSnippet(relativePath, snippet);
  }
}

for (const [relativePath, snippets] of [
  [
    "apps/web/src/styles.css",
    [
      ".attribute-group.is-empty",
      ".attribute-group.is-empty h3",
      ".attribute-group span",
      ".value-group.is-empty",
      ".value-group.is-empty h4",
      ".value-group span",
      "min-height: 30px;",
      "font-size: 14px;",
      ".confirm-delete-backdrop",
      "background: rgb(15 23 42 / 48%);",
      "max-height: calc(100vh - 40px);",
      "box-shadow: 0 18px 48px rgb(15 23 42 / 18%);",
      "min-height: 56px;"
    ]
  ],
  [
    "apps/web/src/referenceScreens/ProjectSettingsReferenceScreen.css",
    [
      ".project-settings__dialog-backdrop",
      "background: rgb(15 23 42 / 48%);",
      "max-height: calc(100vh - 40px);",
      "box-shadow: 0 18px 48px rgb(15 23 42 / 18%);",
      "min-height: calc(56px + var(--th-font-title-delta) + var(--th-font-body-delta));"
    ]
  ],
  [
    "apps/web/src/referenceScreens/DashboardReferenceScreen.css",
    [
      ".dashboard-reference-modal-layer",
      "background: rgb(15 23 42 / 48%);",
      "max-height: calc(100vh - 40px);",
      "box-shadow: 0 18px 48px rgb(15 23 42 / 18%);",
      "min-height: 56px;"
    ]
  ]
]) {
  for (const snippet of snippets) {
    expectSnippet(relativePath, snippet);
  }
}

console.log("UI design contract guard passed");

function read(relativePath) {
  return readFileSync(path.join(workspace, relativePath), "utf8");
}

function listUiSourceFiles(relativeDirectory) {
  const absoluteDirectory = path.join(workspace, relativeDirectory);
  return readdirSync(absoluteDirectory, { withFileTypes: true }).flatMap((entry) => {
    const relativePath = path.posix.join(relativeDirectory.replaceAll("\\", "/"), entry.name);
    if (entry.isDirectory()) {
      return listUiSourceFiles(relativePath);
    }
    return /\.(?:css|ts|tsx)$/.test(entry.name) ? [relativePath] : [];
  });
}

function expectSnippet(relativePath, snippet) {
  const source = sources.get(relativePath);
  if (source === undefined || !source.includes(snippet)) {
    throw new Error(`${relativePath} is missing UI design contract snippet: ${snippet}`);
  }
}

function expectNoSnippet(relativePath, snippet) {
  const source = sources.get(relativePath) ?? read(relativePath);
  if (source.includes(snippet)) {
    throw new Error(
      `${relativePath} must not use UI design contract forbidden snippet: ${snippet}`
    );
  }
}
