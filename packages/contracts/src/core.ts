export type AllureStatus = "failed" | "broken" | "passed" | "skipped" | "unknown";

export type AllureStatusDetails = {
  known?: boolean;
  muted?: boolean;
  flaky?: boolean;
  message?: string;
  trace?: string;
};

export type AllureAttachment = {
  name: string;
  source: string;
  type?: string;
};

export type AllureParameter = {
  name: string;
  value?: string;
  excluded?: boolean;
  mode?: "default" | "masked" | "hidden";
};

export type AllureLabel = {
  name: string;
  value: string;
};

export type AllureLink = {
  name?: string;
  url: string;
  type?: string;
};

export type AllureStep = {
  name: string;
  status?: AllureStatus;
  statusDetails?: AllureStatusDetails;
  stage?: "scheduled" | "running" | "finished" | "pending" | "interrupted";
  steps?: AllureStep[];
  attachments?: AllureAttachment[];
  parameters?: AllureParameter[];
  start?: number;
  stop?: number;
};

export type AllureResult = {
  uuid: string;
  historyId?: string;
  testCaseId?: string;
  fullName?: string;
  name: string;
  description?: string;
  descriptionHtml?: string;
  status?: AllureStatus;
  statusDetails?: AllureStatusDetails;
  stage?: "scheduled" | "running" | "finished" | "pending" | "interrupted";
  steps?: AllureStep[];
  attachments?: AllureAttachment[];
  parameters?: AllureParameter[];
  labels?: AllureLabel[];
  links?: AllureLink[];
  start?: number;
  stop?: number;
};

export type NormalizedTestResult = {
  uuid: string;
  historyId?: string;
  testCaseId?: string;
  fullName?: string;
  name: string;
  status: AllureStatus;
  durationMs?: number;
  labels: Record<string, string[]>;
  parameters: AllureParameter[];
  attachments: AllureAttachment[];
  steps: AllureStep[];
  raw: AllureResult;
};

export type ContentDigest = {
  algorithm: "sha256";
  value: string;
};

export type PageMetadataReadModel = {
  limit: number;
  cursor: string | null;
  offset: number;
  returned: number;
  total: number;
  nextCursor: string | null;
  hasMore: boolean;
};
