import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { launchChromiumWithFallback } from "./playwright-browser.mjs";
import { startPreviewServer, stopPreviewServer } from "./preview-server.mjs";
import { createEmptyUiApiResponse, createUiFixtureApiResponse } from "./ui-api-fixtures.mjs";

const workspace = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = path.join(workspace, "docs/screenshots/final");
const expectedManifestPath = path.join(workspace, "docs/screenshots/expected-manifest.json");
const expectedManifest = JSON.parse(readFileSync(expectedManifestPath, "utf8"));
const port = process.env.WEB_SCREENSHOT_PORT ?? "5174";
const baseUrl = `http://127.0.0.1:${port}`;

const screens = [
  { name: "auth-login", hash: "#launch", auth: false },
  { name: "projects", hash: "#projects" },
  { name: "dashboard", hash: "#dashboard" },
  { name: "launches", hash: "#launch" },
  {
    name: "launch-detail",
    hash: "#launch/L-1289",
    verify: async (page) => {
      await page
        .locator('.launches-reference-overview-donut[aria-label="Результаты запуска: 100 тестов"]')
        .waitFor();
      for (const [status, count] of [
        ["passed", "62"],
        ["failed", "18"],
        ["broken", "12"],
        ["skipped", "8"]
      ]) {
        const actual = await page
          .locator(`.launches-reference-overview-legend-item.is-${status} strong`)
          .textContent();
        if (actual?.trim() !== count) {
          throw new Error(`Launch overview screenshot has ${status}=${actual}, expected ${count}`);
        }
      }
    }
  },
  {
    name: "launch-results",
    hash: "#launch/L-1289/results",
    verify: async (page) => {
      await page.locator(".launches-reference-result-table > button").first().waitFor();
      const rowCount = await page.locator(".launches-reference-result-table > button").count();
      const pageRange = await page.locator(".launches-results-pagination-range").textContent();
      if (rowCount !== 25 || !/1\s*[–-]\s*25\s+из\s+100/.test(pageRange ?? "")) {
        throw new Error(
          `Launch results screenshot requires 25 of 100 rows; got ${rowCount}, ${pageRange}`
        );
      }
    }
  },
  { name: "launch-result-history", hash: "#launch/L-1289/result/PAY-1042/history" },
  { name: "launch-result-defects", hash: "#launch/L-1289/result/PAY-1042/defects" },
  { name: "selected-test-case", hash: "#case/PAY-1042/overview" },
  { name: "selected-test-case-history", hash: "#case/PAY-1042/history" },
  { name: "selected-test-case-defects", hash: "#case/PAY-1042/defects" },
  { name: "defects", hash: "#defects/PAY-337" },
  { name: "analytics", hash: "#analytics" },
  {
    name: "dialog-dashboard-widget-delete",
    hash: "#dashboard",
    beforeNavigate: async (page) => {
      await seedDashboardWidget(page);
    },
    prepare: async (page) => {
      await page.locator(".dashboard-reference-widget-actions button").last().click();
    }
  },
  { name: "settings-access", hash: "#settings/access" },
  { name: "settings-tokens", hash: "#settings/tokens" },
  { name: "settings-integrations", hash: "#settings/integrations" },
  { name: "settings-retention", hash: "#settings/retention" },
  { name: "settings-fields", hash: "#settings/fields" },
  {
    name: "dialog-role-matrix",
    hash: "#settings/access",
    prepare: async (page) => {
      await page.getByTitle("Показать матрицу прав").click();
    }
  },
  {
    name: "dialog-member-edit",
    hash: "#settings/access",
    prepare: async (page) => {
      await page
        .locator(".project-settings__member-card .project-settings__icon-button")
        .first()
        .click();
    }
  },
  {
    name: "dialog-integration-edit",
    hash: "#settings/integrations",
    prepare: async (page) => {
      await page.getByRole("button", { name: "Добавить" }).click();
    }
  },
  {
    name: "dialog-api-token",
    hash: "#settings/tokens",
    prepare: async (page) => {
      await page
        .locator(".project-settings__panel")
        .filter({ hasText: "API токены проекта" })
        .getByRole("button", { name: "Создать", exact: true })
        .click();
    }
  },
  {
    name: "dialog-quarantine",
    hash: "#launch/L-1289/result/PAY-1042",
    prepare: async (page) => {
      await page.getByRole("button", { name: "В карантин" }).first().click();
    }
  },
  {
    name: "dialog-delete-launch",
    hash: "#launch/L-1289",
    prepare: async (page) => {
      await page.getByRole("button", { name: "Удалить" }).first().click();
    }
  }
];

async function seedDashboardWidget(page) {
  await page.evaluate(() => {
    localStorage.setItem(
      "testhistory.dashboard.widgets.v1",
      JSON.stringify([
        {
          entity: "Результаты тестов",
          groupBy: "status",
          id: "guard-dashboard-widget",
          kind: "metric",
          metric: "Успешность",
          period: "Последние 14 дней",
          thql: "from results where muted = false measure passRate()",
          title: "Guard widget"
        }
      ])
    );
  });
}

