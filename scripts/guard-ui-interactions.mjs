import path from "node:path";
import { fileURLToPath } from "node:url";
import { launchChromiumWithFallback } from "./playwright-browser.mjs";
import { startPreviewServer, stopPreviewServer } from "./preview-server.mjs";

const workspace = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = process.env.WEB_UI_INTERACTIONS_PORT ?? "5176";
const baseUrl = `http://127.0.0.1:${port}`;

let accessSettings = createAccessSettings();
let artifactSettings = createArtifactSettings();
const savedAccessPayloads = [];
const savedArtifactPayloads = [];

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
  browser = await launchBrowserForGuard();
  const page = await browser.newPage({
    deviceScaleFactor: 1,
    viewport: { width: 1440, height: 1000 }
  });
  page.setDefaultTimeout(5_000);
  page.setDefaultNavigationTimeout(15_000);

  await installApiMocks(page);
  await page.addInitScript(() => {
    localStorage.setItem("testhistory.sessionToken", "ts_session_ui_guard");
    localStorage.setItem("testhistory.actorId", "admin");
    localStorage.setItem("testhistory.userRole", "admin");
  });

  await page.goto(`${baseUrl}/#settings/integrations`, { waitUntil: "domcontentloaded" });
  await expectVisibleText(page, "Провайдеры ссылок");
  await expectCount(page, ".project-settings__integrations-table-row", 1);

  await page.getByRole("button", { name: "Добавить" }).click();
  await expectVisibleText(page, "Редактирование интеграции");
  await assertDialogLayout(page, "new integration dialog");
  await expectCount(page, ".project-settings__integrations-table-row", 1);
  await page.getByRole("button", { name: "Отмена" }).click();
  await expectCount(page, ".project-settings__integrations-table-row", 1);

  await page.getByRole("button", { name: "Добавить" }).click();
  await page.getByLabel("Название").fill("GitHub Issues");
  await page.getByLabel("Лейбл в Allure").fill("GITHUB_ISSUE");
  await page.getByLabel("Шаблон ссылки").fill("https://github.com/acme/app/issues/{value}");
  await page.getByLabel("Пример значения").fill("42");
  await page.getByRole("button", { name: "Сохранить" }).click();
  await expectCount(page, ".project-settings__integrations-table-row", 2);
  assert(
    savedAccessPayloads
      .at(-1)
      ?.integrationProviders?.some(
        (provider) => provider.name === "GitHub Issues" && provider.source.name === "GITHUB_ISSUE"
      ),
    "Saving a new integration should persist it through the settings access API"
  );

  const firstSwitch = page.getByRole("switch").first();
  const initialChecked = await firstSwitch.getAttribute("aria-checked");
  await firstSwitch.click();
  await page.waitForFunction(
    (checked) =>
      document.querySelector("[role='switch']")?.getAttribute("aria-checked") !== checked,
    initialChecked
  );
  assert(
    savedAccessPayloads.at(-1)?.integrationProviders?.[0]?.enabled === false,
    "Switching an integration off should persist enabled=false"
  );

  await page.getByRole("button", { name: "Доступ" }).click();
  await expectVisibleText(page, "Участники проекта");
  await page.getByTitle("Показать матрицу прав").click();
  await expectVisibleText(page, "Матрица прав");
  await page.getByRole("button", { name: "Закрыть матрицу прав" }).click();
  await expectHiddenText(page, "Матрица прав");
  await page
    .locator(".project-settings__member-card .project-settings__icon-button")
    .first()
    .click();
  await assertDialogLayout(page, "member edit dialog");
  await page.getByRole("button", { name: "Отмена" }).click();

  await page.getByRole("button", { name: "Хранение" }).click();
  await page.getByLabel("Хранить вложения, дней").fill("21");
  await page.getByRole("button", { name: "Сохранить" }).click();
  assert(
    savedArtifactPayloads.at(-1)?.attachmentRetentionDays === 21,
    "Artifact retention form should persist numeric edits"
  );

  const inaccessibleControls = await page.evaluate(() =>
    Array.from(document.querySelectorAll("button, [role='button'], [role='switch']")).flatMap(
      (control) => {
        if (!(control instanceof HTMLElement)) {
          return [];
        }
        const style = window.getComputedStyle(control);
        const rect = control.getBoundingClientRect();
        if (style.display === "none" || style.visibility === "hidden" || rect.width === 0) {
          return [];
        }

        const label =
          control.getAttribute("aria-label") ||
          control.getAttribute("title") ||
          control.textContent?.replace(/\s+/g, " ").trim();

        return label ? [] : [control.outerHTML.slice(0, 160)];
      }
    )
  );
  assert(
    inaccessibleControls.length === 0,
    `Every visible button/switch should have text, title, or aria-label:\n${inaccessibleControls.join(
      "\n"
    )}`
  );

  await browser.close();
  console.log("UI interaction guard passed");
} catch (error) {
  console.error(formatGuardError(error));
  process.exitCode = 1;
} finally {
  await browser?.close().catch(() => undefined);
  stopPreviewServer(server);
}

