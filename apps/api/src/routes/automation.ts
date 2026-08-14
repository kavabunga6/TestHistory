import type { ProjectRole } from "@testhistory/contracts";
import {
  canTransitionAutomationJob,
  createSecurityAuditEvent,
  normalizeAutomatedTestSelector,
  type AutomatedTestSelector,
  type AutomationJob,
  type AutomationJobStatus,
  type AutomationJobTrigger,
  type TestPlan,
  type TestPlanStatus
} from "@testhistory/domain";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { AppStore } from "../store.js";
import {
  actorIdHeader,
  authorizeProjectMutation,
  authorizeProjectVisibilityRead
} from "./project-auth.js";
import { appendStoreSecurityAuditEvents } from "./projectSettings.js";

const planWriteRoles: readonly ProjectRole[] = ["owner", "maintainer", "editor"];
const jobWriteRoles: readonly ProjectRole[] = ["owner", "maintainer", "editor", "ci"];

type TestPlanBody = {
  name: string;
  description?: string;
  selector: AutomatedTestSelector;
  launchNameTemplate?: string;
  status?: TestPlanStatus;
};

type TestPlanPatch = Partial<TestPlanBody>;

type AutomationJobBody = {
  name: string;
  trigger?: AutomationJobTrigger;
  status?: AutomationJobStatus;
  testPlanId?: string;
  launchId?: string;
  branch?: string;
  commitSha?: string;
  external?: AutomationJob["external"];
};

type AutomationJobPatch = Partial<
  Pick<AutomationJob, "status" | "launchId" | "branch" | "commitSha" | "external" | "error">
>;

