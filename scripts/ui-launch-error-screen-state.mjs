export async function verifyLaunchErrorsScreen(page) {
  await page.locator(".launches-reference-error-group").first().waitFor();
  await page.getByText("Весь запуск · 26 результатов с ошибкой").waitFor();
  if ((page.viewportSize()?.width ?? 1440) <= 760) {
    await page.locator(".launches-reference-errors.is-mobile-list").waitFor();
    if ((await page.locator(".launches-reference-result-report:visible").count()) !== 0) {
      throw new Error("Mobile launch errors must open as a list");
    }
    return;
  }
  await page.locator(".launches-reference-result-report:visible").waitFor();
  const selectedVisible = await page
    .locator(".launches-reference-error-results button.selected")
    .evaluate((row) => {
      const list = row.closest(".launches-reference-errors-content");
      if (list === null) return false;
      const rowRect = row.getBoundingClientRect();
      const listRect = list.getBoundingClientRect();
      return rowRect.top >= listRect.top && rowRect.bottom <= listRect.bottom;
    });
  if (!selectedVisible) {
    throw new Error("Launch errors screenshot must show the selected error in the left pane");
  }
}
