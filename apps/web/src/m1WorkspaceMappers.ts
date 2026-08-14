import type {
  ArtifactPreviewDescriptor,
  Launch,
  LaunchListItem,
  ResultAttachment,
  ResultParameter,
  ResultStatus,
  ResultTrace,
  ScenarioStep,
  TestCaseHistoryPoint,
  TestResult
} from "./m1WorkspaceTypes.js";
import type {
  ApiDefectClusterReadModel,
  ApiAllureStatus,
  ApiAttachmentReadModel,
  ApiHistoryComparePermissionAuditInvariantReadModel,
  ApiHistoryComparePermissionAuditReadModel,
  ApiLaunchReadModel,
  ApiNormalizedResultReadModel,
  ApiParameterReadModel,
  ApiResultDetailsReadModel,
  ApiResultStepReadModel,
  ApiStatusDetailsReadModel,
  ApiTestCaseSummaryReadModel,
  ApiTestCaseHistoryPageReadModel,
  ApiTestCaseHistoryPointReadModel
} from "./m1WorkspaceApiTypes.js";
import { mergeHistoryComparePermissionAuditRead } from "./m1WorkspacePermissionAudit.js";
import { defaultResultSteps, PREVIEW_MAX_BYTES } from "./m1WorkspaceMockPreview.js";
import { mapCurrentLaunchAttempts } from "./resultHistory.js";

export function mapApiLaunch(launch: ApiLaunchReadModel): Launch {
  return {
    name: launch.name,
    build: launch.buildNumber ?? launch.commitSha ?? launch.id,
    branch: launch.branch ?? "untracked",
    started: formatDateTime(launch.createdAt),
    environment: "API",
    owner: launch.projectId
  };
}

export function mapApiLaunchListItem(launch: ApiLaunchReadModel): LaunchListItem {
  return {
    id: launch.id,
    projectId: launch.projectId,
    name: launch.name,
    state: launch.status,
    ...(launch.branch !== undefined ? { branch: launch.branch } : {}),
    ...(launch.createdAt !== undefined ? { createdAt: launch.createdAt } : {}),
    metadata: compact([
      launch.branch,
      launch.buildNumber ?? launch.commitSha,
      formatDateTime(launch.createdAt)
    ]),
    defects: (launch.counters.failed ?? 0) + (launch.counters.broken ?? 0),
    members: 0,
    counters: mapCounters(launch.counters)
  };
}

export function mapApiResult(
  result: ApiNormalizedResultReadModel,
  details: ApiResultDetailsReadModel | undefined,
  permissionAuditRead: ApiHistoryComparePermissionAuditReadModel | undefined,
  permissionAuditInvariantRead: ApiHistoryComparePermissionAuditInvariantReadModel | undefined,
  historyRead: ApiTestCaseHistoryPageReadModel | undefined
): TestResult {
  const labels = details?.labels ?? result.labels ?? {};
  const status = mapResultStatus(details?.status ?? result.status);
  const links = details?.links ?? details?.raw?.links ?? result.raw?.links ?? [];
  const raw = details?.raw ?? result.raw;
  const trace = mapTrace(details?.statusDetails ?? result.statusDetails ?? raw?.statusDetails);
  const quarantine = details?.quarantine ?? result.quarantine;
  const historyCompare = mergeHistoryComparePermissionAuditRead(
    details?.historyCompare ?? result.historyCompare,
    permissionAuditRead,
    permissionAuditInvariantRead
  );
  const historyPoints = mapHistoryPoints(result, historyRead, status, result.uuid);

  return {
    id: result.uuid,
    allureId: result.testCaseId ?? result.historyId ?? result.uuid,
    name: details?.name ?? result.name,
    suite: result.fullName ?? result.historyId ?? "Imported result",
    status,
    duration: formatDuration(details?.durationMs ?? result.durationMs),
    owner: firstLabel(labels, "owner") ?? firstLabel(labels, "member") ?? "Unassigned",
    caseType: "automated",
    workflow: "Ready",
    severity: mapSeverity(firstLabel(labels, "severity")),
    layer: mapLayer(firstLabel(labels, "layer") ?? firstLabel(labels, "feature")),
    tags: labels.tag ?? [],
    links: links.map((link) => link.name ?? link.url),
    linkDetails: links.map((link) => ({
      label: link.name ?? link.url,
      ...(link.type !== undefined ? { type: link.type } : {}),
      url: link.url
    })),
    issues: labels.issue ?? [],
    testKeys: [...(labels.tms ?? []), ...(labels.testKey ?? [])],
    members: labels.member ?? labels.owner ?? [],
    customFields: Object.entries(labels)
      .filter(([label]) => label.startsWith("custom_field:"))
      .map(([label, values]) => ({
        label: label.slice("custom_field:".length),
        value: values.join(", ")
      })),
    muted: quarantine?.status === "active",
    history: mapHistoryStatuses(result, historyRead, status),
    historyPoints,
    retryAttempts: mapCurrentLaunchAttempts(historyPoints, result.uuid),
    ...(historyCompare !== undefined ? { historyCompare } : {}),
    steps: mapSteps(details?.steps),
    parameters: mapParameters(raw?.parameters),
    attachments: mapAttachments(details?.attachments ?? raw?.attachments),
    ...(raw?.description !== undefined ? { description: raw.description } : {}),
    ...(trace !== undefined ? { trace } : {}),
    ...(quarantine?.status === "active"
      ? {
          defectMute: {
            id: quarantine.id,
            scope: "defect" as const,
            reason: quarantine.reason ?? "Карантин результата",
            actor:
              quarantine.origin.type === "actor"
                ? quarantine.origin.actorId
                : quarantine.origin.systemId,
            mutedAt: quarantine.mutedAt,
            affectedTestCaseIds: quarantine.affectedTestIds ?? [result.uuid]
          }
        }
      : {}),
    ...(labels.issue?.[0] !== undefined ? { defect: labels.issue[0] } : {})
  };
}

