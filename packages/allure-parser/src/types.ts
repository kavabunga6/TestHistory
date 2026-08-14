import type {
  AllureAttachment,
  AllureParameter,
  AllureResult,
  AllureStatus,
  AllureStatusDetails,
  NormalizedTestResult
} from "@testhistory/contracts";

export type ParseResult<T> =
  { ok: true; value: T; warnings: string[] } | { ok: false; errors: string[]; warnings: string[] };

export type AllureFixture = Record<string, unknown> & {
  name?: string;
  status?: AllureStatus;
  statusDetails?: AllureStatusDetails;
  stage?: string;
  steps?: AllureFixture[];
  attachments?: AllureAttachment[];
  parameters?: AllureParameter[];
  start?: number;
  stop?: number;
};

export type AllureContainer = Record<string, unknown> & {
  uuid: string;
  name?: string;
  children?: string[];
  befores?: AllureFixture[];
  afters?: AllureFixture[];
  start?: number;
  stop?: number;
};

export type AllureEnvironment = Record<string, string>;
export type AllureExecutor = Record<string, unknown>;
export type AllureCategory = Record<string, unknown> & {
  name?: string;
  matchedStatuses?: string[];
  messageRegex?: string;
  traceRegex?: string;
  flaky?: boolean;
};
export type AllureHistoryFile = Record<string, unknown> | Record<string, unknown>[];

export type AllureCompatibilityFile =
  | { kind: "result"; path: string; value: AllureResult }
  | { kind: "container"; path: string; value: AllureContainer }
  | { kind: "environment"; path: string; value: AllureEnvironment }
  | { kind: "executor"; path: string; value: AllureExecutor }
  | { kind: "categories"; path: string; value: AllureCategory[] }
  | { kind: "history"; path: string; value: AllureHistoryFile };

export type AllureArchiveManifestEntryInput =
  | string
  | (Record<string, unknown> & {
      path?: unknown;
      name?: unknown;
      fileName?: unknown;
      size?: unknown;
      uncompressedSize?: unknown;
      compressedSize?: unknown;
      compressedSizeBytes?: unknown;
      directory?: unknown;
      isDirectory?: unknown;
    });

export type AllureArchiveManifestEntryKind =
  AllureCompatibilityFile["kind"] | "attachment" | "unsupported";

export type AllureArchiveManifestEntry = {
  path: string;
  basename: string;
  kind: AllureArchiveManifestEntryKind;
  supported: boolean;
  ignored: boolean;
  reason?: string;
  sizeBytes?: number;
  compressedSizeBytes?: number;
};

export type AllureArchiveManifest = {
  format: "allure-results-archive-manifest";
  entries: AllureArchiveManifestEntry[];
  supportedFiles: number;
  attachmentFiles: number;
  ignoredFiles: number;
  totalUncompressedBytes: number;
  totalCompressedBytes: number;
};

export type AllureAttemptIdentitySource = "historyId" | "testCaseId" | "fullName" | "name";

export type AllureAttemptIdentity = {
  source: AllureAttemptIdentitySource;
  value: string;
};

export type AllureParameterVariantReadModel = {
  signature: string;
  parameters: AllureParameter[];
};

export type AllureAttemptReadModel = {
  attemptIndex: number;
  attemptNumber: number;
  retry: boolean;
  flaky: boolean;
  result: NormalizedTestResult;
  startedAt?: number;
  stoppedAt?: number;
  statusDetails?: AllureStatusDetails;
};

export type AllureAttemptGroupReadModel = {
  key: string;
  identity: AllureAttemptIdentity;
  parameterVariant: AllureParameterVariantReadModel;
  attempts: AllureAttemptReadModel[];
  latest: AllureAttemptReadModel;
};
