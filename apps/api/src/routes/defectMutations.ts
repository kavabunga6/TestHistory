import { randomUUID } from "node:crypto";
import {
  buildDefectClusters,
  applyDefectDispositionEvents,
  createDefectMute,
  createSecurityAuditEvent,
  replayDefectMuteAuditEvents,
  unmuteDefect,
  type DefectMuteAuditEvent,
  type DefectMuteRecord,
  type DefectDispositionEvent,
  type Launch as DomainLaunch
} from "@testhistory/domain";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { NormalizedTestResult } from "@testhistory/contracts";
import type { AppStore, Launch } from "../store.js";
import { appendStoreSecurityAuditEvents } from "./projectSettings.js";
import { actorIdHeader, authorizeProjectMutation } from "./project-auth.js";
import { serializeProjectionRecord } from "./defectProjection.js";

const quarantineWriteRoles = ["owner", "maintainer", "editor"] as const;

type QuarantineBody = {
  reason?: string;
  defectId?: string;
  taskId?: string;
};

type UnmuteBody = { reason?: string };
type DefectDispositionBody = { launchId?: string; reason?: string };

export async function registerDefectMutationRoutes(app: FastifyInstance, store: AppStore) {
  app.post<{
    Params: { launchId: string; resultUuid: string };
    Body: QuarantineBody;
  }>(
    "/api/v1/launches/:launchId/results/:resultUuid/quarantine",
    {
      schema: {
        tags: ["defects"],
        params: {
          type: "object",
          required: ["launchId", "resultUuid"],
          properties: {
            launchId: { type: "string", minLength: 1 },
            resultUuid: { type: "string", minLength: 1 }
          }
        },
        body: {
          type: "object",
          additionalProperties: false,
          properties: {
            reason: { type: "string", maxLength: 2_000 },
            defectId: { type: "string", maxLength: 200 },
            taskId: { type: "string", maxLength: 200 }
          }
        },
        response: {
          200: { type: "object", additionalProperties: true },
          201: { type: "object", additionalProperties: true },
          403: { type: "object", additionalProperties: true },
          404: { type: "object", additionalProperties: true },
          409: { type: "object", additionalProperties: true }
        }
      }
    },
    async (request, reply) => {
      const body = request.body ?? {};
      const launch = store.launches.get(request.params.launchId) as Launch | undefined;
      if (launch === undefined) {
        return reply.code(404).send({ message: "Launch not found" });
      }
      const project = store.projects.get(launch.projectId);
      if (project === undefined) {
        return reply.code(404).send({ message: "Project not found" });
      }
      const denial = authorizeProjectMutation(
        request,
        project,
        "quarantine:write",
        quarantineWriteRoles,
        "Actor role is not allowed to quarantine test results"
      );
      if (denial !== undefined) {
        return reply.code(403).send(denial);
      }

      const result = launch.results.find(
        (candidate) => candidate.uuid === request.params.resultUuid
      );
      if (result === undefined) {
        return reply.code(404).send({ message: "Launch result not found" });
      }
      const projectLaunches = Array.from(store.launches.values()).filter(
        (candidate) => candidate.projectId === project.id
      ) as DomainLaunch[];
      const cluster = buildDefectClusters(projectLaunches).find((candidate) =>
        candidate.occurrences.some(
          (occurrence) => occurrence.launchId === launch.id && occurrence.resultUuid === result.uuid
        )
      );
      if (cluster === undefined) {
        return reply
          .code(409)
          .send({ message: "Only failed or broken results can be quarantined" });
      }

      const events = await loadProjectDefectMuteEvents(store, project.id);
      const projection = replayDefectMuteAuditEvents(events, { projectId: project.id });
      const testId = result.testCaseId ?? result.fullName ?? result.historyId ?? result.name;
      const existing = projection.activeRecords.find(
        (record) =>
          record.affectedSignatureHashes.includes(cluster.signature.hash) &&
          record.affectedTestIds.includes(testId)
      );
      if (existing !== undefined) {
        return reply.code(200).send(quarantineReceipt(existing, body));
      }

      const now = new Date().toISOString();
      const actorId = actorIdHeader(request) ?? "unknown-actor";
      const record = createDefectMute({
        id: `mute:${randomUUID()}`,
        projectId: project.id,
        scope: {
          signatureHashes: [cluster.signature.hash],
          testCaseIds: [testId]
        },
        reason: normalizedReason(body),
        origin: { type: "actor", actorId },
        occurredAt: now,
        clusters: [cluster]
      });
      await appendDefectMuteEvents(store, record.auditEvents);
      await appendMutationAudit(store, {
        actorId,
        eventType: "defect.mute.created",
        method: "POST",
        muteId: record.id,
        projectId: project.id,
        route: "/api/v1/launches/:launchId/results/:resultUuid/quarantine",
        resultUuid: result.uuid,
        launchId: launch.id,
        now
      });
      return reply.code(201).send(quarantineReceipt(record, body));
    }
  );

  app.delete<{
    Params: { projectId: string; muteId: string };
    Body?: UnmuteBody;
  }>(
    "/api/v1/projects/:projectId/defect-mutes/:muteId",
    {
      schema: {
        tags: ["defects"],
        params: {
          type: "object",
          required: ["projectId", "muteId"],
          properties: {
            projectId: { type: "string", minLength: 1 },
            muteId: { type: "string", minLength: 1 }
          }
        },
        body: {
          type: "object",
          additionalProperties: false,
          properties: { reason: { type: "string", maxLength: 2_000 } }
        },
        response: {
          200: { type: "object", additionalProperties: true },
          403: { type: "object", additionalProperties: true },
          404: { type: "object", additionalProperties: true }
        }
      }
    },
    async (request, reply) => {
      const project = store.projects.get(request.params.projectId);
      if (project === undefined) {
        return reply.code(404).send({ message: "Project not found" });
      }
      const denial = authorizeProjectMutation(
        request,
        project,
        "quarantine:write",
        quarantineWriteRoles,
        "Actor role is not allowed to remove test results from quarantine"
      );
      if (denial !== undefined) {
        return reply.code(403).send(denial);
      }

      const events = await loadProjectDefectMuteEvents(store, project.id);
      const record = replayDefectMuteAuditEvents(events, { projectId: project.id }).records.find(
        (candidate) => candidate.id === request.params.muteId
      );
      if (record === undefined) {
        return reply.code(404).send({ message: "Defect mute not found" });
      }
      if (record.status === "inactive") {
        return serializeProjectionRecord(record);
      }

      const now = new Date().toISOString();
      const actorId = actorIdHeader(request) ?? "unknown-actor";
      const next = unmuteDefect({
        record,
        reason: request.body?.reason?.trim() || "Removed from quarantine",
        origin: { type: "actor", actorId },
        occurredAt: now
      });
      await appendDefectMuteEvents(store, next.auditEvents.slice(record.auditEvents.length));
      await appendMutationAudit(store, {
        actorId,
        eventType: "defect.mute.removed",
        method: "DELETE",
        muteId: record.id,
        projectId: project.id,
        route: "/api/v1/projects/:projectId/defect-mutes/:muteId",
        now
      });
      return serializeProjectionRecord(next);
    }
  );

  app.delete<{
    Params: { projectId: string; defectId: string };
    Body?: DefectDispositionBody;
  }>(
    "/api/v1/projects/:projectId/defects/:defectId",
    defectDispositionRouteSchema(false),
    async (request, reply) => {
      const context = authorizeDefectDisposition(request, store, request.params.projectId);
      if (context.status === "missing") {
        return reply.code(404).send({ message: "Project not found" });
      }
      if (context.status === "denied") {
        return reply.code(403).send(context.denial);
      }

      const existingEvents = await loadProjectDefectDispositionEvents(store, context.project.id);
      const clusters = applyDefectDispositionEvents(
        buildDefectClusters(projectLaunches(store, context.project.id)),
        existingEvents
      );
      const cluster = clusters.find((candidate) => candidate.id === request.params.defectId);
      if (cluster === undefined) {
        return reply.code(404).send({ message: "Defect not found" });
      }

      const event = await appendDefectDisposition(store, {
        action: "archived",
        actorId: context.actorId,
        defectId: cluster.id,
        occurrences: cluster.occurrences.map(({ launchId, resultUuid }) => ({
          launchId,
          resultUuid
        })),
        projectId: context.project.id,
        reason: request.body?.reason?.trim() || "Defect removed from active links"
      });
      await appendDispositionAudit(
        store,
        event,
        "defect.deleted",
        "/api/v1/projects/:projectId/defects/:defectId"
      );
      return { kind: "defect-disposition", event };
    }
  );

  app.delete<{
    Params: { projectId: string; defectId: string; resultUuid: string };
    Body?: DefectDispositionBody;
  }>(
    "/api/v1/projects/:projectId/defects/:defectId/results/:resultUuid",
    defectDispositionRouteSchema(true),
    async (request, reply) => {
      const context = authorizeDefectDisposition(request, store, request.params.projectId);
      if (context.status === "missing") {
        return reply.code(404).send({ message: "Project not found" });
      }
      if (context.status === "denied") {
        return reply.code(403).send(context.denial);
      }

      const existingEvents = await loadProjectDefectDispositionEvents(store, context.project.id);
      const cluster = applyDefectDispositionEvents(
        buildDefectClusters(projectLaunches(store, context.project.id)),
        existingEvents
      ).find((candidate) => candidate.id === request.params.defectId);
      const occurrence = cluster?.occurrences.find(
        (candidate) =>
          candidate.resultUuid === request.params.resultUuid &&
          (request.body?.launchId === undefined || candidate.launchId === request.body.launchId)
      );
      if (occurrence === undefined) {
        return reply.code(404).send({ message: "Defect result link not found" });
      }

      const event = await appendDefectDisposition(store, {
        action: "result_unlinked",
        actorId: context.actorId,
        defectId: request.params.defectId,
        occurrences: [{ launchId: occurrence.launchId, resultUuid: occurrence.resultUuid }],
        projectId: context.project.id,
        reason: request.body?.reason?.trim() || "Result unlinked from defect"
      });
      await appendDispositionAudit(
        store,
        event,
        "defect.link.removed",
        "/api/v1/projects/:projectId/defects/:defectId/results/:resultUuid"
      );
      return { kind: "defect-disposition", event };
    }
  );
}

