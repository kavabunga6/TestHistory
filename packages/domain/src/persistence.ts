import type {
  AllureParameter,
  AllureStatus,
  AllureStatusDetails,
  NormalizedTestResult
} from "@testhistory/contracts";
import type {
  IdentityCorrectionAuditEvent,
  IdentityCorrectionAuditKind
} from "./identity-audit.js";
import type { DefectMuteAuditEvent } from "./defect-mute-types.js";
import type { DefectDispositionEvent } from "./defect-dispositions.js";
import type { SecurityAuditEvent } from "./security-audit.js";
import type { AutomationJob, TestPlan } from "./automation.js";
import type { IntegrationDelivery } from "./integrations.js";
import type { Launch, Project } from "./index.js";

export type IsoDateTimeString = string;

export type PersistenceDriver = "file" | "memory" | "postgres";

export type PersistenceHealth = {
  driver: PersistenceDriver;
  writable: boolean;
  migrated: boolean;
  migrationVersion?: string;
};

export type RepositoryPage<T> = {
  items: T[];
  nextCursor?: string;
};

export type RepositoryListQuery = {
  limit?: number;
  cursor?: string;
};

export type PersistentRecord = {
  id: string;
  createdAt: IsoDateTimeString;
  updatedAt: IsoDateTimeString;
  deletedAt?: IsoDateTimeString;
  version: number;
};

export type LaunchStatus = "open" | "processing" | "closed" | "failed" | "archived";

export type PersistentProject = Project &
  PersistentRecord & {
    archivedAt?: IsoDateTimeString;
  };

export type PersistentLaunch = Omit<Launch, "status" | "results"> &
  PersistentRecord & {
    status: LaunchStatus;
    closedAt?: IsoDateTimeString;
    archivedAt?: IsoDateTimeString;
    failedAt?: IsoDateTimeString;
    closePipeline?: PersistentLaunchClosePipeline;
    resultCount: number;
  };

export type PersistentLaunchClosePipeline = {
  status: "pending_uploads" | "processing" | "closed" | "failed";
  requestedAt: IsoDateTimeString;
  updatedAt: IsoDateTimeString;
  startedAt?: IsoDateTimeString;
  finishedAt?: IsoDateTimeString;
  pendingUploadIds: string[];
  processedTestCases: number;
  errors: Array<{ scope: "upload" | "close"; id?: string; path?: string; message: string }>;
};

export type PersistentLaunchResult = NormalizedTestResult &
  PersistentRecord & {
    launchId: string;
    projectId: string;
    resultUuid: string;
    source?: PersistentLaunchResultSource;
  };

export type PersistentLaunchResultSource = {
  uploadJobId?: string;
  path: string;
  importedAt: IsoDateTimeString;
};

export type UploadJobStatus =
  "queued" | "processing" | "completed" | "completed_with_errors" | "failed";

export type PersistentUploadJob = PersistentRecord & {
  launchId: string;
  status: UploadJobStatus;
  receivedFiles: number;
  importedResults: number;
  duplicateResults: number;
  storedArtifacts: number;
  errors: Array<{ path: string; errors: string[]; warnings: string[] }>;
  results?: Array<{
    path: string;
    resultId: string;
    resultUrl: string;
    status: "imported" | "duplicate";
  }>;
  lease?: {
    claimedBy: string;
    claimedAt: IsoDateTimeString;
    expiresAt: IsoDateTimeString;
    claimToken: string;
  };
  source?: {
    mode: "chunked-session";
    sessionId: string;
    payloadAvailable: true;
  };
};

export type UploadSessionStatus =
  "open" | "completing" | "completed" | "aborted" | "expired" | "failed";

export type PersistentUploadSession = PersistentRecord & {
  launchId: string;
  path: string;
  status: UploadSessionStatus;
  totalChunks: number;
  receivedChunks: number;
  totalBytes?: number;
  receivedBytes: number;
  files: PersistentUploadSessionFile[];
  expiresAt: IsoDateTimeString;
  closedAt?: IsoDateTimeString;
  completedJobId?: string;
  cleanup?: PersistentCleanupEvent;
};

