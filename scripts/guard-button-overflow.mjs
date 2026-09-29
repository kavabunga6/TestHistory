import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { launchChromiumWithFallback } from "./playwright-browser.mjs";
import { startPreviewServer, stopPreviewServer } from "./preview-server.mjs";
import { createEmptyUiApiResponse, createUiFixtureApiResponse } from "./ui-api-fixtures.mjs";
import { screens as screenshotScreens } from "./ui-screenshot-screens.mjs";

const workspace = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const expectedManifest = JSON.parse(
  readFileSync(path.join(workspace, "docs/screenshots/expected-manifest.json"), "utf8")
);
const overflowManifestExclusions = new Set(["dialog-dashboard-widget-delete"]);
const port = process.env.WEB_BUTTON_OVERFLOW_PORT ?? "5178";
const existingServerUrl = process.env.WEB_BUTTON_OVERFLOW_BASE_URL;
const baseUrl = existingServerUrl ?? `http://127.0.0.1:${port}`;
const tolerancePx = 1;
const allScreens = screenshotScreens.filter(
  (screen) => !overflowManifestExclusions.has(screen.name)
);
const screenFilter = process.env.WEB_BUTTON_OVERFLOW_SCREEN;
const screens =
  screenFilter === undefined
    ? allScreens
    : allScreens.filter((screen) => screen.name === screenFilter);

if (screenFilter !== undefined && screens.length === 0) {
  throw new Error(`Unknown button overflow screen filter: ${screenFilter}`);
}

validateExpectedManifest();

const server =
  existingServerUrl === undefined ? startPreviewServer({ port, workspace }) : undefined;

let serverOutput = "";
server?.stdout.on("data", (chunk) => {
  serverOutput += chunk.toString();
});
server?.stderr.on("data", (chunk) => {
  serverOutput += chunk.toString();
});

let browser;
try {
  await waitForEndpoint(baseUrl);
  browser = await launchBrowserForGuard();
  const allViewports = [
    { height: 1000, name: "desktop", width: 1440 },
    { height: 900, name: "narrow-desktop", width: 1120 },
    { height: 900, name: "tablet", width: 820 },
    { height: 844, name: "mobile", width: 390 },
    { height: 700, name: "small-mobile", width: 320 }
  ];
  const viewportFilter = process.env.WEB_BUTTON_OVERFLOW_VIEWPORT;
  const viewports = viewportFilter
    ? allViewports.filter((viewport) => viewport.name === viewportFilter)
    : allViewports;
  if (viewports.length === 0) {
    throw new Error(`Unknown button overflow viewport: ${viewportFilter}`);
  }
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
      if (typeof screen.beforeNavigate === "function") {
        await screen.beforeNavigate(page);
      }
      const navigationKey = encodeURIComponent(`${viewport.name}-${screen.name}`);
      await page.goto(`${baseUrl}/?guard=${navigationKey}&screen=${screen.name}${screen.hash}`, {
        waitUntil: "domcontentloaded"
      });
      await page.waitForTimeout(750);
      if (typeof screen.interact === "function") {
        await screen.interact(page);
        await page.waitForTimeout(350);
      }
      if (typeof screen.prepare === "function") {
        await screen.prepare(page);
        await page.waitForTimeout(350);
      }
      const screenFailures = await page.evaluate(
        ({ tolerance }) => {
          const pageWidth = document.documentElement.scrollWidth;
          const layoutFailures =
            pageWidth > window.innerWidth + tolerance
              ? [
                  {
                    index: -1,
                    label: "Ширина страницы",
                    problems: [`page ${pageWidth}px > viewport ${window.innerWidth}px`]
                  }
                ]
              : [];
          const controls = Array.from(document.querySelectorAll("button, [role='button']"));

          return [
            ...layoutFailures,
            ...controls.flatMap((control, index) => {
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
            })
          ];

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
  if (server !== undefined) stopPreviewServer(server);
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
    const screenName =
      new URL(request.headers().referer ?? page.url()).searchParams.get("screen") ?? "";
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
      url.search,
      screenName
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
