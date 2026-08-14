import { launchChromiumWithFallback } from "./playwright-browser.mjs";

const webUrl = process.env.TESTHISTORY_WEB_URL ?? "http://127.0.0.1:5173";
const apiUrl = process.env.TESTHISTORY_API_URL ?? "http://127.0.0.1:18080";
const username = process.env.TESTHISTORY_UI_USERNAME ?? "admin";
const password = process.env.TESTHISTORY_UI_PASSWORD ?? "admin";
const browserErrors = [];

await assertReady(`${apiUrl}/health`, "API");
await assertReady(webUrl, "web UI");
const projectsBefore = await loadProjectCount();

const browser = await launchChromiumWithFallback();
try {
  const page = await browser.newPage({ viewport: { height: 900, width: 1440 } });
  page.setDefaultTimeout(10_000);
  page.on("console", (message) => {
    if (message.type() === "error") {
      const location = message.location().url;
      browserErrors.push(
        `console: ${message.text()}${location.length > 0 ? ` (${location})` : ""}`
      );
    }
  });
  page.on("response", (response) => {
    if (response.status() >= 400) {
      browserErrors.push(`http: ${response.status()} ${response.url()}`);
    }
  });
  page.on("pageerror", (error) => browserErrors.push(`page: ${error.message}`));

  await page.goto(webUrl, { waitUntil: "domcontentloaded" });
  const loginButton = page.getByRole("button", { exact: true, name: "Войти" });
  if (await loginButton.isVisible()) {
    await page.getByLabel("Email").fill(username);
    await page.getByLabel("Пароль").fill(password);
    await loginButton.click();
  }

  await page.goto(`${webUrl}/#launch`, { waitUntil: "domcontentloaded" });
  const fontState = await inspectBundledInter(page);
  const evidenceLaunch = page
    .locator(".launches-reference-list-row")
    .filter({ hasText: "Android instrumentation evidence #114" });
  await evidenceLaunch.waitFor();
  await evidenceLaunch.click();
  await page.locator(".launches-reference-tabs button").nth(1).click();
  await page.locator(".launches-reference-result-table button").first().waitFor();
  await assertResizableColumnPersists(page, ".launches-reference-split-resizer", async () => {
    await page.locator(".launches-reference-tabs button").nth(0).click();
    await page.locator(".launches-reference-tabs button").nth(1).click();
    await page.locator(".launches-reference-result-table button").first().waitFor();
  });
  await assertIndependentSplitScroll(page, {
    detailSelector: ".launches-reference-detail-pane",
    listSelector: ".launches-reference-result-table"
  });
  const resultTabs = page.getByRole("navigation", { name: "Вкладки результата теста" });
  const retriesTab = resultTabs.getByRole("button", { name: /^Перезапуски/ });
  await retriesTab.waitFor();
  await retriesTab.click();
  await page.getByRole("heading", { exact: true, name: "Перезапуски" }).waitFor();
  await resultTabs.getByRole("button", { name: /^Вложения/ }).click();
  const attachment = page.locator(".launches-reference-attachment").first();
  await attachment.waitFor();
  await attachment.locator("summary").click();
  await attachment.locator("img").waitFor();

  await page.getByRole("button", { exact: true, name: "Тест-кейсы" }).click();
  await page.getByRole("heading", { name: /^Тест-кейсы/ }).waitFor();
  const testCaseRows = page.locator(".tc-detail-reference-row, .test-case-list-reference-row");
  await testCaseRows.first().waitFor();
  await assertResizableColumnPersists(page, ".tc-detail-reference-splitter", async () => {
    const testCaseUrl = page.url();
    const navigation = page.getByRole("navigation", { name: "Основная навигация" });
    await navigation.getByRole("button", { exact: true, name: "Запуски" }).click();
    await page.goBack();
    await page.waitForURL(testCaseUrl);
    await page.getByRole("heading", { name: /^Тест-кейсы/ }).waitFor();
    await page.waitForFunction(
      () => document.querySelectorAll(".tc-detail-reference-row").length > 1
    );
  });
  await assertIndependentSplitScroll(page, {
    detailSelector: ".tc-detail-reference-details",
    listSelector: ".tc-detail-reference-list"
  });
  if ((await testCaseRows.count()) === 0) {
    throw new Error("Launch-to-test-case navigation rendered an empty test-case list");
  }
  const search = page.getByRole("searchbox", { name: "THQL поиск тест-кейсов" });
  await search.fill("checkout");
  if ((await search.inputValue()) !== "checkout") {
    throw new Error("Test-case search did not retain the entered query");
  }
  const linkedTestCaseName = "failed assertion is reported with visible screenshot";
  await search.fill(linkedTestCaseName);
  const linkedTestCase = testCaseRows.filter({ hasText: linkedTestCaseName });
  await linkedTestCase.waitFor();
  await linkedTestCase.click();
  await page.getByRole("heading", { exact: true, name: linkedTestCaseName }).waitFor();
  const testCaseRail = page.locator(".tc-detail-reference-side-rail");
  const historyCell = testCaseRail.locator(".tc-detail-reference-history-item").first();
  await historyCell.waitFor();
  const historyCellText = await historyCell.innerText();
  if (/Успешный|Провален|Сломан|Пропущен|Карантин/i.test(historyCellText)) {
    throw new Error("Result history cell still renders a redundant status label");
  }
  const resultLink = testCaseRail.locator('a[href^="https://"]:not([href*="/browse/"])').first();
  await resultLink.waitFor();
  const issueLink = testCaseRail.locator('a[href*="/browse/"]').first();
  await issueLink.waitFor();
  const tagButton = testCaseRail.locator(".rail-section--chips button").first();
  await tagButton.waitFor();
  await tagButton.click();
  const launchResultSearch = page.getByRole("searchbox", {
    name: "THQL \u043f\u043e\u0438\u0441\u043a \u0440\u0435\u0437\u0443\u043b\u044c\u0442\u0430\u0442\u043e\u0432 \u0437\u0430\u043f\u0443\u0441\u043a\u0430"
  });
  await launchResultSearch.waitFor();
  if (!/^tag = ".+"$/.test(await launchResultSearch.inputValue())) {
    throw new Error("Clicking a test-case tag did not apply a THQL tag filter");
  }

  await page
    .getByRole("navigation", { name: "Основная навигация" })
    .getByRole("button", { exact: true, name: "Дефекты" })
    .click();
  await page.getByRole("heading", { name: /^Дефекты/ }).waitFor();
  const defectRows = page.locator(".defects-reference-row");
  await defectRows.first().waitFor();
  const defectCountBeforeSelection = await defectRows.count();
  if (defectCountBeforeSelection < 2) {
    throw new Error("Defect smoke data must contain at least two defects");
  }
  const selectedDefectTitle = (await defectRows.nth(1).locator("strong").innerText()).trim();
  await defectRows.nth(1).click();
  await page.waitForURL(/#defects\//);
  await page.getByRole("heading", { exact: true, name: selectedDefectTitle }).waitFor();
  const defectCountAfterSelection = await defectRows.count();
  if (defectCountAfterSelection !== defectCountBeforeSelection) {
    throw new Error(
      `Selecting a defect changed the list size (${defectCountBeforeSelection} -> ${defectCountAfterSelection})`
    );
  }
  await page.locator(".defects-reference-splitter").waitFor();
  await assertResizableColumnPersists(page, ".defects-reference-splitter", async () => {
    const defectRouteUrl = page.url();
    const navigation = page.getByRole("navigation", { name: "Основная навигация" });
    await navigation.getByRole("button", { exact: true, name: "Тест-кейсы" }).click();
    await page.goBack();
    await page.waitForURL(defectRouteUrl);
    await page.getByRole("heading", { exact: true, name: selectedDefectTitle }).waitFor();
  });
  const defectLayout = await page.evaluate(() => {
    const list = document.querySelector(".defects-reference-list");
    const detail = document.querySelector(".defects-reference-detail-panel");
    const cards = document.querySelectorAll(".defects-reference-section");
    const workspace = document.querySelector(".defects-reference-workspace");
    const splitter = document.querySelector(".defects-reference-splitter");
    const leftAlignedElements = [
      document.querySelector(".defects-reference-header h1"),
      document.querySelector(".defects-reference-list-panel .thql-search")
    ];
    const detailAlignedElements = [
      document.querySelector(".defects-reference-detail-title h2"),
      document.querySelector(".defects-reference-detail-meta"),
      document.querySelector(".defects-reference-section")
    ];
    const xSpread = (elements) => {
      const coordinates = elements
        .filter((element) => element !== null)
        .map((element) => Math.round(element.getBoundingClientRect().x));
      return Math.max(...coordinates) - Math.min(...coordinates);
    };

    return {
      cardCount: cards.length,
      detailOverflow: detail === null ? "" : getComputedStyle(detail).overflowY,
      detailXSpread: xSpread(detailAlignedElements),
      leftXSpread: xSpread(leftAlignedElements),
      listOverflow: list === null ? "" : getComputedStyle(list).overflowY,
      splitterHeight: splitter?.getBoundingClientRect().height ?? 0,
      workspaceHeight: workspace?.getBoundingClientRect().height ?? 0
    };
  });
  if (
    defectLayout.cardCount < 5 ||
    defectLayout.detailOverflow !== "auto" ||
    defectLayout.listOverflow !== "auto" ||
    defectLayout.leftXSpread > 1 ||
    defectLayout.detailXSpread > 1 ||
    Math.abs(defectLayout.splitterHeight - defectLayout.workspaceHeight) > 1
  ) {
    throw new Error(`Defect list-detail layout is incomplete: ${JSON.stringify(defectLayout)}`);
  }

  const defectUrl = page.url();
  const defectLinkLocators = [
    {
      locator: page.locator('.defects-reference-simple-list a[href^="#launch/"]'),
      type: "launch"
    },
    {
      locator: page.locator('.defects-reference-simple-list a[href^="#case/"]'),
      type: "test case"
    },
    {
      locator: page.locator(".defects-reference-result-row"),
      type: "test result"
    }
  ];
  const defectLinks = [];
  for (const link of defectLinkLocators) {
    const linkCount = await link.locator.count();
    if (linkCount === 0) {
      throw new Error(`Defect ${link.type} link is missing`);
    }
    const href = await link.locator.first().getAttribute("href");
    if (href === null || !href.startsWith("#")) {
      throw new Error(`Defect ${link.type} link has an invalid href: ${href}`);
    }
    defectLinks.push({ href, type: link.type });
  }
  for (const link of defectLinks) {
    const exactLink = page.locator(`a[href="${link.href}"]`);
    await exactLink.first().waitFor();
    await exactLink.first().click();
    const expectedUrl = `${webUrl}/${link.href}`;
    await page.waitForFunction((url) => globalThis.location.href === url, expectedUrl);
    await page.goto(defectUrl, { waitUntil: "domcontentloaded" });
    await page.waitForURL(defectUrl);
    await page.locator(`a[href="${link.href}"]`).first().waitFor();
  }

  await page.getByRole("button", { exact: true, name: "Настройки" }).click();
  await page.getByRole("heading", { exact: true, name: "Настройки проекта" }).waitFor();
  await page.locator(".project-settings__api-status--ready").waitFor();

  const projectsAfter = await loadProjectCount();
  if (projectsAfter !== projectsBefore) {
    throw new Error(
      `Opening settings changed the project count (${projectsBefore} -> ${projectsAfter})`
    );
  }
  if (browserErrors.length > 0) {
    throw new Error(`Browser errors were reported:\n${browserErrors.join("\n")}`);
  }

  console.log(
    `Local UI smoke passed: bundled Inter ${fontState.loadedWeights.join("/")}, login, imported launch/result/attachment preview, test-case navigation/search, defect split layout, settings navigation; ${projectsAfter} project(s), no browser errors.`
  );
} finally {
  await browser.close();
}

async function inspectBundledInter(page) {
  const state = await page.evaluate(async () => {
    const requiredWeights = [400, 500, 600, 700];
    const sampleText = "TestHistory Тестирование";
    const loadedWeights = [];

    for (const weight of requiredWeights) {
      const loadedFaces = await document.fonts.load(`${weight} 14px Inter`, sampleText);
      if (
        loadedFaces.some((face) => face.family.replaceAll('"', "").replaceAll("'", "") === "Inter")
      ) {
        loadedWeights.push(weight);
      }
    }
    await document.fonts.ready;

    const textSamples = Array.from(
      document.querySelectorAll("button, input, h1, h2, h3, h4, strong, .thql-search__chip")
    )
      .filter((element) => element instanceof HTMLElement && element.offsetParent !== null)
      .slice(0, 100)
      .map((element) => {
        const style = getComputedStyle(element);
        return {
          family: style.fontFamily,
          weight: style.fontWeight
        };
      });

    return { loadedWeights, textSamples };
  });

  const missingWeights = [400, 500, 600, 700].filter(
    (weight) => !state.loadedWeights.includes(weight)
  );
  if (missingWeights.length > 0) {
    throw new Error(`Bundled Inter faces did not load for weights: ${missingWeights.join(", ")}`);
  }

  const fallbackSample = state.textSamples.find((sample) => !sample.family.includes("Inter"));
  if (fallbackSample) {
    throw new Error(`Visible UI text does not inherit Inter: ${fallbackSample.family}`);
  }

  const unsupportedWeight = state.textSamples.find(
    (sample) => !["400", "500", "600", "700"].includes(sample.weight)
  );
  if (unsupportedWeight) {
    throw new Error(`Visible UI text uses an unsupported font weight: ${unsupportedWeight.weight}`);
  }

  return state;
}

async function assertIndependentSplitScroll(page, { detailSelector, listSelector }) {
  const state = await page.evaluate(
    ({ detailSelector: detailQuery, listSelector: listQuery }) => {
      const parent = document.querySelector(".reference-workspace-body");
      const list = document.querySelector(listQuery);
      const detail = document.querySelector(detailQuery);
      if (!(parent instanceof HTMLElement)) {
        return { error: "workspace body is missing" };
      }
      if (!(list instanceof HTMLElement)) {
        return { error: `list is missing: ${listQuery}` };
      }
      if (!(detail instanceof HTMLElement)) {
        return { error: `detail is missing: ${detailQuery}` };
      }

      const initial = {
        detail: detail.scrollTop,
        list: list.scrollTop,
        parent: parent.scrollTop
      };
      const maximum = Math.max(0, list.scrollHeight - list.clientHeight);
      const target = initial.list > 0 ? 0 : Math.min(320, maximum);
      list.scrollTop = target;
      const result = {
        detailStayed: detail.scrollTop === initial.detail,
        listClientHeight: list.clientHeight,
        listMoved: maximum > 0 && list.scrollTop !== initial.list,
        listScrollHeight: list.scrollHeight,
        listOverflow: getComputedStyle(list).overflowY,
        parentOverflow: getComputedStyle(parent).overflowY,
        parentScrollable: parent.scrollHeight > parent.clientHeight + 1,
        parentStayed: parent.scrollTop === initial.parent
      };
      list.scrollTop = initial.list;
      return result;
    },
    { detailSelector, listSelector }
  );

  if (
    "error" in state ||
    state.listOverflow !== "auto" ||
    state.parentOverflow !== "hidden" ||
    state.parentScrollable ||
    !state.listMoved ||
    !state.parentStayed ||
    !state.detailStayed
  ) {
    throw new Error(`Split-pane scrolling is not independent: ${JSON.stringify(state)}`);
  }
}

async function assertResizableColumnPersists(page, selector, remount) {
  let splitter = page.locator(selector).first();
  await splitter.waitFor();
  const initialWidth = Number(await splitter.getAttribute("aria-valuenow"));
  await splitter.press("ArrowRight");
  let changedWidth = Number(await splitter.getAttribute("aria-valuenow"));

  if (changedWidth === initialWidth) {
    await splitter.press("ArrowLeft");
    changedWidth = Number(await splitter.getAttribute("aria-valuenow"));
  }
  if (
    !Number.isFinite(initialWidth) ||
    !Number.isFinite(changedWidth) ||
    changedWidth === initialWidth
  ) {
    throw new Error(`Resizable column did not change width for ${selector}`);
  }

  await remount();
  splitter = page.locator(selector).first();
  await splitter.waitFor();
  const restoredWidth = Number(await splitter.getAttribute("aria-valuenow"));
  if (restoredWidth !== changedWidth) {
    throw new Error(
      `Resizable column width was not restored for ${selector}: ${changedWidth} -> ${restoredWidth}`
    );
  }
}

async function assertReady(url, label) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(3_000) });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
  } catch (error) {
    throw new Error(
      `${label} is not ready at ${url}. Start it with \`cmd /c npm run local:dev\`. ${formatError(error)}`
    );
  }
}

async function loadProjectCount() {
  const response = await fetch(`${apiUrl}/api/v1/projects`, {
    signal: AbortSignal.timeout(3_000)
  });
  if (!response.ok) {
    throw new Error(`Could not read projects for the UI smoke: HTTP ${response.status}`);
  }
  const projects = await response.json();
  if (!Array.isArray(projects)) {
    throw new Error("Could not read projects for the UI smoke: API returned a non-array payload");
  }
  return projects.length;
}

function formatError(error) {
  return error instanceof Error ? error.message : String(error);
}
