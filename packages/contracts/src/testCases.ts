import type {
  AllureLink,
  AllureParameter,
  AllureStatus,
  AllureStatusDetails,
  PageMetadataReadModel
} from "./core.js";

export type TestCaseWorkflowStatus = "draft" | "active" | "deprecated" | "archived";

export type TestCaseMetadataReadModel = {
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
  links: AllureLink[];
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

export type TestCaseSummaryReadModel = {
  id: string;
  name: string;
  fullName?: string;
  historyIds: string[];
  totalResults: number;
  lastStatus: AllureStatus;
  passRate: number;
  flakyScore: number;
  medianDurationMs?: number;
  p95DurationMs?: number;
  firstSeenAt?: string;
  lastSeenAt?: string;
  testCase?: TestCaseMetadataReadModel;
};

export type TestCaseDetailsReadModel = TestCaseSummaryReadModel & {
  history: TestCaseHistoryPointReadModel[];
};

export type TestCaseListReadModel = {
  kind: "test-case-list";
  projectId?: string;
  page: PageMetadataReadModel;
  items: TestCaseSummaryReadModel[];
};

export type TestCaseHistoryPageReadModel = {
  kind: "test-case-history";
  testCaseId: string;
  projectId?: string;
  identity?: {
    value: string;
    source: "testCaseId" | "fullName" | "historyId" | "name";
    confidence: "high" | "medium" | "low";
    explanation: string;
  };
  totalPoints: number;
  returnedPoints: number;
  omittedPoints: number;
  page: PageMetadataReadModel;
  points: TestCaseHistoryPointReadModel[];
};

export type TestCaseHistoryPointReadModel = {
  launchId: string;
  launchName: string;
  launchCreatedAt: string;
  resultUuid: string;
  testCaseId?: string;
  fullName?: string;
  status: AllureStatus;
  durationMs?: number;
  historyId?: string;
  identity: {
    value: string;
    source: "testCaseId" | "fullName" | "historyId" | "name";
    confidence: "high" | "medium" | "low";
    explanation: string;
  };
  attemptIndex: number;
  attemptNumber: number;
  attemptKey: string;
  parameterVariantSignature: string;
  parameters: AllureParameter[];
  retry: boolean;
  flaky: boolean;
  startedAt?: number;
  stoppedAt?: number;
  statusDetails?: AllureStatusDetails;
};

export type IdentityCorrectionAuditKind = "conservative_link" | "split" | "merge" | "correction";

export type IdentityCorrectionAuditSource =
  "testCaseId" | "fullName" | "historyId" | "name" | "heuristic" | "manual" | "migration";

export type IdentityCorrectionAuditConfidence = "high" | "medium" | "low";

export type IdentityCorrectionAuditOriginReadModel =
  | {
      type: "system";
      name: string;
    }
  | {
      type: "actor";
      actorId: string;
      displayName?: string;
    };

export type IdentityCorrectionAuditScopeReadModel = {
  launchId?: string;
  historyId?: string;
  parameterVariantSignature?: string;
};

export type IdentityCorrectionAuditEvidenceReadModel = {
  launchId?: string;
  resultUuid?: string;
  historyId?: string;
  attemptIndex?: number;
  parameterVariantSignature?: string;
};

export type IdentityCorrectionAuditRedactionRuleReadModel = {
  field:
    | "origin"
    | "reason"
    | "beforeIds"
    | "afterIds"
    | "scope.parameterVariantSignature"
    | "evidence.parameterVariantSignature";
  rule: "project-scoped" | "same-actor-only" | "mcp-safe-redacted";
  explanation: string;
};

export type IdentityCorrectionAuditReadPolicyReadModel = {
  projectIdRequired: true;
  actorOriginRequiresActorId: true;
  systemOriginProjectScoped: true;
  mutationAllowed: false;
  redactionRules: IdentityCorrectionAuditRedactionRuleReadModel[];
};

export type IdentityCorrectionAuditEventReadModel = {
  id: string;
  projectId: string;
  kind: IdentityCorrectionAuditKind;
  source: IdentityCorrectionAuditSource;
  confidence: IdentityCorrectionAuditConfidence;
  origin: IdentityCorrectionAuditOriginReadModel;
  reason: string;
  beforeIds: string[];
  afterIds: string[];
  scope?: IdentityCorrectionAuditScopeReadModel;
  evidence: IdentityCorrectionAuditEvidenceReadModel[];
  occurredAt: string;
  createdAt?: string;
  updatedAt?: string;
  version?: number;
};

export type IdentityCorrectionAuditPageReadModel = {
  kind: "identity-correction-audit";
  projectId: string;
  actorId?: string;
  originType?: "actor" | "system";
  query: {
    kind?: IdentityCorrectionAuditKind;
    beforeId?: string;
    afterId?: string;
    parameterVariantSignature?: string;
    limit: number;
    cursor: string | null;
  };
  page: PageMetadataReadModel;
  events: IdentityCorrectionAuditEventReadModel[];
  policy: IdentityCorrectionAuditReadPolicyReadModel;
};

export type TestCasePatchRequest = Partial<
  Pick<
    TestCaseMetadataReadModel,
    | "allureId"
    | "workflowStatus"
    | "tags"
    | "layer"
    | "description"
    | "customFields"
    | "members"
    | "links"
    | "issues"
    | "testKeys"
    | "relations"
    | "scenario"
    | "expectedResult"
  >
>;