export async function loadProjectDefectMuteEvents(
  store: AppStore,
  projectId: string
): Promise<DefectMuteAuditEvent[]> {
  const page = await store.repositories.defectMuteAudit.listByProject(projectId);
  return page.items;
}

export async function loadProjectDefectDispositionEvents(
  store: AppStore,
  projectId: string
): Promise<DefectDispositionEvent[]> {
  return (await store.repositories.defectDispositions.listByProject(projectId)).items;
}

export function findActiveDefectMuteForResult(
  records: DefectMuteRecord[],
  result: NormalizedTestResult
): DefectMuteRecord | undefined {
  const testId = result.testCaseId ?? result.fullName ?? result.historyId ?? result.name;
  return records.find(
    (record) => record.status === "active" && record.affectedTestIds.includes(testId)
  );
}

async function appendDefectMuteEvents(store: AppStore, events: DefectMuteAuditEvent[]) {
  await store.transaction(async (repositories) => {
    for (const event of events) {
      await repositories.defectMuteAudit.append({
        ...event,
        createdAt: event.occurredAt,
        updatedAt: event.occurredAt,
        version: 1
      });
    }
  });
}

function normalizedReason(body: QuarantineBody): string {
  const reason = body.reason?.trim() || "Quarantined test result";
  const references = [body.defectId?.trim(), body.taskId?.trim()].filter(
    (value): value is string => value !== undefined && value.length > 0
  );
  return references.length === 0 ? reason : `${reason}; reference: ${references.join(", ")}`;
}

