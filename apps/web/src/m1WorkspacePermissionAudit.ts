import type {
  TestCaseHistoryCompareAvailability,
  TestCaseHistoryComparePage,
  TestCaseHistoryComparePermissionAudit,
  TestCaseHistoryComparePermissionAuditInvariant,
  TestCaseHistoryComparePermissionAuditRecord,
  TestCaseHistoryCompareScope,
  TestCaseHistoryCompareValue
} from "./m1WorkspaceTypes.js";
import type {
  ApiHistoryComparePermissionAuditInvariantReadModel,
  ApiHistoryComparePermissionAuditReadModel,
  ApiHistoryComparePermissionAuditRecordReadModel
} from "./m1WorkspaceApiTypes.js";

export function mergeHistoryComparePermissionAuditRead(
  compare: TestCaseHistoryComparePage | undefined,
  auditRead: ApiHistoryComparePermissionAuditReadModel | undefined,
  invariantRead?: ApiHistoryComparePermissionAuditInvariantReadModel | undefined
): TestCaseHistoryComparePage | undefined {
  if (compare === undefined) {
    return compare;
  }

  if (auditRead === undefined && invariantRead === undefined) {
    return compare;
  }

  const compareWithInvariant =
    invariantRead === undefined
      ? compare
      : {
          ...compare,
          permissionAuditInvariant: normalizePermissionAuditInvariantRead(invariantRead)
        };

  if (auditRead === undefined) {
    return compareWithInvariant;
  }

  const availability = normalizePermissionAuditAvailability(auditRead);
  const compareWithAudit: TestCaseHistoryComparePage = {
    ...compareWithInvariant,
    scope: normalizePermissionAuditScope(auditRead, compare.scope),
    permissionAudit: normalizePermissionAuditRead(auditRead)
  };
  if (availability.state === "ready" && compare.availability === undefined) {
    return compareWithAudit;
  }

  return {
    ...compareWithAudit,
    availability: {
      ...compare.availability,
      ...availability
    }
  };
}

function normalizePermissionAuditAvailability(
  auditRead: ApiHistoryComparePermissionAuditReadModel
): TestCaseHistoryCompareAvailability {
  const state = normalizePermissionAuditState(auditRead.availability?.status);
  const unavailable = uniqueStrings([
    ...(auditRead.availability?.unavailable ?? []),
    ...collectPermissionAuditUnavailableFields(auditRead)
  ]);

  if (state === "denied") {
    return {
      state: "denied",
      title: "History compare access denied",
      message: "This actor or project scope cannot read enriched history compare data.",
      reason: safeHistoryCompareText(auditRead.availability?.reason, "permission_denied")
    };
  }

  if (state === "partial") {
    return {
      state: "partial",
      title: "History compare partially available",
      message: "Some enriched compare fields are unavailable or hidden by permission.",
      unavailable
    };
  }

  if (state === "empty") {
    return {
      state: "empty",
      title: "No permission audit records yet",
      message:
        "The selected case has no permission audit replay records for the current actor/project scope."
    };
  }

  return { state: "ready" };
}

function normalizePermissionAuditScope(
  auditRead: ApiHistoryComparePermissionAuditReadModel,
  fallback: TestCaseHistoryCompareScope | undefined
): TestCaseHistoryCompareScope {
  const state = normalizePermissionAuditState(auditRead.availability?.status);
  if (state === "denied") {
    return {
      actor: { state: "denied" },
      project: { state: "denied" },
      permission: "denied",
      redactionApplied: true,
      redactedFields: uniqueStrings([
        "actor",
        "project",
        ...collectPermissionAuditRedactedFields(auditRead)
      ])
    };
  }

  const actorId =
    auditRead.actor?.displayName ??
    auditRead.actor?.actorId ??
    auditRead.query?.actorId ??
    "history-compare-ui";
  const projectId = auditRead.projectId ?? auditRead.query?.projectId ?? fallback?.project;

  return {
    actor: safeHistoryCompareValue(actorId, "history-compare-ui"),
    project:
      typeof projectId === "string"
        ? safeHistoryCompareValue(projectId, "Current project")
        : (fallback?.project ?? "Current project"),
    permission: state === "partial" ? "redacted" : "allowed",
    redactionApplied: true,
    redactedFields: uniqueStrings([
      ...(fallback?.redactedFields ?? []),
      ...collectPermissionAuditRedactedFields(auditRead)
    ])
  };
}

