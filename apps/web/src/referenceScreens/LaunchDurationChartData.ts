import type { LaunchDurationChartReadModel } from "@testhistory/contracts";
import { requestJson } from "../apiHttp.js";

export async function loadLaunchDurationChart(
  launchId: string,
  signal: AbortSignal
): Promise<LaunchDurationChartReadModel> {
  const chart = await requestJson<LaunchDurationChartReadModel>(
    `/api/v1/launches/${encodeURIComponent(launchId)}/charts/duration`,
    { signal }
  );
  if (
    chart?.kind !== "launch-duration-chart" ||
    chart.launchId !== launchId ||
    !Number.isInteger(chart.totalResults) ||
    chart.totalResults < 0 ||
    !Number.isInteger(chart.measuredResults) ||
    chart.measuredResults < 0 ||
    chart.measuredResults > chart.totalResults ||
    !Array.isArray(chart.buckets) ||
    chart.buckets.length !== 8 ||
    chart.buckets.some(
      (bucket) =>
        typeof bucket.label !== "string" || !Number.isInteger(bucket.count) || bucket.count < 0
    ) ||
    chart.buckets.reduce((sum, bucket) => sum + bucket.count, 0) !== chart.measuredResults ||
    (chart.averageDurationMs !== null &&
      (!Number.isFinite(chart.averageDurationMs) || chart.averageDurationMs < 0))
  ) {
    throw new Error("Сервер вернул неполные данные графика запуска.");
  }
  return chart;
}