function quarantineReceipt(record: DefectMuteRecord, body: QuarantineBody) {
  return {
    kind: "result-quarantine",
    mute: serializeProjectionRecord(record),
    ...(body.defectId?.trim() ? { defectId: body.defectId.trim() } : {}),
    ...(body.taskId?.trim() ? { taskId: body.taskId.trim() } : {})
  };
}

async function appendMutationAudit(
  store: AppStore,
  input: {
    actorId: string;
    eventType: "defect.mute.created" | "defect.mute.removed";
    method: "POST" | "DELETE";
    muteId: string;
    projectId: string;
    route: string;
    now: string;
    launchId?: string;
    resultUuid?: string;
  }
) {
  await appendStoreSecurityAuditEvents(store, [
    createSecurityAuditEvent({
      actor: { type: "actor", actorId: input.actorId },
      occurredAt: input.now,
      outcome: "allowed",
      projectId: input.projectId,
      request: { method: input.method, route: input.route },
      resource: { type: "defect-mute", id: input.muteId },
      metadata: {
        ...(input.launchId !== undefined ? { launchId: input.launchId } : {}),
        ...(input.resultUuid !== undefined ? { resultUuid: input.resultUuid } : {})
      },
      type: input.eventType
    })
  ]);
}

function defectDispositionRouteSchema(includeResult: boolean) {
  return {
    schema: {
      tags: ["defects"],
      params: {
        type: "object",
        required: includeResult
          ? ["projectId", "defectId", "resultUuid"]
          : ["projectId", "defectId"],
        properties: {
          projectId: { type: "string", minLength: 1 },
          defectId: { type: "string", minLength: 1 },
          ...(includeResult ? { resultUuid: { type: "string", minLength: 1 } } : {})
        }
      },
      body: {
        type: "object",
        additionalProperties: false,
        properties: {
          launchId: { type: "string", maxLength: 200 },
          reason: { type: "string", maxLength: 2_000 }
        }
      },
      response: {
        200: { type: "object", additionalProperties: true },
        403: { type: "object", additionalProperties: true },
        404: { type: "object", additionalProperties: true }
      }
    }
  } as const;
}