function normalizePermissionAuditRead(
  auditRead: ApiHistoryComparePermissionAuditReadModel
): TestCaseHistoryComparePermissionAudit {
  const state = normalizePermissionAuditState(auditRead.availability?.status);
  const audit = auditRead.audit;
  const page = auditRead.page;
  const records = (auditRead.items ?? auditRead.records ?? [])
    .slice(0, Math.max(0, Math.min(page?.limit ?? 3, page?.returned ?? 3)))
    .map((record) => normalizePermissionAuditRecord(record, state));
  const rawHistoryDigest =
    audit?.rawHistory?.digest ??
    audit?.rawHistory?.digests?.find((digest) => digest.trim().length > 0) ??
    "sha256:unavailable";
  const actorId =
    auditRead.actor?.displayName ??
    auditRead.actor?.actorId ??
    auditRead.query?.actorId ??
    "history-compare-ui";
  const projectId = auditRead.projectId ?? auditRead.query?.projectId ?? "Current project";

  return {
    state,
    actor:
      state === "denied"
        ? { state: "denied" }
        : safeHistoryCompareValue(actorId, "history-compare-ui"),
    project:
      state === "denied"
        ? { state: "denied" }
        : safeHistoryCompareValue(projectId, "Current project"),
    evaluatedAt: audit?.lastOccurredAt ?? audit?.firstOccurredAt ?? new Date(0).toISOString(),
    source: auditRead.policy?.restParity?.path?.includes("/api/v1/")
      ? "rest-permission-audit"
      : "mcp-permission-audit",
    access: {
      scope: safeHistoryCompareText(auditRead.access?.scope, "test-cases:read"),
      projectScoped: auditRead.access?.projectScoped !== false,
      actorScoped: auditRead.access?.actorScoped !== false,
      mutation: false,
      redacted: true
    },
    page: {
      limit: page?.limit ?? 3,
      offset: page?.offset ?? 0,
      returned: page?.returned ?? records.length,
      total: page?.total ?? records.length,
      hasMore: page?.hasMore ?? false
    },
    replay: {
      eventCount:
        audit?.replayedEventCount ??
        records.reduce((total, record) => total + record.eventCount, 0),
      acceptedCount:
        audit?.byDecision?.ready ?? records.filter((record) => record.decision === "ready").length,
      deniedCount:
        audit?.byDecision?.denied ??
        records.filter((record) => record.decision === "denied").length,
      partialCount:
        audit?.byDecision?.partial ??
        records.filter((record) => record.decision === "partial").length,
      duplicateCount: 0,
      ignoredCount: auditRead.diagnostics?.length ?? 0
    },
    digest: {
      projectionDigest: safeHistoryCompareText(audit?.projectionDigest, "unavailable"),
      rawHistoryDigest: safeHistoryCompareText(rawHistoryDigest, "sha256:unavailable"),
      algorithm: "sha256",
      rawHistoryExposed: false
    },
    reason: state === "denied" ? { state: "denied" } : { state: "redacted" },
    redactedFields: uniqueStrings(collectPermissionAuditRedactedFields(auditRead)),
    records
  };
}