export function mapApiTestCaseSummary(summary: ApiTestCaseSummaryReadModel): TestResult {
  const metadata = summary.testCase;
  const status = mapResultStatus(summary.lastStatus);
  const historyPoints = mapTestCaseSummaryHistoryPoints(summary, status);
  const history = historyPoints.length > 0 ? historyPoints.map((point) => point.status) : [status];

  return {
    id: summary.id,
    allureId: metadata?.allureId ?? summary.id,
    name: metadata?.name ?? summary.name,
    suite: metadata?.fullName ?? summary.fullName ?? summary.historyIds?.[0] ?? "Test case",
    status,
    duration: formatDuration(summary.medianDurationMs),
    owner: metadata?.members?.[0] ?? "Unassigned",
    caseType: "automated",
    workflow: mapWorkflow(metadata?.workflowStatus),
    severity: "normal",
    layer: mapLayer(metadata?.layer),
    tags: metadata?.tags ?? [],
    links: (metadata?.links ?? []).map((link) => link.name ?? link.url),
    linkDetails: (metadata?.links ?? []).map((link) => ({
      label: link.name ?? link.url,
      ...(link.type !== undefined ? { type: link.type } : {}),
      url: link.url
    })),
    issues: metadata?.issues ?? [],
    testKeys: metadata?.testKeys ?? [],
    members: metadata?.members ?? [],
    customFields: Object.entries(metadata?.customFields ?? {}).map(([label, value]) => ({
      label,
      value
    })),
    muted: false,
    history,
    historyPoints,
    retryAttempts: mapCurrentLaunchAttempts(historyPoints, summary.id),
    steps: defaultResultSteps,
    parameters: [],
    attachments: [],
    ...(metadata?.description !== undefined ? { description: metadata.description } : {}),
    ...(metadata?.workflowStatus === "deprecated" || metadata?.workflowStatus === "archived"
      ? {
          deletedAt: metadata.updatedAt ?? summary.lastSeenAt ?? new Date(0).toISOString(),
          deletedReason: "Тест-кейс переведён в архивный статус"
        }
      : {}),
    ...(metadata?.issues?.[0] !== undefined ? { defect: metadata.issues[0] } : {})
  };
}