export type PersistentUploadSessionFile = {
  path: string;
  totalChunks: number;
  receivedChunks: number;
  totalBytes?: number;
  receivedBytes: number;
  chunks: PersistentUploadChunk[];
};

export type PersistentUploadChunk = {
  index: number;
  bytes: number;
  sha256?: string;
  objectKey?: string;
  receivedAt: IsoDateTimeString;
};

export type PersistentArtifact = PersistentRecord & {
  launchId: string;
  projectId?: string;
  path: string;
  kind: string;
  contentType?: string;
  originalBytes: number;
  storedBytes: number;
  sha256: string;
  compression: "none" | "gzip" | string;
  storageKey: string;
  storage: Record<string, unknown>;
  expiresAt: IsoDateTimeString;
  retention: Record<string, unknown>;
  cleanup: Record<string, unknown>;
  upload: Record<string, unknown>;
};

export type PersistentTestCase = PersistentRecord & {
  projectId: string;
  allureId?: string;
  name: string;
  fullName?: string;
  workflowStatus: "draft" | "active" | "deprecated" | "archived";
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
};

export type PersistentTestCaseHistoryVersion = PersistentRecord & {
  testCaseId: string;
  projectId: string;
  launchId: string;
  resultUuid: string;
  status: AllureStatus;
  seenAt: IsoDateTimeString;
  historyId?: string;
  attemptIndex?: number;
  attemptNumber?: number;
  attemptKey?: string;
  parameterVariantSignature?: string;
  parameters?: AllureParameter[];
  retry?: boolean;
  flaky?: boolean;
  startedAt?: number;
  stoppedAt?: number;
  statusDetails?: AllureStatusDetails;
};

export type PersistentIdentityCorrectionAuditEvent = IdentityCorrectionAuditEvent &
  PersistentRecord;

export type PersistentDefectMuteAuditEvent = DefectMuteAuditEvent & PersistentRecord;

export type PersistentDefectDispositionEvent = DefectDispositionEvent & PersistentRecord;

export type PersistentSecurityAuditEvent = SecurityAuditEvent & PersistentRecord;

export type PersistentTestPlan = TestPlan & PersistentRecord;

export type PersistentAutomationJob = AutomationJob & PersistentRecord;

export type PersistentIntegrationDelivery = IntegrationDelivery & PersistentRecord;

export type CleanupRuleTarget = "artifact" | "upload-session" | "launch" | "test-case-history";

export type CleanupRuleScope =
  | { type: "global" }
  | { type: "project"; projectId: string }
  | { type: "launch"; launchId: string };

export type PersistentCleanupRule = PersistentRecord & {
  target: CleanupRuleTarget;
  scope: CleanupRuleScope;
  enabled: boolean;
  selector: Record<string, unknown>;
  action: "mark_eligible" | "delete_chunks" | "delete_object" | "archive";
  graceSeconds: number;
};

export type PersistentCleanupEvent = {
  ruleId?: string;
  reason: "completed" | "aborted" | "expired" | "failed" | "retention-expired" | "manual";
  chunksClearedAt?: IsoDateTimeString;
  objectDeletedAt?: IsoDateTimeString;
  evaluatedAt?: IsoDateTimeString;
};

export type ProjectRepository = {
  list(query?: RepositoryListQuery): Promise<RepositoryPage<PersistentProject>>;
  findById(id: string): Promise<PersistentProject | undefined>;
  findByKey(key: string): Promise<PersistentProject | undefined>;
  save(project: PersistentProject): Promise<void>;
};

export type LaunchRepository = {
  listByProject(
    projectId: string,
    query?: RepositoryListQuery & { status?: LaunchStatus; branch?: string }
  ): Promise<RepositoryPage<PersistentLaunch>>;
  findById(id: string): Promise<PersistentLaunch | undefined>;
  save(launch: PersistentLaunch): Promise<void>;
  deleteById(id: string): Promise<void>;
};