async function launchBrowserForGuard() {
  return launchChromiumWithFallback();
}

function formatGuardError(error) {
  if (!(error instanceof Error)) {
    return String(error);
  }

  return error.message;
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

    if (pathname === "/api/v1/auth/tokens") {
      return route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ items: [] })
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

    if (pathname.endsWith("/settings/access") && method === "GET") {
      return route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(accessSettings)
      });
    }

    if (pathname.endsWith("/settings/access") && method === "PATCH") {
      const payload = request.postDataJSON();
      savedAccessPayloads.push(payload);
      accessSettings = {
        ...accessSettings,
        ...payload,
        project: {
          ...accessSettings.project,
          ...(payload.project ?? {})
        },
        updatedAt: new Date().toISOString()
      };
      return route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(accessSettings)
      });
    }

    if (pathname.endsWith("/settings/artifacts") && method === "GET") {
      return route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(artifactSettings)
      });
    }

    if (pathname.endsWith("/settings/artifacts") && method === "PATCH") {
      const payload = request.postDataJSON();
      savedArtifactPayloads.push(payload);
      artifactSettings = {
        ...artifactSettings,
        retention: {
          ...artifactSettings.retention,
          ...payload,
          updatedAt: new Date().toISOString()
        }
      };
      return route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(artifactSettings)
      });
    }

    return route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(emptyApiResponse(pathname))
    });
  });
}

async function expectVisibleText(page, text) {
  await page.getByText(text, { exact: false }).first().waitFor({ state: "visible" });
}

async function expectHiddenText(page, text) {
  await page.getByText(text, { exact: false }).first().waitFor({ state: "hidden" });
}

async function expectCount(page, selector, expected) {
  await page.waitForFunction(
    ({ selector: itemSelector, expectedCount }) =>
      document.querySelectorAll(itemSelector).length === expectedCount,
    { expectedCount: expected, selector }
  );
}