export function mapApiDefectCluster(cluster: ApiDefectClusterReadModel): TestResult {
  const firstResult = cluster.results?.[0];
  const affectedTests = [
    ...new Set([
      ...(cluster.affectedTestIds ?? []),
      ...(cluster.currentAffectedTestIds ?? []),
      ...(cluster.results ?? []).map((result) => result.testId)
    ])
  ].filter((testId) => testId.trim().length > 0);
  const status =
    cluster.status === "closed" ? "passed" : mapResultStatus(firstResult?.status ?? "failed");

  return {
    id: cluster.id,
    allureId: affectedTests[0] ?? cluster.signature?.hash ?? cluster.id,
    name: affectedTests[0] ?? cluster.title,
    suite: firstResult?.launchName ?? cluster.lifecycleState ?? "Defect cluster",
    status,
    duration: "n/a",
    owner: "Unassigned",
    caseType: "automated",
    workflow: cluster.status === "closed" ? "Deprecated" : "Ready",
    severity: "normal",
    layer: "E2E",
    tags: [cluster.lifecycleState, cluster.signature?.hash].filter(
      (tag): tag is string => tag !== undefined && tag.length > 0
    ),
    links: [],
    issues: [cluster.id],
    testKeys: affectedTests,
    members: [],
    customFields: [
      { label: "Occurrences", value: String(cluster.occurrenceCount) },
      { label: "First seen", value: cluster.firstSeenAt },
      { label: "Last seen", value: cluster.lastSeenAt }
    ],
    muted: false,
    history: (cluster.results ?? []).map((result) => mapResultStatus(result.status)),
    historyPoints: mapDefectClusterHistoryPoints(cluster, status),
    steps: defaultResultSteps,
    parameters: [],
    attachments: [],
    description: cluster.signature?.reason ?? cluster.title,
    defect: cluster.id
  };
}

export function mapHistoryStatuses(
  result: ApiNormalizedResultReadModel,
  historyRead: ApiTestCaseHistoryPageReadModel | undefined,
  fallbackStatus: ResultStatus
): ResultStatus[] {
  const points = selectHistoryPoints(result, historyRead);
  if (points.length === 0) {
    return [fallbackStatus];
  }

  const statuses = points.map((point) => mapResultStatus(point.status));

  return statuses.length > 0 ? statuses : [fallbackStatus];
}

export function mapHistoryPoints(
  result: ApiNormalizedResultReadModel,
  historyRead: ApiTestCaseHistoryPageReadModel | undefined,
  fallbackStatus: ResultStatus,
  fallbackResultUuid: string
): TestCaseHistoryPoint[] {
  const points = selectHistoryPoints(result, historyRead);
  if (points.length === 0) {
    return [
      {
        launchId: "",
        launchName: "Текущий запуск",
        resultUuid: fallbackResultUuid,
        startedAt: "",
        status: fallbackStatus,
        duration: formatDuration(result.durationMs),
        retry: false,
        flaky: false,
        attempt: 1
      }
    ];
  }

  return points.map((point, index) => ({
    launchId: point.launchId,
    launchName: point.launchName,
    resultUuid: point.resultUuid,
    ...(point.testCaseId !== undefined ? { testCaseId: point.testCaseId } : {}),
    startedAt: point.launchCreatedAt,
    status: mapResultStatus(point.status),
    duration: formatDuration(point.durationMs),
    retry: point.retry === true,
    flaky: point.flaky === true,
    attempt: point.attemptNumber ?? index + 1
  }));
}

export function selectHistoryPoints(
  result: ApiNormalizedResultReadModel,
  historyRead: ApiTestCaseHistoryPageReadModel | undefined
): ApiTestCaseHistoryPointReadModel[] {
  const points = historyRead?.points ?? [];
  if (points.length === 0) {
    return [];
  }

  const stablePoints = points.filter((point) => matchesResultHistoryPoint(result, point));
  return stablePoints.length > 0 ? stablePoints : points;
}

export function matchesResultHistoryPoint(
  result: ApiNormalizedResultReadModel,
  point: ApiTestCaseHistoryPointReadModel
): boolean {
  if (result.historyId !== undefined) {
    return (
      point.historyId === result.historyId ||
      (point.identity?.source === "historyId" && point.identity.value === result.historyId)
    );
  }

  if (result.testCaseId !== undefined) {
    return (
      point.testCaseId === result.testCaseId ||
      (point.identity?.source === "testCaseId" && point.identity.value === result.testCaseId)
    );
  }

  return false;
}

