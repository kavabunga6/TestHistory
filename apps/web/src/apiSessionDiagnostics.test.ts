import { afterEach, describe, expect, it, vi } from "vitest";
import {
  loadArchiveDiagnosticReplayFixtureState,
  loadArchiveUploadStatusState
} from "./apiArchiveState.js";
import {
  loadDefectMuteProjectionState,
  loadDefectMuteReplayInvariantState
} from "./apiDefectMuteState.js";
import { loadAttachmentPreviewRetentionDryRunScheduleState } from "./apiRetentionState.js";
import { loadSecurityAuditExportLifecycleInvariantState } from "./apiSecurityAuditState.js";
import {
  loadHistoryComparePermissionAuditRead,
  loadHistoryComparePermissionAuditInvariantRead
} from "./m1WorkspaceHistoryReads.js";
import type { ApiNormalizedResultReadModel } from "./m1WorkspaceApiTypes.js";

const originalFetch = globalThis.fetch;
const originalStorage = globalThis.localStorage;
const user = {
  id: "user-uuid",
  email: "actual.user@example.test",
  name: "Actual User",
  role: "user",
  status: "active"
};
const historyResult = { uuid: "result-1", testCaseId: "case-1" } as ApiNormalizedResultReadModel;
const callers = [
  ["archive replay", () => loadArchiveDiagnosticReplayFixtureState("project-1")],
  ["archive upload status", () => loadArchiveUploadStatusState("project-1")],
  ["defect projection", () => loadDefectMuteProjectionState("project-1")],
  ["defect replay", () => loadDefectMuteReplayInvariantState("project-1")],
  ["retention schedule", () => loadAttachmentPreviewRetentionDryRunScheduleState("project-1")],
  ["security audit", () => loadSecurityAuditExportLifecycleInvariantState("project-1")],
  [
    "history compare audit",
    () => loadHistoryComparePermissionAuditRead("project-1", historyResult)
  ],
  [
    "history compare invariant",
    () => loadHistoryComparePermissionAuditInvariantRead("project-1", historyResult)
  ]
] as const;

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalStorage === undefined) Reflect.deleteProperty(globalThis, "localStorage");
  else
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: originalStorage
    });
  vi.restoreAllMocks();
});

function session(token?: string) {
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => (key === "testhistory.sessionToken" ? (token ?? null) : null)
    }
  });
}
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}
function fixtureFetch() {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url === "/api/v1/auth/me") return json({ auth: { method: "session" }, user });
    if (url.endsWith("/launches")) return json([{ id: "launch-1", status: "closed" }]);
    return json({
      summary: { materializedRecordCount: 0, total: 0, scheduledDescriptorCount: 0 },
      items: [],
      page: { hasMore: false },
      diagnostics: { items: [], page: { hasMore: false } },
      projection: { eventCount: 0 },
      appendOnly: { totalProjectedEventIds: 0 },
      replay: { requestCount: 0 },
      batches: []
    });
  });
  globalThis.fetch = fetchMock;
  return fetchMock;
}

describe("auxiliary diagnostics session authentication", () => {
  it.each(callers)("sends the actual session for %s", async (_name, load) => {
    session("actual-session");
    const fetchMock = fixtureFetch();
    const result = await load();
    expect(result).toBeDefined();
    if (result !== undefined && "state" in result) expect(result.state).not.toBe("error");
    const calls = fetchMock.mock.calls as unknown as [string, RequestInit][];
    expect(calls.length).toBeGreaterThan(0);
    for (const [, init] of calls)
      expect(new Headers(init.headers).get("authorization")).toBe("Bearer actual-session");
  });

  it.each([
    ["defect replay", () => loadDefectMuteReplayInvariantState("project-1"), "qa-api-agent"],
    [
      "security audit",
      () => loadSecurityAuditExportLifecycleInvariantState("project-1"),
      "security-audit-actor"
    ]
  ] as const)(
    "uses the authenticated backend actor identity for %s",
    async (_name, load, _legacyActor) => {
      session("actual-session");
      const fetchMock = fixtureFetch();
      await load();
      const calls = fetchMock.mock.calls as unknown as [string, RequestInit][];
      expect(calls[0]?.[0]).toBe("/api/v1/auth/me");
      const [path, init] = calls.at(-1)!;
      const actor = new URL(path, "http://test.invalid").searchParams.get("actorId");
      expect(actor).toBe(user.email);
      expect(actor).not.toBe(user.id);
      expect(new Headers(init.headers).get("authorization")).toBe("Bearer actual-session");
    }
  );

  it.each([
    ["defect replay", () => loadDefectMuteReplayInvariantState("project-1"), "qa-api-agent"],
    [
      "security audit",
      () => loadSecurityAuditExportLifecycleInvariantState("project-1"),
      "security-audit-actor"
    ]
  ] as const)(
    "preserves the no-session development fixture for %s",
    async (_name, load, legacyActor) => {
      session();
      const fetchMock = fixtureFetch();
      await load();
      const calls = fetchMock.mock.calls as unknown as [string, RequestInit][];
      expect(calls).toHaveLength(1);
      const [path, init] = calls[0]!;
      expect(new URL(path, "http://test.invalid").searchParams.get("actorId")).toBe(legacyActor);
      expect(new Headers(init.headers).get("authorization")).toBeNull();
      expect(new Headers(init.headers).get("x-testhistory-actor-id")).toBe(legacyActor);
    }
  );

  it.each([
    ["defect replay", () => loadDefectMuteReplayInvariantState("project-1")],
    ["security audit", () => loadSecurityAuditExportLifecycleInvariantState("project-1")]
  ] as const)(
    "does not fall back to a fake actor when authentication fails for %s",
    async (_name, load) => {
      session("expired-session");
      const fetchMock = vi.fn().mockResolvedValue(json({ message: "unauthorized" }, 401));
      globalThis.fetch = fetchMock;
      expect((await load()).state).toBe("error");
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/v1/auth/me");
    }
  );
});
