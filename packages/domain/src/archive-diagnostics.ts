import { redactSensitiveText } from "./defects.js";

export type ArchiveDiagnosticReplayFixtureStatus =
  "materialized" | "replayed" | "denied" | "skipped";

export type ArchiveDiagnosticReplayMaterializedFixtureInput = {
  projectId: string;
  fixtureRef: string;
  materializedRef: string;
  sourceDigest: string;
  materializedAt: string;
  name?: string;
  status?: ArchiveDiagnosticReplayFixtureStatus;
  actorIds?: readonly string[];
  retryOf?: string;
  attempt?: number;
  diagnostics?: readonly ArchiveDiagnosticReplayMaterializedFixtureDiagnosticInput[];
  metadata?: unknown;
  rawArchivePayload?: unknown;
  localPath?: string;
  storageRef?: string;
  signedUrl?: string;
  token?: string;
  rawAttachment?: unknown;
};

export type ArchiveDiagnosticReplayMaterializedFixtureDiagnosticInput = {
  code: string;
  severity?: "info" | "warn" | "deny";
  message?: string;
};

export type ArchiveDiagnosticReplayMaterializedFixtureProjectionInput = {
  projectId: string;
  actorId?: string;
  records: readonly ArchiveDiagnosticReplayMaterializedFixtureInput[];
  cursor?: string;
  limit?: number;
};

export type ArchiveDiagnosticReplayMaterializedFixtureProjectionItem = {
  id: string;
  fixtureRef: string;
  materializedRef: string;
  sourceDigest: string;
  materializedAt: string;
  name?: string;
  status: ArchiveDiagnosticReplayFixtureStatus;
  actorIds: string[];
  attempt: number;
  retry: boolean;
  diagnostics: ArchiveDiagnosticReplayMaterializedFixtureDiagnostic[];
};

export type ArchiveDiagnosticReplayMaterializedFixtureDiagnostic = {
  code: string;
  severity: "info" | "warn" | "deny";
  message?: string;
};

export type ArchiveDiagnosticReplayMaterializedFixtureProjection = {
  schemaVersion: 1;
  kind: "archive-diagnostic-replay.materialized-fixture.domain-projection";
  projectId: string;
  actorId?: string;
  scope: {
    projectScoped: true;
    actorScoped: boolean;
    readOnly: true;
    mutation: false;
  };
  page: {
    limit: number;
    offset: number;
    returned: number;
    total: number;
    cursor?: string;
    nextCursor?: string;
    hasMore: boolean;
    itemDigest: string;
  };
  summary: {
    sourceRecordCount: number;
    projectRecordCount: number;
    actorRecordCount: number;
    materializedRecordCount: number;
    duplicateRecordCount: number;
    retryRecordCount: number;
    excludedByProjectScope: number;
    excludedByActorScope: number;
    deterministic: true;
    projectionDigest: string;
  };
  safety: {
    rawArchivePayloadsIncluded: false;
    manifestEntriesIncluded: false;
    resultFilesIncluded: false;
    rawAttachmentsIncluded: false;
    localPathsIncluded: false;
    storageRefsIncluded: false;
    signedUrlsIncluded: false;
    tokensIncluded: false;
    workerJobsEnqueued: false;
    replayStarted: false;
  };
  diagnostics: ArchiveDiagnosticReplayMaterializedFixtureDiagnostic[];
  items: ArchiveDiagnosticReplayMaterializedFixtureProjectionItem[];
};

type NormalizedArchiveDiagnosticReplayRecord = {
  key: string;
  item: ArchiveDiagnosticReplayMaterializedFixtureProjectionItem;
};

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