function normalizePermissionAuditInvariantRead(
  invariantRead: ApiHistoryComparePermissionAuditInvariantReadModel
): TestCaseHistoryComparePermissionAuditInvariant {
  const state = normalizePermissionAuditState(invariantRead.availability?.status);
  const actorId =
    invariantRead.actor?.displayName ??
    invariantRead.actor?.actorId ??
    invariantRead.query?.actorId ??
    "history-compare-ui";
  const projectId = invariantRead.projectId ?? invariantRead.query?.projectId ?? "Current project";
  const page = invariantRead.page;
  const actorScoped = invariantRead.invariant?.actorScoped?.passed !== false;
  const leakedActorIds = uniqueStrings(
    invariantRead.invariant?.actorScoped?.leakedActorIds ?? []
  ).filter((value) => !containsSensitiveHistoryCompareText(value));
  const items = (invariantRead.items ?? [])
    .slice(0, Math.max(0, Math.min(page?.limit ?? 3, page?.returned ?? 3)))
    .map((item, index) => ({
      ordinal: item.ordinal ?? index,
      eventId: safeHistoryCompareText(item.eventId, "event redacted"),
      redacted: true as const
    }));

  return {
    state,
    actor:
      state === "denied"
        ? { state: "denied" }
        : safeHistoryCompareValue(actorId, "history-compare-ui"),
    project:
      state === "denied"
        ? { state: "denied" }
        : safeHistoryCompareValue(projectId, "Current project"),
    evaluatedAt: new Date(0).toISOString(),
    source: invariantRead.kind.includes("replay-invariants")
      ? "rest-permission-audit-invariants"
      : "mcp-permission-audit-invariants",
    access: {
      scope: safeHistoryCompareText(invariantRead.access?.scope, "test-cases:read"),
      projectScoped: invariantRead.access?.projectScoped !== false,
      actorScoped: invariantRead.access?.actorScoped !== false,
      mutation: false,
      redacted: true
    },
    page: {
      limit: page?.limit ?? 3,
      offset: page?.offset ?? 0,
      returned: page?.returned ?? items.length,
      total: page?.total ?? items.length,
      hasMore: page?.hasMore ?? false
    },
    invariant: {
      boundary: safeHistoryCompareText(
        invariantRead.invariant?.boundary,
        "read-only-history-compare-permission-audit-replay-invariant"
      ),
      source: safeHistoryCompareText(
        invariantRead.invariant?.source,
        "history-compare-permission-audit-projection"
      ),
      consistency: safeHistoryCompareText(
        invariantRead.invariant?.consistency,
        "append-only-replay"
      ),
      mutationBoundary: safeHistoryCompareText(
        invariantRead.invariant?.mutationBoundary,
        "rest-read-only-no-replay-mutation"
      ),
      deterministic: invariantRead.invariant?.deterministic === true,
      recomputable: invariantRead.invariant?.recomputable === true,
      projectScoped: invariantRead.invariant?.projectScoped !== false,
      actorScoped,
      leakedActorIds,
      projectionDigest: safeHistoryCompareText(
        invariantRead.invariant?.projectionDigest,
        "sha256:unavailable"
      ),
      recomputedDigest: safeHistoryCompareText(
        invariantRead.invariant?.recomputedDigest,
        "sha256:unavailable"
      )
    },
    appendOnly: {
      uniqueProjectedEventIds: invariantRead.appendOnly?.uniqueProjectedEventIds !== false,
      duplicateEventIds: uniqueStrings(invariantRead.appendOnly?.duplicateEventIds ?? []).filter(
        (value) => !containsSensitiveHistoryCompareText(value)
      ),
      totalProjectedEventIds: invariantRead.appendOnly?.totalProjectedEventIds ?? items.length
    },
    rawCompareInputs: {
      included: false,
      preserved: invariantRead.rawCompareInputs?.preserved !== false,
      digestCount: invariantRead.rawCompareInputs?.digestCount ?? 0,
      itemCount: invariantRead.rawCompareInputs?.itemCount ?? 0
    },
    redaction: {
      passed: invariantRead.redaction?.passed !== false,
      leakedMarkerCount: invariantRead.redaction?.leakedMarkerCount ?? 0,
      leakedMarkers: uniqueStrings(invariantRead.redaction?.leakedMarkers ?? []).filter(
        (value) => !containsSensitiveHistoryCompareText(value)
      ),
      rawHistoryIncluded: false,
      rawCompareInputsIncluded: false,
      hiddenOrMaskedValuesIncluded: false,
      tokensIncluded: false,
      pathsIncluded: false,
      storageLocationsIncluded: false,
      artifactUrlsIncluded: false,
      policy: safeHistoryCompareText(
        invariantRead.redaction?.policy,
        "Invariant evidence renders metadata only; raw compare inputs and raw history remain hidden."
      )
    },
    items
  };
}