export async function registerAutomationRoutes(app: FastifyInstance, store: AppStore) {
  app.get<{
    Params: { projectId: string };
    Querystring: { status?: TestPlanStatus; limit?: number; cursor?: string };
  }>(
    "/api/v1/projects/:projectId/test-plans",
    { schema: planListSchema },
    async (request, reply) => {
      const project = store.projects.get(request.params.projectId);
      if (!project) return reply.code(404).send({ message: "Project not found" });
      const denied = authorizeProjectVisibilityRead(request, project, "test-cases:read");
      if (denied) return reply.code(403).send(denied);
      const page = await store.repositories.testPlans.listByProject(project.id, request.query);
      return { kind: "test-plan-list", ...page };
    }
  );

  app.post<{ Params: { projectId: string }; Body: TestPlanBody }>(
    "/api/v1/projects/:projectId/test-plans",
    { schema: { ...planMutationSchema, body: testPlanBodySchema(["name", "selector"]) } },
    async (request, reply) => {
      const project = store.projects.get(request.params.projectId);
      if (!project) return reply.code(404).send({ message: "Project not found" });
      const denied = authorizeProjectMutation(
        request,
        project,
        "test-cases:write",
        planWriteRoles,
        "Actor role is not allowed to manage test plans"
      );
      if (denied) return reply.code(403).send(denied);
      let selector: AutomatedTestSelector;
      try {
        selector = normalizeAutomatedTestSelector(request.body.selector);
      } catch (error) {
        return reply.code(400).send({ message: (error as Error).message });
      }
      const now = new Date().toISOString();
      const plan: TestPlan = {
        id: crypto.randomUUID(),
        projectId: project.id,
        name: request.body.name.trim(),
        status: request.body.status ?? "active",
        selector,
        createdBy: actorIdHeader(request) ?? "system",
        createdAt: now,
        updatedAt: now,
        version: 1,
        ...optionalText("description", request.body.description),
        ...optionalText("launchNameTemplate", request.body.launchNameTemplate)
      };
      await store.repositories.testPlans.save(plan);
      store.testPlans.set(plan.id, plan);
      await auditAutomationMutation(store, request, plan, "test-plan.created");
      return reply.code(201).send(plan);
    }
  );

  app.get<{ Params: { projectId: string; planId: string } }>(
    "/api/v1/projects/:projectId/test-plans/:planId",
    { schema: planItemSchema },
    async (request, reply) => {
      const project = store.projects.get(request.params.projectId);
      if (!project) return reply.code(404).send({ message: "Project not found" });
      const denied = authorizeProjectVisibilityRead(request, project, "test-cases:read");
      if (denied) return reply.code(403).send(denied);
      const plan = await store.repositories.testPlans.findById(project.id, request.params.planId);
      return plan ?? reply.code(404).send({ message: "Test plan not found" });
    }
  );

  app.patch<{ Params: { projectId: string; planId: string }; Body: TestPlanPatch }>(
    "/api/v1/projects/:projectId/test-plans/:planId",
    { schema: { ...planItemSchema, body: testPlanBodySchema([]) } },
    async (request, reply) => {
      const project = store.projects.get(request.params.projectId);
      if (!project) return reply.code(404).send({ message: "Project not found" });
      const denied = authorizeProjectMutation(
        request,
        project,
        "test-cases:write",
        planWriteRoles,
        "Actor role is not allowed to manage test plans"
      );
      if (denied) return reply.code(403).send(denied);
      const plan = await store.repositories.testPlans.findById(project.id, request.params.planId);
      if (!plan) return reply.code(404).send({ message: "Test plan not found" });
      if (request.body.selector !== undefined) {
        try {
          plan.selector = normalizeAutomatedTestSelector(request.body.selector);
        } catch (error) {
          return reply.code(400).send({ message: (error as Error).message });
        }
      }
      if (request.body.name !== undefined) plan.name = request.body.name.trim();
      if (request.body.status !== undefined) plan.status = request.body.status;
      assignOptionalText(plan, "description", request.body.description);
      assignOptionalText(plan, "launchNameTemplate", request.body.launchNameTemplate);
      plan.updatedAt = new Date().toISOString();
      plan.version += 1;
      await store.repositories.testPlans.save(plan);
      store.testPlans.set(plan.id, plan);
      await auditAutomationMutation(
        store,
        request,
        plan,
        plan.status === "archived" ? "test-plan.archived" : "test-plan.updated"
      );
      return plan;
    }
  );

  app.delete<{ Params: { projectId: string; planId: string } }>(
    "/api/v1/projects/:projectId/test-plans/:planId",
    { schema: planItemSchema },
    async (request, reply) => {
      const project = store.projects.get(request.params.projectId);
      if (!project) return reply.code(404).send({ message: "Project not found" });
      const denied = authorizeProjectMutation(
        request,
        project,
        "test-cases:write",
        planWriteRoles,
        "Actor role is not allowed to archive test plans"
      );
      if (denied) return reply.code(403).send(denied);
      const plan = await store.repositories.testPlans.findById(project.id, request.params.planId);
      if (!plan) return reply.code(404).send({ message: "Test plan not found" });
      plan.status = "archived";
      plan.updatedAt = new Date().toISOString();
      plan.version += 1;
      await store.repositories.testPlans.save(plan);
      store.testPlans.set(plan.id, plan);
      await auditAutomationMutation(store, request, plan, "test-plan.archived");
      return reply.code(204).send();
    }
  );

  app.get<{
    Params: { projectId: string };
    Querystring: {
      status?: AutomationJobStatus;
      testPlanId?: string;
      limit?: number;
      cursor?: string;
    };
  }>(
    "/api/v1/projects/:projectId/automation-jobs",
    { schema: jobListSchema },
    async (request, reply) => {
      const project = store.projects.get(request.params.projectId);
      if (!project) return reply.code(404).send({ message: "Project not found" });
      const denied = authorizeProjectVisibilityRead(request, project, "launches:read");
      if (denied) return reply.code(403).send(denied);
      const page = await store.repositories.automationJobs.listByProject(project.id, request.query);
      return { kind: "automation-job-list", ...page };
    }
  );

  app.post<{ Params: { projectId: string }; Body: AutomationJobBody }>(
    "/api/v1/projects/:projectId/automation-jobs",
    { schema: { ...jobMutationSchema, body: automationJobBodySchema(["name"]) } },
    async (request, reply) => {
      const project = store.projects.get(request.params.projectId);
      if (!project) return reply.code(404).send({ message: "Project not found" });
      const denied = authorizeProjectMutation(
        request,
        project,
        "launches:write",
        jobWriteRoles,
        "Actor role is not allowed to register automation jobs"
      );
      if (denied) return reply.code(403).send(denied);
      const relationError = await validateJobRelations(store, project.id, request.body);
      if (relationError) return reply.code(400).send({ message: relationError });
      const now = new Date().toISOString();
      const job: AutomationJob = {
        id: crypto.randomUUID(),
        projectId: project.id,
        name: request.body.name.trim(),
        status: request.body.status ?? "queued",
        trigger: request.body.trigger ?? "api",
        requestedBy: actorIdHeader(request) ?? "system",
        createdAt: now,
        updatedAt: now,
        version: 1,
        ...jobOptionalFields(request.body)
      };
      if (job.status === "running") job.startedAt = now;
      if (["succeeded", "failed", "canceled"].includes(job.status)) job.finishedAt = now;
      await store.repositories.automationJobs.save(job);
      store.automationJobs.set(job.id, job);
      await auditAutomationMutation(store, request, job, "automation-job.created");
      return reply.code(201).send(job);
    }
  );

  app.patch<{ Params: { projectId: string; jobId: string }; Body: AutomationJobPatch }>(
    "/api/v1/projects/:projectId/automation-jobs/:jobId",
    { schema: { ...jobItemSchema, body: automationJobPatchSchema } },
    async (request, reply) => {
      const project = store.projects.get(request.params.projectId);
      if (!project) return reply.code(404).send({ message: "Project not found" });
      const denied = authorizeProjectMutation(
        request,
        project,
        "launches:write",
        jobWriteRoles,
        "Actor role is not allowed to update automation jobs"
      );
      if (denied) return reply.code(403).send(denied);
      const job = await store.repositories.automationJobs.findById(
        project.id,
        request.params.jobId
      );
      if (!job) return reply.code(404).send({ message: "Automation job not found" });
      if (
        request.body.status !== undefined &&
        !canTransitionAutomationJob(job.status, request.body.status)
      ) {
        return reply.code(409).send({
          message: `Automation job cannot transition from ${job.status} to ${request.body.status}`
        });
      }
      const relationError = await validateJobRelations(store, project.id, request.body);
      if (relationError) return reply.code(400).send({ message: relationError });
      const now = new Date().toISOString();
      Object.assign(job, jobOptionalFields(request.body));
      if (request.body.status !== undefined && request.body.status !== job.status) {
        job.status = request.body.status;
        if (job.status === "running") job.startedAt = now;
        if (["succeeded", "failed", "canceled"].includes(job.status)) job.finishedAt = now;
      }
      job.updatedAt = now;
      job.version += 1;
      await store.repositories.automationJobs.save(job);
      store.automationJobs.set(job.id, job);
      await auditAutomationMutation(store, request, job, "automation-job.updated");
      return job;
    }
  );
}

