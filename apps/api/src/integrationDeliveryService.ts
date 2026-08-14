import { createHash, createHmac, randomUUID } from "node:crypto";
import {
  createSecurityAuditEvent,
  evaluateQualityGate,
  nextIntegrationRetryAt,
  redactSensitiveText,
  type AutomationJob,
  type IntegrationDelivery,
  type Launch as DomainLaunch,
  type OutboundIntegrationEvent,
  type PersistentIntegrationDelivery,
  type ProjectIssueTrackerIntegration,
  type ProjectNotificationIntegration,
  type SecurityAuditActor
} from "@testhistory/domain";
import type { AppStore, Launch } from "./store.js";
import { assertSafeOutboundDestination, parseSafeOutboundUrl } from "./outboundHttpSecurity.js";
import {
  appendStoreSecurityAuditEvents,
  getProjectAccessSettings
} from "./routes/projectSettings.js";

export type IntegrationFetch = typeof fetch;

export async function enqueueAutomationNotificationDeliveries(
  store: AppStore,
  job: AutomationJob
): Promise<PersistentIntegrationDelivery[]> {
  const event = automationEvent(job.status);
  if (event === undefined) return [];
  return enqueueNotificationDeliveries({
    store,
    projectId: job.projectId,
    event,
    sourceId: job.id,
    payload: {
      event,
      projectId: job.projectId,
      job: {
        id: job.id,
        name: job.name,
        status: job.status,
        ...(job.launchId !== undefined ? { launchId: job.launchId } : {}),
        ...(job.testPlanId !== undefined ? { testPlanId: job.testPlanId } : {}),
        ...(job.external !== undefined ? { external: job.external } : {})
      }
    },
    actor: { type: "service", serviceId: `ci:${job.requestedBy}` }
  });
}

export async function enqueueNotificationDeliveries(input: {
  store: AppStore;
  projectId: string;
  event: OutboundIntegrationEvent;
  sourceId: string;
  payload: Record<string, unknown>;
  actor: SecurityAuditActor;
}): Promise<PersistentIntegrationDelivery[]> {
  const { store } = input;
  const project = store.projects.get(input.projectId);
  if (project === undefined) return [];
  const integrations =
    getProjectAccessSettings(project, project.createdAt).notificationIntegrations ?? [];
  const deliveries: PersistentIntegrationDelivery[] = [];
  for (const integration of integrations) {
    if (!integration.enabled || !integration.events.includes(input.event)) continue;
    const delivery = newDelivery({
      id: deterministicDeliveryId(integration.id, input.event, input.sourceId),
      projectId: input.projectId,
      integrationId: integration.id,
      kind: "notification",
      event: input.event,
      payload: input.payload
    });
    const existing = await store.repositories.integrationDeliveries.findById(
      input.projectId,
      delivery.id
    );
    if (existing !== undefined) continue;
    await saveDelivery(store, delivery);
    deliveries.push(delivery);
  }
  if (deliveries.length > 0) {
    await auditDeliveries(store, deliveries, "integration-delivery.queued", "allowed", input.actor);
  }
  return deliveries;
}

export async function enqueueLaunchNotifications(
  store: AppStore,
  launch: Launch,
  actor: SecurityAuditActor
): Promise<PersistentIntegrationDelivery[]> {
  if (launch.status !== "closed" && launch.status !== "failed") return [];
  const event = launch.status === "failed" ? "launch.failed" : "launch.closed";
  const deliveries = await enqueueNotificationDeliveries({
    store,
    projectId: launch.projectId,
    event,
    sourceId: launch.id,
    payload: {
      event,
      projectId: launch.projectId,
      launch: {
        id: launch.id,
        name: launch.name,
        status: launch.status,
        resultCount: launch.results.length
      }
    },
    actor
  });
  if (launch.status === "closed") {
    const gate = evaluateQualityGate(launch as DomainLaunch);
    if (gate.status === "failed") {
      deliveries.push(
        ...(await enqueueNotificationDeliveries({
          store,
          projectId: launch.projectId,
          event: "quality-gate.failed",
          sourceId: launch.id,
          payload: {
            event: "quality-gate.failed",
            projectId: launch.projectId,
            launch: { id: launch.id, name: launch.name },
            qualityGate: { status: gate.status, score: gate.score, metrics: gate.metrics }
          },
          actor
        }))
      );
    }
  }
  return deliveries;
}

