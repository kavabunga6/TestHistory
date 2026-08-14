import { createHash } from "node:crypto";
import { type AppStore, type Launch, type UploadJob } from "../store.js";

import { archiveJobDiagnostics, archiveJobPhase, getArchiveJobs } from "./uploadArchiveStatus.js";
import {
  type ArchiveManifestDiagnostic,
  archiveDiagnosticReplaySources,
  archiveDiagnosticReplaySeverities,
  syntheticArchiveDiagnosticReplayFixtureContracts,
  type ArchiveDiagnosticReplayFixtureContract,
  type ArchiveDiagnosticReplayFixtureName,
  type ArchiveDiagnosticReplayMaterializedFixtureRecord,
  type ArchiveDiagnosticReplayProjection,
  type ArchiveDiagnosticReplayRecord,
  type ArchiveDiagnosticReplaySeverity,
  type ArchiveDiagnosticReplaySource,
  type ArchiveDiagnosticReplaySummary
} from "./uploadTypes.js";

export function buildArchiveDiagnosticReplayProjections(
  store: AppStore,
  launch: Launch
): ArchiveDiagnosticReplayProjection[] {
  return getArchiveJobs(store, launch.id).map((job) => {
    const archiveRef = `archive:${job.id}`;
    const events = archiveDiagnosticReplayRecordsForJob(launch, job, archiveRef);
    const records = isClosedArchiveDiagnosticReplayLaunch(launch) ? events : [];
    const summary = buildArchiveDiagnosticReplaySummary({
      projectId: launch.projectId,
      launchId: launch.id,
      archiveRef,
      eventCount: events.length,
      records,
      rejectedOpenLaunchEventCount: isClosedArchiveDiagnosticReplayLaunch(launch)
        ? 0
        : events.length
    });

    return {
      kind: "archive-diagnostic-replay-summary",
      projectId: launch.projectId,
      launchId: launch.id,
      archiveRef,
      uploadId: job.id,
      status: job.status,
      phase: archiveJobPhase(job),
      worker: archiveDiagnosticReplayWorkerContract(),
      execution: archiveDiagnosticReplayExecutionContract(),
      summary,
      records
    };
  });
}

function archiveDiagnosticReplayRecordsForJob(
  launch: Launch,
  job: UploadJob,
  archiveRef: string
): ArchiveDiagnosticReplayRecord[] {
  const statusRecord: ArchiveDiagnosticReplayRecord = {
    eventRef: archiveDiagnosticReplayEventRef(job.id, "status", job.status),
    projectId: launch.projectId,
    launchId: launch.id,
    archiveRef,
    source: "archive.status.read",
    code: "archive-status-read",
    severity: archiveDiagnosticReplaySeverityForJob(job),
    retryable: job.status === "queued" || job.status === "processing" || job.status === "failed",
    occurredAt: job.updatedAt
  };
  const diagnosticRecords = archiveJobDiagnostics(job).map((diagnostic, index) => ({
    eventRef: archiveDiagnosticReplayEventRef(
      job.id,
      "diagnostic",
      String(index),
      diagnostic.code,
      diagnostic.severity
    ),
    projectId: launch.projectId,
    launchId: launch.id,
    archiveRef,
    source: "archive.diagnostics.read" as const,
    code: archiveDiagnosticReplayCode(diagnostic),
    severity: archiveDiagnosticReplaySeverity(diagnostic.severity),
    retryable: false,
    occurredAt: job.updatedAt,
    entryRef: archiveDiagnosticReplayRef(job.id, "entry", index),
    chunkRef: archiveDiagnosticReplayRef(job.id, "chunk", index)
  }));

  return [statusRecord, ...diagnosticRecords].sort((left, right) =>
    [left.occurredAt, left.source, left.code, left.eventRef]
      .join("\u001f")
      .localeCompare([right.occurredAt, right.source, right.code, right.eventRef].join("\u001f"))
  );
}

