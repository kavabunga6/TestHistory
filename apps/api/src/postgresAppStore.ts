import type { ArtifactDescriptor } from "@testhistory/artifacts";
import type {
  PersistentLaunch,
  PersistentLaunchResult,
  PersistentTestCase,
  PersistentTestCaseHistoryVersion,
  Launch as DomainLaunch,
  TestHistoryPersistence
} from "@testhistory/domain";
import {
  createPostgresPersistence,
  type PostgresPersistenceConfig
} from "./persistence/postgres.js";
import { createAppStore, type AppStore, type Launch, type TestCaseRecord } from "./store.js";
import { toUploadJob, toUploadSession } from "./storeMappers.js";

export async function createPostgresAppStore(config: PostgresPersistenceConfig): Promise<AppStore> {
  const persistence = await createPostgresPersistence(config);
  return hydratePostgresAppStore(persistence);
}

export async function hydratePostgresAppStore(
  persistence: TestHistoryPersistence
): Promise<AppStore> {
  const store = createAppStore();
  const projects = await persistence.repositories.projects.list();

  for (const project of projects.items) {
    store.projects.set(project.id, project);
    const [launches, testCases] = await Promise.all([
      persistence.repositories.launches.listByProject(project.id),
      persistence.repositories.testCases.listByProject(project.id)
    ]);
    for (const persistentLaunch of launches.items) {
      const [results, jobs, sessions] = await Promise.all([
        persistence.repositories.launchResults.listByLaunch(persistentLaunch.id),
        persistence.repositories.uploadJobs.listByLaunch(persistentLaunch.id),
        persistence.repositories.uploadSessions.listByLaunch(persistentLaunch.id)
      ]);
      const launch = hydrateLaunch(persistentLaunch, results.items);
      store.launches.set(launch.id, launch as unknown as DomainLaunch);
      for (const job of jobs.items) {
        store.uploadJobs.set(job.id, toUploadJob(job));
      }
      for (const session of sessions.items) {
        store.uploadSessions.set(session.id, toUploadSession(session));
      }
    }
    for (const testCase of testCases.items) {
      const history = await persistence.repositories.testCaseHistory.listByTestCase(testCase.id);
      store.testCases.set(testCase.id, hydrateTestCase(testCase, history.items));
    }
    const [muteEvents, dispositionEvents, securityEvents] = await Promise.all([
      persistence.repositories.defectMuteAudit.listByProject(project.id),
      persistence.repositories.defectDispositions.listByProject(project.id),
      persistence.repositories.securityAudit.listByProject(project.id)
    ]);
    store.defectMuteAuditEvents.push(...muteEvents.items);
    store.defectDispositionEvents.push(...dispositionEvents.items);
    store.securityAuditEvents.push(...securityEvents.items);
    const [testPlans, automationJobs, integrationDeliveries] = await Promise.all([
      persistence.repositories.testPlans.listByProject(project.id),
      persistence.repositories.automationJobs.listByProject(project.id),
      persistence.repositories.integrationDeliveries.listByProject(project.id)
    ]);
    for (const plan of testPlans.items) {
      store.testPlans.set(plan.id, plan);
    }
    for (const job of automationJobs.items) {
      store.automationJobs.set(job.id, job);
    }
    for (const delivery of integrationDeliveries.items) {
      store.integrationDeliveries.set(delivery.id, delivery);
    }
  }

  const [artifacts, cleanupRules] = await Promise.all([
    persistence.repositories.artifacts.list(),
    persistence.repositories.cleanupRules.listActive()
  ]);
  for (const artifact of artifacts.items) {
    store.artifacts.set(artifact.id, artifact as unknown as ArtifactDescriptor);
  }
  for (const rule of cleanupRules) {
    store.cleanupRules.set(rule.id, rule);
  }

  return {
    ...store,
    driver: "postgres",
    repositories: persistence.repositories,
    health: persistence.health,
    transaction: persistence.transaction,
    closePersistence: () => {
      void persistence.close?.();
    }
  };
}

function hydrateLaunch(persistent: PersistentLaunch, results: PersistentLaunchResult[]): Launch {
  const launch: Launch = {
    id: persistent.id,
    projectId: persistent.projectId,
    name: persistent.name,
    status: persistent.status,
    createdAt: persistent.createdAt,
    results: results.map(hydrateResult),
    ...(persistent.branch !== undefined ? { branch: persistent.branch } : {}),
    ...(persistent.commitSha !== undefined ? { commitSha: persistent.commitSha } : {}),
    ...(persistent.buildNumber !== undefined ? { buildNumber: persistent.buildNumber } : {}),
    ...(persistent.closedAt !== undefined ? { closedAt: persistent.closedAt } : {}),
    ...(persistent.archivedAt !== undefined ? { archivedAt: persistent.archivedAt } : {}),
    ...(persistent.failedAt !== undefined ? { failedAt: persistent.failedAt } : {})
  };
  if (persistent.closePipeline !== undefined) {
    launch.closePipeline = {
      ...persistent.closePipeline,
      pendingUploads: persistent.closePipeline.pendingUploadIds.map((id) => ({
        id,
        kind: "job",
        status: "unknown"
      })),
      summary: {
        totalResults: results.length,
        counters: { failed: 0, broken: 0, passed: 0, skipped: 0, unknown: 0 },
        uploadJobs: {
          total: 0,
          queued: 0,
          processing: 0,
          completed: 0,
          completedWithErrors: 0,
          failed: 0,
          receivedFiles: 0,
          importedResults: 0,
          duplicateResults: 0,
          storedArtifacts: 0
        },
        processedTestCases: persistent.closePipeline.processedTestCases
      }
    };
  }
  return launch;
}

function hydrateResult(result: PersistentLaunchResult): Launch["results"][number] {
  const normalized = { ...result } as Record<string, unknown>;
  for (const key of [
    "id",
    "launchId",
    "projectId",
    "resultUuid",
    "source",
    "createdAt",
    "updatedAt",
    "deletedAt",
    "version"
  ]) {
    delete normalized[key];
  }
  return normalized as Launch["results"][number];
}

function hydrateTestCase(
  testCase: PersistentTestCase,
  history: PersistentTestCaseHistoryVersion[]
): TestCaseRecord {
  return {
    id: testCase.id,
    projectId: testCase.projectId,
    name: testCase.name,
    workflowStatus: testCase.workflowStatus,
    tags: testCase.tags,
    customFields: testCase.customFields,
    members: testCase.members,
    links: testCase.links,
    issues: testCase.issues,
    testKeys: testCase.testKeys,
    relations: testCase.relations,
    historyVersions: history.map((version) => ({
      launchId: version.launchId,
      resultUuid: version.resultUuid,
      status: version.status,
      seenAt: version.seenAt,
      ...(version.historyId !== undefined ? { historyId: version.historyId } : {})
    })),
    createdAt: testCase.createdAt,
    updatedAt: testCase.updatedAt,
    ...(testCase.allureId !== undefined ? { allureId: testCase.allureId } : {}),
    ...(testCase.fullName !== undefined ? { fullName: testCase.fullName } : {}),
    ...(testCase.layer !== undefined ? { layer: testCase.layer } : {}),
    ...(testCase.description !== undefined ? { description: testCase.description } : {}),
    ...(testCase.scenario !== undefined ? { scenario: testCase.scenario } : {}),
    ...(testCase.expectedResult !== undefined ? { expectedResult: testCase.expectedResult } : {})
  };
}
