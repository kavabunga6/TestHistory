import type { ArtifactDescriptor } from "@testhistory/artifacts";
import {
  appendDefectMuteAuditEvent,
  appendDefectDispositionEvent,
  appendSecurityAuditEvent,
  canDispatchIntegrationDelivery,
  type ArtifactRepository,
  type AutomationJobRepository,
  type CleanupRuleRepository,
  type DefectMuteAuditEvent,
  type DefectMuteAuditRepository,
  type DefectDispositionEvent,
  type DefectDispositionRepository,
  type IntegrationDeliveryRepository,
  type Launch as DomainLaunch,
  type LaunchRepository,
  type LaunchResultRepository,
  type PersistentDefectMuteAuditEvent,
  type PersistentDefectDispositionEvent,
  type PersistentSecurityAuditEvent,
  type ProjectRepository,
  type SecurityAuditEvent,
  type SecurityAuditRepository,
  type TestCaseHistoryRepository,
  type TestCaseRepository,
  type TestPlanRepository,
  type TestHistoryRepositories,
  type UploadJobRepository,
  type UploadSessionRepository
} from "@testhistory/domain";

import {
  cleanupRuleMatchesScope,
  page,
  toApiLaunch,
  toPersistentArtifact,
  toPersistentLaunch,
  toPersistentLaunchResult,
  toPersistentProject,
  toPersistentTestCase,
  toPersistentTestCaseHistory,
  toPersistentUploadJob,
  toPersistentUploadSession,
  toUploadJob,
  toUploadSession
} from "./storeMappers.js";
import type { AppStore, Launch } from "./store.js";