function buildArchiveDiagnosticReplaySummary(input: {
  projectId: string;
  launchId: string;
  archiveRef: string;
  eventCount: number;
  records: readonly ArchiveDiagnosticReplayRecord[];
  rejectedOpenLaunchEventCount: number;
}): ArchiveDiagnosticReplaySummary {
  const severityCounts = createArchiveDiagnosticReplaySeverityCounts();
  const sourceCounts = createArchiveDiagnosticReplaySourceCounts();
  for (const record of input.records) {
    severityCounts[record.severity] += 1;
    sourceCounts[record.source] += 1;
  }

  return {
    projectId: input.projectId,
    launchId: input.launchId,
    archiveRef: input.archiveRef,
    eventCount: input.eventCount,
    acceptedEventCount: input.records.length,
    duplicateEventCount: 0,
    rejectedOpenLaunchEventCount: input.rejectedOpenLaunchEventCount,
    rejectedOutOfScopeEventCount: 0,
    invalidEventCount: 0,
    retryableEventCount: input.records.filter((record) => record.retryable).length,
    severityCounts,
    sourceCounts,
    replayDigest: hashArchiveDiagnosticReplayParts([
      "archive-diagnostics-replay",
      input.projectId,
      input.launchId,
      input.archiveRef,
      ...input.records.map((record) =>
        [
          record.eventRef,
          record.source,
          record.code,
          record.severity,
          record.retryable ? "retryable" : "terminal"
        ].join(":")
      )
    ]),
    closedArchiveStatusReadCompatible: true,
    closedArchiveDiagnosticsReadCompatible: true,
    mutationBoundary: "worker-replay-only-no-rest-or-ui-claims"
  };
}

export function summarizeArchiveDiagnosticReplayProjections(
  projections: readonly ArchiveDiagnosticReplayProjection[]
) {
  const severityCounts = createArchiveDiagnosticReplaySeverityCounts();
  const sourceCounts = createArchiveDiagnosticReplaySourceCounts();

  for (const projection of projections) {
    for (const severity of archiveDiagnosticReplaySeverities) {
      severityCounts[severity] += projection.summary.severityCounts[severity];
    }
    for (const source of archiveDiagnosticReplaySources) {
      sourceCounts[source] += projection.summary.sourceCounts[source];
    }
  }

  return {
    totalProjections: projections.length,
    eventCount: projections.reduce((total, item) => total + item.summary.eventCount, 0),
    acceptedEventCount: projections.reduce(
      (total, item) => total + item.summary.acceptedEventCount,
      0
    ),
    rejectedOpenLaunchEventCount: projections.reduce(
      (total, item) => total + item.summary.rejectedOpenLaunchEventCount,
      0
    ),
    retryableEventCount: projections.reduce(
      (total, item) => total + item.summary.retryableEventCount,
      0
    ),
    severityCounts,
    sourceCounts,
    readOnly: true,
    mutation: false,
    deleteRequestedCount: 0,
    rawMaterialReturned: false
  };
}

export function buildArchiveDiagnosticReplayFixtureContracts(
  projectId: string
): ArchiveDiagnosticReplayFixtureContract[] {
  return syntheticArchiveDiagnosticReplayFixtureContracts.map((fixture) => ({
    ...fixture,
    projectId,
    fixtureRef: archiveDiagnosticReplayFixtureRef(fixture.name),
    digest: hashArchiveDiagnosticReplayParts([
      "archive-diagnostic-replay-fixture",
      projectId,
      fixture.name,
      fixture.scenario,
      String(fixture.expected.supportedFiles),
      String(fixture.expected.attachmentFiles),
      String(fixture.expected.ignoredFiles),
      String(fixture.expected.warningCount),
      String(fixture.expected.parseErrors),
      String(fixture.expected.attemptGroups),
      fixture.expected.latestStatuses.join(",")
    ])
  }));
}

export function summarizeArchiveDiagnosticReplayFixtureContracts(
  fixtures: readonly ArchiveDiagnosticReplayFixtureContract[]
) {
  return {
    totalFixtures: fixtures.length,
    fixtureNames: fixtures.map((fixture) => fixture.name),
    supportedFiles: fixtures.reduce((total, fixture) => total + fixture.expected.supportedFiles, 0),
    attachmentFiles: fixtures.reduce(
      (total, fixture) => total + fixture.expected.attachmentFiles,
      0
    ),
    ignoredFiles: fixtures.reduce((total, fixture) => total + fixture.expected.ignoredFiles, 0),
    warningCount: fixtures.reduce((total, fixture) => total + fixture.expected.warningCount, 0),
    parseErrors: fixtures.reduce((total, fixture) => total + fixture.expected.parseErrors, 0),
    attemptGroups: fixtures.reduce((total, fixture) => total + fixture.expected.attemptGroups, 0),
    readOnly: true,
    mutation: false,
    archivePayloadAvailable: false,
    rawManifestEntriesReturned: false,
    rawResultFilesReturned: false,
    resultContentReturned: false,
    rawPathsReturned: false,
    payloadBytesReturned: 0,
    redacted: true
  };
}

