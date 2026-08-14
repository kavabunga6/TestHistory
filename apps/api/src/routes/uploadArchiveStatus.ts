import { type AppStore, type Launch, type UploadJob } from "../store.js";

import { archiveStatusAccess, paginate, redactDiagnosticText } from "./uploadArchiveAuth.js";
import { jobProgress } from "./uploadSerialization.js";
import { type ArchiveManifestDiagnostic } from "./uploadTypes.js";

export function getArchiveJobs(store: AppStore, launchId: string): UploadJob[] {
  return Array.from(store.uploadJobs.values())
    .filter((job) => job.launchId === launchId && job.archive !== undefined)
    .sort(
      (left, right) =>
        left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id)
    );
}

export function serializeArchiveUploadStatus(
  store: AppStore,
  job: UploadJob,
  diagnosticsLimit: number,
  diagnosticsOffset: number,
  actorId?: string
) {
  const launch = store.launches.get(job.launchId) as Launch | undefined;
  const diagnostics = archiveJobDiagnostics(job);
  const diagnosticsPage = paginate(diagnostics, diagnosticsLimit, diagnosticsOffset);

  return {
    kind: "archive-upload-status",
    id: job.id,
    launchId: job.launchId,
    ...(launch !== undefined ? { projectId: launch.projectId } : {}),
    status: job.status,
    phase: archiveJobPhase(job),
    progress: jobProgress(job),
    access: archiveStatusAccess(actorId),
    archive: {
      name: job.archive?.name,
      format: job.archive?.format ?? "allure-results-archive-manifest",
      totalEntries: job.archive?.totalEntries ?? job.receivedFiles,
      supportedFiles: job.archive?.supportedFiles ?? job.receivedFiles,
      attachmentFiles: job.archive?.attachmentFiles ?? 0,
      ignoredFiles: job.archive?.ignoredFiles ?? 0,
      totalUncompressedBytes: job.archive?.totalUncompressedBytes ?? 0,
      totalCompressedBytes: job.archive?.totalCompressedBytes ?? 0,
      storesArchivePayload: false,
      payloadsAcceptedOnThisEndpoint: false
    },
    worker: {
      queue: "ingestion.parse",
      boundary: job.archive?.workerBoundary ?? "archive-unpack-planned",
      retryable: job.status === "queued" || job.status === "processing" || job.status === "failed",
      persistence: "synthetic-in-memory-read-model",
      payloadsAvailable: false
    },
    diagnostics: {
      page: diagnosticsPage.metadata,
      items: diagnosticsPage.items
    },
    links: {
      self: `/api/v1/uploads/${job.id}/archive/status`,
      uploadStatus: `/api/v1/uploads/${job.id}/status`,
      launch: `/api/v1/launches/${job.launchId}`,
      ...(launch !== undefined
        ? { launchArchiveStatus: `/api/v1/launches/${launch.id}/uploads/archive/status` }
        : {})
    },
    createdAt: job.createdAt,
    updatedAt: job.updatedAt
  };
}

export function archiveJobPhase(
  job: UploadJob
): "queued" | "processing" | "completed" | "partial_success" | "failed" {
  if (job.status === "completed_with_errors") {
    return job.importedResults > 0 || job.storedArtifacts > 0 ? "partial_success" : "failed";
  }
  if (job.status === "failed") {
    return "failed";
  }
  return job.status;
}

export function archiveStatusSummary(jobs: UploadJob[]) {
  const diagnostics = jobs.flatMap(archiveJobDiagnostics);
  return {
    total: jobs.length,
    queued: jobs.filter((job) => job.status === "queued").length,
    processing: jobs.filter((job) => job.status === "processing").length,
    completed: jobs.filter((job) => job.status === "completed").length,
    completedWithErrors: jobs.filter((job) => job.status === "completed_with_errors").length,
    failed: jobs.filter((job) => job.status === "failed").length,
    acceptedEntries: jobs.reduce((total, job) => total + (job.archive?.supportedFiles ?? 0), 0),
    ignoredEntries: jobs.reduce((total, job) => total + (job.archive?.ignoredFiles ?? 0), 0),
    importedResults: jobs.reduce((total, job) => total + job.importedResults, 0),
    storedArtifacts: jobs.reduce((total, job) => total + job.storedArtifacts, 0),
    diagnostics: diagnostics.length,
    warnings: diagnostics.filter((diagnostic) => diagnostic.severity === "warning").length,
    errors: diagnostics.filter((diagnostic) => diagnostic.severity === "error").length
  };
}

export function archiveJobDiagnostics(job: UploadJob): ArchiveManifestDiagnostic[] {
  const diagnostics: ArchiveManifestDiagnostic[] = [];

  if (job.status === "queued" || job.status === "processing") {
    diagnostics.push({
      scope: "archive",
      severity: "info",
      code: "archive.worker.in_progress",
      message: `Archive worker job is ${job.status}`
    });
  }
  if (job.status === "completed") {
    diagnostics.push({
      scope: "archive",
      severity: "info",
      code: "archive.worker.completed",
      message: "Archive worker job completed"
    });
  }
  if (job.status === "completed_with_errors") {
    diagnostics.push({
      scope: "archive",
      severity: "warning",
      code: "archive.worker.partial_success",
      message: "Archive worker job completed with bounded diagnostics"
    });
  }
  if (job.status === "failed") {
    diagnostics.push({
      scope: "archive",
      severity: "error",
      code: "archive.worker.failed",
      message: "Archive worker job failed"
    });
  }

  for (const diagnostic of job.errors) {
    for (const warning of diagnostic.warnings) {
      diagnostics.push({
        scope: "entry",
        severity: "warning",
        code: "archive.entry.warning",
        message: redactDiagnosticText(warning)
      });
    }
    for (const error of diagnostic.errors) {
      diagnostics.push({
        scope: "entry",
        severity: "error",
        code: "archive.entry.error",
        message: redactDiagnosticText(error)
      });
    }
  }

  return diagnostics;
}
