export type IdentityCorrectionAuditKind = "conservative_link" | "split" | "merge" | "correction";

export type IdentityCorrectionAuditSource =
  "testCaseId" | "fullName" | "historyId" | "name" | "heuristic" | "manual" | "migration";

export type IdentityCorrectionAuditConfidence = "high" | "medium" | "low";

export type IdentityCorrectionAuditOrigin =
  | {
      type: "system";
      name: string;
    }
  | {
      type: "actor";
      actorId: string;
      displayName?: string;
    };

export type IdentityCorrectionAuditScope = {
  launchId?: string;
  historyId?: string;
  parameterVariantSignature?: string;
};

export type IdentityCorrectionAuditEvidence = {
  launchId?: string;
  resultUuid?: string;
  historyId?: string;
  attemptIndex?: number;
  parameterVariantSignature?: string;
};

export type IdentityCorrectionAuditEvent = {
  id: string;
  dedupeKey: string;
  projectId: string;
  kind: IdentityCorrectionAuditKind;
  source: IdentityCorrectionAuditSource;
  confidence: IdentityCorrectionAuditConfidence;
  origin: IdentityCorrectionAuditOrigin;
  reason: string;
  beforeIds: string[];
  afterIds: string[];
  scope?: IdentityCorrectionAuditScope;
  evidence: IdentityCorrectionAuditEvidence[];
  occurredAt: string;
};

export type IdentityCorrectionAuditInput = {
  projectId: string;
  kind: IdentityCorrectionAuditKind;
  source: IdentityCorrectionAuditSource;
  confidence: IdentityCorrectionAuditConfidence;
  origin: IdentityCorrectionAuditOrigin;
  reason: string;
  beforeIds: string[];
  afterIds: string[];
  scope?: IdentityCorrectionAuditScope;
  evidence?: IdentityCorrectionAuditEvidence[];
  occurredAt: string;
};

export function createIdentityCorrectionAuditEvent(
  input: IdentityCorrectionAuditInput
): IdentityCorrectionAuditEvent {
  const beforeIds = normalizeIdentityIds(input.beforeIds, "beforeIds");
  const afterIds = normalizeIdentityIds(input.afterIds, "afterIds");
  assertIdentityCorrectionShape(input.kind, beforeIds, afterIds);

  const scope = normalizeScope(input.scope);
  const dedupeInput = {
    projectId: input.projectId,
    kind: input.kind,
    source: input.source,
    confidence: input.confidence,
    origin: input.origin,
    reason: input.reason,
    beforeIds,
    afterIds
  };
  const dedupeKey = buildIdentityCorrectionAuditDedupeKey(
    scope === undefined ? dedupeInput : { ...dedupeInput, scope }
  );

  return {
    id: `identity-audit:${stableHash(dedupeKey)}`,
    dedupeKey,
    projectId: input.projectId,
    kind: input.kind,
    source: input.source,
    confidence: input.confidence,
    origin: input.origin,
    reason: input.reason,
    beforeIds,
    afterIds,
    ...(scope !== undefined ? { scope } : {}),
    evidence: uniqueEvidence(input.evidence ?? []),
    occurredAt: input.occurredAt
  };
}

export function buildIdentityCorrectionAuditEvents(
  inputs: IdentityCorrectionAuditInput[]
): IdentityCorrectionAuditEvent[] {
  const events = new Map<string, IdentityCorrectionAuditEvent>();

  for (const input of inputs) {
    const event = createIdentityCorrectionAuditEvent(input);
    const existing = events.get(event.dedupeKey);
    if (existing === undefined) {
      events.set(event.dedupeKey, event);
      continue;
    }

    events.set(event.dedupeKey, {
      ...existing,
      evidence: uniqueEvidence([...existing.evidence, ...event.evidence]),
      occurredAt:
        existing.occurredAt.localeCompare(event.occurredAt) <= 0
          ? existing.occurredAt
          : event.occurredAt
    });
  }

  return [...events.values()].sort((left, right) => {
    const occurredAt = left.occurredAt.localeCompare(right.occurredAt);
    return occurredAt === 0 ? left.id.localeCompare(right.id) : occurredAt;
  });
}

