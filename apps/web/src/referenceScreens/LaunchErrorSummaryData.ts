import type { LaunchErrorSummaryReadModel } from "@testhistory/contracts";
import { requestJson } from "../apiHttp.js";
import { formatStatus } from "./LaunchesReferenceFormatters.js";

export function formatLaunchErrorGroupHeading(name: string): string {
  return name.replace(
    /(со статусом )(failed|broken)$/,
    (_, prefix: string, status: "failed" | "broken") => `${prefix}«${formatStatus(status)}»`
  );
}

export async function loadLaunchErrorSummary(
  launchId: string,
  signal: AbortSignal
): Promise<LaunchErrorSummaryReadModel> {
  const summary = await requestJson<LaunchErrorSummaryReadModel>(
    `/api/v1/launches/${encodeURIComponent(launchId)}/errors/summary`,
    { signal }
  );
  if (
    summary?.kind !== "launch-error-summary" ||
    summary.launchId !== launchId ||
    !Number.isInteger(summary.totalResults) ||
    !Number.isInteger(summary.failedResults) ||
    !Number.isInteger(summary.brokenResults) ||
    !Number.isInteger(summary.totalGroups) ||
    !Array.isArray(summary.groups) ||
    summary.failedResults + summary.brokenResults > summary.totalResults ||
    summary.totalGroups < summary.groups.length ||
    summary.groups.some(
      (group) =>
        typeof group.name !== "string" ||
        !Number.isInteger(group.failed) ||
        !Number.isInteger(group.broken) ||
        !Array.isArray(group.examples) ||
        group.examples.length > group.failed + group.broken ||
        group.examples.some(
          (example) =>
            typeof example.resultUuid !== "string" ||
            typeof example.name !== "string" ||
            (example.status !== "failed" && example.status !== "broken")
        )
    )
  ) {
    throw new Error("Сервер вернул неполную сводку ошибок запуска.");
  }
  return summary;
}
