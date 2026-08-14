import type { ArtifactDescriptor, ArtifactObjectStorePort } from "@testhistory/artifacts";
import type { AllureStatus } from "@testhistory/contracts";
import {
  type AutomationJob,
  type DefectMuteAuditEvent,
  type DefectDispositionEvent,
  type Launch as DomainLaunch,
  type PersistentCleanupRule,
  type PersistentIntegrationDelivery,
  type Project,
  type SecurityAuditEvent,
  type TestCaseHistoryCompareExecutorInput,
  type TestHistoryPersistence,
  type TestHistoryRepositories,
  type TestPlan
} from "@testhistory/domain";
import { seedDefaultUsers } from "./storeUsers.js";
import { createMemoryArtifactObjectStore } from "./artifactObjectStore.js";
import { createInMemoryRepositories } from "./inMemoryRepositories.js";
export {
  defaultUploadFieldPolicy,
  summarizeStoredLaunch,
  syncTestCasesFromLaunch
} from "./storeTestCaseSync.js";

export type LaunchStatus = "open" | "processing" | "closed" | "failed" | "archived";

export type LaunchClosePipelineStatus = "pending_uploads" | "processing" | "closed" | "failed";

export type LaunchClosePendingUpload = {
  kind: "session" | "job";
  id: string;
  status: string;
  path?: string;
  receivedChunks?: number;
  totalChunks?: number;
  receivedFiles?: number;
  expiresAt?: string;
};

export type LaunchCloseProcessingSummary = {
  totalResults: number;
  counters: Record<AllureStatus, number>;
  uploadJobs: {
    total: number;
    queued: number;
    processing: number;
    completed: number;
    completedWithErrors: number;
    failed: number;
    receivedFiles: number;
    importedResults: number;
    duplicateResults: number;
    storedArtifacts: number;
  };
  processedTestCases: number;
};

export type LaunchClosePipeline = {
  status: LaunchClosePipelineStatus;
  requestedAt: string;
  updatedAt: string;
  startedAt?: string;
  finishedAt?: string;
  pendingUploads: LaunchClosePendingUpload[];
  summary: LaunchCloseProcessingSummary;
  processedTestCases: number;
  errors: Array<{ scope: "upload" | "close"; id?: string; path?: string; message: string }>;
};

export type LaunchResultSource = {
  path: string;
  uuid: string;
  importedAt: string;
};

export type Launch = Omit<DomainLaunch, "status"> & {
  status: LaunchStatus;
  closedAt?: string;
  archivedAt?: string;
  failedAt?: string;
  executor?: TestCaseHistoryCompareExecutorInput;
  closePipeline?: LaunchClosePipeline;
  resultSources?: Map<string, LaunchResultSource>;
};

export type UploadJob = {
  id: string;
  launchId: string;
  status: "queued" | "processing" | "completed" | "completed_with_errors" | "failed";
  receivedFiles: number;
  importedResults: number;
  duplicateResults: number;
  storedArtifacts: number;
  errors: Array<{ path: string; errors: string[]; warnings: string[] }>;
  createdAt: string;
  updatedAt: string;
  lease?: {
    claimedBy: string;
    claimedAt: string;
    expiresAt: string;
    claimToken: string;
  };
  source?: {
    mode: "chunked-session";
    sessionId: string;
    payloadAvailable: true;
  };
  archive?: {
    name?: string;
    format: "allure-results-archive-manifest";
    totalEntries: number;
    supportedFiles: number;
    attachmentFiles: number;
    ignoredFiles: number;
    totalUncompressedBytes: number;
    totalCompressedBytes: number;
    workerBoundary: "archive-unpack-planned";
    storesArchivePayload: false;
    payloadsAcceptedOnThisEndpoint: false;
  };
};

export type UploadSessionFile = {
  path: string;
  totalChunks: number;
  receivedChunks: number;
  totalBytes?: number;
  receivedBytes: number;
  chunks: Map<number, UploadChunkPayload>;
};

export type UploadChunkPayload = {
  storage: "memory" | "filesystem" | "object";
  bytes: number;
  sha256: string;
  storageKey?: string;
  buffer?: Buffer;
};

export type UploadSession = {
  id: string;
  launchId: string;
  path: string;
  status: "open" | "completing" | "completed" | "aborted" | "expired" | "failed";
  totalChunks: number;
  receivedChunks: number;
  totalBytes?: number;
  receivedBytes: number;
  chunks?: Map<number, string>;
  files: Map<string, UploadSessionFile>;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  closedAt?: string;
  cleanup?: {
    chunksClearedAt?: string;
    reason: "completed" | "aborted" | "expired" | "failed";
  };
  completedJobId?: string;
};

export type UploadPolicySource = "from_result" | "from_test_case";