async function validateJobRelations(
  store: AppStore,
  projectId: string,
  body: { testPlanId?: string; launchId?: string }
) {
  if (
    body.testPlanId !== undefined &&
    !(await store.repositories.testPlans.findById(projectId, body.testPlanId))
  )
    return "Test plan does not belong to this project";
  if (body.launchId !== undefined && store.launches.get(body.launchId)?.projectId !== projectId)
    return "Launch does not belong to this project";
  return undefined;
}

async function auditAutomationMutation(
  store: AppStore,
  request: FastifyRequest,
  resource: TestPlan | AutomationJob,
  type: Parameters<typeof createSecurityAuditEvent>[0]["type"]
) {
  await appendStoreSecurityAuditEvents(store, [
    createSecurityAuditEvent({
      projectId: resource.projectId,
      type,
      outcome: "allowed",
      occurredAt: resource.updatedAt,
      actor: { type: "actor", actorId: actorIdHeader(request) ?? "system" },
      resource: {
        type: "id" in resource && "selector" in resource ? "test-plan" : "automation-job",
        id: resource.id,
        name: resource.name
      },
      request: {
        method: request.method,
        requestId: request.id,
        ...(request.routeOptions.url !== undefined ? { route: request.routeOptions.url } : {})
      }
    })
  ]);
}