export function buildArchiveDiagnosticReplayMaterializedFixtureRecords(
  projectId: string
): ArchiveDiagnosticReplayMaterializedFixtureRecord[] {
  return buildArchiveDiagnosticReplayFixtureContracts(projectId).map((fixture) => {
    const materializedAt = archiveDiagnosticReplayFixtureMaterializedAt();
    const recordDigest = hashArchiveDiagnosticReplayParts([
      "archive-diagnostic-replay-fixture-materialized",
      projectId,
      fixture.fixtureRef,
      fixture.digest,
      fixture.name,
      fixture.scenario,
      materializedAt
    ]);

    return {
      kind: "archive-diagnostic-replay-fixture-materialized",
      projectId,
      fixtureRef: fixture.fixtureRef,
      materializedRef: `materialized:${recordDigest}`,
      name: fixture.name,
      scenario: fixture.scenario,
      materializedAt,
      sourceDigest: fixture.digest,
      recordDigest,
      status: fixture.replay.deniedFixture ? "denied" : "ready",
      evidence: {
        deterministic: true,
        retryAware: fixture.replay.retryAware,
        duplicateAware: fixture.replay.duplicateAware,
        deniedFixture: fixture.replay.deniedFixture,
        supportedFiles: fixture.expected.supportedFiles,
        attachmentFiles: fixture.expected.attachmentFiles,
        ignoredFiles: fixture.expected.ignoredFiles,
        warningCount: fixture.expected.warningCount,
        parseErrors: fixture.expected.parseErrors,
        attemptGroups: fixture.expected.attemptGroups,
        latestStatusCount: fixture.expected.latestStatuses.length,
        compatibleSourceCount: fixture.replay.compatibleSources.length,
        closedArchiveStatusReadCompatible: true,
        closedArchiveDiagnosticsReadCompatible: true,
        redactionPassed: true
      },
      materialization: {
        adapterKind: "api-read-model-archive-diagnostic-replay-fixture-materialized-wip",
        boundary: "worker-compatible-archive-diagnostic-replay-fixture-materialized-read",
        consistency: "synthetic-fixture-contracts-idempotent",
        source: "synthetic-archive-diagnostic-replay-fixture-contract",
        readOnly: true,
        rawArchivePayloadsIncluded: false,
        manifestEntriesIncluded: false,
        resultFilesIncluded: false,
        localPathsIncluded: false,
        storageRefsIncluded: false,
        signedUrlsIncluded: false,
        tokensIncluded: false,
        mutationBoundary: "rest-materialized-read-only-no-archive-or-worker-mutation"
      },
      execution: {
        replayStarted: false,
        workerJobEnqueued: false,
        archivePayloadOpened: false,
        mutation: false,
        deletionStarted: false,
        providerIntegration: false
      }
    };
  });
}

export function summarizeArchiveDiagnosticReplayMaterializedFixtureRecords(
  projectId: string,
  records: readonly ArchiveDiagnosticReplayMaterializedFixtureRecord[],
  materializationDigest: string
) {
  return {
    projectId,
    materializedRecordCount: records.length,
    fixtureNames: records.map((record) => record.name),
    supportedFiles: records.reduce((total, record) => total + record.evidence.supportedFiles, 0),
    attachmentFiles: records.reduce((total, record) => total + record.evidence.attachmentFiles, 0),
    ignoredFiles: records.reduce((total, record) => total + record.evidence.ignoredFiles, 0),
    warningCount: records.reduce((total, record) => total + record.evidence.warningCount, 0),
    parseErrors: records.reduce((total, record) => total + record.evidence.parseErrors, 0),
    attemptGroups: records.reduce((total, record) => total + record.evidence.attemptGroups, 0),
    retryAwareCount: records.filter((record) => record.evidence.retryAware).length,
    duplicateAwareCount: records.filter((record) => record.evidence.duplicateAware).length,
    deniedFixtureCount: records.filter((record) => record.evidence.deniedFixture).length,
    deterministic: true,
    projectScoped: true,
    readOnly: true,
    mutation: false,
    rawArchivePayloadsIncluded: false,
    manifestEntriesIncluded: false,
    resultFilesIncluded: false,
    localPathsIncluded: false,
    storageRefsIncluded: false,
    signedUrlsIncluded: false,
    tokensIncluded: false,
    redactionPassed: true,
    materializationDigest,
    mutationBoundary: "api-materialized-fixture-read-only-no-rest-or-worker-mutation",
    plannedOperations: [
      "archive_diagnostic.replay_fixture.contract_project",
      "archive_diagnostic.replay_fixture.materialized_read"
    ]
  };
}

