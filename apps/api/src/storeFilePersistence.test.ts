import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { createFileBackedAppStore } from "./storeFilePersistence.js";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe("file-backed store safety", () => {
  it("creates a versioned snapshot without serializing executable store helpers", () => {
    const filePath = createTemporaryStorePath();

    const store = createFileBackedAppStore(filePath, { autosaveMs: 60_000 });
    const snapshot = JSON.parse(readFileSync(filePath, "utf8"));

    expect(snapshot.version).toBe(1);
    expect(snapshot.maps.users.__testhistoryMap).toBe(true);
    expect(snapshot.maps.repositories).toBeUndefined();
    expect(snapshot.arrays.securityAuditEvents).toEqual([]);
    expect(snapshot.arrays.defectMuteAuditEvents).toEqual([]);
    expect(snapshot.arrays.defectDispositionEvents).toEqual([]);
    if (process.platform !== "win32") {
      expect(statSync(filePath).mode & 0o777).toBe(0o600);
    }
    store.closePersistence?.();
  });

  it("survives restart with append-only defect quarantine audit events", async () => {
    const filePath = createTemporaryStorePath();
    const first = createFileBackedAppStore(filePath, { autosaveMs: 60_000 });
    await first.repositories.defectMuteAudit.append({
      id: "mute-event-1",
      type: "defect.muted",
      muteId: "mute-1",
      projectId: "00000000-0000-4000-8000-000000000001",
      occurredAt: "2026-08-09T10:00:00.000Z",
      origin: { type: "actor", actorId: "qa-owner" },
      scope: { testCaseIds: ["case-1"] },
      reason: "Known issue",
      affectedSignatureHashes: ["signature-1"],
      affectedTestIds: ["case-1"],
      rawFailureHistory: [],
      createdAt: "2026-08-09T10:00:00.000Z",
      updatedAt: "2026-08-09T10:00:00.000Z",
      version: 1
    });
    first.closePersistence?.();

    const second = createFileBackedAppStore(filePath, { autosaveMs: 60_000 });
    await expect(
      second.repositories.defectMuteAudit.listByProject("00000000-0000-4000-8000-000000000001")
    ).resolves.toEqual({
      items: [expect.objectContaining({ id: "mute-event-1", muteId: "mute-1" })]
    });
    second.closePersistence?.();
  });

  it("survives restart with append-only defect disposition events", async () => {
    const filePath = createTemporaryStorePath();
    const first = createFileBackedAppStore(filePath, { autosaveMs: 60_000 });
    await first.repositories.defectDispositions.append({
      id: "disposition-event-1",
      projectId: "00000000-0000-4000-8000-000000000001",
      defectId: "defect:signature-1",
      action: "result_unlinked",
      occurrences: [{ launchId: "launch-1", resultUuid: "result-1" }],
      actorId: "qa-owner",
      reason: "Incorrect grouping",
      occurredAt: "2026-08-09T11:00:00.000Z",
      createdAt: "2026-08-09T11:00:00.000Z",
      updatedAt: "2026-08-09T11:00:00.000Z",
      version: 1
    });
    first.closePersistence?.();

    const second = createFileBackedAppStore(filePath, { autosaveMs: 60_000 });
    await expect(
      second.repositories.defectDispositions.listByProject("00000000-0000-4000-8000-000000000001")
    ).resolves.toEqual({
      items: [
        expect.objectContaining({ id: "disposition-event-1", defectId: "defect:signature-1" })
      ]
    });
    second.closePersistence?.();
  });

  it("survives restart with append-only security audit events", async () => {
    const filePath = createTemporaryStorePath();
    const first = createFileBackedAppStore(filePath, { autosaveMs: 60_000 });
    await first.repositories.securityAudit.append({
      schemaVersion: 1,
      id: "security-audit-1",
      fingerprint: "fingerprint-1",
      projectId: "00000000-0000-4000-8000-000000000001",
      type: "defect.deleted",
      outcome: "allowed",
      severity: "info",
      occurredAt: "2026-08-09T12:00:00.000Z",
      actor: { type: "actor", actorId: "qa-owner" },
      createdAt: "2026-08-09T12:00:00.000Z",
      updatedAt: "2026-08-09T12:00:00.000Z",
      version: 1
    });
    first.closePersistence?.();

    const second = createFileBackedAppStore(filePath, { autosaveMs: 60_000 });
    await expect(
      second.repositories.securityAudit.listByProject("00000000-0000-4000-8000-000000000001")
    ).resolves.toEqual({ items: [expect.objectContaining({ id: "security-audit-1" })] });
    second.closePersistence?.();
  });

  it("rejects unsupported or corrupt snapshots with a path-only diagnostic", () => {
    const versionedPath = createTemporaryStorePath();
    writeFileSync(
      versionedPath,
      JSON.stringify({ arrays: {}, maps: {}, savedAt: new Date().toISOString(), version: 99 })
    );
    expect(() => createFileBackedAppStore(versionedPath)).toThrow(
      `Unsupported TestHistory store snapshot version 99: ${versionedPath}`
    );

    const corruptPath = path.join(path.dirname(versionedPath), "corrupt.json");
    writeFileSync(corruptPath, '{"secret":"must-not-appear"');
    expect(() => createFileBackedAppStore(corruptPath)).toThrow(
      `TestHistory store snapshot is not valid JSON: ${corruptPath}`
    );
  });
});

function createTemporaryStorePath() {
  const directory = mkdtempSync(path.join(tmpdir(), "testhistory-store-"));
  temporaryDirectories.push(directory);
  const nestedDirectory = path.join(directory, "state");
  mkdirSync(nestedDirectory);
  return path.join(nestedDirectory, "store.json");
}