function authorizeDefectDisposition(request: FastifyRequest, store: AppStore, projectId: string) {
  const project = store.projects.get(projectId);
  if (project === undefined) {
    return { status: "missing" as const };
  }
  const denial = authorizeProjectMutation(
    request,
    project,
    "defects:write",
    quarantineWriteRoles,
    "Actor role is not allowed to change defect links"
  );
  if (denial !== undefined) {
    return { status: "denied" as const, denial };
  }
  return {
    status: "authorized" as const,
    project,
    actorId: actorIdHeader(request) ?? "unknown-actor"
  };
}

function projectLaunches(store: AppStore, projectId: string): DomainLaunch[] {
  return Array.from(store.launches.values()).filter(
    (candidate) => candidate.projectId === projectId
  ) as DomainLaunch[];
}

async function appendDefectDisposition(
  store: AppStore,
  input: Omit<DefectDispositionEvent, "id" | "occurredAt">
): Promise<DefectDispositionEvent> {
  const occurredAt = new Date().toISOString();
  const event: DefectDispositionEvent = {
    ...input,
    id: `defect-disposition:${randomUUID()}`,
    occurredAt
  };
  await store.transaction((repositories) =>
    repositories.defectDispositions.append({
      ...event,
      createdAt: occurredAt,
      updatedAt: occurredAt,
      version: 1
    })
  );
  return event;
}

async function appendDispositionAudit(
  store: AppStore,
  event: DefectDispositionEvent,
  type: "defect.deleted" | "defect.link.removed",
  route: string
) {
  await appendStoreSecurityAuditEvents(store, [
    createSecurityAuditEvent({
      actor: { type: "actor", actorId: event.actorId },
      occurredAt: event.occurredAt,
      outcome: "allowed",
      projectId: event.projectId,
      request: { method: "DELETE", route },
      resource: { type: "defect", id: event.defectId },
      reason: event.reason,
      metadata: {
        action: event.action,
        occurrenceCount: event.occurrences.length
      },
      type
    })
  ]);
}