export type UploadFieldName =
  | "name"
  | "layer"
  | "description"
  | "expected_result"
  | "link"
  | "tag"
  | "issue"
  | "member"
  | "custom_field";

export type TestCaseWorkflowStatus = "draft" | "active" | "deprecated" | "archived";

export type TestCaseRecord = {
  id: string;
  projectId: string;
  allureId?: string;
  name: string;
  fullName?: string;
  workflowStatus: TestCaseWorkflowStatus;
  tags: string[];
  layer?: string;
  description?: string;
  customFields: Record<string, string>;
  members: string[];
  links: Array<{ name?: string; url: string; type?: string }>;
  issues: string[];
  testKeys: string[];
  relations: string[];
  scenario?: string;
  expectedResult?: string;
  historyVersions: Array<{
    launchId: string;
    resultUuid: string;
    status: AllureStatus;
    seenAt: string;
    historyId?: string;
  }>;
  createdAt: string;
  updatedAt: string;
};

export type DashboardRecord = {
  id: string;
  projectId: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
};

export type WidgetRecord = {
  id: string;
  dashboardId: string;
  title: string;
  type: "metric" | "table" | "chart";
  query: Record<string, unknown>;
  layout?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type ThqlFilterScope = "global" | "personal" | "project";
export type ThqlFilterEntity = "defects" | "launchResults" | "launches" | "testCases";

export type ThqlSavedFilterRecord = {
  id: string;
  name: string;
  query: string;
  scope: ThqlFilterScope;
  entity: ThqlFilterEntity;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  ownerId?: string;
  projectId?: string;
  description?: string;
};

export type UserRecord = {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  role: "admin" | "user";
  status: "active" | "disabled";
  createdAt: string;
  updatedAt: string;
};

export type UserSessionRecord = {
  id: string;
  userId: string;
  tokenHash: string;
  createdAt: string;
  expiresAt: string;
  lastUsedAt?: string;
};

export type PersonalApiTokenRecord = {
  id: string;
  userId: string;
  name: string;
  prefix: string;
  fingerprint: string;
  secretHash: string;
  status: "active" | "revoked";
  scopes: string[];
  createdAt: string;
  updatedAt: string;
  expiresAt?: string;
  lastUsedAt?: string;
  revokedAt?: string;
};

export type AppStore = {
  driver: "file" | "memory" | "postgres";
  closePersistence?: (() => void) | undefined;
  projects: Map<string, Project>;
  users: Map<string, UserRecord>;
  userSessions: Map<string, UserSessionRecord>;
  personalApiTokens: Map<string, PersonalApiTokenRecord>;
  launches: Map<string, DomainLaunch>;
  testCases: Map<string, TestCaseRecord>;
  dashboards: Map<string, DashboardRecord>;
  widgets: Map<string, WidgetRecord>;
  thqlFilters: Map<string, ThqlSavedFilterRecord>;
  artifacts: Map<string, ArtifactDescriptor>;
  artifactObjects: ArtifactObjectStorePort;
  uploadJobs: Map<string, UploadJob>;
  uploadSessions: Map<string, UploadSession>;
  cleanupRules: Map<string, PersistentCleanupRule>;
  testPlans: Map<string, TestPlan>;
  automationJobs: Map<string, AutomationJob>;
  integrationDeliveries: Map<string, PersistentIntegrationDelivery>;
  defectMuteAuditEvents: DefectMuteAuditEvent[];
  defectDispositionEvents: DefectDispositionEvent[];
  securityAuditEvents: SecurityAuditEvent[];
  repositories: TestHistoryRepositories;
  health: TestHistoryPersistence["health"];
  transaction: TestHistoryPersistence["transaction"];
};

export function createAppStore(): AppStore {
  const store = {
    driver: "memory" as const,
    projects: new Map(),
    users: new Map(),
    userSessions: new Map(),
    personalApiTokens: new Map(),
    launches: new Map(),
    testCases: new Map(),
    dashboards: new Map(),
    widgets: new Map(),
    thqlFilters: new Map(),
    artifacts: new Map(),
    artifactObjects: createMemoryArtifactObjectStore(),
    uploadJobs: new Map(),
    uploadSessions: new Map(),
    cleanupRules: new Map(),
    testPlans: new Map(),
    automationJobs: new Map(),
    integrationDeliveries: new Map(),
    defectMuteAuditEvents: [],
    defectDispositionEvents: [],
    securityAuditEvents: []
  } as Omit<AppStore, "repositories" | "health" | "transaction">;
  seedDefaultUsers(store);
  const repositories = createInMemoryRepositories(store);

  return {
    ...store,
    repositories,
    health: async () => ({
      driver: "memory",
      writable: true,
      migrated: true,
      migrationVersion: "memory"
    }),
    transaction: async (work) => work(repositories)
  };
}