async function assertDialogLayout(page, context) {
  const failures = await page.evaluate(() => {
    const tolerance = 2;
    const dialogs = Array.from(document.querySelectorAll("[role='dialog']"));

    return dialogs.flatMap((dialog, dialogIndex) => {
      if (!(dialog instanceof HTMLElement)) {
        return [];
      }

      const body = dialog.querySelector(".project-settings__dialog-body");
      if (!(body instanceof HTMLElement)) {
        return [];
      }

      const bodyRect = body.getBoundingClientRect();
      const bodyContentLeft = bodyRect.left + body.clientLeft;
      const bodyContentRight = bodyContentLeft + body.clientWidth;
      const problems = [];
      const labels = Array.from(body.querySelectorAll("label")).filter(
        (label) => label instanceof HTMLElement
      );

      for (const label of labels) {
        const rect = label.getBoundingClientRect();
        if (Math.abs(rect.left - bodyContentLeft) > tolerance) {
          problems.push(
            `label "${compactText(label)}" starts at ${Math.round(rect.left)}, body content starts at ${Math.round(
              bodyContentLeft
            )}`
          );
        }
        if (Math.abs(rect.right - bodyContentRight) > tolerance) {
          problems.push(
            `label "${compactText(label)}" ends at ${Math.round(rect.right)}, body content ends at ${Math.round(
              bodyContentRight
            )}`
          );
        }
      }

      const controls = Array.from(
        body.querySelectorAll("input:not([type='checkbox']), select, textarea, [role='switch']")
      ).filter((control) => control instanceof HTMLElement);
      for (const control of controls) {
        const rect = control.getBoundingClientRect();
        if (rect.left < bodyContentLeft - tolerance || rect.right > bodyContentRight + tolerance) {
          problems.push(
            `control "${compactText(control)}" ${formatRect(rect)} outside body ${formatRect(bodyRect)}`
          );
        }
      }

      return problems.map((problem) => `dialog ${dialogIndex}: ${problem}`);
    });

    function compactText(element) {
      return (
        element.getAttribute("aria-label") ||
        element.textContent?.replace(/\s+/g, " ").trim() ||
        element.getAttribute("title") ||
        element.tagName
      ).slice(0, 80);
    }

    function formatRect(rect) {
      return `${Math.round(rect.left)},${Math.round(rect.top)} ${Math.round(rect.width)}x${Math.round(
        rect.height
      )}`;
    }
  });

  assert(
    failures.length === 0,
    `Dialog layout guard failed for ${context}:\n${failures.join("\n")}`
  );
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

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function createAccessSettings() {
  return {
    apiTokens: [],
    customFieldMappings: [
      {
        displayName: "Компонент",
        enabled: true,
        id: "field-component",
        labelName: "component",
        required: false,
        targetField: "component"
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
      }
    ],
    kind: "project-access-settings",
    memberships: [
      {
        createdAt: "2026-06-03T00:00:00.000Z",
        displayName: "Project owner",
        id: "member-owner",
        role: "owner",
        source: "manual",
        status: "active",
        subject: "admin",
        updatedAt: "2026-06-03T00:00:00.000Z"
      },
      {
        createdAt: "2026-06-03T00:00:00.000Z",
        displayName: "QA",
        id: "member-qa",
        role: "editor",
        source: "manual",
        status: "active",
        subject: "user",
        updatedAt: "2026-06-03T00:00:00.000Z"
      }
    ],
    project: { id: "project-1", key: "WS", name: "Web Sandbox", visibility: "private" },
    schemaVersion: 1,
    updatedAt: "2026-06-03T00:00:00.000Z",
    visibilityPolicies: [
      {
        description: "Сырые вложения доступны участникам проекта.",
        id: "policy-artifacts",
        mode: "limited",
        name: "Вложения",
        scope: "artifacts"
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
      cleanupGraceDays: 3,
      compressRetainedTextArtifacts: true,
      deleteBinaryArtifactsAfterRetention: true,
      updatedAt: "2026-06-03T00:00:00.000Z"
    }
  };
}

function emptyApiResponse(pathname) {
  if (pathname.includes("/launches")) {
    return { items: [], kind: "launch-list", page: emptyPage() };
  }
  if (pathname.includes("/test-cases")) {
    return { items: [], kind: "test-case-list", page: emptyPage() };
  }
  if (pathname.includes("/defects")) {
    return { items: [], kind: "defect-list", page: emptyPage() };
  }
  return { items: [], page: emptyPage() };
}

function emptyPage() {
  return {
    cursor: null,
    hasMore: false,
    limit: 10,
    nextCursor: null,
    offset: 0,
    returned: 0,
    total: 0
  };
}
