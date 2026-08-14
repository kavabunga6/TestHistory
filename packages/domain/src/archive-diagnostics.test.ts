import { describe, expect, it } from "vitest";
import {
  projectArchiveDiagnosticReplayMaterializedFixtures,
  type ArchiveDiagnosticReplayMaterializedFixtureInput
} from "./index.js";

describe("archive diagnostic replay materialized fixture domain projection", () => {
  it("keeps paginated replay deterministic across retries and project/actor scopes without leaking sensitive payloads", () => {
    const records = syntheticMaterializedFixtureRecords();
    const firstPage = projectArchiveDiagnosticReplayMaterializedFixtures({
      projectId: "project-a",
      actorId: "actor-a",
      records,
      limit: 2
    });
    const fullReplay = projectArchiveDiagnosticReplayMaterializedFixtures({
      projectId: "project-a",
      actorId: "actor-a",
      records,
      limit: 100
    });
    const retriedReplay = projectArchiveDiagnosticReplayMaterializedFixtures({
      projectId: "project-a",
      actorId: "actor-a",
      records: [...records].reverse(),
      limit: 100
    });
    const projectOnlyReplay = projectArchiveDiagnosticReplayMaterializedFixtures({
      projectId: "project-a",
      records,
      limit: 100
    });

    expect(firstPage).toMatchObject({
      schemaVersion: 1,
      scope: {
        projectScoped: true,
        actorScoped: true,
        readOnly: true,
        mutation: false
      },
      page: {
        limit: 2,
        offset: 0,
        returned: 2,
        total: 3,
        hasMore: true,
        nextCursor: "offset:2"
      },
      summary: {
        sourceRecordCount: 6,
        projectRecordCount: 5,
        actorRecordCount: 4,
        materializedRecordCount: 3,
        duplicateRecordCount: 1,
        retryRecordCount: 1,
        excludedByProjectScope: 1,
        excludedByActorScope: 1,
        deterministic: true
      },
      safety: {
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
      }
    });
    expect(firstPage.page.nextCursor).toBe("offset:2");

    expect(Object.isFrozen(firstPage)).toBe(true);
    expect(Object.isFrozen(firstPage.items)).toBe(true);
    const nextCursor = firstPage.page.nextCursor;
    if (nextCursor === undefined) {
      throw new Error("Expected the first materialized fixture replay page to expose a cursor");
    }
    const secondPage = projectArchiveDiagnosticReplayMaterializedFixtures({
      projectId: "project-a",
      actorId: "actor-a",
      records,
      limit: 2,
      cursor: nextCursor
    });
    expect([...firstPage.items, ...secondPage.items].map((item) => item.id)).toEqual(
      fullReplay.items.map((item) => item.id)
    );
    expect(retriedReplay.summary.projectionDigest).toBe(fullReplay.summary.projectionDigest);
    expect(retriedReplay.items.map((item) => item.id)).toEqual(
      fullReplay.items.map((item) => item.id)
    );
    expect(projectOnlyReplay.summary.materializedRecordCount).toBe(4);
    expect(projectOnlyReplay.summary.excludedByActorScope).toBe(0);
    expect(fullReplay.items.every((item) => item.actorIds.includes("actor-a"))).toBe(true);
    expect(fullReplay.diagnostics).toEqual([
      {
        code: "archive-diagnostic-replay.duplicate-materialized-record",
        severity: "warn",
        message: "1 duplicate materialized replay fixture record(s) were ignored."
      }
    ]);

    const serialized = JSON.stringify([firstPage, secondPage, fullReplay, retriedReplay]);
    expect(serialized).not.toContain("archive-diagnostic-secret");
    expect(serialized).not.toContain("raw-token-secret");
    expect(serialized).not.toContain("C:\\");
    expect(serialized).not.toContain("s3://");
    expect(serialized).not.toContain("X-Amz-Signature");
    expect(serialized).not.toContain("storageKey");
    expect(serialized).not.toContain("signedUrl=https");
    expect(serialized).not.toContain("raw.zip");
    expect(serialized).not.toContain("raw-attachment");
    expect(serialized).not.toContain("manifest.json");
    expect(serialized).not.toContain("result.json");
  });
});

function syntheticMaterializedFixtureRecords(): ArchiveDiagnosticReplayMaterializedFixtureInput[] {
  return [
    {
      projectId: "project-b",
      fixtureRef: "fixture-cross-project",
      materializedRef: "mat-cross-project",
      sourceDigest: "digest-cross-project",
      materializedAt: "2026-05-30T10:00:03.000Z",
      name: "cross project C:\\archive\\raw.zip token=archive-diagnostic-secret",
      actorIds: ["actor-a"]
    },
    {
      projectId: "project-a",
      fixtureRef: "fixture-login",
      materializedRef: "mat-login",
      sourceDigest: "digest-login",
      materializedAt: "2026-05-30T10:00:01.000Z",
      name: "login replay from C:\\ci\\archive\\raw.zip token=archive-diagnostic-secret",
      actorIds: ["actor-a", "actor-b"],
      attempt: 1,
      diagnostics: [
        {
          code: "replay.normalized",
          severity: "info",
          message:
            "normalized https://storage.invalid/raw.zip?X-Amz-Signature=archive-diagnostic-secret"
        }
      ],
      rawArchivePayload: { secret: "archive-diagnostic-secret", result: "result.json" },
      localPath: "C:\\ci\\archive\\raw.zip",
      storageRef: "s3://bucket/raw.zip",
      signedUrl: "https://storage.invalid/raw.zip?X-Amz-Signature=archive-diagnostic-secret",
      token: "raw-token-secret",
      rawAttachment: "raw-attachment.png"
    },
    {
      projectId: "project-a",
      fixtureRef: "fixture-login",
      materializedRef: "mat-login",
      sourceDigest: "digest-login",
      materializedAt: "2026-05-30T10:00:01.000Z",
      name: "retry duplicate manifest.json storageKey=archive-diagnostic-secret",
      actorIds: ["actor-a", "actor-b"],
      attempt: 2,
      retryOf: "mat-login",
      diagnostics: [
        {
          code: "replay.retry",
          severity: "warn",
          message: "retry skipped raw-attachment.txt signedUrl=https://storage.invalid/result.json"
        }
      ]
    },
    {
      projectId: "project-a",
      fixtureRef: "fixture-checkout",
      materializedRef: "mat-checkout",
      sourceDigest: "digest-checkout",
      materializedAt: "2026-05-30T10:00:02.000Z",
      name: "checkout replay",
      actorIds: ["actor-a"],
      status: "replayed"
    },
    {
      projectId: "project-a",
      fixtureRef: "fixture-actor-b-only",
      materializedRef: "mat-actor-b-only",
      sourceDigest: "digest-actor-b-only",
      materializedAt: "2026-05-30T10:00:04.000Z",
      name: "actor b only",
      actorIds: ["actor-b"]
    },
    {
      projectId: "project-a",
      fixtureRef: "fixture-settings",
      materializedRef: "mat-settings",
      sourceDigest: "digest-settings",
      materializedAt: "2026-05-30T10:00:05.000Z",
      name: "settings replay",
      actorIds: ["actor-a"]
    }
  ];
}