function optionalText<K extends string>(key: K, value: string | undefined): { [P in K]?: string } {
  return value?.trim() ? ({ [key]: value.trim() } as { [P in K]?: string }) : {};
}
function assignOptionalText<T extends object, K extends keyof T>(
  target: T,
  key: K,
  value: string | undefined
) {
  if (value !== undefined) (target as Record<string, unknown>)[String(key)] = value.trim();
}
function jobOptionalFields(source: {
  testPlanId?: string;
  launchId?: string;
  branch?: string;
  commitSha?: string;
  external?: AutomationJob["external"];
  error?: string;
}): Partial<AutomationJob> {
  return {
    ...(source.testPlanId !== undefined ? { testPlanId: source.testPlanId } : {}),
    ...(source.launchId !== undefined ? { launchId: source.launchId } : {}),
    ...(source.branch !== undefined ? { branch: source.branch } : {}),
    ...(source.commitSha !== undefined ? { commitSha: source.commitSha } : {}),
    ...(source.external !== undefined ? { external: source.external } : {}),
    ...(source.error !== undefined ? { error: source.error } : {})
  };
}

const projectParams = {
  type: "object",
  required: ["projectId"],
  properties: { projectId: { type: "string", minLength: 1 } }
} as const;
const planParams = {
  type: "object",
  required: ["projectId", "planId"],
  properties: {
    projectId: { type: "string", minLength: 1 },
    planId: { type: "string", minLength: 1 }
  }
} as const;
const jobParams = {
  type: "object",
  required: ["projectId", "jobId"],
  properties: {
    projectId: { type: "string", minLength: 1 },
    jobId: { type: "string", minLength: 1 }
  }
} as const;
const selectorSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    thql: { type: "string", minLength: 1, maxLength: 4000 },
    testCaseIds: {
      type: "array",
      maxItems: 10000,
      items: { type: "string", minLength: 1, maxLength: 200 }
    },
    tags: { type: "array", maxItems: 200, items: { type: "string", minLength: 1, maxLength: 100 } }
  }
} as const;
const planStatusSchema = { type: "string", enum: ["active", "disabled", "archived"] } as const;
function testPlanBodySchema(required: string[]) {
  return {
    type: "object",
    additionalProperties: false,
    required,
    properties: {
      name: { type: "string", minLength: 1, maxLength: 200 },
      description: { type: "string", maxLength: 4000 },
      selector: selectorSchema,
      launchNameTemplate: { type: "string", maxLength: 300 },
      status: planStatusSchema
    }
  };
}
const planListSchema = {
  tags: ["test-plans"],
  params: projectParams,
  querystring: {
    type: "object",
    additionalProperties: false,
    properties: {
      status: planStatusSchema,
      limit: { type: "integer", minimum: 1, maximum: 200 },
      cursor: { type: "string" }
    }
  }
};
const planMutationSchema = { tags: ["test-plans"], params: projectParams };
const planItemSchema = { tags: ["test-plans"], params: planParams };
const jobStatusSchema = {
  type: "string",
  enum: ["queued", "running", "succeeded", "failed", "canceled"]
} as const;
const externalSchema = {
  type: "object",
  additionalProperties: false,
  required: ["provider"],
  properties: {
    provider: { type: "string", minLength: 1, maxLength: 100 },
    pipelineId: { type: "string", maxLength: 200 },
    pipelineUrl: { type: "string", maxLength: 2000, pattern: "^https?://" }
  }
} as const;
function automationJobBodySchema(required: string[]) {
  return {
    type: "object",
    additionalProperties: false,
    required,
    properties: {
      name: { type: "string", minLength: 1, maxLength: 200 },
      trigger: { type: "string", enum: ["api", "schedule", "webhook", "ci"] },
      status: jobStatusSchema,
      testPlanId: { type: "string", maxLength: 200 },
      launchId: { type: "string", maxLength: 200 },
      branch: { type: "string", maxLength: 300 },
      commitSha: { type: "string", maxLength: 128 },
      external: externalSchema
    }
  };
}
const jobListSchema = {
  tags: ["automation-jobs"],
  params: projectParams,
  querystring: {
    type: "object",
    additionalProperties: false,
    properties: {
      status: jobStatusSchema,
      testPlanId: { type: "string" },
      limit: { type: "integer", minimum: 1, maximum: 200 },
      cursor: { type: "string" }
    }
  }
};
const jobMutationSchema = { tags: ["automation-jobs"], params: projectParams };
const jobItemSchema = { tags: ["automation-jobs"], params: jobParams };
const automationJobPatchSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    status: jobStatusSchema,
    launchId: { type: "string", maxLength: 200 },
    branch: { type: "string", maxLength: 300 },
    commitSha: { type: "string", maxLength: 128 },
    external: externalSchema,
    error: { type: "string", maxLength: 2000 }
  }
};