function buildIdentityCorrectionAuditDedupeKey(input: {
  projectId: string;
  kind: IdentityCorrectionAuditKind;
  source: IdentityCorrectionAuditSource;
  confidence: IdentityCorrectionAuditConfidence;
  origin: IdentityCorrectionAuditOrigin;
  reason: string;
  beforeIds: string[];
  afterIds: string[];
  scope?: IdentityCorrectionAuditScope;
}): string {
  return stableStringify({
    projectId: input.projectId,
    kind: input.kind,
    source: input.source,
    confidence: input.confidence,
    origin: input.origin,
    reason: input.reason,
    beforeIds: input.beforeIds,
    afterIds: input.afterIds,
    scope: input.scope
  });
}

function assertIdentityCorrectionShape(
  kind: IdentityCorrectionAuditKind,
  beforeIds: string[],
  afterIds: string[]
): void {
  if (kind === "split" && (beforeIds.length !== 1 || afterIds.length < 2)) {
    throw new Error(
      "Identity split audit events require one before id and at least two after ids."
    );
  }

  if (kind === "merge" && (beforeIds.length < 2 || afterIds.length !== 1)) {
    throw new Error(
      "Identity merge audit events require at least two before ids and one after id."
    );
  }

  if (
    (kind === "conservative_link" || kind === "correction") &&
    (beforeIds.length !== 1 || afterIds.length !== 1)
  ) {
    throw new Error(`${kind} audit events require one before id and one after id.`);
  }
}

function normalizeIdentityIds(values: string[], label: string): string[] {
  const ids = values.map((value) => value.trim()).filter((value) => value.length > 0);
  if (ids.length === 0) {
    throw new Error(`Identity correction audit ${label} must not be empty.`);
  }
  return [...new Set(ids)].sort();
}

function normalizeScope(
  scope: IdentityCorrectionAuditScope | undefined
): IdentityCorrectionAuditScope | undefined {
  if (scope === undefined) {
    return undefined;
  }

  const normalized: IdentityCorrectionAuditScope = {};
  assignNonEmpty(normalized, "launchId", scope.launchId);
  assignNonEmpty(normalized, "historyId", scope.historyId);
  assignNonEmpty(normalized, "parameterVariantSignature", scope.parameterVariantSignature);
  return Object.keys(normalized).length === 0 ? undefined : normalized;
}

function uniqueEvidence(
  evidence: IdentityCorrectionAuditEvidence[]
): IdentityCorrectionAuditEvidence[] {
  const unique = new Map<string, IdentityCorrectionAuditEvidence>();
  for (const item of evidence) {
    const normalized = normalizeEvidence(item);
    if (normalized !== undefined) {
      unique.set(stableStringify(normalized), normalized);
    }
  }
  return [...unique.values()].sort((left, right) =>
    stableStringify(left).localeCompare(stableStringify(right))
  );
}

function normalizeEvidence(
  evidence: IdentityCorrectionAuditEvidence
): IdentityCorrectionAuditEvidence | undefined {
  const normalized: IdentityCorrectionAuditEvidence = {};
  assignNonEmpty(normalized, "launchId", evidence.launchId);
  assignNonEmpty(normalized, "resultUuid", evidence.resultUuid);
  assignNonEmpty(normalized, "historyId", evidence.historyId);
  assignNonEmpty(normalized, "parameterVariantSignature", evidence.parameterVariantSignature);
  if (evidence.attemptIndex !== undefined) {
    normalized.attemptIndex = evidence.attemptIndex;
  }
  return Object.keys(normalized).length === 0 ? undefined : normalized;
}

function assignNonEmpty<T extends object, K extends keyof T>(
  target: T,
  key: K,
  value: T[K] | undefined
): void {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.length > 0) {
      target[key] = trimmed as T[K];
    }
    return;
  }

  if (value !== undefined) {
    target[key] = value;
  }
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }

  const entries = Object.entries(value)
    .filter(([, entryValue]) => entryValue !== undefined)
    .sort(([left], [right]) => left.localeCompare(right));

  return `{${entries
    .map(([key, entryValue]) => `${JSON.stringify(key)}:${stableStringify(entryValue)}`)
    .join(",")}}`;
}

function stableHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0).toString(16).padStart(8, "0");
}