export function createInMemoryRepositories(
  store: Omit<AppStore, "repositories" | "health" | "transaction">
): TestHistoryRepositories {
  const projects: ProjectRepository = {
    async list(query) {
      return page(Array.from(store.projects.values()).map(toPersistentProject), query);
    },
    async findById(id) {
      const project = store.projects.get(id);
      return project === undefined ? undefined : toPersistentProject(project);
    },
    async findByKey(key) {
      const project = Array.from(store.projects.values()).find((item) => item.key === key);
      return project === undefined ? undefined : toPersistentProject(project);
    },
    async save(project) {
      store.projects.set(project.id, {
        id: project.id,
        key: project.key,
        name: project.name,
        createdAt: project.createdAt,
        ...(project.artifactRetention !== undefined
          ? { artifactRetention: project.artifactRetention }
          : {}),
        ...(project.accessSettings !== undefined ? { accessSettings: project.accessSettings } : {})
      });
    }
  };

  const launches: LaunchRepository = {
    async listByProject(projectId, query) {
      const items = Array.from(store.launches.values())
        .map((launch) => toApiLaunch(launch))
        .filter((launch): launch is Launch => launch !== undefined)
        .filter((launch) => launch.projectId === projectId)
        .filter((launch) => query?.status === undefined || launch.status === query.status)
        .filter((launch) => query?.branch === undefined || launch.branch === query.branch)
        .map(toPersistentLaunch);
      return page(items, query);
    },
    async findById(id) {
      const launch = store.launches.get(id);
      return launch === undefined ? undefined : toPersistentLaunch(toApiLaunch(launch));
    },
    async save(launch) {
      const existing = store.launches.get(launch.id) as Launch | undefined;
      store.launches.set(launch.id, {
        ...launch,
        results: existing?.results ?? []
      } as unknown as DomainLaunch);
    },
    async deleteById(id) {
      store.launches.delete(id);
    }
  };

  const launchResults: LaunchResultRepository = {
    async listByLaunch(launchId, query) {
      const launch = store.launches.get(launchId);
      if (launch === undefined) {
        return page([], query);
      }
      return page(
        toApiLaunch(launch).results.map((result) => toPersistentLaunchResult(launch, result)),
        query
      );
    },
    async findByLaunchAndUuid(launchId, resultUuid) {
      const launch = store.launches.get(launchId);
      const result = toApiLaunch(launch)?.results.find((item) => item.uuid === resultUuid);
      return launch === undefined || result === undefined
        ? undefined
        : toPersistentLaunchResult(launch, result);
    },
    async saveMany(results) {
      for (const result of results) {
        const launch = store.launches.get(result.launchId) as Launch | undefined;
        if (launch === undefined) {
          continue;
        }
        const existingIndex = launch.results.findIndex((item) => item.uuid === result.resultUuid);
        const normalized = result as unknown as DomainLaunch["results"][number];
        if (existingIndex >= 0) {
          launch.results[existingIndex] = normalized;
        } else {
          launch.results.push(normalized);
        }
      }
    }
  };

  const uploadJobs: UploadJobRepository = {
    async listByLaunch(launchId, query) {
      return page(
        Array.from(store.uploadJobs.values())
          .filter((job) => job.launchId === launchId)
          .map(toPersistentUploadJob),
        query
      );
    },
    async findById(id) {
      const job = store.uploadJobs.get(id);
      return job === undefined ? undefined : toPersistentUploadJob(job);
    },
    async claimQueued(input) {
      const jobs = Array.from(store.uploadJobs.values())
        .filter((job) => job.source?.mode === input.source)
        .filter((job) => {
          if (job.status === "queued") {
            return true;
          }

          return (
            job.status === "processing" &&
            job.lease !== undefined &&
            job.lease.expiresAt <= input.claimedAt
          );
        })
        .sort((left, right) => {
          const createdCompare = left.createdAt.localeCompare(right.createdAt);
          return createdCompare === 0 ? left.id.localeCompare(right.id) : createdCompare;
        })
        .slice(0, input.limit);

      for (const job of jobs) {
        job.status = "processing";
        job.updatedAt = input.claimedAt;
        job.lease = {
          claimedBy: input.workerId,
          claimedAt: input.claimedAt,
          expiresAt: input.leaseExpiresAt,
          claimToken: input.claimToken
        };
      }

      return {
        items: jobs.map(toPersistentUploadJob)
      };
    },
    async save(job) {
      store.uploadJobs.set(job.id, toUploadJob(job));
    }
  };

  const uploadSessions: UploadSessionRepository = {
    async listByLaunch(launchId, query) {
      return page(
        Array.from(store.uploadSessions.values())
          .filter((session) => session.launchId === launchId)
          .filter((session) => query?.status === undefined || session.status === query.status)
          .map(toPersistentUploadSession),
        query
      );
    },
    async findById(id) {
      const session = store.uploadSessions.get(id);
      return session === undefined ? undefined : toPersistentUploadSession(session);
    },
    async save(session) {
      store.uploadSessions.set(session.id, toUploadSession(session));
    }
  };

  const artifacts: ArtifactRepository = {
    async list(query) {
      return page(
        Array.from(store.artifacts.values())
          .filter(
            (artifact) => query?.launchId === undefined || artifact.launchId === query.launchId
          )
          .filter(
            (artifact) => query?.projectId === undefined || artifact.projectId === query.projectId
          )
          .filter((artifact) => query?.kind === undefined || artifact.kind === query.kind)
          .map(toPersistentArtifact),
        query
      );
    },
    async findById(id) {
      const artifact = store.artifacts.get(id);
      return artifact === undefined ? undefined : toPersistentArtifact(artifact);
    },
    async save(artifact) {
      store.artifacts.set(artifact.id, artifact as unknown as ArtifactDescriptor);
    },
    async saveMany(artifactsToSave) {
      for (const artifact of artifactsToSave) {
        store.artifacts.set(artifact.id, artifact as unknown as ArtifactDescriptor);
      }
    },
    async deleteById(id) {
      store.artifacts.delete(id);
    }
  };

  const testCases: TestCaseRepository = {
    async listByProject(projectId, query) {
      return page(
        Array.from(store.testCases.values())
          .filter((testCase) => testCase.projectId === projectId)
          .map(toPersistentTestCase),
        query
      );
    },
    async findById(projectId, id) {
      const testCase = store.testCases.get(id);
      if (testCase === undefined || testCase.projectId !== projectId) {
        return undefined;
      }
      return toPersistentTestCase(testCase);
    },
    async save(testCase) {
      const existing = store.testCases.get(testCase.id);
      if (existing !== undefined && existing.projectId !== testCase.projectId) {
        throw new Error("Test case id already exists in another project.");
      }
      store.testCases.set(testCase.id, {
        ...testCase,
        historyVersions: existing?.historyVersions ?? []
      });
    }
  };

  const testCaseHistory: TestCaseHistoryRepository = {
    async listByTestCase(testCaseId, query) {
      const testCase = store.testCases.get(testCaseId);
      return page(
        (testCase?.historyVersions ?? []).map((history) =>
          toPersistentTestCaseHistory(testCaseId, testCase?.projectId ?? "", history)
        ),
        query
      );
    },
    async saveMany(history) {
      for (const item of history) {
        const testCase = store.testCases.get(item.testCaseId);
        if (testCase === undefined) {
          continue;
        }
        if (
          testCase.historyVersions.some(
            (version) =>
              version.launchId === item.launchId && version.resultUuid === item.resultUuid
          )
        ) {
          continue;
        }
        testCase.historyVersions.push({
          launchId: item.launchId,
          resultUuid: item.resultUuid,
          status: item.status,
          seenAt: item.seenAt,
          ...(item.historyId !== undefined ? { historyId: item.historyId } : {})
        });
      }
    }
  };

  const cleanupRules: CleanupRuleRepository = {
    async listActive(query) {
      return Array.from(store.cleanupRules.values()).filter(
        (rule) =>
          rule.enabled &&
          (query?.target === undefined || rule.target === query.target) &&
          cleanupRuleMatchesScope(rule, query)
      );
    },
    async findById(id, query) {
      const rule = store.cleanupRules.get(id);
      if (rule === undefined || !cleanupRuleMatchesScope(rule, query)) {
        return undefined;
      }
      return rule;
    },
    async save(rule) {
      store.cleanupRules.set(rule.id, rule);
    }
  };

  const testPlans: TestPlanRepository = {
    async listByProject(projectId, query) {
      return page(
        Array.from(store.testPlans.values())
          .filter((plan) => plan.projectId === projectId)
          .filter((plan) => query?.status === undefined || plan.status === query.status),
        query
      );
    },
    async findById(projectId, id) {
      const plan = store.testPlans.get(id);
      return plan?.projectId === projectId ? plan : undefined;
    },
    async save(plan) {
      store.testPlans.set(plan.id, plan);
    }
  };

  const automationJobs: AutomationJobRepository = {
    async listByProject(projectId, query) {
      return page(
        Array.from(store.automationJobs.values())
          .filter((job) => job.projectId === projectId)
          .filter((job) => query?.status === undefined || job.status === query.status)
          .filter((job) => query?.testPlanId === undefined || job.testPlanId === query.testPlanId),
        query
      );
    },
    async findById(projectId, id) {
      const job = store.automationJobs.get(id);
      return job?.projectId === projectId ? job : undefined;
    },
    async save(job) {
      store.automationJobs.set(job.id, job);
    }
  };

  const integrationDeliveries: IntegrationDeliveryRepository = {
    async listByProject(projectId, query) {
      return page(
        Array.from(store.integrationDeliveries.values())
          .filter((delivery) => delivery.projectId === projectId)
          .filter((delivery) => query?.status === undefined || delivery.status === query.status)
          .filter((delivery) => query?.kind === undefined || delivery.kind === query.kind)
          .sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
        query
      );
    },
    async findById(projectId, id) {
      const delivery = store.integrationDeliveries.get(id);
      return delivery?.projectId === projectId ? delivery : undefined;
    },
    async claimDispatchable(input) {
      const deliveries = Array.from(store.integrationDeliveries.values())
        .filter((delivery) => canDispatchIntegrationDelivery(delivery, input.claimedAt))
        .sort((left, right) => {
          const time = left.nextAttemptAt.localeCompare(right.nextAttemptAt);
          return time === 0 ? left.id.localeCompare(right.id) : time;
        })
        .slice(0, input.limit);
      for (const delivery of deliveries) {
        delivery.status = "processing";
        delivery.updatedAt = input.claimedAt;
        delivery.version += 1;
        delivery.lease = {
          workerId: input.workerId,
          token: input.leaseToken,
          expiresAt: input.leaseExpiresAt
        };
      }
      return { items: deliveries };
    },
    async save(delivery) {
      store.integrationDeliveries.set(delivery.id, delivery);
    }
  };

  const defectMuteAudit: DefectMuteAuditRepository = {
    async listByProject(projectId, query) {
      return page(
        store.defectMuteAuditEvents
          .filter((event) => event.projectId === projectId)
          .filter((event) => query?.muteId === undefined || event.muteId === query.muteId)
          .map(toPersistentDefectMuteAuditEvent),
        query
      );
    },
    async findById(id) {
      const event = store.defectMuteAuditEvents.find((candidate) => candidate.id === id);
      return event === undefined ? undefined : toPersistentDefectMuteAuditEvent(event);
    },
    async append(event) {
      const nextEvents = appendDefectMuteAuditEvent(store.defectMuteAuditEvents, event);
      store.defectMuteAuditEvents.splice(0, store.defectMuteAuditEvents.length, ...nextEvents);
    }
  };

  const defectDispositions: DefectDispositionRepository = {
    async listByProject(projectId, query) {
      return page(
        store.defectDispositionEvents
          .filter((event) => event.projectId === projectId)
          .filter((event) => query?.defectId === undefined || event.defectId === query.defectId)
          .map(toPersistentDefectDispositionEvent),
        query
      );
    },
    async findById(id) {
      const event = store.defectDispositionEvents.find((candidate) => candidate.id === id);
      return event === undefined ? undefined : toPersistentDefectDispositionEvent(event);
    },
    async append(event) {
      const nextEvents = appendDefectDispositionEvent(store.defectDispositionEvents, event);
      store.defectDispositionEvents.splice(0, store.defectDispositionEvents.length, ...nextEvents);
    }
  };

  const securityAudit: SecurityAuditRepository = {
    async listByProject(projectId, query) {
      return page(
        store.securityAuditEvents
          .filter((event) => event.projectId === projectId)
          .filter((event) => query?.type === undefined || event.type === query.type)
          .map(toPersistentSecurityAuditEvent),
        query
      );
    },
    async findById(id) {
      const event = store.securityAuditEvents.find((candidate) => candidate.id === id);
      return event === undefined ? undefined : toPersistentSecurityAuditEvent(event);
    },
    async append(event) {
      const nextEvents = appendSecurityAuditEvent(store.securityAuditEvents, event);
      store.securityAuditEvents.splice(0, store.securityAuditEvents.length, ...nextEvents);
    }
  };

  return {
    projects,
    launches,
    launchResults,
    uploadJobs,
    uploadSessions,
    artifacts,
    testCases,
    testCaseHistory,
    defectMuteAudit,
    defectDispositions,
    securityAudit,
    cleanupRules,
    testPlans,
    automationJobs,
    integrationDeliveries
  };
}
function toPersistentDefectMuteAuditEvent(
  event: DefectMuteAuditEvent
): PersistentDefectMuteAuditEvent {
  return {
    ...event,
    createdAt: event.occurredAt,
    updatedAt: event.occurredAt,
    version: 1
  };
}

function toPersistentDefectDispositionEvent(
  event: DefectDispositionEvent
): PersistentDefectDispositionEvent {
  return {
    ...event,
    createdAt: event.occurredAt,
    updatedAt: event.occurredAt,
    version: 1
  };
}

function toPersistentSecurityAuditEvent(event: SecurityAuditEvent): PersistentSecurityAuditEvent {
  return {
    ...event,
    createdAt: event.occurredAt,
    updatedAt: event.occurredAt,
    version: 1
  };
}