export type LaunchResultRepository = {
  listByLaunch(
    launchId: string,
    query?: RepositoryListQuery
  ): Promise<RepositoryPage<PersistentLaunchResult>>;
  findByLaunchAndUuid(
    launchId: string,
    resultUuid: string
  ): Promise<PersistentLaunchResult | undefined>;
  saveMany(results: PersistentLaunchResult[]): Promise<void>;
};

export type UploadJobRepository = {
  listByLaunch(
    launchId: string,
    query?: RepositoryListQuery
  ): Promise<RepositoryPage<PersistentUploadJob>>;
  findById(id: string): Promise<PersistentUploadJob | undefined>;
  claimQueued(input: {
    source: "chunked-session";
    limit: number;
    workerId: string;
    claimedAt: IsoDateTimeString;
    leaseExpiresAt: IsoDateTimeString;
    claimToken: string;
  }): Promise<RepositoryPage<PersistentUploadJob>>;
  save(job: PersistentUploadJob): Promise<void>;
};

export type UploadSessionRepository = {
  listByLaunch(
    launchId: string,
    query?: RepositoryListQuery & { status?: UploadSessionStatus }
  ): Promise<RepositoryPage<PersistentUploadSession>>;
  findById(id: string): Promise<PersistentUploadSession | undefined>;
  save(session: PersistentUploadSession): Promise<void>;
};

export type ArtifactRepository = {
  list(
    query?: RepositoryListQuery & { launchId?: string; projectId?: string; kind?: string }
  ): Promise<RepositoryPage<PersistentArtifact>>;
  findById(id: string): Promise<PersistentArtifact | undefined>;
  save(artifact: PersistentArtifact): Promise<void>;
  saveMany(artifacts: PersistentArtifact[]): Promise<void>;
  deleteById(id: string): Promise<void>;
};

export type TestCaseRepository = {
  listByProject(
    projectId: string,
    query?: RepositoryListQuery
  ): Promise<RepositoryPage<PersistentTestCase>>;
  findById(projectId: string, id: string): Promise<PersistentTestCase | undefined>;
  save(testCase: PersistentTestCase): Promise<void>;
};

export type TestCaseHistoryRepository = {
  listByTestCase(
    testCaseId: string,
    query?: RepositoryListQuery
  ): Promise<RepositoryPage<PersistentTestCaseHistoryVersion>>;
  saveMany(history: PersistentTestCaseHistoryVersion[]): Promise<void>;
};

export type IdentityCorrectionAuditRepository = {
  listByProject(
    projectId: string,
    query?: RepositoryListQuery & {
      kind?: IdentityCorrectionAuditKind;
      beforeId?: string;
      afterId?: string;
      parameterVariantSignature?: string;
    }
  ): Promise<RepositoryPage<PersistentIdentityCorrectionAuditEvent>>;
  findByDedupeKey(dedupeKey: string): Promise<PersistentIdentityCorrectionAuditEvent | undefined>;
  saveMany(events: PersistentIdentityCorrectionAuditEvent[]): Promise<void>;
};

export type DefectMuteAuditRepository = {
  listByProject(
    projectId: string,
    query?: RepositoryListQuery & { muteId?: string }
  ): Promise<RepositoryPage<PersistentDefectMuteAuditEvent>>;
  findById(id: string): Promise<PersistentDefectMuteAuditEvent | undefined>;
  append(event: PersistentDefectMuteAuditEvent): Promise<void>;
};

export type DefectDispositionRepository = {
  listByProject(
    projectId: string,
    query?: RepositoryListQuery & { defectId?: string }
  ): Promise<RepositoryPage<PersistentDefectDispositionEvent>>;
  findById(id: string): Promise<PersistentDefectDispositionEvent | undefined>;
  append(event: PersistentDefectDispositionEvent): Promise<void>;
};

