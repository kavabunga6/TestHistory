import type { RuntimeUiState } from "./apiRuntimeTypes.js";

export type ArchiveIntakeUiState = "ready" | "loading" | "error" | "denied" | "empty" | "partial";

export type ArchiveIntakeDiagnostic = {
  id: string;
  label: string;
  value: string;
  detail: string;
  state: RuntimeUiState;
};

export type ArchiveWorkerDiagnostic = ArchiveIntakeDiagnostic & {
  wip: boolean;
};

export type ArchiveReadMetadata = {
  project: string;
  actor: string;
  access: string;
  launch: string;
  readOnly: string;
  bounded: string;
};

export type ArchiveJobReadCard = {
  id: string;
  status: string;
  phase: string;
  archiveName: string;
  entries: string;
  progress: string;
  worker: string;
  diagnostics: string;
  state: RuntimeUiState;
};

export type ArchiveDiagnosticReplayFixtureCard = {
  id: string;
  name: string;
  scenario: string;
  digest: string;
  expected: string;
  replay: string;
  payload: string;
  state: RuntimeUiState;
};

export type ArchiveDiagnosticReplayFixtureEvidence = {
  state: ArchiveIntakeUiState;
  label: string;
  copy: string;
  summary: {
    fixtures: string;
    digests: string;
    entries: string;
    attempts: string;
    readOnly: string;
    payload: string;
    bounds: string;
  };
  cards: ArchiveDiagnosticReplayFixtureCard[];
  cardLimit: number;
};

export type ArchiveIntakeUiModel = {
  state: ArchiveIntakeUiState;
  label: string;
  copy: string;
  readMetadata: ArchiveReadMetadata;
  diagnostics: ArchiveIntakeDiagnostic[];
  archiveJobs: ArchiveJobReadCard[];
  workerDiagnostics: ArchiveWorkerDiagnostic[];
  workerDiagnosticLimit: number;
  fixtureEvidence: ArchiveDiagnosticReplayFixtureEvidence;
};
