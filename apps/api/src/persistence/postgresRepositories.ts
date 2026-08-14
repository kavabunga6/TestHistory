import type { TestHistoryRepositories } from "@testhistory/domain";
import type { PostgresPersistenceConfig, PostgresQueryable } from "./postgres.js";
import {
  createArtifactRepository,
  createTestCaseHistoryRepository,
  createTestCaseRepository
} from "./postgresArtifactTestCaseRepositories.js";
import {
  createCleanupRuleRepository,
  createDefectMuteAuditRepository,
  createDefectDispositionRepository,
  createIdentityCorrectionAuditRepository,
  createSecurityAuditRepository
} from "./postgresAuditCleanupRepositories.js";
import {
  createLaunchRepository,
  createLaunchResultRepository,
  createProjectRepository
} from "./postgresProjectLaunchRepositories.js";
import {
  createUploadJobRepository,
  createUploadSessionRepository
} from "./postgresUploadRepositories.js";
import {
  createAutomationJobRepository,
  createTestPlanRepository
} from "./postgresAutomationRepositories.js";
import { createIntegrationDeliveryRepository } from "./postgresIntegrationDeliveryRepository.js";

export function createPostgresRepositories(
  queryable: PostgresQueryable,
  config: PostgresPersistenceConfig
): TestHistoryRepositories {
  return {
    projects: createProjectRepository(queryable, config),
    launches: createLaunchRepository(queryable, config),
    launchResults: createLaunchResultRepository(queryable, config),
    uploadJobs: createUploadJobRepository(queryable, config),
    uploadSessions: createUploadSessionRepository(queryable, config),
    artifacts: createArtifactRepository(queryable, config),
    testCases: createTestCaseRepository(queryable, config),
    testCaseHistory: createTestCaseHistoryRepository(queryable, config),
    identityCorrectionAudit: createIdentityCorrectionAuditRepository(queryable, config),
    defectMuteAudit: createDefectMuteAuditRepository(queryable, config),
    defectDispositions: createDefectDispositionRepository(queryable, config),
    securityAudit: createSecurityAuditRepository(queryable, config),
    cleanupRules: createCleanupRuleRepository(queryable, config),
    testPlans: createTestPlanRepository(queryable, config),
    automationJobs: createAutomationJobRepository(queryable, config),
    integrationDeliveries: createIntegrationDeliveryRepository(queryable, config)
  };
}
