export async function seedDashboardWidget(page) {
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
          thql: "from results where muted = false measure passRate()",
          title: "Guard widget"
        }
      ])
    );
  });
}

export async function seedDashboardOwnerWidgets(page) {
  await page.evaluate(() => {
    localStorage.setItem(
      "testhistory.dashboard.widgets.v1",
      JSON.stringify([
        {
          entity: "Результаты тестов",
          groupBy: "owner",
          id: "dashboard-problem-owners",
          kind: "table",
          metric: "Количество",
          thql: 'from results where status in ["failed", "broken"] and muted = false group by owner measure count()',
          title: "Проблемные тесты по владельцам"
        },
        {
          entity: "Результаты тестов",
          groupBy: "status",
          id: "dashboard-active-results",
          kind: "metric",
          metric: "Количество",
          thql: "from results where muted = false measure count()",
          title: "Все активные результаты"
        }
      ])
    );
  });
}