export function mapSteps(steps: ApiResultStepReadModel[] | undefined): ScenarioStep[] {
  const mapped = mapApiSteps(steps);
  return mapped.length > 0 ? mapped : defaultResultSteps;
}

export function mapApiSteps(steps: ApiResultStepReadModel[] | undefined): ScenarioStep[] {
  if (steps === undefined) {
    return [];
  }

  if (steps.length === 0) {
    return [];
  }

  return steps.map((step) => ({
    name: step.name,
    status: mapResultStatus(step.status ?? "passed"),
    duration: formatStepDuration(step),
    attachments: mapAttachments(step.attachments),
    steps: mapApiSteps(step.steps)
  }));
}

export function mapCounters(
  counters: Record<ApiAllureStatus, number>
): Record<ResultStatus, number> {
  return {
    passed: counters.passed ?? 0,
    failed: counters.failed ?? 0,
    broken: (counters.broken ?? 0) + (counters.unknown ?? 0),
    skipped: counters.skipped ?? 0,
    muted: 0
  };
}

export function mapResultStatus(status: ApiAllureStatus): ResultStatus {
  return status === "unknown" ? "broken" : status;
}

function mapWorkflow(value: string | undefined): TestResult["workflow"] {
  if (value === "draft") {
    return "Draft";
  }
  if (value === "deprecated" || value === "archived") {
    return "Deprecated";
  }
  return "Ready";
}

function mapTestCaseSummaryHistoryPoints(
  summary: ApiTestCaseSummaryReadModel,
  fallbackStatus: ResultStatus
): TestCaseHistoryPoint[] {
  const points = summary.history ?? [];
  if (points.length === 0) {
    return [
      {
        launchId: "",
        launchName: "Test case summary",
        resultUuid: summary.id,
        startedAt: summary.lastSeenAt ?? "",
        status: fallbackStatus,
        duration: formatDuration(summary.medianDurationMs),
        retry: false,
        flaky: (summary.flakyScore ?? 0) > 0,
        attempt: 1
      }
    ];
  }

  return points.map((point, index) => ({
    launchId: point.launchId,
    launchName: point.launchName,
    resultUuid: point.resultUuid,
    ...(point.testCaseId !== undefined ? { testCaseId: point.testCaseId } : {}),
    startedAt: point.launchCreatedAt,
    status: mapResultStatus(point.status),
    duration: formatDuration(point.durationMs),
    retry: point.retry === true,
    flaky: point.flaky === true,
    attempt: point.attemptNumber ?? index + 1
  }));
}

function mapDefectClusterHistoryPoints(
  cluster: ApiDefectClusterReadModel,
  fallbackStatus: ResultStatus
): TestCaseHistoryPoint[] {
  const results = cluster.results ?? [];
  if (results.length === 0) {
    return [
      {
        launchId: cluster.lastSeenLaunchId ?? "",
        launchName: "Defect cluster",
        resultUuid: cluster.id,
        startedAt: cluster.lastSeenAt,
        status: fallbackStatus,
        duration: "n/a",
        retry: false,
        flaky: cluster.lifecycleState === "recurring",
        attempt: 1
      }
    ];
  }

  return results.map((result, index) => ({
    launchId: result.launchId,
    launchName: result.launchName,
    resultUuid: result.resultUuid,
    testCaseId: result.testId,
    startedAt: result.launchCreatedAt,
    status: mapResultStatus(result.status),
    duration: "n/a",
    retry: false,
    flaky: cluster.lifecycleState === "recurring",
    attempt: index + 1
  }));
}

export function mapSeverity(value: string | undefined): TestResult["severity"] {
  if (value === "critical" || value === "normal" || value === "minor") {
    return value;
  }
  return "normal";
}

export function mapLayer(value: string | undefined): TestResult["layer"] {
  if (value === "UI" || value === "API" || value === "E2E") {
    return value;
  }
  return "E2E";
}

export function firstLabel(labels: Record<string, string[]>, name: string): string | undefined {
  return labels[name]?.[0];
}

export function compact(values: Array<string | undefined>): string[] {
  const compacted = values.filter((value): value is string => value !== undefined && value !== "");
  return compacted.length > 0 ? compacted : ["API launch"];
}

