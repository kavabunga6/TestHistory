import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import {
  canTransitionAutomationJob,
  createSecurityAuditEvent,
  type AutomationJob,
  type AutomationJobStatus,
  type ProjectCiIntegration
} from "@testhistory/domain";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { AppStore } from "../store.js";
import { toPersistentProject } from "../storeMappers.js";
import { enqueueAutomationNotificationDeliveries } from "../integrationDeliveryService.js";
import {
  decryptIntegrationSecret,
  encryptIntegrationSecret,
  hasIntegrationMasterKey
} from "../integrationSecrets.js";
import {
  actorIdHeader,
  authorizeProjectMutation,
  authorizeProjectVisibilityRead
} from "./project-auth.js";
import { appendStoreSecurityAuditEvents, getProjectAccessSettings } from "./projectSettings.js";

type CiIntegrationBody = {
  name: string;
  provider: ProjectCiIntegration["provider"];
};

type CiWebhookBody = {
  eventId: string;
  pipelineId: string;
  name: string;
  status: AutomationJobStatus;
  pipelineUrl?: string;
  branch?: string;
  commitSha?: string;
  launchId?: string;
  testPlanId?: string;
};

export async function registerCiIntegrationRoutes(app: FastifyInstance, store: AppStore) {
  app.get<{ Params: { projectId: string } }>(
    "/api/v1/projects/:projectId/integrations/ci",
    { schema: { tags: ["integrations"], params: projectParams } },
    async (request, reply) => {
      const project = store.projects.get(request.params.projectId);
      if (!project) return reply.code(404).send({ message: "Project not found" });
      const denied = authorizeProjectVisibilityRead(request, project, "settings:read");
      if (denied) return reply.code(403).send(denied);
      const items = getProjectAccessSettings(project, project.createdAt).ciIntegrations ?? [];
      return { kind: "ci-integration-list", items: items.map(redactCiIntegration) };
    }
  );

  app.post<{ Params: { projectId: string }; Body: CiIntegrationBody }>(
    "/api/v1/projects/:projectId/integrations/ci",
    { schema: { tags: ["integrations"], params: projectParams, body: ciIntegrationBodySchema } },
    async (request, reply) => {
      const project = store.projects.get(request.params.projectId);
      if (!project) return reply.code(404).send({ message: "Project not found" });
      const denied = authorizeProjectMutation(
        request,
        project,
        "settings:write",
        ["owner", "maintainer"],
        "Actor role is not allowed to manage CI integrations"
      );
      if (denied) return reply.code(403).send(denied);
      if (
        request.body.provider === "github" &&
        process.env.NODE_ENV === "production" &&
        !hasIntegrationMasterKey()
      ) {
        return reply.code(503).send({
          message: "GitHub webhook HMAC requires TESTHISTORY_INTEGRATION_MASTER_KEY",
          redacted: true
        });
      }

      const now = new Date().toISOString();
      const secret = `thci_${randomBytes(32).toString("base64url")}`;
      const secretCiphertext = encryptIntegrationSecret(secret);
      const integration: ProjectCiIntegration = {
        id: crypto.randomUUID(),
        name: request.body.name.trim(),
        provider: request.body.provider,
        enabled: true,
        secretPrefix: secret.slice(0, 12),
        secretHash: hashSecret(secret),
        createdBy: actorIdHeader(request) ?? "system",
        createdAt: now,
        updatedAt: now,
        ...(secretCiphertext !== undefined ? { secretCiphertext } : {})
      };
      const settings = getProjectAccessSettings(project, now);
      project.accessSettings = {
        ...settings,
        ciIntegrations: [...(settings.ciIntegrations ?? []), integration],
        updatedAt: now
      };
      store.projects.set(project.id, project);
      if (store.driver === "postgres") {
        await store.repositories.projects.save(toPersistentProject(project));
      }
      await appendStoreSecurityAuditEvents(store, [
        createSecurityAuditEvent({
          projectId: project.id,
          type: "ci-integration.created",
          outcome: "allowed",
          occurredAt: now,
          actor: { type: "actor", actorId: actorIdHeader(request) ?? "system" },
          resource: { type: "ci-integration", id: integration.id, name: integration.name },
          request: requestContext(request)
        })
      ]);
      return reply.code(201).send({
        integration: redactCiIntegration(integration),
        secret,
        secretShownOnce: true,
        webhookUrl: `/api/v1/webhooks/ci/${integration.id}`
      });
    }
  );

  app.post<{ Params: { integrationId: string }; Body: unknown }>(
    "/api/v1/webhooks/ci/:integrationId",
    { schema: { tags: ["integrations"], params: integrationParams, body: ciWebhookBodySchema } },
    async (request, reply) => {
      const match = findCiIntegration(store, request.params.integrationId);
      if (match === undefined || !match.integration.enabled) {
        return reply.code(404).send({ message: "CI integration not found" });
      }
      const eventHint = readHeader(request.headers["x-github-delivery"]) ?? request.id;
      if (!authenticateCiWebhook(request, match.integration)) {
        await appendWebhookAudit(
          store,
          request,
          match.projectId,
          match.integration,
          "ci-webhook.denied",
          "denied",
          eventHint
        );
        return reply.code(401).send({ message: "Webhook token is invalid", redacted: true });
      }
      const body = normalizeCiWebhook(
        match.integration.provider,
        request.body,
        request.headers,
        request.id
      );
      if (typeof body === "string") return reply.code(400).send({ message: body, redacted: true });
      const invalidBody = validateNormalizedCiWebhook(body);
      if (invalidBody !== undefined) {
        return reply.code(400).send({ message: invalidBody, redacted: true });
      }
      if (
        body.launchId !== undefined &&
        store.launches.get(body.launchId)?.projectId !== match.projectId
      ) {
        return reply.code(400).send({ message: "Launch does not belong to integration project" });
      }
      if (
        body.testPlanId !== undefined &&
        !(await store.repositories.testPlans.findById(match.projectId, body.testPlanId))
      ) {
        return reply
          .code(400)
          .send({ message: "Test plan does not belong to integration project" });
      }

      const id = webhookAutomationJobId(match.integration.id, body.pipelineId);
      const existing = await store.repositories.automationJobs.findById(match.projectId, id);
      if (existing !== undefined && !canTransitionAutomationJob(existing.status, body.status)) {
        return { job: existing, idempotent: true, ignoredStatus: body.status };
      }
      const now = new Date().toISOString();
      const job: AutomationJob = {
        id,
        projectId: match.projectId,
        name: body.name.trim(),
        status: body.status,
        trigger: "webhook",
        requestedBy: `ci:${match.integration.id}`,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
        version: (existing?.version ?? 0) + 1,
        external: {
          provider: match.integration.provider,
          pipelineId: body.pipelineId,
          ...(body.pipelineUrl !== undefined
            ? { pipelineUrl: body.pipelineUrl }
            : existing?.external?.pipelineUrl !== undefined
              ? { pipelineUrl: existing.external.pipelineUrl }
              : {})
        },
        ...optionalWebhookFields(existing, body)
      };
      if (job.status === "running") job.startedAt = existing?.startedAt ?? now;
      if (["succeeded", "failed", "canceled"].includes(job.status)) {
        job.startedAt = existing?.startedAt ?? now;
        job.finishedAt = now;
      }
      await store.repositories.automationJobs.save(job);
      store.automationJobs.set(job.id, job);
      await appendWebhookAudit(
        store,
        request,
        match.projectId,
        match.integration,
        "ci-webhook.accepted",
        "allowed",
        body.eventId,
        job.id
      );
      if (existing?.status !== job.status) {
        await enqueueAutomationNotificationDeliveries(store, job);
      }
      return reply
        .code(existing === undefined ? 201 : 200)
        .send({ job, idempotent: existing?.status === job.status });
    }
  );
}