export function projectArchiveDiagnosticReplayMaterializedFixtures(
  input: ArchiveDiagnosticReplayMaterializedFixtureProjectionInput
): ArchiveDiagnosticReplayMaterializedFixtureProjection {
  const limit = normalizeLimit(input.limit);
  const offset = parseCursor(input.cursor);
  const projectRecords = input.records.filter((record) => record.projectId === input.projectId);
  const actorScopedRecords =
    input.actorId === undefined
      ? projectRecords
      : projectRecords.filter((record) => (record.actorIds ?? []).includes(input.actorId!));
  const normalizedRecords = actorScopedRecords.map(normalizeRecord).sort(compareNormalizedRecords);
  const { records, duplicateRecordCount } = deduplicateRecords(normalizedRecords);
  const items = records.map((record) => record.item);
  const safeOffset = Math.min(offset, items.length);
  const pageItems = items.slice(safeOffset, safeOffset + limit);
  const nextOffset = safeOffset + pageItems.length;
  const hasMore = nextOffset < items.length;
  const projectionDigest = stableHash(
    stableJson({
      projectId: input.projectId,
      actorId: input.actorId ?? null,
      items,
      duplicateRecordCount
    })
  );
  const page = {
    limit,
    offset: safeOffset,
    returned: pageItems.length,
    total: items.length,
    ...(input.cursor === undefined ? {} : { cursor: normalizeCursor(safeOffset) }),
    ...(hasMore ? { nextCursor: normalizeCursor(nextOffset) } : {}),
    hasMore,
    itemDigest: stableHash(stableJson(pageItems.map((item) => item.id)))
  };
  const diagnostics = buildProjectionDiagnostics(duplicateRecordCount);
  const projection = {
    schemaVersion: 1 as const,
    kind: "archive-diagnostic-replay.materialized-fixture.domain-projection" as const,
    projectId: safeText(input.projectId),
    ...(input.actorId === undefined ? {} : { actorId: safeText(input.actorId) }),
    scope: {
      projectScoped: true as const,
      actorScoped: input.actorId !== undefined,
      readOnly: true as const,
      mutation: false as const
    },
    page,
    summary: {
      sourceRecordCount: input.records.length,
      projectRecordCount: projectRecords.length,
      actorRecordCount: actorScopedRecords.length,
      materializedRecordCount: items.length,
      duplicateRecordCount,
      retryRecordCount: actorScopedRecords.filter((record) => record.retryOf !== undefined).length,
      excludedByProjectScope: input.records.length - projectRecords.length,
      excludedByActorScope: projectRecords.length - actorScopedRecords.length,
      deterministic: true as const,
      projectionDigest
    },
    safety: archiveDiagnosticReplayProjectionSafety(),
    diagnostics,
    items: pageItems
  };

  return deepFreeze(projection);
}

export function archiveDiagnosticReplayProjectionSafety(): ArchiveDiagnosticReplayMaterializedFixtureProjection["safety"] {
  return {
    rawArchivePayloadsIncluded: false,
    manifestEntriesIncluded: false,
    resultFilesIncluded: false,
    rawAttachmentsIncluded: false,
    localPathsIncluded: false,
    storageRefsIncluded: false,
    signedUrlsIncluded: false,
    tokensIncluded: false,
    workerJobsEnqueued: false,
    replayStarted: false
  };
}

function normalizeRecord(
  record: ArchiveDiagnosticReplayMaterializedFixtureInput
): NormalizedArchiveDiagnosticReplayRecord {
  const fixtureRef = safeText(record.fixtureRef);
  const materializedRef = safeText(record.materializedRef);
  const sourceDigest = safeText(record.sourceDigest);
  const key = [fixtureRef, materializedRef, sourceDigest].join("\u001f");
  const diagnostics = (record.diagnostics ?? []).map(normalizeDiagnostic).sort(compareDiagnostics);
  const item = {
    id: `archive-diagnostic-replay-fixture:${stableHash(key)}`,
    fixtureRef,
    materializedRef,
    sourceDigest,
    materializedAt: safeText(record.materializedAt),
    ...(record.name === undefined ? {} : { name: safeText(record.name) }),
    status: record.status ?? "materialized",
    actorIds: uniqueSorted((record.actorIds ?? []).map(safeText)),
    attempt: normalizeAttempt(record.attempt),
    retry: record.retryOf !== undefined || normalizeAttempt(record.attempt) > 1,
    diagnostics
  };

  return { key, item };
}

function normalizeDiagnostic(
  diagnostic: ArchiveDiagnosticReplayMaterializedFixtureDiagnosticInput
): ArchiveDiagnosticReplayMaterializedFixtureDiagnostic {
  return {
    code: safeText(diagnostic.code),
    severity: diagnostic.severity ?? "info",
    ...(diagnostic.message === undefined ? {} : { message: safeText(diagnostic.message) })
  };
}

