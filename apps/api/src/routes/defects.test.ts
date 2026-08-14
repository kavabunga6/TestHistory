import type { FastifyInstance } from "fastify";
import type { NormalizedTestResult } from "@testhistory/contracts";
import { afterEach, describe, expect, it } from "vitest";
import { createApiApp } from "../app.js";
import { createAppStore, type Launch } from "../store.js";

let app: FastifyInstance | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

describe("defects API read model", () => {
  it("lists bounded redacted defect clusters from launch failures", async () => {
    const store = createAppStore();
    app = await createApiApp(store);
    const project = await createProject(app);
    const launch = await createLaunch(app, project.id);
    const secret = "token=raw-defect-secret signedUrl=https://object.test/private";
    const storedLaunch = store.launches.get(launch.id) as Launch;
    storedLaunch.results.push(
      normalizedFailure({
        message: `Checkout failed with ${secret}`,
        name: "checkout fails",
        status: "failed",
        testCaseId: "case-a",
        uuid: "defect-a"
      }),
      normalizedFailure({
        message: "Profile dependency broken",
        name: "profile breaks",
        status: "broken",
        testCaseId: "case-b",
        uuid: "defect-b"
      })
    );

    const listResponse = await app.inject({
      method: "GET",
      url: `/api/v1/defects?projectId=${project.id}&limit=1`,
      headers: defectReadHeaders(project.id)
    });
    const searchResponse = await app.inject({
      method: "GET",
      url: `/api/v1/defects?projectId=${project.id}&q=case-b&limit=10`,
      headers: defectReadHeaders(project.id)
    });
    const invalidResponse = await app.inject({
      method: "GET",
      url: `/api/v1/defects?projectId=${project.id}&limit=501`,
      headers: defectReadHeaders(project.id)
    });

    expect(listResponse.statusCode).toBe(200);
    const list = listResponse.json<{
      kind: string;
      page: { limit: number; returned: number; total: number; nextCursor: string | null };
      items: Array<{
        id: string;
        status: string;
        signature: { reason: string };
        results: Array<{ resultUuid: string; testId: string; status: string }>;
      }>;
    }>();
    expect(list.kind).toBe("defect-list");
    expect(list.page).toEqual(
      expect.objectContaining({ limit: 1, returned: 1, total: 2, nextCursor: "1" })
    );
    expect(list.items).toHaveLength(1);
    expect(list.items[0]).toEqual(
      expect.objectContaining({
        status: "open",
        results: [expect.objectContaining({ resultUuid: expect.any(String) })]
      })
    );
    expect(listResponse.body).not.toContain("raw-defect-secret");
    expect(listResponse.body).not.toContain("signedUrl");
    expect(listResponse.body).not.toContain("C:\\Users");
    expect(listResponse.body).not.toContain("Downloads");

    expect(searchResponse.statusCode).toBe(200);
    expect(
      searchResponse.json<{ page: { total: number }; items: Array<{ id: string }> }>().page
    ).toEqual(expect.objectContaining({ total: 1 }));

    expect(invalidResponse.statusCode).toBe(400);
    expect(invalidResponse.json()).toEqual(
      expect.objectContaining({
        code: "defects.pagination.invalid",
        redacted: true
      })
    );
  });

  it("persists authorized quarantine commands as append-only domain and security audit events", async () => {
    const store = createAppStore();
    app = await createApiApp(store);
    const project = await createProject(app);
    const launch = await createLaunch(app, project.id);
    const storedLaunch = store.launches.get(launch.id) as Launch;
    storedLaunch.results.push(
      normalizedFailure({
        message: "Checkout assertion failed",
        name: "checkout fails",
        status: "failed",
        testCaseId: "case-quarantine",
        uuid: "result-quarantine"
      })
    );
    const headers = {
      "x-testhistory-actor-id": "project-owner",
      "x-testhistory-project-scope": project.id,
      "x-testhistory-scopes": "quarantine:write"
    };

    const denied = await app.inject({
      method: "POST",
      url: `/api/v1/launches/${launch.id}/results/result-quarantine/quarantine`,
      headers: { ...headers, "x-testhistory-scopes": "defects:read" },
      payload: { reason: "Known unstable dependency" }
    });
    expect(denied.statusCode).toBe(403);

    const created = await app.inject({
      method: "POST",
      url: `/api/v1/launches/${launch.id}/results/result-quarantine/quarantine`,
      headers,
      payload: { reason: "Known unstable dependency", defectId: "BUG-431" }
    });
    expect(created.statusCode).toBe(201);
    const receipt = created.json<{ mute: { id: string; status: string } }>();
    expect(receipt.mute).toEqual(expect.objectContaining({ status: "active" }));
    expect(store.defectMuteAuditEvents).toHaveLength(1);
    expect(store.securityAuditEvents.at(-1)?.type).toBe("defect.mute.created");

    const resultDetails = await app.inject({
      method: "GET",
      url: `/api/v1/launches/${launch.id}/results/result-quarantine`,
      headers: {
        "x-testhistory-actor-id": "project-owner",
        "x-testhistory-project-scope": project.id,
        "x-testhistory-scopes": "launches:read"
      }
    });
    expect(resultDetails.statusCode).toBe(200);
    expect(resultDetails.json()).toEqual(
      expect.objectContaining({
        quarantine: expect.objectContaining({ id: receipt.mute.id, status: "active" })
      })
    );

    const qualityGate = await app.inject({
      method: "GET",
      url: `/api/v1/launches/${launch.id}/quality-gate`,
      headers: {
        "x-testhistory-actor-id": "project-owner",
        "x-testhistory-project-scope": project.id,
        "x-testhistory-scopes": "quality-gates:evaluate"
      }
    });
    expect(qualityGate.statusCode).toBe(200);
    expect(qualityGate.json()).toEqual(
      expect.objectContaining({
        rawStatus: "failed",
        effects: expect.arrayContaining([
          expect.objectContaining({
            type: "defect_mute",
            muteIds: [receipt.mute.id],
            affectedTestCaseIds: ["case-quarantine"]
          })
        ])
      })
    );

    const retried = await app.inject({
      method: "POST",
      url: `/api/v1/launches/${launch.id}/results/result-quarantine/quarantine`,
      headers,
      payload: { reason: "Retry must be idempotent" }
    });
    expect(retried.statusCode).toBe(200);
    expect(store.defectMuteAuditEvents).toHaveLength(1);

    const projection = await app.inject({
      method: "GET",
      url: `/api/v1/projects/${project.id}/defect-mutes/projection?actorId=project-owner`,
      headers: { ...headers, "x-testhistory-scopes": "defects:read" }
    });
    expect(projection.statusCode).toBe(200);
    expect(projection.json<{ items: Array<{ id: string; status: string }> }>().items).toEqual([
      expect.objectContaining({ id: receipt.mute.id, status: "active" })
    ]);

    const removed = await app.inject({
      method: "DELETE",
      url: `/api/v1/projects/${project.id}/defect-mutes/${encodeURIComponent(receipt.mute.id)}`,
      headers,
      payload: { reason: "Failure is stable again" }
    });
    expect(removed.statusCode).toBe(200);
    expect(removed.json()).toEqual(expect.objectContaining({ status: "inactive" }));
    expect(store.defectMuteAuditEvents).toHaveLength(2);
    expect(store.securityAuditEvents.at(-1)?.type).toBe("defect.mute.removed");
  });

  it("persists defect unlink and archive commands and applies them to the read model", async () => {
    const store = createAppStore();
    app = await createApiApp(store);
    const project = await createProject(app);
    const launch = await createLaunch(app, project.id);
    const storedLaunch = store.launches.get(launch.id) as Launch;
    storedLaunch.results.push(
      normalizedFailure({
        message: "Shared checkout failure",
        name: "checkout first",
        status: "failed",
        testCaseId: "case-first",
        uuid: "result-first"
      }),
      normalizedFailure({
        message: "Shared checkout failure",
        name: "checkout second",
        status: "failed",
        testCaseId: "case-second",
        uuid: "result-second"
      })
    );
    const readHeaders = defectReadHeaders(project.id);
    const writeHeaders = {
      "x-testhistory-actor-id": "project-owner",
      "x-testhistory-project-scope": project.id,
      "x-testhistory-scopes": "defects:write"
    };
    const initial = await app.inject({
      method: "GET",
      url: `/api/v1/defects?projectId=${project.id}`,
      headers: readHeaders
    });
    const defectId = initial.json<{ items: Array<{ id: string }> }>().items[0]!.id;

    const unlinked = await app.inject({
      method: "DELETE",
      url: `/api/v1/projects/${project.id}/defects/${encodeURIComponent(defectId)}/results/result-first`,
      headers: writeHeaders,
      payload: { launchId: launch.id, reason: "Incorrect occurrence grouping" }
    });
    expect(unlinked.statusCode).toBe(200);
    expect(unlinked.json()).toEqual(
      expect.objectContaining({
        event: expect.objectContaining({ action: "result_unlinked", defectId })
      })
    );

    const afterUnlink = await app.inject({
      method: "GET",
      url: `/api/v1/defects?projectId=${project.id}`,
      headers: readHeaders
    });
    expect(
      afterUnlink.json<{ items: Array<{ results: Array<{ resultUuid: string }> }> }>().items[0]
        ?.results
    ).toEqual([expect.objectContaining({ resultUuid: "result-second" })]);

    const archived = await app.inject({
      method: "DELETE",
      url: `/api/v1/projects/${project.id}/defects/${encodeURIComponent(defectId)}`,
      headers: writeHeaders,
      payload: { reason: "Archive computed defect" }
    });
    expect(archived.statusCode).toBe(200);
    const afterArchive = await app.inject({
      method: "GET",
      url: `/api/v1/defects?projectId=${project.id}`,
      headers: readHeaders
    });
    expect(afterArchive.json<{ items: unknown[] }>().items).toEqual([]);
    expect(store.defectDispositionEvents).toHaveLength(2);
    expect(store.securityAuditEvents.slice(-2).map((event) => event.type)).toEqual([
      "defect.link.removed",
      "defect.deleted"
    ]);
  });
});

