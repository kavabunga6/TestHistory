export function createLaunchErrorSummaryFixture(launch, project, results) {
  const groups = new Map();
  for (const result of results) {
    if (result.status !== "failed" && result.status !== "broken") continue;
    const firstLine =
      (result.raw?.statusDetails?.message || result.raw?.statusDetails?.trace || "")
        .split(/\r?\n/, 1)[0]
        ?.trim() ?? "";
    const name = firstLine.split(":", 1)[0]?.trim().slice(0, 180) || "Без категории";
    const group = groups.get(name) ?? {
      name,
      failed: 0,
      broken: 0,
      resultsTruncated: false,
      examples: []
    };
    group[result.status] += 1;
    if (group.examples.length < 10) {
      group.examples.push({
        resultUuid: result.uuid,
        name: result.name,
        status: result.status,
        durationMs: result.durationMs
      });
    } else {
      group.resultsTruncated = true;
    }
    groups.set(name, group);
  }
  const sorted = [...groups.values()].sort(
    (left, right) =>
      right.failed + right.broken - (left.failed + left.broken) ||
      left.name.localeCompare(right.name)
  );
  return {
    kind: "launch-error-summary",
    launchId: launch.id,
    projectId: project.id,
    totalResults: results.length,
    failedResults: launch.counters.failed,
    brokenResults: launch.counters.broken,
    totalGroups: sorted.length,
    groupsTruncated: sorted.length > 50,
    groups: sorted.slice(0, 50)
  };
}