export function archiveDiagnosticReplayFixtureReplayContract(
  name: ArchiveDiagnosticReplayFixtureName
): ArchiveDiagnosticReplayFixtureContract["replay"] {
  return {
    deterministic: true,
    compatibleSources: archiveDiagnosticReplaySources,
    retryAware: name === "retry",
    duplicateAware: name === "duplicate",
    deniedFixture: name === "denied",
    closedArchiveStatusReadCompatible: true,
    closedArchiveDiagnosticsReadCompatible: true,
    mutationBoundary: "fixture-read-only-no-replay-mutation"
  };
}

export function archiveDiagnosticReplayFixturePayloadContract(): ArchiveDiagnosticReplayFixtureContract["payload"] {
  return {
    archivePayloadAvailable: false,
    manifestEntriesReturned: false,
    resultFilesReturned: false,
    resultContentReturned: false,
    rawPathsReturned: false,
    payloadBytesReturned: 0,
    redacted: true
  };
}

export function archiveDiagnosticReplayFixtureMaterializedAt(): string {
  return "2026-05-30T00:00:00.000Z";
}

export function archiveDiagnosticReplayWorkerContract() {
  return {
    queue: "archive.diagnostics.replay" as const,
    boundary: "worker-local-archive-diagnostics-replay" as const,
    adapterKind: "in-memory-archive-diagnostics-replay-wip" as const,
    consistency: "append-only-idempotent-replay" as const,
    payloadsAvailable: false as const
  };
}

function archiveDiagnosticReplayExecutionContract() {
  return {
    readOnly: true as const,
    mutation: false as const,
    deletionStarted: false as const,
    deleteRequestedCount: 0 as const,
    rawMaterialReturned: false as const
  };
}

function archiveDiagnosticReplaySeverityForJob(job: UploadJob): ArchiveDiagnosticReplaySeverity {
  if (job.status === "failed" || job.status === "completed_with_errors") {
    return "error";
  }
  return "info";
}

function archiveDiagnosticReplaySeverity(
  severity: ArchiveManifestDiagnostic["severity"]
): ArchiveDiagnosticReplaySeverity {
  return severity === "warning" ? "warn" : severity;
}

function archiveDiagnosticReplayCode(
  diagnostic: ArchiveManifestDiagnostic
): ArchiveDiagnosticReplayRecord["code"] {
  if (diagnostic.code.includes("unsafe")) {
    return "unsafe-entry-path";
  }
  if (diagnostic.code.includes("duplicate")) {
    return "duplicate-entry";
  }
  if (diagnostic.code.includes("ignored") || diagnostic.kind === "unsupported") {
    return "unsupported-entry";
  }
  if (diagnostic.code.includes("limit")) {
    return "diagnostic-limit-reached";
  }
  if (diagnostic.scope === "archive") {
    return "parser-diagnostic";
  }
  return "entry-processing-error";
}

function createArchiveDiagnosticReplaySeverityCounts(): Record<
  ArchiveDiagnosticReplaySeverity,
  number
> {
  return { info: 0, warn: 0, error: 0 };
}

function createArchiveDiagnosticReplaySourceCounts(): Record<
  ArchiveDiagnosticReplaySource,
  number
> {
  return {
    "archive.status.read": 0,
    "archive.diagnostics.read": 0,
    "archive.cleanup.preview": 0
  };
}

function isClosedArchiveDiagnosticReplayLaunch(launch: Launch): boolean {
  return launch.status === "closed" || launch.status === "archived" || launch.status === "failed";
}

function archiveDiagnosticReplayEventRef(...parts: string[]): string {
  return `event:${hashArchiveDiagnosticReplayParts(parts)}`;
}

function archiveDiagnosticReplayRef(jobId: string, kind: "entry" | "chunk", index: number): string {
  return `${kind}:${hashArchiveDiagnosticReplayParts([jobId, kind, String(index)])}`;
}

function archiveDiagnosticReplayFixtureRef(name: ArchiveDiagnosticReplayFixtureName): string {
  return `fixture:${hashArchiveDiagnosticReplayParts(["archive-diagnostic-replay-fixture", name])}`;
}

export function hashArchiveDiagnosticReplayParts(parts: readonly string[]): string {
  return createHash("sha256").update(parts.join("\u001f")).digest("hex");
}