validateExpectedManifest();

mkdirSync(outputDir, { recursive: true });

const server = startPreviewServer({ port, workspace });

let serverOutput = "";
server.stdout.on("data", (chunk) => {
  serverOutput += chunk.toString();
});
server.stderr.on("data", (chunk) => {
  serverOutput += chunk.toString();
});

let browser;
try {
  await waitForEndpoint(baseUrl);
  browser = await launchScreenshotBrowser();
  const page = await browser.newPage({
    deviceScaleFactor: 1,
    viewport: { width: 1440, height: 1000 }
  });
  page.setDefaultTimeout(5_000);
  page.setDefaultNavigationTimeout(15_000);
  await installApiMocks(page);
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });

  for (const screen of screens) {
    await page.evaluate(() => localStorage.clear()).catch(() => undefined);
    if (screen.auth !== false) {
      await page.addInitScript(() => {
        localStorage.setItem("testhistory.sessionToken", "ts_session_screenshot");
        localStorage.setItem("testhistory.actorId", "admin");
        localStorage.setItem("testhistory.userRole", "admin");
      });
      await page.evaluate(() => {
        localStorage.setItem("testhistory.sessionToken", "ts_session_screenshot");
        localStorage.setItem("testhistory.actorId", "admin");
        localStorage.setItem("testhistory.userRole", "admin");
      });
    }
    if (typeof screen.beforeNavigate === "function") {
      await screen.beforeNavigate(page);
    }
    await page.goto(`${baseUrl}/?screen=${encodeURIComponent(screen.name)}${screen.hash}`, {
      waitUntil: "domcontentloaded"
    });
    await page.waitForTimeout(750);
    if (typeof screen.prepare === "function") {
      await screen.prepare(page);
      await page.waitForTimeout(350);
    }
    if (typeof screen.verify === "function") {
      await screen.verify(page);
    }
    const screenshotPath = path.join(outputDir, `${screen.name}.png`);
    await page.screenshot({
      fullPage: true,
      path: screenshotPath
    });
    console.log(`Captured ${screen.name}`);
  }

  await browser.close();
  writeScreenshotManifest();
  console.log(`Captured ${screens.length} screenshots in ${path.relative(workspace, outputDir)}`);
} catch (error) {
  console.error(formatScreenshotError(error));
  process.exitCode = 1;
} finally {
  await browser?.close().catch(() => undefined);
  stopPreviewServer(server);
}