function deduplicateRecords(records: NormalizedArchiveDiagnosticReplayRecord[]): {
  records: NormalizedArchiveDiagnosticReplayRecord[];
  duplicateRecordCount: number;
} {
  const unique = new Map<string, NormalizedArchiveDiagnosticReplayRecord>();
  let duplicateRecordCount = 0;

  for (const record of records) {
    const existing = unique.get(record.key);
    if (existing === undefined) {
      unique.set(record.key, record);
      continue;
    }

    duplicateRecordCount += 1;
    if (compareProjectionItems(record.item, existing.item) < 0) {
      unique.set(record.key, record);
    }
  }

  return {
    records: [...unique.values()].sort(compareNormalizedRecords),
    duplicateRecordCount
  };
}

function buildProjectionDiagnostics(
  duplicateRecordCount: number
): ArchiveDiagnosticReplayMaterializedFixtureDiagnostic[] {
  if (duplicateRecordCount === 0) {
    return [];
  }

  return [
    {
      code: "archive-diagnostic-replay.duplicate-materialized-record",
      severity: "warn",
      message: `${duplicateRecordCount} duplicate materialized replay fixture record(s) were ignored.`
    }
  ];
}

function compareNormalizedRecords(
  left: NormalizedArchiveDiagnosticReplayRecord,
  right: NormalizedArchiveDiagnosticReplayRecord
): number {
  return compareProjectionItems(left.item, right.item);
}

function compareProjectionItems(
  left: ArchiveDiagnosticReplayMaterializedFixtureProjectionItem,
  right: ArchiveDiagnosticReplayMaterializedFixtureProjectionItem
): number {
  return (
    left.fixtureRef.localeCompare(right.fixtureRef) ||
    left.materializedAt.localeCompare(right.materializedAt) ||
    left.materializedRef.localeCompare(right.materializedRef) ||
    left.sourceDigest.localeCompare(right.sourceDigest) ||
    left.attempt - right.attempt
  );
}

function compareDiagnostics(
  left: ArchiveDiagnosticReplayMaterializedFixtureDiagnostic,
  right: ArchiveDiagnosticReplayMaterializedFixtureDiagnostic
): number {
  return (
    left.code.localeCompare(right.code) ||
    left.severity.localeCompare(right.severity) ||
    (left.message ?? "").localeCompare(right.message ?? "")
  );
}

function normalizeLimit(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) {
    return DEFAULT_LIMIT;
  }

  return Math.min(Math.max(Math.floor(value), 1), MAX_LIMIT);
}

function parseCursor(value: string | undefined): number {
  if (value === undefined) {
    return 0;
  }

  const match = /^offset:(\d+)$/.exec(value);
  if (match === null) {
    return 0;
  }

  return Number.parseInt(match[1]!, 10);
}

function normalizeCursor(offset: number): string {
  return `offset:${offset}`;
}

function normalizeAttempt(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) {
    return 1;
  }

  return Math.max(1, Math.floor(value));
}

function safeText(value: string): string {
  return redactSensitiveText(value)
    .replace(
      /\b[a-z0-9._-]*(?:archive|attachment|result)[a-z0-9._-]*\.(?:json|xml|txt|png|jpg|jpeg|zip)\b/gi,
      "[artifact]"
    )
    .replace(/\b[a-z0-9._-]+\.(?:zip|png|jpg|jpeg|xml|txt|json)\b/gi, "[file]")
    .replace(/\b(raw[-_])?(archive|attachment|payload|manifest|result)\b/gi, "[artifact]")
    .replace(/\s+/g, " ")
    .trim();
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entryValue]) => entryValue !== undefined)
    .sort(([left], [right]) => left.localeCompare(right));

  return `{${entries
    .map(([key, entryValue]) => `${JSON.stringify(key)}:${stableJson(entryValue)}`)
    .join(",")}}`;
}

function stableHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(16).padStart(8, "0");
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object") {
    return value;
  }

  Object.freeze(value);
  for (const child of Object.values(value)) {
    deepFreeze(child);
  }

  return value;
}
