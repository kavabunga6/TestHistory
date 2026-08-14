import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type {
  ApiState,
  ArchiveDiagnosticReplayFixtureListRead,
  ArchiveUploadStatusListRead
} from "./api.js";
import { demoM1Workspace } from "./m1Workspace.js";
import {
  WorkspaceSurface,
  archiveDiagnosticReplayFixtureBrowserSmokeGuidance,
  type WorkspaceMode
} from "./testExports.js";

const archiveCapableApiState: ApiState = {
  loading: false,
  capabilities: {
    apiVersion: "v1",
    swagger: "/docs",
    openapiJson: "/docs/json",
    ingestion: {
      modes: ["json-batch", "chunked-json", "archive-planned"],
      policy: {
        compressionMinBytes: 2048,
        retentionDays: 30,
        maxUploadConcurrency: 6,
        chunkBytes: 1_048_576
      }
    },
    modules: ["launches", "results", "test-cases", "artifacts", "defects", "quality-gates"]
  }
};

const syntheticArchiveStatus: ArchiveUploadStatusListRead = {
  kind: "archive-upload-status-list",
  launch: {
    id: "launch-archive-regression",
    projectId: "project-archive-regression",
    status: "processing"
  },
  access: {
    scope: "uploads:read",
    requiredScopes: ["uploads:read", "launches:read"],
    projectScoped: true,
    actorScoped: true,
    mutation: false,
    redacted: true
  },
  processing: {
    mode: "archive-manifest-intake",
    workerBoundary: "archive-unpack-planned",
    storesArchivePayload: false,
    payloadsAcceptedOnThisEndpoint: false,
    bounded: {
      maxDiagnostics: 40
    }
  },
  page: {
    limit: 2,
    cursor: null,
    offset: 0,
    returned: 2,
    total: 4,
    nextCursor: "archive-cursor-2",
    hasMore: true
  },
  summary: {
    total: 4,
    queued: 1,
    processing: 1,
    completed: 1,
    completedWithErrors: 1,
    failed: 0,
    acceptedEntries: 20,
    ignoredEntries: 3,
    importedResults: 16,
    storedArtifacts: 4,
    diagnostics: 40,
    warnings: 5,
    errors: 1
  },
  diagnostics: {
    page: {
      limit: 7,
      cursor: null,
      offset: 0,
      returned: 7,
      total: 40,
      nextCursor: "diagnostic-cursor-7",
      hasMore: true
    },
    items: [
      {
        scope: "archive",
        severity: "info",
        code: "archive.worker.accepted",
        message: "Archive metadata accepted"
      },
      {
        scope: "archive",
        severity: "warning",
        code: "storageRef=raw-diagnostic-marker",
        message: "D:\\synthetic\\archive\\worker.log"
      },
      {
        scope: "entry",
        severity: "error",
        code: "archive.entry.invalid",
        message: "signedUrl=https://object.example/file?X-Amz-Signature=raw"
      },
      {
        scope: "entry",
        severity: "info",
        code: "archive.entry.skipped",
        message: "Unsupported but safe synthetic entry skipped"
      },
      {
        scope: "archive",
        severity: "warning",
        code: "archive.worker.retryable",
        message: "Synthetic retry evidence"
      },
      {
        scope: "archive",
        severity: "info",
        code: "archive.worker.queued",
        message: "Synthetic queued evidence"
      },
      {
        scope: "archive",
        severity: "info",
        code: "archive.worker.persisted",
        message: "Synthetic persisted evidence"
      }
    ]
  },
  items: [
    {
      kind: "archive-upload-status",
      id: "Bearer raw-upload-marker",
      launchId: "launch-archive-regression",
      projectId: "project-archive-regression",
      status: "completed_with_errors",
      phase: "partial_success",
      progress: 71.4,
      access: {
        scope: "uploads:read",
        requiredScopes: ["uploads:read", "launches:read"],
        projectScoped: true,
        actorScoped: true,
        mutation: false,
        redacted: true
      },
      archive: {
        name: "D:\\synthetic\\archive\\nightly.zip",
        format: "allure-results-archive-manifest",
        totalEntries: 10,
        supportedFiles: 8,
        attachmentFiles: 2,
        ignoredFiles: 2,
        totalUncompressedBytes: 8192,
        totalCompressedBytes: 3072,
        storesArchivePayload: false,
        payloadsAcceptedOnThisEndpoint: false
      },
      worker: {
        queue: "storage://private-queue/raw-marker",
        boundary: "archive-unpack-planned",
        retryable: true,
        persistence: "synthetic-read-model-only",
        payloadsAvailable: false
      },
      diagnostics: {
        page: {
          limit: 5,
          cursor: null,
          offset: 0,
          returned: 5,
          total: 14,
          nextCursor: "job-diagnostics-5",
          hasMore: true
        },
        items: []
      },
      links: {
        self: "/api/v1/uploads/synthetic/archive/status",
        uploadStatus: "/api/v1/uploads/synthetic/status",
        launch: "/api/v1/launches/launch-archive-regression"
      },
      createdAt: "2026-05-30T09:00:00.000Z",
      updatedAt: "2026-05-30T09:01:00.000Z"
    },
    {
      kind: "archive-upload-status",
      id: "archive-upload-safe-2",
      launchId: "launch-archive-regression",
      projectId: "project-archive-regression",
      status: "processing",
      phase: "processing",
      progress: 32,
      access: {
        scope: "uploads:read",
        requiredScopes: ["uploads:read", "launches:read"],
        projectScoped: true,
        actorScoped: true,
        mutation: false,
        redacted: true
      },
      archive: {
        name: "synthetic-nightly.zip",
        format: "allure-results-archive-manifest",
        totalEntries: 13,
        supportedFiles: 12,
        attachmentFiles: 1,
        ignoredFiles: 1,
        totalUncompressedBytes: 16384,
        totalCompressedBytes: 4096,
        storesArchivePayload: false,
        payloadsAcceptedOnThisEndpoint: false
      },
      worker: {
        queue: "ingestion.parse",
        boundary: "archive-unpack-planned",
        retryable: false,
        persistence: "synthetic-read-model-only",
        payloadsAvailable: false
      },
      diagnostics: {
        page: {
          limit: 5,
          cursor: null,
          offset: 0,
          returned: 2,
          total: 2,
          nextCursor: null,
          hasMore: false
        },
        items: []
      },
      links: {
        self: "/api/v1/uploads/archive-upload-safe-2/archive/status",
        uploadStatus: "/api/v1/uploads/archive-upload-safe-2/status",
        launch: "/api/v1/launches/launch-archive-regression"
      },
      createdAt: "2026-05-30T09:02:00.000Z",
      updatedAt: "2026-05-30T09:03:00.000Z"
    },
    {
      kind: "archive-upload-status",
      id: "archive-upload-over-bound-3",
      launchId: "launch-archive-regression",
      projectId: "project-archive-regression",
      status: "queued",
      phase: "queued",
      progress: 0,
      access: {
        scope: "uploads:read",
        requiredScopes: ["uploads:read", "launches:read"],
        projectScoped: true,
        actorScoped: true,
        mutation: false,
        redacted: true
      },
      archive: {
        name: "over-bound-should-not-render.zip",
        format: "allure-results-archive-manifest",
        totalEntries: 1,
        supportedFiles: 1,
        attachmentFiles: 0,
        ignoredFiles: 0,
        totalUncompressedBytes: 512,
        totalCompressedBytes: 256,
        storesArchivePayload: false,
        payloadsAcceptedOnThisEndpoint: false
      },
      worker: {
        queue: "ingestion.parse",
        boundary: "archive-unpack-planned",
        retryable: false,
        persistence: "synthetic-read-model-only",
        payloadsAvailable: false
      },
      diagnostics: {
        page: {
          limit: 1,
          cursor: null,
          offset: 0,
          returned: 0,
          total: 0,
          nextCursor: null,
          hasMore: false
        },
        items: []
      },
      links: {},
      createdAt: "2026-05-30T09:04:00.000Z",
      updatedAt: "2026-05-30T09:04:00.000Z"
    },
    {
      kind: "archive-upload-status",
      id: "archive-upload-over-bound-4",
      launchId: "launch-archive-regression",
      projectId: "project-archive-regression",
      status: "queued",
      phase: "queued",
      progress: 0,
      access: {
        scope: "uploads:read",
        requiredScopes: ["uploads:read", "launches:read"],
        projectScoped: true,
        actorScoped: true,
        mutation: false,
        redacted: true
      },
      archive: {
        name: "over-bound-storageRef-raw.zip",
        format: "allure-results-archive-manifest",
        totalEntries: 1,
        supportedFiles: 1,
        attachmentFiles: 0,
        ignoredFiles: 0,
        totalUncompressedBytes: 512,
        totalCompressedBytes: 256,
        storesArchivePayload: false,
        payloadsAcceptedOnThisEndpoint: false
      },
      worker: {
        queue: "minio://private/raw",
        boundary: "archive-unpack-planned",
        retryable: false,
        persistence: "synthetic-read-model-only",
        payloadsAvailable: false
      },
      diagnostics: {
        page: {
          limit: 1,
          cursor: null,
          offset: 0,
          returned: 0,
          total: 0,
          nextCursor: null,
          hasMore: false
        },
        items: []
      },
      links: {},
      createdAt: "2026-05-30T09:05:00.000Z",
      updatedAt: "2026-05-30T09:05:00.000Z"
    }
  ]
};

