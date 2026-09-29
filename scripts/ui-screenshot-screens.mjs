import { seedDashboardOwnerWidgets, seedDashboardWidget } from "./ui-dashboard-screen-state.mjs";
import { showComparisonMatrix, verifyComparisonMatrix } from "./ui-comparison-screen-state.mjs";
import { verifyLaunchErrorsScreen } from "./ui-launch-error-screen-state.mjs";

export const screens = [
  { name: "auth-login", hash: "#launch", auth: false },
  {
    name: "auth-register",
    hash: "#launch",
    auth: false,
    interact: async (page) => {
      await page.getByRole("tab", { name: "Регистрация" }).click();
    }
  },
  { name: "projects", hash: "#projects" },
  { name: "dashboard", hash: "#dashboard" },
  {
    name: "dashboard-owner-groups",
    hash: "#dashboard",
    beforeNavigate: seedDashboardOwnerWidgets,
    interact: async (page) => {
      if ((page.viewportSize()?.width ?? 1440) <= 600) {
        await page.locator(".dashboard-reference-table-widget.is-grouped").scrollIntoViewIfNeeded();
      }
    },
    verify: async (page) => {
      const firstGroup = page
        .locator(".dashboard-reference-table-widget.is-grouped tbody tr")
        .first();
      await firstGroup.waitFor();
      if ((await page.locator(".dashboard-reference-widget-card.is-unavailable").count()) !== 0) {
        throw new Error("Grouped dashboard screenshot contains an unavailable widget");
      }
      if ((page.viewportSize()?.width ?? 1440) <= 600) {
        const row = await firstGroup.boundingBox();
        if (
          row === null ||
          row.y < 56 ||
          row.y + row.height > (page.viewportSize()?.height ?? 844)
        ) {
          throw new Error("Grouped dashboard rows are outside the mobile screenshot");
        }
      }
    }
  },
  {
    name: "test-cases",
    hash: "#case?list=1",
    interact: async (page) => {
      await page.getByRole("searchbox", { name: "THQL поиск тест-кейсов" }).fill("Оплата");
    }
  },
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
        ["broken", "8"],
        ["unknown", "4"],
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
  {
    name: "launch-errors",
    hash: "#launch/L-1289/errors",
    verify: verifyLaunchErrorsScreen
  },
  {
    name: "launch-charts",
    hash: "#launch/L-1289/charts",
    verify: async (page) => {
      await page.getByLabel("Распределение по продолжительности").waitFor();
    }
  },
  {
    name: "launch-comparison",
    hash: "#launch/L-1289/comparison",
    interact: async (page) => {
      await page.getByLabel("Сравнить текущий запуск с").selectOption("L-1288");
      await page.getByRole("button", { name: "Сравнить", exact: true }).click();
    },
    verify: async (page) => {
      await page.getByRole("table", { name: "Отличия тестов между запусками" }).waitFor();
      await page.getByText("Оплата картой после повторной авторизации").waitFor();
    }
  },
  {
    name: "launch-comparison-matrix",
    hash: "#launch/L-1289/comparison",
    interact: showComparisonMatrix,
    verify: verifyComparisonMatrix
  },
  { name: "selected-test-case", hash: "#case/PAY-1042/overview" },
  {
    name: "selected-test-case-scenario",
    hash: "#case/PAY-1042/overview",
    interact: async (page) => {
      await page
        .getByRole("heading", { name: "Сценарий из тестового результата" })
        .evaluate((heading) => heading.scrollIntoView({ block: "start" }));
    },
    verify: async (page) => {
      const failure = page.locator(".tc-detail-reference-step-failure").first();
      await failure.waitFor();
      if (
        !(await failure.textContent())?.includes("AssertionError: expected payment confirmation")
      ) {
        throw new Error("Test-case scenario is missing the failed step exception");
      }
      if ((page.viewportSize()?.width ?? 1440) > 600) return;
      const heading = await page
        .getByRole("heading", { name: "Сценарий из тестового результата" })
        .boundingBox();
      const tabs = await page.getByRole("navigation", { name: "Вкладки тест-кейса" }).boundingBox();
      if (heading === null || tabs === null || heading.y < tabs.y + tabs.height) {
        throw new Error("Test-case scenario heading is hidden under mobile tabs");
      }
    }
  },
  { name: "selected-test-case-history", hash: "#case/PAY-1042/history" },
  {
    name: "selected-test-case-defects",
    hash: "#case/PAY-1042/defects",
    verify: (page) => verifyVisibleCaseTab(page, "Дефекты")
  },
  { name: "defects-list", hash: "#defects" },
  { name: "defects", hash: "#defects/PAY-337" },
  { name: "automation", hash: "#automation" },
  {
    name: "automation-plans",
    hash: "#automation",
    verify: async (page) => {
      await page.getByText("Регрессия оформления заказа").waitFor();
      if ((await page.locator(".automation-grid .automation-card").count()) !== 3) {
        throw new Error("Automation plans screenshot requires three populated plans");
      }
    }
  },
  {
    name: "automation-jobs",
    hash: "#automation",
    interact: async (page) => {
      await page.getByRole("tab", { name: /CI-задачи/ }).click();
    },
    verify: async (page) => {
      await page.getByText("Checkout regression #7842").waitFor();
      if ((await page.locator('[aria-label="CI-задачи"] .automation-table-row').count()) !== 5) {
        throw new Error("Automation jobs screenshot requires four populated jobs");
      }
    }
  },
  {
    name: "automation-integrations",
    hash: "#automation",
    interact: async (page) => {
      await page.getByRole("tab", { name: /Интеграции/ }).click();
    },
    verify: async (page) => {
      await page.getByText("QA: результаты прогонов").waitFor();
      await page
        .getByRole("table", { name: "Доставки интеграций" })
        .getByText("automation-job.failed")
        .first()
        .waitFor();
    }
  },
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
  {
    name: "settings-visibility",
    hash: "#settings/visibility",
    verify: async (page) => {
      await page.locator(".project-settings__policy-list").waitFor();
    }
  },
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
      await page.getByRole("button", { name: "Редактировать интеграцию Jira" }).click();
    }
  },
  {
    name: "dialog-integration-add",
    hash: "#settings/integrations",
    prepare: async (page) => {
      await page
        .locator(".project-settings__panel")
        .filter({ hasText: "Провайдеры ссылок" })
        .getByRole("button", { name: "Добавить" })
        .click();
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
  { name: "quarantine-empty", hash: "#launch/L-1289/results?query=muted+%3D+true" },
  {
    name: "dialog-delete-launch",
    hash: "#launch/L-1289",
    prepare: async (page) => {
      await page.getByRole("button", { name: "Удалить" }).first().click();
    }
  }
];

async function verifyVisibleCaseTab(page, label) {
  const tabs = page.getByRole("navigation", { name: "Вкладки тест-кейса" });
  const active = tabs.locator('button[aria-current="page"]');
  await active.waitFor();
  const actualLabel = (await active.textContent())?.trim() ?? "";
  const [tabsBox, activeBox] = await Promise.all([tabs.boundingBox(), active.boundingBox()]);
  if (
    !actualLabel.startsWith(label) ||
    tabsBox === null ||
    activeBox === null ||
    activeBox.x < tabsBox.x - 1 ||
    activeBox.x + activeBox.width > tabsBox.x + tabsBox.width + 1
  ) {
    throw new Error(`Case tab ${label} is not fully visible: ${actualLabel}`);
  }
}
