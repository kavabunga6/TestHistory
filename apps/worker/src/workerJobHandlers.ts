import {
  buildArchiveIntakeExecutionPlan,
  getArchiveIntakeManifest
} from "./workerArchiveIntake.js";
import {
  buildArchiveDiagnosticReplayPlan,
  createInMemoryArchiveDiagnosticReplayAdapter
} from "./workerArchiveDiagnosticReplay.js";
import { buildArtifactCleanupPipelinePlan } from "./workerArtifactCleanupPlanning.js";
import {
  buildArtifactPreviewGenerationPlan,
  createInMemoryArtifactPreviewDescriptorStoreAdapter,
  listArtifactPreviewSourcesFromPayload
} from "./workerArtifactPreviewGeneration.js";
import { buildArtifactPreviewRetentionEligibilityPlan } from "./workerArtifactPreviewRetention.js";
import { buildAttachmentPreviewRetentionDryRunSchedulePlan } from "./workerAttachmentPreviewRetentionSchedule.js";
import { buildAnalyticsMaterializePipelinePlan } from "./workerAnalyticsProjection.js";
import {
  buildDefectMuteProjectionPlan,
  createInMemoryDefectMuteProjectionAdapter
} from "./workerDefectMuteProjection.js";
import {
  buildLaunchClosePipelinePlan,
  buildTestCaseSyncPipelinePlan
} from "./workerHealthPipeline.js";
import { buildIngestionParseMetadataSummary } from "./workerIngestionMetadataSummary.js";
import { logJobSummary } from "./workerRuntime.js";
import { createInMemorySearchIndexProjectionAdapter } from "./workerSearchIndexProjection.js";
import type { WorkerJobHandlerMap, WorkerPipelinePorts } from "./workerTypes.js";

export function createDefaultWorkerPipelinePorts(): WorkerPipelinePorts {
  return {
    launchClose: {
      planClose: ({ job, at }) => buildLaunchClosePipelinePlan(job, at)
    },
    testCases: {
      planSync: ({ payload, at }) => buildTestCaseSyncPipelinePlan(payload, at)
    },
    analytics: {
      listProjectionResults: () => [],
      planMaterialize: ({ payload, at, results }) =>
        buildAnalyticsMaterializePipelinePlan(payload, at, results)
    },
    artifacts: {
      listRetentionArtifacts: () => [],
      listClosedLaunchIds: () => []
    },
    artifactPreviews: {
      listPreviewSources: ({ payload }) => listArtifactPreviewSourcesFromPayload(payload),
      listRetentionDescriptors: () => [],
      store: createInMemoryArtifactPreviewDescriptorStoreAdapter()
    },
    searchIndex: createInMemorySearchIndexProjectionAdapter(),
    defectMutes: createInMemoryDefectMuteProjectionAdapter(),
    archiveDiagnostics: createInMemoryArchiveDiagnosticReplayAdapter()
  };
}