function archiveMaterializedFixturePolicy() {
  return {
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
  };
}

function archiveMaterializedFixtureExecution() {
  return {
    replayStarted: false,
    workerJobEnqueued: false,
    archivePayloadOpened: false,
    mutation: false,
    deletionStarted: false,
    providerIntegration: false
  };
}

const syntheticArchiveFixtureEvidence: ArchiveDiagnosticReplayFixtureListRead = {
  kind: "archive-diagnostic-replay-fixture-materialized-list",
  project: {
    id: "project-archive-regression",
    scoped: true
  },
  actor: {
    id: "archive-fixture-ui",
    scoped: true
  },
  access: {
    scope: "uploads:read",
    projectScoped: true,
    actorScoped: true,
    mutation: false,
    redacted: true
  },
  query: {
    projectId: "project-archive-regression",
    limit: 3,
    cursor: null
  },
  page: {
    limit: 3,
    cursor: null,
    offset: 0,
    returned: 3,
    total: 6,
    nextCursor: "3",
    hasMore: true
  },
  materialization: {
    adapterKind: "api-read-model-archive-diagnostic-replay-fixture-materialized-wip",
    boundary: "worker-compatible-archive-diagnostic-replay-fixture-materialized-read",
    consistency: "synthetic-fixture-contracts-idempotent",
    source: "synthetic-archive-diagnostic-replay-fixture-contracts",
    readOnly: true,
    mutation: false,
    rawArchivePayloadsIncluded: false,
    manifestEntriesIncluded: false,
    resultFilesIncluded: false,
    localPathsIncluded: false,
    storageRefsIncluded: false,
    signedUrlsIncluded: false,
    tokensIncluded: false,
    materializedAt: "2026-05-30T00:00:00.000Z",
    materializedRecordCount: 6,
    materializationDigest: "sha256:synthetic-materialized-list",
    mutationBoundary: "rest-materialized-read-only-no-archive-or-worker-mutation"
  },
  summary: {
    projectId: "project-archive-regression",
    materializedRecordCount: 6,
    fixtureNames: ["corrupt", "empty", "denied", "partial", "duplicate", "retry"],
    supportedFiles: 10,
    attachmentFiles: 4,
    ignoredFiles: 2,
    warningCount: 7,
    parseErrors: 1,
    attemptGroups: 4,
    retryAwareCount: 1,
    duplicateAwareCount: 0,
    deniedFixtureCount: 1,
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
    materializationDigest: "sha256:synthetic-materialized-list",
    mutationBoundary: "api-materialized-fixture-read-only-no-rest-or-worker-mutation",
    plannedOperations: [
      "archive_diagnostic.replay_fixture.contract_project",
      "archive_diagnostic.replay_fixture.materialized_read"
    ]
  },
  items: [
    {
      kind: "archive-diagnostic-replay-fixture-materialized",
      projectId: "project-archive-regression",
      fixtureRef: "fixture:1111111111111111111111111111111111111111111111111111111111111111",
      materializedRef:
        "materialized:1111111111111111111111111111111111111111111111111111111111111111",
      name: "corrupt",
      scenario: "corrupt-result-json",
      materializedAt: "2026-05-30T00:00:00.000Z",
      sourceDigest: "sha256:synthetic-corrupt-source",
      recordDigest: "sha256:synthetic-corrupt",
      status: "ready",
      evidence: {
        deterministic: true,
        retryAware: false,
        duplicateAware: false,
        deniedFixture: false,
        supportedFiles: 2,
        attachmentFiles: 1,
        ignoredFiles: 0,
        warningCount: 0,
        parseErrors: 1,
        attemptGroups: 0,
        latestStatusCount: 0,
        compatibleSourceCount: 3,
        closedArchiveStatusReadCompatible: true,
        closedArchiveDiagnosticsReadCompatible: true,
        redactionPassed: true
      },
      materialization: archiveMaterializedFixturePolicy(),
      execution: archiveMaterializedFixtureExecution()
    },
    {
      kind: "archive-diagnostic-replay-fixture-materialized",
      projectId: "project-archive-regression",
      fixtureRef: "fixture:2222222222222222222222222222222222222222222222222222222222222222",
      materializedRef:
        "materialized:2222222222222222222222222222222222222222222222222222222222222222",
      name: "denied",
      scenario: "denied-unsafe-entries",
      materializedAt: "2026-05-30T00:00:00.000Z",
      sourceDigest: "sha256:synthetic-denied-source",
      recordDigest: "sha256:synthetic-denied",
      status: "denied",
      evidence: {
        deterministic: true,
        retryAware: false,
        duplicateAware: false,
        deniedFixture: true,
        supportedFiles: 0,
        attachmentFiles: 0,
        ignoredFiles: 0,
        warningCount: 4,
        parseErrors: 0,
        attemptGroups: 0,
        latestStatusCount: 0,
        compatibleSourceCount: 3,
        closedArchiveStatusReadCompatible: true,
        closedArchiveDiagnosticsReadCompatible: true,
        redactionPassed: true
      },
      materialization: archiveMaterializedFixturePolicy(),
      execution: archiveMaterializedFixtureExecution()
    },
    {
      kind: "archive-diagnostic-replay-fixture-materialized",
      projectId: "project-archive-regression",
      fixtureRef: "fixture:3333333333333333333333333333333333333333333333333333333333333333",
      materializedRef:
        "materialized:3333333333333333333333333333333333333333333333333333333333333333",
      name: "retry",
      scenario: "retry-history",
      materializedAt: "2026-05-30T00:00:00.000Z",
      sourceDigest: "sha256:synthetic-retry-source",
      recordDigest: "sha256:synthetic-retry",
      status: "ready",
      evidence: {
        deterministic: true,
        retryAware: true,
        duplicateAware: false,
        deniedFixture: false,
        supportedFiles: 2,
        attachmentFiles: 0,
        ignoredFiles: 0,
        warningCount: 0,
        parseErrors: 0,
        attemptGroups: 1,
        latestStatusCount: 1,
        compatibleSourceCount: 3,
        closedArchiveStatusReadCompatible: true,
        closedArchiveDiagnosticsReadCompatible: true,
        redactionPassed: true
      },
      materialization: archiveMaterializedFixturePolicy(),
      execution: archiveMaterializedFixtureExecution()
    }
  ],
  links: {
    self: "/api/v1/projects/project-archive-regression/archive/diagnostics/replay/fixtures/materialized"
  }
};

