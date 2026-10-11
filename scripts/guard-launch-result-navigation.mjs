import path from "node:path";
import { fileURLToPath } from "node:url";

import { launchChromiumWithFallback } from "./playwright-browser.mjs";
import { startPreviewServer, stopPreviewServer } from "./preview-server.mjs";
import { createEmptyUiApiResponse, createUiFixtureApiResponse } from "./ui-api-fixtures.mjs";

const workspace = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = process.env.WEB_LAUNCH_NAVIGATION_PORT ?? "5183";
const baseUrl = `http://127.0.0.1:${port}`;
const server = startPreviewServer({ port, workspace });
let browser;

try {
  await waitForPreview();
  browser = await launchChromiumWithFallback();

  for (const width of [1440, 1024, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    page.setDefaultTimeout(10_000);
    await installApiMocks(page);
    await page.addInitScript(() => {
      localStorage.setItem("testhistory.sessionToken", "ts_session_launch_navigation");
      localStorage.setItem("testhistory.actorId", "admin");
      localStorage.setItem("testhistory.userRole", "admin");
    });

    await page.goto(`${baseUrl}/#launch`, { waitUntil: "domcontentloaded" });
    await page.locator(".launches-reference-list-row").first().waitFor();
    const filteredRequest = page.waitForRequest((request) => {
      const url = new URL(request.url());
      return (
        url.pathname === "/api/v1/launches/L-1289/results" &&
        url.searchParams.get("q") === 'status = "passed"'
      );
    });
    await page.locator(".launches-reference-progress button.is-passed").first().click();

    const rows = page.locator(".launches-reference-result-table > button");
    assert(
      (await rows.count()) === 0,
      `${width}px: results from the previous filter remain selectable while the new page loads`
    );
    await filteredRequest;
    assert(
      (await rows.count()) === 0,
      `${width}px: stale results reappeared after the filter debounce`
    );
    await page
      .locator(
        ".launches-reference-result-table > button .launches-reference-result-table-status.is-passed"
      )
      .first()
      .waitFor();
    await rows.first().click();

    await page.waitForFunction(() => window.location.hash.includes("/result/API-0002/overview"));
    const report = page.locator(".launches-reference-result-report");
    await report.waitFor({ state: "visible" });
    assert(
      new URL(page.url()).hash.includes("query=status+%3D+%22passed%22"),
      `${width}px: opening a result discarded the successful-results filter`
    );

    const list = page.locator(".launches-reference-results-pane");
    const back = page.locator(".launches-reference-mobile-back");
    if (width <= 1150) {
      assert(!(await list.isVisible()), `${width}px: the list obscures the selected result`);
      assert(await back.isVisible(), `${width}px: the return-to-list control is hidden`);
    } else {
      assert(await list.isVisible(), `${width}px: the desktop split lost its result list`);
    }

    if (width <= 600) {
      await page.locator(".launches-reference-result-tab-picker summary").click();
      await page
        .locator(".launches-reference-result-tab-picker button")
        .filter({ hasText: "Вложения" })
        .click();
    } else {
      await page
        .locator('.launches-reference-result-tabs button[data-tab-id="attachments"]')
        .click();
    }
    assert(
      new URL(page.url()).hash.includes("query=status+%3D+%22passed%22"),
      `${width}px: switching result tabs discarded the filter`
    );

    if (width <= 1150) {
      await back.click();
      assert(
        new URL(page.url()).hash.includes("/results?query=status+%3D+%22passed%22"),
        `${width}px: returning to the list discarded the filter`
      );
      await list.waitFor({ state: "visible" });
    } else {
      await page.locator('.launches-reference-result-tabs button[data-tab-id="overview"]').click();
    }

    const failedResponse = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return (
        url.pathname === "/api/v1/launches/L-1289/results" &&
        url.searchParams.get("status") === "failed"
      );
    });
    await page.locator('select[aria-label="Фильтр по статусу"]').selectOption("failed");
    await failedResponse;
    await page
      .locator(
        ".launches-reference-result-table > button .launches-reference-result-table-status.is-failed"
      )
      .first()
      .waitFor();
    assert(
      !new URL(page.url()).hash.includes("query="),
      `${width}px: changing the status preserved the previous route query`
    );

    const unfilteredResponse = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return (
        url.pathname === "/api/v1/launches/L-1289/results" &&
        !url.searchParams.has("q") &&
        !url.searchParams.has("status")
      );
    });
    await page.locator('select[aria-label="Фильтр по статусу"]').selectOption("");
    await page.waitForFunction(() => !window.location.hash.includes("query="));
    await unfilteredResponse;
    await page.locator(".launches-reference-result-table > button").first().waitFor();
    assert(
      !(await page.locator(".launches-reference-result-table [role='status']").isVisible()),
      `${width}px: clearing the filter left results in a loading state`
    );

    await page.close();
  }

  const directPage = await browser.newPage({ viewport: { width: 1024, height: 900 } });
  directPage.setDefaultTimeout(10_000);
  const directResultQueries = [];
  await installApiMocks(directPage, (query) => directResultQueries.push(query));
  await directPage.addInitScript(() => {
    localStorage.setItem("testhistory.sessionToken", "ts_session_launch_navigation");
    localStorage.setItem("testhistory.actorId", "admin");
    localStorage.setItem("testhistory.userRole", "admin");
  });
  await directPage.goto(
    `${baseUrl}/#launch/L-1289/result/API-0002/overview?query=status+%3D+%22passed%22`,
    { waitUntil: "domcontentloaded" }
  );
  await directPage.locator(".launches-reference-result-report").waitFor({ state: "visible" });
  await directPage.waitForFunction(() =>
    document.querySelector(".launches-reference-result-report")?.textContent?.includes("#002")
  );
  assert(
    directResultQueries.length > 0 &&
      directResultQueries.every((query) => query === 'status = "passed"'),
    `Direct result links fetched an unfiltered page before applying the URL filter: ${JSON.stringify(directResultQueries)}`
  );
  await directPage.goto(`${baseUrl}/#launch/L-1289/overview`, { waitUntil: "domcontentloaded" });
  await directPage.locator(".launches-reference-overview-legend-item.is-passed").click();
  await directPage.waitForFunction(() =>
    window.location.hash.includes("/results?query=status+%3D+%22passed%22")
  );
  await directPage
    .locator(
      ".launches-reference-result-table > button .launches-reference-result-table-status.is-passed"
    )
    .first()
    .waitFor();
  await directPage.locator(".launches-reference-result-table > button").first().click();
  await directPage.waitForFunction(
    () =>
      window.location.hash.includes("/result/") &&
      window.location.hash.includes("query=status+%3D+%22passed%22")
  );
  await directPage.locator(".launches-reference-result-report").waitFor({ state: "visible" });
  assert(
    !(await directPage.locator(".launches-reference-results-pane").isVisible()),
    "Overview status filter left the result hidden below the list"
  );
  await directPage.close();

  console.log("Launch result navigation guard passed at 1440, 1024, and 390 px plus direct links");
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  await browser?.close().catch(() => undefined);
  stopPreviewServer(server);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function waitForPreview() {
  for (let index = 0; index < 100; index += 1) {
    try {
      const response = await fetch(baseUrl);
      if (response.ok) return;
    } catch {
      // The preview server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Web preview did not start at ${baseUrl}`);
}

async function installApiMocks(page, onResultPageRequest = () => undefined) {
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const pathname = url.pathname;

    if (pathname === "/api/v1/auth/me") {
      return route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          auth: { method: "session" },
          user: { id: "admin", email: "admin", name: "Admin", role: "admin", status: "active" }
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

    if (pathname === "/api/v1/launches/L-1289/results") {
      onResultPageRequest(url.searchParams.get("q"));
      const status = /^status = "([a-z]+)"$/.exec(url.searchParams.get("q") ?? "")?.[1];
      if (status !== undefined) {
        await new Promise((resolve) => setTimeout(resolve, 650));
        url.searchParams.delete("q");
        url.searchParams.set("status", status);
      }
    }
    const payload = createUiFixtureApiResponse(
      pathname,
      request.method(),
      request.postData(),
      url.search
    );
    return route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(payload ?? createEmptyUiApiResponse(pathname))
    });
  });
}