async function createProject(target: FastifyInstance): Promise<{ id: string }> {
  const response = await target.inject({
    method: "POST",
    url: "/api/v1/projects",
    payload: { key: "DEF", name: "Defects" }
  });
  expect(response.statusCode).toBe(201);
  return response.json<{ id: string }>();
}

function normalizedFailure(input: {
  message: string;
  name: string;
  status: "failed" | "broken";
  testCaseId: string;
  uuid: string;
}): NormalizedTestResult {
  return {
    uuid: input.uuid,
    testCaseId: input.testCaseId,
    fullName: `suite.${input.testCaseId}`,
    name: input.name,
    status: input.status,
    durationMs: 100,
    labels: {},
    parameters: [],
    attachments: [],
    steps: [],
    raw: {
      uuid: input.uuid,
      name: input.name,
      status: input.status,
      statusDetails: {
        message: input.message,
        trace: "Error: failure\n    at pay (C:\\Users\\tester\\Downloads\\spec.ts:1)"
      }
    }
  };
}

function defectReadHeaders(projectId: string) {
  return {
    "x-testhistory-actor-id": "defect-reader",
    "x-testhistory-project-scope": projectId,
    "x-testhistory-scopes": "defects:read"
  };
}

async function createLaunch(
  target: FastifyInstance,
  projectId: string
): Promise<{ id: string; projectId: string }> {
  const response = await target.inject({
    method: "POST",
    url: `/api/v1/projects/${projectId}/launches`,
    payload: { name: "Defect nightly" }
  });
  expect(response.statusCode).toBe(201);
  return response.json<{ id: string; projectId: string }>();
}
