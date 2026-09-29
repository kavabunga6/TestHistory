export async function showComparisonMatrix(page) {
  await page.getByRole("button", { name: "Матрица запусков" }).click();
  for (const name of ["Checkout Regression · предыдущая неделя", "Main Checkout Regression"]) {
    await page
      .locator(".launches-reference-matrix-candidate")
      .filter({ hasText: name })
      .locator('input[type="checkbox"]')
      .check();
  }
  await page.getByRole("button", { name: "Построить матрицу" }).click();
}

export async function verifyComparisonMatrix(page) {
  const matrix = page.getByRole("table", { name: "Матрица статусов тестов по запускам" });
  await matrix.waitFor();
  const columns = await matrix.getByRole("columnheader").count();
  if (columns !== 4) throw new Error(`Expected three launch columns, got ${columns - 1}`);
  await page.getByText("Проверка возврата").waitFor();
}