export function formatDateTime(value: string | undefined): string {
  if (value === undefined) {
    return "API runtime";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

export function formatDuration(durationMs: number | undefined): string {
  if (durationMs === undefined) {
    return "n/a";
  }
  if (durationMs < 1_000) {
    return `${durationMs}ms`;
  }
  return `${(durationMs / 1_000).toFixed(2)}s`;
}

export function formatStepDuration(step: ApiResultStepReadModel): string {
  if (step.start === undefined || step.stop === undefined) {
    return "n/a";
  }
  return formatDuration(Math.max(0, step.stop - step.start));
}

export function mapParameters(parameters: ApiParameterReadModel[] | undefined): ResultParameter[] {
  return (parameters ?? [])
    .filter((parameter) => parameter.name !== undefined && parameter.name !== "")
    .map((parameter) => {
      const name = parameter.name!;
      const masked = parameter.masked === true || parameter.mode === "masked";

      return {
        name,
        value: masked ? "[redacted]" : stringifyParameterValue(parameter.value),
        ...(parameter.excluded !== undefined ? { excluded: parameter.excluded } : {}),
        ...(masked ? { masked: true } : {})
      };
    });
}

export function mapAttachments(
  attachments: ApiAttachmentReadModel[] | undefined
): ResultAttachment[] {
  return (attachments ?? [])
    .filter((attachment) => attachment.name !== undefined && attachment.name !== "")
    .map((attachment) => {
      const preview = mapAttachmentPreview(attachment.preview);

      return {
        name: attachment.name!,
        mediaType: attachment.type ?? "application/octet-stream",
        size: formatAttachmentSize(attachment.size),
        source: attachment.source ?? attachment.name!,
        retained: true,
        ...(attachment.previewUrl !== undefined ? { previewUrl: attachment.previewUrl } : {}),
        ...(preview !== undefined ? { preview } : {})
      };
    });
}

export function mapAttachmentPreview(
  preview: ArtifactPreviewDescriptor | undefined
): ArtifactPreviewDescriptor | undefined {
  if (preview === undefined) {
    return undefined;
  }

  const base = {
    id: preview.id,
    artifactId: preview.artifactId,
    kind: preview.kind,
    flavor: preview.flavor,
    support: preview.support,
    status: preview.status,
    reason: preview.reason,
    originalBytes: preview.originalBytes,
    previewBytes: preview.previewBytes,
    maxPreviewBytes: preview.maxPreviewBytes,
    ...(preview.contentType !== undefined ? { contentType: preview.contentType } : {}),
    sha256: preview.sha256,
    safety: {
      descriptorVersion: 1 as const,
      bounded: true as const,
      pathIncluded: false as const,
      storageKeyIncluded: false as const,
      rawPayloadIncluded: false as const,
      blobIncluded: false as const,
      signedUrlIncluded: false as const,
      redactionApplied: preview.safety.redactionApplied
    }
  };

  if (preview.body.type === "redacted-text") {
    return {
      ...base,
      body: {
        type: "redacted-text",
        encoding: "utf8",
        value: preview.body.value.slice(0, PREVIEW_MAX_BYTES),
        lineCount: preview.body.lineCount,
        truncated: preview.body.truncated || preview.body.value.length > PREVIEW_MAX_BYTES,
        redacted: preview.body.redacted
      }
    };
  }

  if (preview.body.type === "image-metadata") {
    return {
      ...base,
      body: {
        type: "image-metadata",
        mediaType: preview.body.mediaType,
        inline: false,
        downloadRequired: true
      }
    };
  }

  return {
    ...base,
    body: { type: "metadata-only" }
  };
}

export function mapTrace(
  statusDetails: ApiStatusDetailsReadModel | undefined
): ResultTrace | undefined {
  if (statusDetails?.message === undefined && statusDetails?.trace === undefined) {
    return undefined;
  }

  return {
    message: statusDetails.message ?? "Failure details captured",
    stack: (statusDetails.trace ?? "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
  };
}

export function stringifyParameterValue(value: unknown): string {
  if (value === undefined || value === null) {
    return "";
  }

  if (typeof value === "string") {
    return value;
  }

  return JSON.stringify(value);
}

export function formatAttachmentSize(bytes: number | undefined): string {
  if (bytes === undefined) {
    return "size unknown";
  }
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