export function createWorkerJobHandlers(
  ports: WorkerPipelinePorts = createDefaultWorkerPipelinePorts()
): WorkerJobHandlerMap {
  return {
    "ingestion.parse": (job, context) => {
      context.log("info", "ingestion.parse.metadata_summary", {
        jobId: job.id,
        jobName: job.name,
        traceId: job.traceId,
        ...buildIngestionParseMetadataSummary(job.payload)
      });

      const archiveManifest = getArchiveIntakeManifest(job.payload);
      if (archiveManifest !== undefined) {
        const archivePlan = buildArchiveIntakeExecutionPlan(
          job.payload,
          archiveManifest,
          context.now().toISOString()
        );

        context.log("info", "ingestion.archive_intake.execution_planned", {
          ...logJobSummary(job),
          projectId: job.payload.projectId,
          launchId: job.payload.launchId,
          boundary: archivePlan.boundary,
          consistency: archivePlan.consistency,
          transitions: archivePlan.transitions,
          chunkCount: archivePlan.chunks.length,
          plannedEntryCount: archivePlan.summary.plannedEntryCount,
          rejectedEntryCount: archivePlan.summary.rejectedEntryCount,
          unsupportedEntryCount: archivePlan.summary.unsupportedEntryCount,
          retryableEntryErrorCount: archivePlan.summary.retryableEntryErrorCount,
          diagnostics: archivePlan.diagnostics,
          summary: archivePlan.summary
        });
      }

      const previewSources = ports.artifactPreviews.listPreviewSources({ payload: job.payload });
      if (previewSources.length > 0) {
        const previewPlan = buildArtifactPreviewGenerationPlan(
          job.payload,
          context.now().toISOString(),
          previewSources
        );

        context.log("info", "artifact.preview.pipeline.planned", {
          ...logJobSummary(job),
          projectId: job.payload.projectId,
          launchId: job.payload.launchId,
          boundary: previewPlan.boundary,
          consistency: previewPlan.consistency,
          transitions: previewPlan.transitions,
          sourceArtifactCount: previewPlan.summary.sourceArtifactCount,
          descriptorCount: previewPlan.summary.descriptorCount,
          readyCount: previewPlan.summary.readyCount,
          metadataOnlyCount: previewPlan.summary.metadataOnlyCount,
          unsupportedCount: previewPlan.summary.unsupportedCount,
          retryableErrorCount: previewPlan.summary.retryableErrorCount,
          terminalErrorCount: previewPlan.summary.terminalErrorCount,
          inlinePreviewBytes: previewPlan.summary.inlinePreviewBytes,
          generationDigest: previewPlan.summary.generationDigest,
          diagnostics: previewPlan.diagnostics,
          summary: previewPlan.summary
        });

        const applyResult = ports.artifactPreviews.store.applyDescriptors({
          descriptors: previewPlan.descriptors,
          generationDigest: previewPlan.summary.generationDigest,
          at: context.now().toISOString()
        });

        context.log("info", "artifact.preview.descriptors.applied", {
          ...logJobSummary(job),
          projectId: job.payload.projectId,
          launchId: job.payload.launchId,
          adapterKind: applyResult.adapterKind,
          boundary: applyResult.boundary,
          consistency: applyResult.consistency,
          receivedDescriptorCount: applyResult.receivedDescriptorCount,
          upsertedDescriptorCount: applyResult.upsertedDescriptorCount,
          updatedDescriptorCount: applyResult.updatedDescriptorCount,
          unchangedDescriptorCount: applyResult.unchangedDescriptorCount,
          totalDescriptorCount: applyResult.totalDescriptorCount,
          generationDigest: applyResult.generationDigest,
          idempotencyKeyHash: applyResult.idempotencyKeyHash
        });
      }
    },
    "launch.close": (job, context) => {
      const plan = ports.launchClose.planClose({
        job,
        at: context.now().toISOString()
      });

      context.log("info", "launch.close.pipeline.planned", {
        ...logJobSummary(job),
        projectId: job.payload.projectId,
        launchId: job.payload.launchId,
        transitions: plan.transitions,
        childJobCount: plan.childJobs.length,
        childJobNames: plan.childJobs.map((childJob) => childJob.name),
        summary: plan.summary
      });

      for (const childJob of plan.childJobs) {
        const enqueueResult = context.enqueue(childJob);
        context.log("info", "launch.close.child_job.planned", {
          parentJobId: job.id,
          childJobId: childJob.id,
          childJobName: childJob.name,
          enqueueStatus: enqueueResult.status,
          duplicateOfJobId:
            enqueueResult.status === "duplicate" ? enqueueResult.duplicateOfJobId : undefined,
          idempotencyKeyHash: enqueueResult.idempotencyKeyHash
        });
      }
    },
    "testcase.sync": (job, context) => {
      const plan = ports.testCases.planSync({
        payload: job.payload,
        at: context.now().toISOString()
      });

      context.log("info", "testcase.sync.pipeline.planned", {
        ...logJobSummary(job),
        projectId: job.payload.projectId,
        launchId: job.payload.launchId,
        transitions: plan.transitions,
        summary: plan.summary
      });
    },
    "analytics.materialize": (job, context) => {
      const projectionResults = ports.analytics.listProjectionResults({
        payload: job.payload
      });
      const plan = ports.analytics.planMaterialize({
        payload: job.payload,
        at: context.now().toISOString(),
        results: projectionResults
      });

      context.log("info", "analytics.materialize.pipeline.planned", {
        ...logJobSummary(job),
        projectId: job.payload.projectId,
        launchId: job.payload.launchId ?? "all",
        transitions: plan.transitions,
        resultCount: projectionResults.length,
        analyticsFactCount: plan.facts.length,
        searchDocumentCount: plan.searchIndexDocuments.length,
        defectClusterCount: plan.defectClusters.length,
        summary: plan.summary
      });
      context.log("info", "search.index.pipeline.planned", {
        ...logJobSummary(job),
        parentJobName: job.name,
        projectId: job.payload.projectId,
        launchId: job.payload.launchId ?? "all",
        documentCount: plan.searchIndexDocuments.length,
        projectionDigest: plan.summary.projectionDigest,
        summary: {
          indexName: "testhistory-results",
          scope: plan.summary.scope,
          documentCount: plan.searchIndexDocuments.length,
          projectionDigest: plan.summary.projectionDigest
        }
      });
      const applyResult = ports.searchIndex.applyDocuments({
        documents: plan.searchIndexDocuments,
        projectionDigest: String(plan.summary.projectionDigest),
        at: context.now().toISOString()
      });
      context.log("info", "search.index.documents.applied", {
        ...logJobSummary(job),
        parentJobName: job.name,
        projectId: job.payload.projectId,
        launchId: job.payload.launchId ?? "all",
        adapterKind: applyResult.adapterKind,
        boundary: applyResult.boundary,
        consistency: applyResult.consistency,
        receivedDocumentCount: applyResult.receivedDocumentCount,
        upsertedDocumentCount: applyResult.upsertedDocumentCount,
        updatedDocumentCount: applyResult.updatedDocumentCount,
        unchangedDocumentCount: applyResult.unchangedDocumentCount,
        totalDocumentCount: applyResult.totalDocumentCount,
        projectionDigest: applyResult.projectionDigest,
        idempotencyKeyHash: applyResult.idempotencyKeyHash
      });
    },
    "defect.mute.project": (job, context) => {
      const plan = buildDefectMuteProjectionPlan(job.payload, context.now().toISOString());

      context.log("info", "defect.mute.projection.planned", {
        ...logJobSummary(job),
        projectId: job.payload.projectId,
        eventCount: plan.summary.eventCount,
        mutedEventCount: plan.summary.mutedEventCount,
        unmutedEventCount: plan.summary.unmutedEventCount,
        rawFailureOccurrenceCount: plan.summary.rawFailureOccurrenceCount,
        mutationBoundary: plan.summary.mutationBoundary,
        diagnostics: plan.diagnostics,
        summary: plan.summary
      });

      const applyResult = ports.defectMutes.applyEvents({
        projectId: job.payload.projectId,
        events: job.payload.events,
        projectionDigest: plan.summary.projectionDigest,
        at: context.now().toISOString()
      });

      context.log("info", "defect.mute.projection.applied", {
        ...logJobSummary(job),
        projectId: job.payload.projectId,
        adapterKind: applyResult.adapterKind,
        boundary: applyResult.boundary,
        consistency: applyResult.consistency,
        mutationBoundary: applyResult.mutationBoundary,
        receivedEventCount: applyResult.receivedEventCount,
        appendedEventCount: applyResult.appendedEventCount,
        unchangedEventCount: applyResult.unchangedEventCount,
        totalStoredEventCount: applyResult.totalStoredEventCount,
        activeMuteCount: applyResult.activeMuteCount,
        inactiveMuteCount: applyResult.inactiveMuteCount,
        rawFailureOccurrenceCount: applyResult.rawFailureOccurrenceCount,
        projectionDigest: applyResult.projectionDigest,
        idempotencyKeyHash: applyResult.idempotencyKeyHash
      });
    },
    "archive.diagnostics.replay": (job, context) => {
      const plan = buildArchiveDiagnosticReplayPlan(job.payload, context.now().toISOString());

      context.log("info", "archive.diagnostics.replay.planned", {
        ...logJobSummary(job),
        projectId: job.payload.projectId,
        launchId: job.payload.launchId,
        archiveRef: job.payload.archiveRef,
        boundary: plan.boundary,
        consistency: plan.consistency,
        transitions: plan.transitions,
        eventCount: plan.summary.eventCount,
        acceptedEventCount: plan.summary.acceptedEventCount,
        duplicateEventCount: plan.summary.duplicateEventCount,
        rejectedOpenLaunchEventCount: plan.summary.rejectedOpenLaunchEventCount,
        rejectedOutOfScopeEventCount: plan.summary.rejectedOutOfScopeEventCount,
        invalidEventCount: plan.summary.invalidEventCount,
        retryableEventCount: plan.summary.retryableEventCount,
        severityCounts: plan.summary.severityCounts,
        sourceCounts: plan.summary.sourceCounts,
        diagnostics: plan.diagnostics,
        summary: plan.summary
      });

      const applyResult = ports.archiveDiagnostics.applyEvents({
        projectId: job.payload.projectId,
        launchId: job.payload.launchId,
        archiveRef: job.payload.archiveRef,
        events: job.payload.events,
        replayDigest: plan.summary.replayDigest,
        at: context.now().toISOString()
      });

      context.log("info", "archive.diagnostics.replay.applied", {
        ...logJobSummary(job),
        projectId: job.payload.projectId,
        launchId: job.payload.launchId,
        archiveRef: job.payload.archiveRef,
        adapterKind: applyResult.adapterKind,
        boundary: applyResult.boundary,
        consistency: applyResult.consistency,
        mutationBoundary: applyResult.mutationBoundary,
        receivedEventCount: applyResult.receivedEventCount,
        appendedEventCount: applyResult.appendedEventCount,
        unchangedEventCount: applyResult.unchangedEventCount,
        totalStoredEventCount: applyResult.totalStoredEventCount,
        acceptedEventCount: applyResult.acceptedEventCount,
        rejectedOpenLaunchEventCount: applyResult.rejectedOpenLaunchEventCount,
        rejectedOutOfScopeEventCount: applyResult.rejectedOutOfScopeEventCount,
        invalidEventCount: applyResult.invalidEventCount,
        replayDigest: applyResult.replayDigest,
        idempotencyKeyHash: applyResult.idempotencyKeyHash
      });
    },
    "artifact.cleanup": (job, context) => {
      const requestedBatchSize = job.payload.batchSize;
      const currentTime = context.now();
      const cleanupCutoff = Number.isFinite(Date.parse(job.payload.before))
        ? new Date(job.payload.before)
        : currentTime;
      const artifacts = ports.artifacts.listRetentionArtifacts({ payload: job.payload });
      const closedLaunchIds = [...ports.artifacts.listClosedLaunchIds({ payload: job.payload })];
      const plan = buildArtifactCleanupPipelinePlan({
        payload: job.payload,
        artifacts,
        closedLaunchIds,
        currentTime
      });

      const previewRetentionSources = ports.artifactPreviews.listRetentionDescriptors({
        payload: job.payload
      });
      if (previewRetentionSources.length > 0) {
        const previewRetentionPlan = buildArtifactPreviewRetentionEligibilityPlan({
          sources: previewRetentionSources,
          at: cleanupCutoff.toISOString()
        });

        context.log("info", "artifact.preview.retention_eligibility.planned", {
          ...logJobSummary(job),
          projectId: job.payload.projectId ?? "all",
          boundary: previewRetentionPlan.boundary,
          consistency: previewRetentionPlan.consistency,
          transitions: previewRetentionPlan.transitions,
          sourceDescriptorCount: previewRetentionPlan.summary.sourceDescriptorCount,
          classifiedDescriptorCount: previewRetentionPlan.summary.classifiedDescriptorCount,
          cleanupEligibleDescriptorCount:
            previewRetentionPlan.summary.cleanupEligibleDescriptorCount,
          retainedDescriptorCount: previewRetentionPlan.summary.retainedDescriptorCount,
          evidenceDescriptorCount: previewRetentionPlan.summary.evidenceDescriptorCount,
          legalHoldPlaceholderCount: previewRetentionPlan.summary.legalHoldPlaceholderCount,
          invalidDescriptorCount: previewRetentionPlan.summary.invalidDescriptorCount,
          duplicateDescriptorCount: previewRetentionPlan.summary.duplicateDescriptorCount,
          omittedDiagnosticCount: previewRetentionPlan.summary.omittedDiagnosticCount,
          projectionDigest: previewRetentionPlan.summary.projectionDigest,
          diagnostics: previewRetentionPlan.diagnostics,
          summary: previewRetentionPlan.summary
        });

        if (plan.dryRun) {
          const previewRetentionSchedulePlan = buildAttachmentPreviewRetentionDryRunSchedulePlan({
            sources: previewRetentionSources,
            closedLaunchIds,
            at: cleanupCutoff.toISOString(),
            ...(requestedBatchSize !== undefined ? { batchSize: requestedBatchSize } : {})
          });

          context.log("info", "artifact.preview.retention_dry_run.scheduled", {
            ...logJobSummary(job),
            projectId: job.payload.projectId ?? "all",
            boundary: previewRetentionSchedulePlan.boundary,
            consistency: previewRetentionSchedulePlan.consistency,
            scope: previewRetentionSchedulePlan.scope,
            dryRun: previewRetentionSchedulePlan.dryRun,
            readOnly: previewRetentionSchedulePlan.readOnly,
            deletionExecution: previewRetentionSchedulePlan.deletionExecution,
            deleteRequestedCount: previewRetentionSchedulePlan.deleteRequestedCount,
            transitions: previewRetentionSchedulePlan.transitions,
            requestedBatchSize: previewRetentionSchedulePlan.requestedBatchSize,
            plannedBatchSize: previewRetentionSchedulePlan.plannedBatchSize,
            batchCount: previewRetentionSchedulePlan.batchCount,
            batches: previewRetentionSchedulePlan.batches,
            diagnostics: previewRetentionSchedulePlan.diagnostics,
            summary: previewRetentionSchedulePlan.summary
          });
        }
      }

      context.log("info", "artifact.cleanup.pipeline.planned", {
        ...logJobSummary(job),
        projectId: job.payload.projectId ?? "all",
        transitions: plan.transitions,
        dryRun: plan.dryRun,
        executionMode: plan.executionMode,
        requestedBatchSize: plan.requestedBatchSize,
        plannedBatchSize: plan.plannedBatchSize,
        scannedArtifactCount: plan.scannedArtifactCount,
        stagedCandidateCount: plan.stagedCandidateCount,
        skippedOpenLaunchRecords: plan.skippedOpenLaunchRecords,
        retainedRecordCount: plan.retainedRecordCount,
        deletionBatchCount: plan.deletionBatchCount,
        dryRunBatchCount: plan.dryRunBatchCount,
        dryRunPlanDigest: plan.dryRunPlanDigest,
        candidateCount: plan.candidateCount,
        deleteRequestedCount: plan.deleteRequestedCount,
        batches: plan.batches,
        auditRecordCount: plan.auditRecordCount,
        auditEvidence: plan.auditEvidence,
        noopReason: plan.noopReason,
        summary: plan.summary
      });
    }
  };
}