function optionalWebhookFields(
  existing: AutomationJob | undefined,
  body: CiWebhookBody
): Partial<AutomationJob> {
  return {
    ...(body.testPlanId !== undefined
      ? { testPlanId: body.testPlanId }
      : existing?.testPlanId !== undefined
        ? { testPlanId: existing.testPlanId }
        : {}),
    ...(body.launchId !== undefined
      ? { launchId: body.launchId }
      : existing?.launchId !== undefined
        ? { launchId: existing.launchId }
        : {}),
    ...(body.branch !== undefined
      ? { branch: body.branch }
      : existing?.branch !== undefined
        ? { branch: existing.branch }
        : {}),
    ...(body.commitSha !== undefined
      ? { commitSha: body.commitSha }
      : existing?.commitSha !== undefined
        ? { commitSha: existing.commitSha }
        : {})
  };
}

function findCiIntegration(store: AppStore, integrationId: string) {
  for (const project of store.projects.values()) {
    const integration = project.accessSettings?.ciIntegrations?.find(
      (item) => item.id === integrationId
    );
    if (integration !== undefined) return { projectId: project.id, integration };
  }
  return undefined;
}

function redactCiIntegration(integration: ProjectCiIntegration) {
  const safe = { ...integration } as Partial<ProjectCiIntegration>;
  delete safe.secretHash;
  delete safe.secretCiphertext;
  return safe;
}

