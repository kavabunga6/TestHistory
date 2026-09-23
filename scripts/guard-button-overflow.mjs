import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { launchChromiumWithFallback } from "./playwright-browser.mjs";
import { startPreviewServer, stopPreviewServer } from "./preview-server.mjs";
import { createEmptyUiApiResponse, createUiFixtureApiResponse } from "./ui-api-fixtures.mjs";

const workspace = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const expectedManifest = JSON.parse(
  readFileSync(path.join(workspace, "docs/screenshots/expected-manifest.json"), "utf8")
);
const overflowManifestExclusions = new Set(["dialog-dashboard-widget-delete"]);
const port = process.env.WEB_BUTTON_OVERFLOW_PORT ?? "5178";
const baseUrl = `http://127.0.0.1:${port}`;
const tolerancePx = 1;
const allScreens = [
  { name: "auth-login", hash: "#launch", auth: false },
  { name: "projects", hash: "#projects" },
  { name: "dashboard", hash: "#dashboard" },
  { name: "launches", hash: "#launch" },
  { name: "launch-detail", hash: "#launch/L-1289" },
  { name: "launch-results", hash: "#launch/L-1289/results" },
  { name: "launch-result-history", hash: "#launch/L-1289/result/PAY-1042/history" },
  { name: "launch-result-defects", hash: "#launch/L-1289/result/PAY-1042/defects" },
  { name: "selected-test-case", hash: "#case/PAY-1042/overview" },
  { name: "selected-test-case-history", hash: "#case/PAY-1042/history" },
  { name: "selected-test-case-defects", hash: "#case/PAY-1042/defects" },
  { name: "defects", hash: "#defects/PAY-337" },
  { name: "analytics", hash: "#analytics" },
  { name: "settings-access", hash: "#settings/access" },
  { name: "settings-tokens", hash: "#settings/tokens" },
  { name: "settings-integrations", hash: "#settings/integrations" },
  { name: "settings-retention", hash: "#settings/retention" },
  { name: "settings-fields", hash: "#settings/fields" },
  {
    name: "dialog-role-matrix",
    hash: "#settings/access",
    prepare: async (page) => {
      await clickSingle(
        page,
        ".project-settings__panel-title--inline .project-settings__icon-button"
      );
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
      await page.locator(".project-settings__actions button").first().click();
    }
  },
  {
    name: "dialog-api-token",
    hash: "#settings/tokens",
    prepare: async (page) => {
      await page
        .locator(".project-settings__panel", { hasText: "API токены проекта" })
        .getByRole("button", { name: "Создать" })
        .click();
    }
  },
  {
    name: "dialog-quarantine",
    hash: "#launch/L-1289/result/PAY-1042",
    prepare: async (page) => {
      const action = page.locator(".launches-reference-result-action");
      try {
        await action.first().click();
      } catch (error) {
        const routeState = await page
          .locator(".launches-reference-route-state")
          .allTextContents()
          .catch(() => []);
        const visibleText = await page
          .locator("main")
          .innerText()
          .then((text) => text.replace(/\s+/g, " ").slice(0, 800))
          .catch(() => "unavailable");
        throw new Error(
          `Quarantine action is unavailable. Route state: ${routeState.join(" | ") || "none"}. Visible UI: ${visibleText}. ${formatGuardError(error)}`
        );
      }
    }
  },
  {
    name: "dialog-delete-launch",
    hash: "#launch/L-1289",
    prepare: async (page) => {
      await page.locator(".launches-reference-danger-action").click();
    }
  }
];
const screenFilter = process.env.WEB_BUTTON_OVERFLOW_SCREEN;
const screens =
  screenFilter === undefined
    ? allScreens
    : allScreens.filter((screen) => screen.name === screenFilter);

if (screenFilter !== undefined && screens.length === 0) {
  throw new Error(`Unknown button overflow screen filter: ${screenFilter}`);
}