export async function enqueueIssueDelivery(input: {
  store: AppStore;
  projectId: string;
  integrationId: string;
  summary: string;
  description?: string;
  labels?: string[];
  actor: SecurityAuditActor;
}): Promise<PersistentIntegrationDelivery> {
  const delivery = newDelivery({
    id: `delivery:${randomUUID()}`,
    projectId: input.projectId,
    integrationId: input.integrationId,
    kind: "issue",
    event: "issue.create",
    payload: {
      summary: input.summary.trim(),
      ...(input.description !== undefined ? { description: input.description.trim() } : {}),
      ...(input.labels !== undefined ? { labels: input.labels } : {})
    }
  });
  await saveDelivery(input.store, delivery);
  await auditDeliveries(
    input.store,
    [delivery],
    "integration-delivery.queued",
    "allowed",
    input.actor
  );
  return delivery;
}

export async function dispatchIntegrationDelivery(
  store: AppStore,
  delivery: PersistentIntegrationDelivery,
  options: { fetch?: IntegrationFetch; env?: NodeJS.ProcessEnv } = {}
): Promise<PersistentIntegrationDelivery> {
  const env = options.env ?? process.env;
  const fetchImpl = options.fetch ?? fetch;
  const project = store.projects.get(delivery.projectId);
  if (project === undefined) return failDelivery(store, delivery, "Project not found", undefined);
  const settings = getProjectAccessSettings(project, project.createdAt);
  const integration =
    delivery.kind === "notification"
      ? settings.notificationIntegrations?.find((item) => item.id === delivery.integrationId)
      : settings.issueTrackerIntegrations?.find((item) => item.id === delivery.integrationId);
  if (integration === undefined || !integration.enabled) {
    return failDelivery(store, delivery, "Integration is missing or disabled", undefined);
  }

  try {
    const request =
      delivery.kind === "notification"
        ? notificationRequest(integration as ProjectNotificationIntegration, delivery, env)
        : issueRequest(integration as ProjectIssueTrackerIntegration, delivery, env);
    await assertSafeOutboundDestination(request.url, env);
    const response = await fetchImpl(request.url, {
      method: "POST",
      headers: request.headers,
      body: JSON.stringify(request.body),
      redirect: "error",
      signal: AbortSignal.timeout(10_000)
    });
    const responseText = await readLimitedResponseText(response, 65_536);
    if (!response.ok) {
      return failDelivery(
        store,
        delivery,
        `Provider returned HTTP ${response.status}`,
        response.status
      );
    }
    const now = new Date().toISOString();
    delivery.status = "delivered";
    delivery.attempts += 1;
    delivery.updatedAt = now;
    delivery.deliveredAt = now;
    delivery.responseStatus = response.status;
    delivery.version += 1;
    delivery.externalReference =
      parseExternalReference(responseText, integration.provider) ?? request.url.toString();
    delete delivery.lastError;
    delete delivery.lease;
    await saveDelivery(store, delivery);
    await auditDeliveries(store, [delivery], "integration-delivery.delivered", "allowed", {
      type: "system",
      systemId: "integration-dispatcher"
    });
    return delivery;
  } catch (error) {
    return failDelivery(
      store,
      delivery,
      error instanceof Error ? error.message : "Delivery failed",
      undefined
    );
  }
}