async function appendWebhookAudit(
  store: AppStore,
  request: FastifyRequest,
  projectId: string,
  integration: ProjectCiIntegration,
  type: "ci-webhook.accepted" | "ci-webhook.denied",
  outcome: "allowed" | "denied",
  eventId: string,
  jobId?: string
) {
  await appendStoreSecurityAuditEvents(store, [
    createSecurityAuditEvent({
      projectId,
      type,
      outcome,
      occurredAt: new Date().toISOString(),
      actor: { type: "service", serviceId: `ci:${integration.id}` },
      resource: { type: "ci-webhook", id: eventId },
      request: requestContext(request),
      metadata: { provider: integration.provider, ...(jobId !== undefined ? { jobId } : {}) }
    })
  ]);
}

function requestContext(request: FastifyRequest) {
  return {
    method: request.method,
    requestId: request.id,
    ...(request.routeOptions.url !== undefined ? { route: request.routeOptions.url } : {})
  };
}
function webhookAutomationJobId(integrationId: string, pipelineId: string) {
  return `automation:${createHash("sha256").update(`${integrationId}\0${pipelineId}`).digest("hex")}`;
}
function hashSecret(secret: string) {
  return createHash("sha256").update(secret).digest("hex");
}
function safeHashEquals(left: string, right: string) {
  const a = Buffer.from(left, "hex");
  const b = Buffer.from(right, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}
function readHeader(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function authenticateCiWebhook(
  request: FastifyRequest,
  integration: ProjectCiIntegration
): boolean {
  const token =
    readHeader(request.headers["x-testhistory-webhook-token"]) ??
    readHeader(request.headers["x-gitlab-token"]);
  if (token !== undefined && safeHashEquals(integration.secretHash, hashSecret(token))) return true;
  if (integration.provider !== "github" || integration.secretCiphertext === undefined) return false;
  const signature = readHeader(request.headers["x-hub-signature-256"]);
  const rawBody = (request as typeof request & { rawBody?: string }).rawBody;
  const secret = decryptIntegrationSecret(integration.secretCiphertext);
  if (signature === undefined || rawBody === undefined || secret === undefined) return false;
  const expected = `sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`;
  return safeTextEquals(signature, expected);
}

function normalizeCiWebhook(
  provider: ProjectCiIntegration["provider"],
  input: unknown,
  headers: FastifyRequest["headers"],
  requestId: string
): CiWebhookBody | string {
  if (!isRecord(input)) return "CI webhook body must be an object";
  if (isGenericCiWebhook(input)) {
    const pipelineUrl = optionalHttpsUrl(input.pipelineUrl);
    if (input.pipelineUrl !== undefined && pipelineUrl === undefined)
      return "pipelineUrl must use https";
    return {
      eventId: input.eventId,
      pipelineId: input.pipelineId,
      name: input.name,
      status: input.status,
      ...(pipelineUrl !== undefined ? { pipelineUrl } : {}),
      ...copyOptionalStrings(input, ["branch", "commitSha", "launchId", "testPlanId"])
    };
  }
  if (provider === "gitlab") return normalizeGitLabPipeline(input, headers, requestId);
  if (provider === "github") return normalizeGitHubWorkflowRun(input, headers, requestId);
  return "Provider webhook payload is not supported";
}

function normalizeGitLabPipeline(
  input: Record<string, unknown>,
  headers: FastifyRequest["headers"],
  requestId: string
): CiWebhookBody | string {
  const attributes = isRecord(input.object_attributes) ? input.object_attributes : undefined;
  if (input.object_kind !== "pipeline" || attributes === undefined)
    return "GitLab pipeline payload is invalid";
  const pipelineId = stringOrNumber(attributes.id);
  const status = mapProviderStatus(attributes.status);
  if (pipelineId === undefined || status === undefined)
    return "GitLab pipeline id or status is invalid";
  const project = isRecord(input.project) ? input.project : {};
  const projectName = text(project.path_with_namespace) ?? text(project.name) ?? "GitLab";
  const projectUrl = optionalHttpsUrl(project.web_url);
  return {
    eventId: readHeader(headers["x-gitlab-event-uuid"]) ?? requestId,
    pipelineId,
    name: `${projectName} #${pipelineId}`,
    status,
    ...(projectUrl !== undefined
      ? {
          pipelineUrl: `${projectUrl.replace(/\/$/, "")}/-/pipelines/${encodeURIComponent(pipelineId)}`
        }
      : {}),
    ...(text(attributes.ref) !== undefined ? { branch: text(attributes.ref)! } : {}),
    ...(text(attributes.sha) !== undefined ? { commitSha: text(attributes.sha)! } : {})
  };
}

function normalizeGitHubWorkflowRun(
  input: Record<string, unknown>,
  headers: FastifyRequest["headers"],
  requestId: string
): CiWebhookBody | string {
  const run = isRecord(input.workflow_run) ? input.workflow_run : undefined;
  if (run === undefined) return "GitHub workflow_run payload is invalid";
  const pipelineId = stringOrNumber(run.id);
  const status = mapGitHubStatus(run.status, run.conclusion);
  if (pipelineId === undefined || status === undefined)
    return "GitHub workflow id or status is invalid";
  const pipelineUrl = optionalHttpsUrl(run.html_url);
  return {
    eventId: readHeader(headers["x-github-delivery"]) ?? requestId,
    pipelineId,
    name: text(run.name) ?? `GitHub workflow #${pipelineId}`,
    status,
    ...(pipelineUrl !== undefined ? { pipelineUrl } : {}),
    ...(text(run.head_branch) !== undefined ? { branch: text(run.head_branch)! } : {}),
    ...(text(run.head_sha) !== undefined ? { commitSha: text(run.head_sha)! } : {})
  };
}

function isGenericCiWebhook(
  input: Record<string, unknown>
): input is Record<string, unknown> & CiWebhookBody {
  return (
    typeof input.eventId === "string" &&
    typeof input.pipelineId === "string" &&
    typeof input.name === "string" &&
    isAutomationStatus(input.status)
  );
}
function mapProviderStatus(value: unknown): AutomationJobStatus | undefined {
  if (typeof value !== "string") return undefined;
  if (["created", "pending", "preparing", "waiting_for_resource", "scheduled"].includes(value))
    return "queued";
  if (value === "running") return "running";
  if (value === "success" || value === "passed") return "succeeded";
  if (["failed", "failure", "timed_out"].includes(value)) return "failed";
  if (["canceled", "cancelled", "skipped"].includes(value)) return "canceled";
  return undefined;
}
function mapGitHubStatus(status: unknown, conclusion: unknown): AutomationJobStatus | undefined {
  if (status === "queued" || status === "requested" || status === "waiting") return "queued";
  if (status === "in_progress") return "running";
  if (status !== "completed") return undefined;
  if (conclusion === "success" || conclusion === "neutral") return "succeeded";
  if (conclusion === "cancelled" || conclusion === "skipped") return "canceled";
  return "failed";
}
function isAutomationStatus(value: unknown): value is AutomationJobStatus {
  return (
    typeof value === "string" &&
    ["queued", "running", "succeeded", "failed", "canceled"].includes(value)
  );
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function text(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}
function stringOrNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? String(value) : text(value);
}
function optionalHttpsUrl(value: unknown) {
  const source = text(value);
  if (source === undefined) return undefined;
  try {
    const url = new URL(source);
    return url.protocol === "https:" && !url.username && !url.password ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}
function copyOptionalStrings(
  input: Record<string, unknown>,
  keys: Array<"branch" | "commitSha" | "launchId" | "testPlanId">
): Partial<CiWebhookBody> {
  return Object.fromEntries(
    keys.flatMap((key) => (text(input[key]) === undefined ? [] : [[key, text(input[key])]]))
  );
}
function safeTextEquals(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function validateNormalizedCiWebhook(body: CiWebhookBody): string | undefined {
  const fields: Array<[keyof CiWebhookBody, number, boolean]> = [
    ["eventId", 300, true],
    ["pipelineId", 300, true],
    ["name", 300, true],
    ["pipelineUrl", 2_000, false],
    ["branch", 300, false],
    ["commitSha", 128, false],
    ["launchId", 200, false],
    ["testPlanId", 200, false]
  ];
  for (const [field, maxLength, required] of fields) {
    const value = body[field];
    if (value === undefined) {
      if (required) return `${field} is required`;
      continue;
    }
    if (typeof value !== "string" || value.trim().length === 0 || value.length > maxLength) {
      return `${field} is invalid`;
    }
  }
  return undefined;
}

const projectParams = {
  type: "object",
  required: ["projectId"],
  properties: { projectId: { type: "string", minLength: 1 } }
} as const;
const integrationParams = {
  type: "object",
  required: ["integrationId"],
  properties: { integrationId: { type: "string", minLength: 1 } }
} as const;
const ciIntegrationBodySchema = {
  type: "object",
  additionalProperties: false,
  required: ["name", "provider"],
  properties: {
    name: { type: "string", minLength: 1, maxLength: 200 },
    provider: { type: "string", enum: ["gitlab", "github", "jenkins", "teamcity", "generic"] }
  }
} as const;
const ciWebhookBodySchema = { type: "object", additionalProperties: true } as const;
