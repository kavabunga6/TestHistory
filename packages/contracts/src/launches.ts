import type {
  AllureAttachment,
  AllureLink,
  AllureParameter,
  AllureResult,
  AllureStatus,
  AllureStatusDetails,
  AllureStep,
  ContentDigest,
  NormalizedTestResult,
  PageMetadataReadModel
} from "./core.js";
import type {
  ArtifactChecksumDuplicateReadModel,
  ArtifactDescriptorReadModel
} from "./artifacts.js";

export type LaunchStatus = "open" | "processing" | "closed" | "failed" | "archived";

export type LaunchClosePipelineStatus = "pending_uploads" | "processing" | "closed" | "failed";

export type LaunchResultAttachmentReadModel = AllureAttachment & {
  scope: "result" | "step";
  stepPath?: string[];
};

export type LaunchResultDetailsReadModel = {
  launchId: string;
  projectId: string;
  uuid: string;
  historyId?: string;
  testCaseId?: string;
  fullName?: string;
  name: string;
  status: AllureStatus;
  durationMs?: number;
  stage?: AllureResult["stage"];
  statusDetails?: AllureStatusDetails;
  description?: string;
  descriptionHtml?: string;
  labels: Record<string, string[]>;
  parameters: AllureParameter[];
  links: AllureLink[];
  attachments: LaunchResultAttachmentReadModel[];
  artifacts: ArtifactDescriptorReadModel[];
  checksumDuplicates: ArtifactChecksumDuplicateReadModel[];
  steps: AllureStep[];
  raw: AllureResult;
};

export type AllureResultImportDescriptor = {
  source: string;
  uuid?: string;
  historyId?: string;
  testCaseId?: string;
  fullName?: string;
  name?: string;
  status?: AllureStatus;
  start?: number;
  stop?: number;
  sizeBytes?: number;
  contentDigest?: ContentDigest;
  attachmentSources?: string[];
};

export type AllureAttachmentImportDescriptor = {
  source: string;
  name?: string;
  type?: string;
  sizeBytes?: number;
  contentDigest?: ContentDigest;
  referencedByResultUuid?: string;
};

export type AllureResultsImportDescriptor = {
  results: AllureResultImportDescriptor[];
  attachments: AllureAttachmentImportDescriptor[];
};

export type LaunchSummary = {
  id: string;
  projectId: string;
  name: string;
  status: LaunchStatus;
  counters: Record<AllureStatus, number>;
};

export type LaunchReadModel = LaunchSummary & {
  branch?: string;
  commitSha?: string;
  buildNumber?: string;
  createdAt: string;
  closedAt?: string;
  archivedAt?: string;
  failedAt?: string;
  closePipeline?: LaunchClosePipelineReadModel;
};

export type LaunchDetailsReadModel = LaunchReadModel & {
  results: NormalizedTestResult[];
  artifacts: ArtifactDescriptorReadModel[];
  checksumDuplicates: ArtifactChecksumDuplicateReadModel[];
};

export type LaunchListReadModel = {
  kind: "launch-list";
  projectId: string;
  page: PageMetadataReadModel;
  items: LaunchReadModel[];
};

export type LaunchResultSummaryReadModel = {
  uuid: string;
  resultUuid: string;
  launchId: string;
  projectId: string;
  name: string;
  status: AllureStatus;
  historyId?: string;
  testCaseId?: string;
  fullName?: string;
  durationMs?: number;
  createdAt: string;
  updatedAt: string;
  source?: {
    uploadJobId?: string;
    path: string;
    importedAt: string;
  };
};

export type LaunchResultListReadModel = {
  kind: "launch-result-list";
  launchId: string;
  projectId: string;
  page: PageMetadataReadModel;
  items: LaunchResultSummaryReadModel[];
};

export type LaunchCreateRequest = {
  name: string;
  branch?: string;
  commitSha?: string;
  buildNumber?: string;
};

export type LaunchClosePendingUploadReadModel = {
  kind: "session" | "job";
  id: string;
  status: string;
  path?: string;
  receivedChunks?: number;
  totalChunks?: number;
  receivedFiles?: number;
  expiresAt?: string;
};

export type LaunchCloseProcessingSummaryReadModel = {
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

export type LaunchClosePipelineReadModel = {
  status: LaunchClosePipelineStatus;
  requestedAt: string;
  updatedAt: string;
  startedAt?: string;
  finishedAt?: string;
  pendingUploads: LaunchClosePendingUploadReadModel[];
  summary: LaunchCloseProcessingSummaryReadModel;
  processedTestCases: number;
  errors: Array<{ scope: "upload" | "close"; id?: string; path?: string; message: string }>;
};

export type LaunchCloseResponse = LaunchSummary & {
  closedAt?: string;
  failedAt?: string;
  closePipeline?: LaunchClosePipelineReadModel;
  processingSummary?: LaunchCloseProcessingSummaryReadModel;
  processedTestCases: number;
  errors: LaunchClosePipelineReadModel["errors"];
};

export type LaunchArchiveResponse = {
  launch: LaunchReadModel;
};