validateExpectedManifest();

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
  const viewports = [
    { height: 1000, name: "desktop", width: 1440 },
    { height: 900, name: "narrow-desktop", width: 1120 },
    { height: 900, name: "tablet", width: 820 }
  ];
  const failures = [];

  for (const viewport of viewports) {
    const page = await browser.newPage({
      deviceScaleFactor: 1,
      viewport: { width: viewport.width, height: viewport.height }
    });
    page.setDefaultTimeout(5_000);
    page.setDefaultNavigationTimeout(15_000);
    await installApiMocks(page);
    await page.goto(baseUrl, { waitUntil: "domcontentloaded" });

    for (const screen of screens) {
      await page.evaluate(() => localStorage.clear()).catch(() => undefined);
      if (screen.auth !== false) {
        await page.evaluate(() => {
          localStorage.setItem("testhistory.sessionToken", "ts_session_overflow_guard");
          localStorage.setItem("testhistory.actorId", "admin");
          localStorage.setItem("testhistory.userRole", "admin");
        });
      }
      const navigationKey = encodeURIComponent(`${viewport.name}-${screen.name}`);
      await page.goto(`${baseUrl}/?guard=${navigationKey}${screen.hash}`, {
        waitUntil: "domcontentloaded"
      });
      await page.waitForTimeout(750);
      if (typeof screen.prepare === "function") {
        await screen.prepare(page);
        await page.waitForTimeout(350);
      }
      const screenFailures = await page.evaluate(
        ({ tolerance }) => {
          const controls = Array.from(document.querySelectorAll("button, [role='button']"));

          return controls.flatMap((control, index) => {
            if (!(control instanceof HTMLElement || control instanceof SVGElement)) {
              return [];
            }

            const style = window.getComputedStyle(control);
            const rect = control.getBoundingClientRect();
            if (
              rect.width <= 0 ||
              rect.height <= 0 ||
              style.visibility === "hidden" ||
              style.display === "none"
            ) {
              return [];
            }

            const problems = [];
            const scrollWidth = "scrollWidth" in control ? control.scrollWidth : rect.width;
            const scrollHeight = "scrollHeight" in control ? control.scrollHeight : rect.height;

            if (scrollWidth > rect.width + tolerance || scrollHeight > rect.height + tolerance) {
              problems.push(
                `scroll ${Math.round(scrollWidth)}x${Math.round(scrollHeight)} > ${Math.round(
                  rect.width
                )}x${Math.round(rect.height)}`
              );
            }

            for (const childRect of getContentRects(control)) {
              if (
                childRect.width <= 0 ||
                childRect.height <= 0 ||
                childRect.right < rect.left ||
                childRect.left > rect.right ||
                childRect.bottom < rect.top ||
                childRect.top > rect.bottom
              ) {
                continue;
              }

              if (
                childRect.left < rect.left - tolerance ||
                childRect.right > rect.right + tolerance ||
                childRect.top < rect.top - tolerance ||
                childRect.bottom > rect.bottom + tolerance
              ) {
                problems.push(
                  `content rect ${formatRect(childRect)} outside button ${formatRect(rect)}`
                );
                break;
              }
            }

            if (problems.length === 0) {
              return [];
            }

            return [
              {
                index,
                label:
                  control.getAttribute("aria-label") ||
                  control.textContent?.replace(/\s+/g, " ").trim() ||
                  control.getAttribute("title") ||
                  control.className.toString() ||
                  control.tagName,
                problems
              }
            ];
          });

          function getContentRects(root) {
            const rects = [];
            const walker = document.createTreeWalker(
              root,
              NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT
            );
            let node = walker.nextNode();

            while (node !== null) {
              if (node.nodeType === Node.TEXT_NODE) {
                if (node.textContent?.trim()) {
                  const textContainer = node.parentElement;
                  const textStyle =
                    textContainer === null ? undefined : window.getComputedStyle(textContainer);
                  const intentionallyClipped =
                    textStyle?.textOverflow === "ellipsis" &&
                    (textStyle.overflowX === "hidden" || textStyle.overflowX === "clip");

                  if (!intentionallyClipped) {
                    const range = document.createRange();
                    range.selectNodeContents(node);
                    rects.push(...Array.from(range.getClientRects()));
                    range.detach();
                  }
                }
              } else if (node instanceof Element) {
                const childStyle = window.getComputedStyle(node);
                if (childStyle.display !== "none" && childStyle.visibility !== "hidden") {
                  rects.push(node.getBoundingClientRect());
                }
              }
              node = walker.nextNode();
            }

            return rects;
          }

          function formatRect(rect) {
            return `${Math.round(rect.left)},${Math.round(rect.top)} ${Math.round(
              rect.width
            )}x${Math.round(rect.height)}`;
          }
        },
        { tolerance: tolerancePx }
      );

      for (const failure of screenFailures) {
        failures.push({ ...failure, screen: screen.name, viewport: viewport.name });
      }
    }

    await page.close();
  }

  await browser.close();

  if (failures.length > 0) {
    console.error("Button overflow guard failed:");
    for (const failure of failures.slice(0, 30)) {
      console.error(
        `- ${failure.viewport}/${failure.screen} button #${failure.index} "${failure.label}": ${failure.problems.join(
          "; "
        )}`
      );
    }
    if (failures.length > 30) {
      console.error(`...and ${failures.length - 30} more`);
    }
    process.exit(1);
  }

  console.log("Button overflow guard passed");
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