function writeScreenshotManifest() {
  const files = screens.map((screen) => {
    const file = `${screen.name}.png`;
    const fullPath = path.join(outputDir, file);
    const stats = statSync(fullPath);
    if (stats.size <= 0) {
      throw new Error(`Screenshot ${file} is empty`);
    }

    return {
      file,
      hash: screen.hash,
      bytes: stats.size,
      auth: screen.auth !== false,
      dialog: typeof screen.prepare === "function"
    };
  });

  writeFileSync(
    path.join(outputDir, "manifest.json"),
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        viewport: expectedManifest.viewport,
        count: files.length,
        files
      },
      null,
      2
    )}\n`
  );
}

function validateExpectedManifest() {
  const actual = screens.map((screen) => ({
    name: screen.name,
    hash: screen.hash,
    auth: screen.auth !== false,
    dialog: typeof screen.prepare === "function"
  }));
  const expected = expectedManifest.files;
  const mismatches = [];

  if (expectedManifest.viewport?.width !== 1440 || expectedManifest.viewport?.height !== 1000) {
    mismatches.push("expected screenshot viewport must stay 1440x1000");
  }

  if (actual.length !== expected.length) {
    mismatches.push(`expected ${expected.length} screens, capture has ${actual.length}`);
  }

  for (let index = 0; index < Math.max(actual.length, expected.length); index += 1) {
    const actualScreen = actual[index];
    const expectedScreen = expected[index];
    if (actualScreen === undefined || expectedScreen === undefined) {
      mismatches.push(`screen index ${index} is missing on one side`);
      continue;
    }

    for (const field of ["name", "hash", "auth", "dialog"]) {
      if (actualScreen[field] !== expectedScreen[field]) {
        mismatches.push(
          `${actualScreen.name} ${field} expected ${JSON.stringify(
            expectedScreen[field]
          )}, got ${JSON.stringify(actualScreen[field])}`
        );
      }
    }
  }

  if (mismatches.length > 0) {
    throw new Error(`Screenshot expected manifest drift:\n- ${mismatches.join("\n- ")}`);
  }
}

function formatScreenshotError(error) {
  if (!(error instanceof Error)) {
    return String(error);
  }

  return error.message;
}

async function launchScreenshotBrowser() {
  return launchChromiumWithFallback();
}
async function installApiMocks(page) {
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    const pathname = url.pathname;

    if (pathname === "/api/v1/auth/me") {
      return route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          auth: { method: "session" },
          user: {
            email: "admin",
            id: "admin",
            name: "Admin",
            role: "admin",
            status: "active"
          }
        })
      });
    }

    if (pathname === "/api/v1/auth/tokens" && method === "GET") {
      return route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          items: [
            {
              createdAt: "2026-06-03T10:00:00.000Z",
              fingerprint: "fp_local_cli",
              id: "personal-local-cli",
              name: "Local CLI",
              prefix: "tu_live_83f4",
              scopes: ["profile:read", "tokens:read", "tokens:write"],
              status: "active",
              updatedAt: "2026-06-03T10:00:00.000Z"
            }
          ]
        })
      });
    }

    if (pathname === "/api/v1/capabilities") {
      return route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          apiVersion: "v1",
          ingestion: {
            modes: ["json-batch", "chunked-json"],
            policy: {
              chunkBytes: 524288,
              compressionMinBytes: 1024,
              maxUploadConcurrency: 4,
              retentionDays: 14
            }
          },
          modules: ["launches", "results", "test-cases", "artifacts", "defects"],
          openapiJson: "/docs/json",
          swagger: "/docs"
        })
      });
    }

    if (pathname === "/api/v1/projects" && method === "GET") {
      return route.fulfill({
        contentType: "application/json",
        body: JSON.stringify([{ id: "project-1", key: "WS", name: "Web Sandbox" }])
      });
    }

    if (pathname === "/api/v1/projects/project-1/settings/access" && method === "GET") {
      return route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(createAccessSettings())
      });
    }

    if (pathname === "/api/v1/projects/project-1/settings/artifacts" && method === "GET") {
      return route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(createArtifactSettings())
      });
    }

    const fixtureResponse = createUiFixtureApiResponse(
      pathname,
      method,
      request.postData(),
      url.search
    );
    return route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(fixtureResponse ?? createEmptyUiApiResponse(pathname))
    });
  });
}

function createAccessSettings() {
  return {
    apiTokens: [
      {
        createdAt: "2026-06-03T10:10:00.000Z",
        expiresAt: "2026-09-03T10:10:00.000Z",
        id: "token-regression",
        lastUsedAt: "2026-06-03T11:55:00.000Z",
        name: "Загрузка регрессии",
        ownerSubject: "CI регрессия",
        prefix: "th_live_83f4",
        scopes: ["launches:write", "results:write", "artifacts:read"],
        status: "active"
      }
    ],
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
      }
    ],
    integrationProviders: [
      {
        baseUrl: "https://www.jira.ru/browse/",
        enabled: true,
        encodeSuffix: true,
        id: "provider-jira",
        name: "Jira",
        preset: "jira",
        source: { kind: "label", matchMode: "first", name: "JIRA_ISSUE" },
        suffixTemplate: "{value}"
      },
      {
        baseUrl: "https://testrail.example.test/index.php?/cases/view/",
        enabled: true,
        encodeSuffix: true,
        id: "provider-testrail",
        name: "TestRail",
        preset: "testrail",
        source: { kind: "testKey", matchMode: "all", name: "TESTRAIL_CASE" },
        suffixTemplate: "{value}"
      }
    ],
    kind: "project-access-settings",
    memberships: [
      {
        displayName: "Project owner",
        email: "admin",
        id: "member-owner",
        lastActiveAt: "сегодня, 12:10",
        role: "owner",
        source: "manual",
        status: "active",
        subject: "admin"
      },
      {
        displayName: "QA",
        email: "user",
        id: "member-qa",
        lastActiveAt: "сегодня, 11:42",
        role: "editor",
        source: "manual",
        status: "active",
        subject: "user"
      }
    ],
    project: { id: "project-1", key: "WS", name: "Web Sandbox", visibility: "private" },
    visibilityPolicies: [
      {
        description: "Скрывает параметры с паролями, токенами, storage refs и signed URL.",
        id: "redact-sensitive",
        label: "Редакция чувствительных данных",
        mode: "enabled",
        owner: "Security"
      }
    ]
  };
}

function createArtifactSettings() {
  return {
    kind: "project-artifact-settings",
    projectId: "project-1",
    retention: {
      attachmentRetentionDays: 14,
      cleanupGraceDays: 7,
      compressRetainedTextArtifacts: true,
      deleteBinaryArtifactsAfterRetention: true,
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
        }
      ],
      updatedAt: "2026-06-03T10:00:00.000Z"
    },
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
      }
    ]
  };
}

async function waitForEndpoint(url) {
  const deadline = Date.now() + 30_000;
  let lastError;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`Timed out waiting for ${url}\n${serverOutput}\n${lastError?.message ?? ""}`);
}