describe("archive diagnostic UI regression evidence", () => {
  it("keeps bounded read-only archive diagnostics only in Jobs", () => {
    const apiState: ApiState = {
      ...archiveCapableApiState,
      archiveUploadStatus: {
        data: syntheticArchiveStatus,
        state: "partial"
      }
    };
    const launchMarkup = renderWorkspace("launch", apiState);
    const jobsMarkup = renderWorkspace("jobs", apiState);
    const caseMarkup = renderWorkspace("case", apiState);
    const defectsMarkup = renderWorkspace("defects", apiState);
    const analyticsMarkup = renderWorkspace("analytics", apiState);
    const foreignMarkup = `${caseMarkup} ${defectsMarkup} ${analyticsMarkup}`;

    expect(visibleText(launchMarkup)).not.toContain("Прием архивов");
    expect(visibleText(jobsMarkup)).toContain("Прием архивов частично доступен");
    expect(visibleText(jobsMarkup)).toContain(
      "Режим чтения только чтение; без исходных данных архива и объектов хранения"
    );
    expect(visibleText(jobsMarkup)).toContain("Границы 7 из 40 диагностик, лимит 7");
    expect(visibleText(jobsMarkup)).toContain("Показано 3 из 7");
    expect(visibleText(jobsMarkup)).toContain("Archive name redacted");
    expect(visibleText(jobsMarkup)).toContain("Upload redacted");
    expect(visibleText(jobsMarkup)).toContain("synthetic-nightly.zip");
    expect(countMatches(launchMarkup, /class="archive-worker-row/g)).toBe(0);
    expect(countMatches(jobsMarkup, /class="archive-worker-row/g)).toBe(3);
    expect(countMatches(launchMarkup, /class="archive-job-row/g)).toBe(0);
    expect(countMatches(jobsMarkup, /class="archive-job-row/g)).toBe(2);

    for (const label of [
      "Загрузка через API",
      "Повтор через очередь воркера",
      "Диагностика без мутаций"
    ]) {
      expect(jobsMarkup, `${label} must be visible as a read-only archive action`).toContain(label);

      expect(buttonContaining(launchMarkup, label)).toBeUndefined();
      expect(buttonContaining(foreignMarkup, label)).toBeUndefined();
    }
    expect(visibleText(jobsMarkup)).not.toContain("WIP");

    expect(foreignMarkup).not.toContain("Прием архивов");
    expect(foreignMarkup).not.toContain("archive upload status reads");
    expect(foreignMarkup).not.toContain("synthetic-nightly.zip");
    expect(foreignMarkup).not.toContain("Ограниченная диагностика воркеров");

    for (const markup of [`${launchMarkup} ${jobsMarkup}`, foreignMarkup]) {
      expect(markup).not.toContain("D:\\synthetic");
      expect(markup).not.toContain("/tmp/synthetic");
      expect(markup).not.toContain("raw-upload-marker");
      expect(markup).not.toContain("raw-diagnostic-marker");
      expect(markup).not.toContain("storageRef");
      expect(markup).not.toContain("signedUrl");
      expect(markup).not.toContain("X-Amz-Signature");
      expect(markup).not.toContain("storage://");
      expect(markup).not.toContain("minio://");
      expect(markup).not.toContain("over-bound");
    }
  });

  it("renders synthetic replay fixture evidence only in archive upload and ingestion diagnostics", () => {
    const apiState: ApiState = {
      ...archiveCapableApiState,
      archiveDiagnosticReplayFixtures: {
        data: syntheticArchiveFixtureEvidence,
        state: "partial"
      },
      archiveUploadStatus: {
        data: syntheticArchiveStatus,
        state: "partial"
      }
    };
    const launchMarkup = renderWorkspace("launch", apiState);
    const jobsMarkup = renderWorkspace("jobs", apiState);
    const caseMarkup = renderWorkspace("case", apiState);
    const defectsMarkup = renderWorkspace("defects", apiState);
    const analyticsMarkup = renderWorkspace("analytics", apiState);
    const foreignMarkup = `${caseMarkup} ${defectsMarkup} ${analyticsMarkup}`;

    expect(visibleText(launchMarkup)).not.toContain("Диагностический replay архива");
    expect(visibleText(jobsMarkup)).toContain("Синтетические фикстуры replay загружены частично");
    expect(visibleText(jobsMarkup)).toContain(
      "Материализованные сводки фикстур подтверждают совместимость replay архива"
    );
    expect(visibleText(jobsMarkup)).toContain("Фикстуры 6 фикстур");
    expect(visibleText(jobsMarkup)).toContain("Файлы 10 поддержано / 2 проигнорировано");
    expect(visibleText(jobsMarkup)).toContain("Исходные данные не включены");
    expect(visibleText(jobsMarkup)).toContain("Границы 3 из 6, лимит 3");
    expect(visibleText(jobsMarkup)).toContain("corrupt");
    expect(visibleText(jobsMarkup)).toContain("безопасный denied-path");
    expect(visibleText(jobsMarkup)).toContain("с учетом ретраев");
    expect(countMatches(launchMarkup, /class="archive-fixture-card/g)).toBe(0);
    expect(countMatches(jobsMarkup, /class="archive-fixture-card/g)).toBe(3);

    for (const label of ["Детали фикстуры на странице", "Сводка отредактирована"]) {
      expect(jobsMarkup, `${label} must be visible as a read-only fixture action`).toContain(label);

      expect(buttonContaining(launchMarkup, label)).toBeUndefined();
      expect(buttonContaining(foreignMarkup, label)).toBeUndefined();
    }
    expect(visibleText(jobsMarkup)).not.toContain("WIP");

    expect(foreignMarkup).not.toContain("Синтетическая фикстура replay");
    expect(foreignMarkup).not.toContain("Диагностический replay архива");
    expect(foreignMarkup).not.toContain("Archive replay fixture summaries");
    expect(foreignMarkup).not.toContain("с учетом ретраев");

    for (const markup of [`${launchMarkup} ${jobsMarkup}`, foreignMarkup]) {
      expect(markup).not.toContain("raw archive payload");
      expect(markup).not.toContain("manifestEntries");
      expect(markup).not.toContain("resultFiles");
      expect(markup).not.toContain("resultContent");
      expect(markup).not.toContain("C:\\Users\\example-user");
      expect(markup).not.toContain("Downloads\\\\allure-results");
      expect(markup).not.toContain("storage://");
      expect(markup).not.toContain("minio://");
      expect(markup).not.toContain("signedUrl");
      expect(markup).not.toContain("X-Amz-Signature");
      expect(markup).not.toContain("token=");
    }
  });

  it("keeps browser smoke notes aligned with archive fixture UI boundaries", () => {
    expect(archiveDiagnosticReplayFixtureBrowserSmokeGuidance.join(" ")).toContain("#launch");
    expect(archiveDiagnosticReplayFixtureBrowserSmokeGuidance.join(" ")).not.toContain("#jobs");
    expect(archiveDiagnosticReplayFixtureBrowserSmokeGuidance.join(" ")).toContain(
      "только для чтения"
    );
    expect(archiveDiagnosticReplayFixtureBrowserSmokeGuidance.join(" ")).toContain(
      "исходные данные архива"
    );
  });
});

function renderWorkspace(mode: WorkspaceMode, apiState: ApiState): string {
  return renderToStaticMarkup(
    <WorkspaceSurface
      apiState={apiState}
      mode={mode}
      onModeChange={() => undefined}
      onSelect={() => undefined}
      selectedId={demoM1Workspace.results[0]!.id}
      workspace={demoM1Workspace}
    />
  );
}

function buttonContaining(markup: string, label: string): string | undefined {
  return Array.from(markup.matchAll(/<button\b[^>]*>[\s\S]*?<\/button>/g))
    .map(([button]) => button)
    .find((button) => button.includes(label));
}

function countMatches(value: string, pattern: RegExp): number {
  return Array.from(value.matchAll(pattern)).length;
}

function visibleText(markup: string): string {
  return markup
    .replace(/<style[\s\S]*?<\/style>/g, " ")
    .replace(/<script[\s\S]*?<\/script>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}