export type SecurityAuditRepository = {
  listByProject(
    projectId: string,
    query?: RepositoryListQuery & { type?: SecurityAuditEvent["type"] }
  ): Promise<RepositoryPage<PersistentSecurityAuditEvent>>;
  findById(id: string): Promise<PersistentSecurityAuditEvent | undefined>;
  append(event: PersistentSecurityAuditEvent): Promise<void>;
};

export type CleanupRuleRepository = {
  listActive(query?: {
    target?: CleanupRuleTarget;
    projectId?: string;
    launchId?: string;
  }): Promise<PersistentCleanupRule[]>;
  findById(
    id: string,
    query?: {
      projectId?: string;
      launchId?: string;
    }
  ): Promise<PersistentCleanupRule | undefined>;
  save(rule: PersistentCleanupRule): Promise<void>;
};

export type TestPlanRepository = {
  listByProject(
    projectId: string,
    query?: RepositoryListQuery & { status?: TestPlan["status"] }
  ): Promise<RepositoryPage<PersistentTestPlan>>;
  findById(projectId: string, id: string): Promise<PersistentTestPlan | undefined>;
  save(plan: PersistentTestPlan): Promise<void>;
};

export type AutomationJobRepository = {
  listByProject(
    projectId: string,
    query?: RepositoryListQuery & { status?: AutomationJob["status"]; testPlanId?: string }
  ): Promise<RepositoryPage<PersistentAutomationJob>>;
  findById(projectId: string, id: string): Promise<PersistentAutomationJob | undefined>;
  save(job: PersistentAutomationJob): Promise<void>;
};

export type IntegrationDeliveryRepository = {
  listByProject(
    projectId: string,
    query?: RepositoryListQuery & {
      status?: IntegrationDelivery["status"];
      kind?: IntegrationDelivery["kind"];
    }
  ): Promise<RepositoryPage<PersistentIntegrationDelivery>>;
  findById(projectId: string, id: string): Promise<PersistentIntegrationDelivery | undefined>;
  claimDispatchable(input: {
    limit: number;
    workerId: string;
    claimedAt: IsoDateTimeString;
    leaseExpiresAt: IsoDateTimeString;
    leaseToken: string;
  }): Promise<RepositoryPage<PersistentIntegrationDelivery>>;
  save(delivery: PersistentIntegrationDelivery): Promise<void>;
};

export type TestHistoryRepositories = {
  projects: ProjectRepository;
  launches: LaunchRepository;
  launchResults: LaunchResultRepository;
  uploadJobs: UploadJobRepository;
  uploadSessions: UploadSessionRepository;
  artifacts: ArtifactRepository;
  testCases: TestCaseRepository;
  testCaseHistory: TestCaseHistoryRepository;
  identityCorrectionAudit?: IdentityCorrectionAuditRepository;
  defectMuteAudit: DefectMuteAuditRepository;
  defectDispositions: DefectDispositionRepository;
  securityAudit: SecurityAuditRepository;
  cleanupRules: CleanupRuleRepository;
  testPlans: TestPlanRepository;
  automationJobs: AutomationJobRepository;
  integrationDeliveries: IntegrationDeliveryRepository;
};

export type TestHistoryPersistence = {
  health(): Promise<PersistenceHealth>;
  repositories: TestHistoryRepositories;
  transaction<T>(work: (repositories: TestHistoryRepositories) => Promise<T>): Promise<T>;
  close?(): Promise<void>;
};

export function sanitizePersistentAttemptParameters(
  parameters: AllureParameter[] | undefined
): AllureParameter[] {
  return (parameters ?? []).map((parameter) => {
    if (parameter.mode === "hidden") {
      const copy = { ...parameter };
      delete copy.value;
      return copy;
    }

    if (parameter.mode === "masked" && parameter.value !== undefined) {
      return { ...parameter, value: "***" };
    }

    return { ...parameter };
  });
}