async function clickSingle(page, selector) {
  const locator = page.locator(selector);
  try {
    await locator.first().waitFor({ state: "visible" });
  } catch (error) {
    const diagnostics = await page.evaluate(() => ({
      hash: location.hash,
      mainText: document
        .querySelector("main")
        ?.textContent?.replace(/\s+/g, " ")
        .trim()
        .slice(0, 800),
      role: localStorage.getItem("testhistory.userRole")
    }));
    throw new Error(
      `Could not find ${selector}. Page diagnostics: ${JSON.stringify(diagnostics)}. ${formatGuardError(error)}`
    );
  }
  const count = await locator.count();
  if (count !== 1) {
    throw new Error(`Expected one ${selector}, found ${count}`);
  }
  await locator.click();
}

async function installApiMocks(page) {
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    const pathname = url.pathname;
    if (process.env.WEB_UI_GUARD_DEBUG === "1") {
      console.log(`[ui-guard] ${method} ${pathname}`);
    }

    if (pathname === "/api/v1/auth/me") {
      return route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          auth: { method: "session" },
          user: { email: "admin", id: "admin", name: "Admin", role: "admin", status: "active" }
        })
      });
    }

    if (pathname === "/api/v1/auth/tokens" && method === "GET") {
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
          ingestion: { modes: ["json-batch"], policy: { retentionDays: 14 } },
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
        body: JSON.stringify(createOverflowAccessSettings())
      });
    }

    if (pathname.endsWith("/settings/artifacts") && method === "GET") {
      return route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(createOverflowArtifactSettings())
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

function createOverflowAccessSettings() {
  return {
    apiTokens: [],
    customFieldMappings: [],
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
        displayName: "Project owner",
        email: "admin",
        id: "member-owner",
        lastActiveAt: "сегодня, 12:10",
        role: "owner",
        source: "manual",
        status: "active",
        subject: "admin"
      }
    ],
    project: { id: "project-1", key: "WS", name: "Web Sandbox", visibility: "private" },
    visibilityPolicies: []
  };
}

function createOverflowArtifactSettings() {
  const retentionPolicies = [
    {
      artifact: "Скриншоты",
      failedDays: 90,
      id: "screenshots",
      maxSizeMb: 25,
      passedDays: 14,
      quarantinedDays: 120
    }
  ];

  return {
    kind: "project-artifact-settings",
    projectId: "project-1",
    retention: {
      attachmentRetentionDays: 14,
      cleanupGraceDays: 7,
      compressRetainedTextArtifacts: true,
      deleteBinaryArtifactsAfterRetention: true,
      retentionPolicies,
      updatedAt: "2026-06-03T10:00:00.000Z"
    },
    retentionPolicies
  };
}

function validateExpectedManifest() {
  const actual = allScreens.map((screen) => ({
    name: screen.name,
    hash: screen.hash,
    auth: screen.auth !== false,
    dialog: typeof screen.prepare === "function"
  }));
  const expected = expectedManifest.files.filter(
    (screen) => !overflowManifestExclusions.has(screen.name)
  );
  const mismatches = [];

  if (actual.length !== expected.length) {
    mismatches.push(`expected ${expected.length} screens, overflow guard has ${actual.length}`);
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
    throw new Error(`Button overflow expected manifest drift:\n- ${mismatches.join("\n- ")}`);
  }
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