export async function claimAndDispatchIntegrationDeliveries(input: {
  store: AppStore;
  workerId: string;
  limit: number;
  fetch?: IntegrationFetch;
  env?: NodeJS.ProcessEnv;
}): Promise<PersistentIntegrationDelivery[]> {
  const now = new Date().toISOString();
  const claimed = await input.store.repositories.integrationDeliveries.claimDispatchable({
    limit: input.limit,
    workerId: input.workerId,
    claimedAt: now,
    leaseExpiresAt: new Date(Date.parse(now) + 30_000).toISOString(),
    leaseToken: randomUUID()
  });
  for (const delivery of claimed.items)
    input.store.integrationDeliveries.set(delivery.id, delivery);
  return Promise.all(
    claimed.items.map((delivery) => dispatchIntegrationDelivery(input.store, delivery, input))
  );
}

function notificationRequest(
  integration: ProjectNotificationIntegration,
  delivery: PersistentIntegrationDelivery,
  env: NodeJS.ProcessEnv
) {
  const url = parseSafeOutboundUrl(integration.endpointUrl, env);
  const body =
    integration.provider === "slack"
      ? { text: notificationText(delivery) }
      : integration.provider === "teams"
        ? { type: "message", text: notificationText(delivery) }
        : integration.provider === "pachca"
          ? { message: notificationText(delivery) }
          : delivery.payload;
  const canonicalBody = JSON.stringify(body);
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "user-agent": "TestHistory-Integrations/1.0",
    "x-testhistory-delivery": delivery.id,
    "x-testhistory-event": delivery.event
  };
  if (integration.secretEnvVar !== undefined) {
    const secret = env[integration.secretEnvVar];
    if (secret === undefined || secret.length < 16)
      throw new Error("Notification signing secret is not configured");
    headers["x-testhistory-signature"] =
      `sha256=${createHmac("sha256", secret).update(canonicalBody).digest("hex")}`;
  }
  return { url, headers, body };
}

function issueRequest(
  integration: ProjectIssueTrackerIntegration,
  delivery: PersistentIntegrationDelivery,
  env: NodeJS.ProcessEnv
) {
  const credential = env[integration.credentialEnvVar];
  if (credential === undefined || credential.length < 8)
    throw new Error("Issue tracker credential is not configured");
  const base = parseSafeOutboundUrl(integration.baseUrl, env);
  const payload = delivery.payload as { summary: string; description?: string; labels?: string[] };
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "user-agent": "TestHistory-Integrations/1.0",
    authorization: /^(?:Bearer|Basic)\s/i.test(credential) ? credential : `Bearer ${credential}`
  };
  if (integration.provider === "github") {
    const url = new URL(`/repos/${integration.projectKey}/issues`, base);
    headers.accept = "application/vnd.github+json";
    headers["x-github-api-version"] = "2022-11-28";
    return {
      url,
      headers,
      body: {
        title: payload.summary,
        body: payload.description ?? "",
        labels: payload.labels ?? []
      }
    };
  }
  if (integration.provider === "jira") {
    const url = new URL("rest/api/3/issue", ensureTrailingSlash(base));
    return {
      url,
      headers,
      body: {
        fields: {
          project: { key: integration.projectKey },
          summary: payload.summary,
          description: payload.description ?? "",
          issuetype: { name: "Bug" },
          labels: payload.labels ?? []
        }
      }
    };
  }
  if (integration.provider === "youtrack") {
    const url = new URL("api/issues?fields=id,idReadable,summary", ensureTrailingSlash(base));
    return {
      url,
      headers,
      body: {
        project: { id: integration.projectKey },
        summary: payload.summary,
        description: payload.description ?? ""
      }
    };
  }
  return { url: base, headers, body: { projectKey: integration.projectKey, ...payload } };
}