function normalizePermissionAuditRecord(
  record: ApiHistoryComparePermissionAuditRecordReadModel,
  auditState: TestCaseHistoryComparePermissionAudit["state"]
): TestCaseHistoryComparePermissionAuditRecord {
  const decision = normalizePermissionAuditRecordDecision(record.decision, auditState);
  const actorId = record.actor?.displayName ?? record.actor?.actorId ?? "history-compare-ui";

  const normalizedRecord: TestCaseHistoryComparePermissionAuditRecord = {
    compareId: safeHistoryCompareText(record.compareId, "compare redacted"),
    decision,
    actor:
      auditState === "denied"
        ? { state: "denied" }
        : safeHistoryCompareValue(actorId, "history-compare-ui"),
    eventCount: record.eventCount ?? 0,
    rawHistoryItemCount: record.rawHistory?.itemCount ?? 0,
    reasons: (record.reasons ?? [])
      .map((reason) =>
        safeHistoryCompareText(reason.code ?? reason.explanation, "permission redacted")
      )
      .filter((reason) => reason.length > 0),
    unavailable: (record.unavailable ?? []).map((field) =>
      safeHistoryCompareText(field, "restricted field")
    )
  };

  if (record.rawHistory?.digest !== undefined) {
    normalizedRecord.rawHistoryDigest = safeHistoryCompareText(
      record.rawHistory.digest,
      "sha256:redacted"
    );
  }

  return normalizedRecord;
}

function normalizePermissionAuditState(
  value: string | undefined
): TestCaseHistoryComparePermissionAudit["state"] {
  if (value === "denied" || value === "partial" || value === "empty") {
    return value;
  }

  return "ready";
}

function normalizePermissionAuditRecordDecision(
  value: string | undefined,
  fallback: TestCaseHistoryComparePermissionAudit["state"]
): TestCaseHistoryComparePermissionAuditRecord["decision"] {
  if (value === "ready" || value === "partial" || value === "denied") {
    return value;
  }

  return fallback === "empty" ? "partial" : fallback;
}

function collectPermissionAuditRedactedFields(
  auditRead: ApiHistoryComparePermissionAuditReadModel
): string[] {
  return uniqueStrings([
    ...collectPermissionAuditUnavailableFields(auditRead),
    ...(auditRead.redaction?.rawHistoryIncluded === false ? ["rawHistory"] : []),
    ...(auditRead.redaction?.rawCompareInputsIncluded === false ? ["compareInputs"] : []),
    ...(auditRead.redaction?.hiddenOrMaskedValuesIncluded === false ? ["hiddenValues"] : []),
    ...(auditRead.redaction?.tokensIncluded === false ? ["tokens"] : []),
    ...(auditRead.redaction?.pathsIncluded === false ? ["paths"] : []),
    ...(auditRead.redaction?.storageLocationsIncluded === false ? ["storageLocations"] : []),
    ...(auditRead.redaction?.artifactUrlsIncluded === false ? ["artifactUrls"] : [])
  ]).filter((field) => !containsSensitiveHistoryCompareText(field));
}

function collectPermissionAuditUnavailableFields(
  auditRead: ApiHistoryComparePermissionAuditReadModel
): string[] {
  return uniqueStrings([
    ...(auditRead.availability?.unavailable ?? []),
    ...(auditRead.items ?? auditRead.records ?? []).flatMap((record) => [
      ...(record.unavailable ?? []),
      ...(record.reasons ?? []).flatMap((reason) => reason.fields ?? [])
    ])
  ]).filter((field) => !containsSensitiveHistoryCompareText(field));
}

function safeHistoryCompareValue(value: string, fallback: string): TestCaseHistoryCompareValue {
  const text = safeHistoryCompareText(value, fallback);
  return text === fallback && containsSensitiveHistoryCompareText(value)
    ? { state: "redacted" }
    : text;
}

function safeHistoryCompareText(value: string | undefined, fallback: string): string {
  const normalized = value?.trim() ?? "";
  if (normalized.length === 0 || containsSensitiveHistoryCompareText(normalized)) {
    return fallback;
  }

  return normalized.slice(0, 160);
}

function containsSensitiveHistoryCompareText(value: string): boolean {
  return (
    /[A-Za-z]:\\|\\\\|\/Users\/|\/home\/|\/var\/|\/tmp\/|Downloads/i.test(value) ||
    /\b(authorization|bearer|password|secret|token|api[-_ ]?key|raw-sensitive|storage[-_ ]?key|storage[-_ ]?ref|signed[-_ ]?url)\b/i.test(
      value
    ) ||
    /https?:\/\/\S*(?:[?&](?:token|signature|x-amz-signature|sig|key|secret)=)/i.test(value) ||
    /(?:s3|gs|az|azure|minio|storage|blob):\/\//i.test(value)
  );
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)));
}