async function failDelivery(
  store: AppStore,
  delivery: PersistentIntegrationDelivery,
  message: string,
  responseStatus: number | undefined
) {
  const now = new Date().toISOString();
  delivery.attempts += 1;
  delivery.updatedAt = now;
  delivery.version += 1;
  delivery.status = delivery.attempts >= delivery.maxAttempts ? "dead" : "retrying";
  delivery.nextAttemptAt = nextIntegrationRetryAt(now, delivery.attempts);
  delivery.lastError = redactSensitiveText(message).slice(0, 500);
  if (responseStatus !== undefined) delivery.responseStatus = responseStatus;
  delete delivery.lease;
  await saveDelivery(store, delivery);
  await auditDeliveries(store, [delivery], "integration-delivery.failed", "failed", {
    type: "system",
    systemId: "integration-dispatcher"
  });
  return delivery;
}

function newDelivery(
  input: Pick<
    IntegrationDelivery,
    "id" | "projectId" | "integrationId" | "kind" | "event" | "payload"
  >
): PersistentIntegrationDelivery {
  const now = new Date().toISOString();
  return {
    ...input,
    status: "pending",
    attempts: 0,
    maxAttempts: 5,
    nextAttemptAt: now,
    createdAt: now,
    updatedAt: now,
    version: 1
  };
}

async function saveDelivery(store: AppStore, delivery: PersistentIntegrationDelivery) {
  await store.repositories.integrationDeliveries.save(delivery);
  store.integrationDeliveries.set(delivery.id, delivery);
}

async function auditDeliveries(
  store: AppStore,
  deliveries: PersistentIntegrationDelivery[],
  type:
    | "integration-delivery.queued"
    | "integration-delivery.delivered"
    | "integration-delivery.failed",
  outcome: "allowed" | "failed",
  actor: SecurityAuditActor
) {
  const occurredAt = new Date().toISOString();
  await appendStoreSecurityAuditEvents(
    store,
    deliveries.map((delivery) =>
      createSecurityAuditEvent({
        projectId: delivery.projectId,
        type,
        outcome,
        occurredAt,
        actor,
        resource: { type: "integration-delivery", id: delivery.id },
        metadata: {
          integrationId: delivery.integrationId,
          kind: delivery.kind,
          event: delivery.event,
          attempts: delivery.attempts
        }
      })
    )
  );
}

function automationEvent(status: AutomationJob["status"]): OutboundIntegrationEvent | undefined {
  return status === "succeeded" || status === "failed" || status === "canceled"
    ? `automation-job.${status}`
    : undefined;
}
function deterministicDeliveryId(integrationId: string, event: string, sourceId: string) {
  return `delivery:${createHash("sha256").update(`${integrationId}\0${event}\0${sourceId}`).digest("hex")}`;
}
function notificationText(delivery: PersistentIntegrationDelivery) {
  const job = delivery.payload.job as { name?: string; status?: string } | undefined;
  return `[TestHistory] ${job?.name ?? delivery.event}: ${job?.status ?? delivery.event}`;
}
function ensureTrailingSlash(url: URL) {
  return url.href.endsWith("/") ? url : new URL(`${url.href}/`);
}
function parseExternalReference(text: string, provider: string): string | undefined {
  if (text.length === 0) return undefined;
  try {
    const body = JSON.parse(text) as Record<string, unknown>;
    const value =
      provider === "jira"
        ? body.key
        : provider === "youtrack"
          ? (body.idReadable ?? body.id)
          : provider === "github"
            ? (body.html_url ?? body.number)
            : (body.url ?? body.id);
    return typeof value === "string" || typeof value === "number" ? String(value) : undefined;
  } catch {
    return undefined;
  }
}

async function readLimitedResponseText(response: Response, maxBytes: number): Promise<string> {
  if (response.body === null) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (bytes < maxBytes) {
      const next = await reader.read();
      if (next.done) break;
      const remaining = maxBytes - bytes;
      const chunk = next.value.byteLength > remaining ? next.value.slice(0, remaining) : next.value;
      chunks.push(chunk);
      bytes += chunk.byteLength;
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  const merged = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(merged);
}
