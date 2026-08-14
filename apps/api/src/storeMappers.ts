import type { ArtifactDescriptor } from "@testhistory/artifacts";
import type {
  Launch as DomainLaunch,
  PersistentArtifact,
  PersistentCleanupRule,
  PersistentLaunch,
  PersistentLaunchResult,
  PersistentProject,
  PersistentTestCase,
  PersistentTestCaseHistoryVersion,
  PersistentUploadJob,
  PersistentUploadSession,
  Project,
  RepositoryListQuery,
  RepositoryPage
} from "@testhistory/domain";
import type {
  Launch,
  LaunchClosePipeline,
  TestCaseRecord,
  UploadJob,
  UploadSession
} from "./store.js";

export function page<T>(items: T[], query?: RepositoryListQuery): RepositoryPage<T> {
  const offset = query?.cursor === undefined ? 0 : Math.max(0, Number(query.cursor) || 0);
  const limit = query?.limit === undefined ? items.length : Math.max(1, Math.floor(query.limit));
  const window = items.slice(offset, offset + limit);
  const nextOffset = offset + window.length;

  return nextOffset < items.length
    ? { items: window, nextCursor: String(nextOffset) }
    : { items: window };
}

export function toPersistentProject(project: Project): PersistentProject {
  return {
    ...project,
    updatedAt: project.createdAt,
    version: 1
  };
}

export function toPersistentLaunch(launch: Launch): PersistentLaunch {
  return {
    id: launch.id,
    projectId: launch.projectId,
    name: launch.name,
    status: launch.status,
    ...(launch.branch !== undefined ? { branch: launch.branch } : {}),
    ...(launch.commitSha !== undefined ? { commitSha: launch.commitSha } : {}),
    ...(launch.buildNumber !== undefined ? { buildNumber: launch.buildNumber } : {}),
    createdAt: launch.createdAt,
    updatedAt:
      launch.closePipeline?.updatedAt ??
      launch.archivedAt ??
      launch.failedAt ??
      launch.closedAt ??
      launch.createdAt,
    version: 1,
    ...(launch.closedAt !== undefined ? { closedAt: launch.closedAt } : {}),
    ...(launch.archivedAt !== undefined ? { archivedAt: launch.archivedAt } : {}),
    ...(launch.failedAt !== undefined ? { failedAt: launch.failedAt } : {}),
    ...(launch.closePipeline !== undefined
      ? { closePipeline: toPersistentClosePipeline(launch.closePipeline) }
      : {}),
    resultCount: launch.results.length
  };
}

function toPersistentClosePipeline(
  pipeline: LaunchClosePipeline
): NonNullable<PersistentLaunch["closePipeline"]> {
  return {
    status: pipeline.status,
    requestedAt: pipeline.requestedAt,
    updatedAt: pipeline.updatedAt,
    ...(pipeline.startedAt !== undefined ? { startedAt: pipeline.startedAt } : {}),
    ...(pipeline.finishedAt !== undefined ? { finishedAt: pipeline.finishedAt } : {}),
    pendingUploadIds: pipeline.pendingUploads.map((upload) => upload.id),
    processedTestCases: pipeline.processedTestCases,
    errors: pipeline.errors
  };
}

export function toPersistentLaunchResult(
  launch: DomainLaunch,
  result: DomainLaunch["results"][number]
): PersistentLaunchResult {
  const apiLaunch = toApiLaunch(launch);
  const source = Array.from(apiLaunch.resultSources?.values() ?? []).find(
    (item) => item.uuid === result.uuid
  );
  return {
    ...result,
    id: `${launch.id}:${result.uuid}`,
    launchId: launch.id,
    projectId: launch.projectId,
    resultUuid: result.uuid,
    ...(source !== undefined ? { source } : {}),
    createdAt: source?.importedAt ?? launch.createdAt,
    updatedAt: source?.importedAt ?? launch.createdAt,
    version: 1
  };
}

export function toPersistentUploadJob(job: UploadJob): PersistentUploadJob {
  return {
    ...job,
    version: 1
  };
}

export function cleanupRuleMatchesScope(
  rule: PersistentCleanupRule,
  query: { projectId?: string; launchId?: string } | undefined
): boolean {
  if (rule.scope.type === "global") {
    return true;
  }
  if (rule.scope.type === "project") {
    return query?.projectId === rule.scope.projectId;
  }
  return query?.launchId === rule.scope.launchId;
}

export function toUploadJob(job: PersistentUploadJob): UploadJob {
  return {
    id: job.id,
    launchId: job.launchId,
    status: job.status,
    receivedFiles: job.receivedFiles,
    importedResults: job.importedResults,
    duplicateResults: job.duplicateResults,
    storedArtifacts: job.storedArtifacts,
    errors: job.errors,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    ...(job.lease !== undefined ? { lease: job.lease } : {}),
    ...(job.source !== undefined ? { source: job.source } : {})
  };
}

export function toPersistentUploadSession(session: UploadSession): PersistentUploadSession {
  return {
    id: session.id,
    launchId: session.launchId,
    path: session.path,
    status: session.status,
    totalChunks: session.totalChunks,
    receivedChunks: session.receivedChunks,
    ...(session.totalBytes !== undefined ? { totalBytes: session.totalBytes } : {}),
    receivedBytes: session.receivedBytes,
    files: Array.from(session.files.values()).map((file) => ({
      path: file.path,
      totalChunks: file.totalChunks,
      receivedChunks: file.receivedChunks,
      ...(file.totalBytes !== undefined ? { totalBytes: file.totalBytes } : {}),
      receivedBytes: file.receivedBytes,
      chunks: Array.from(file.chunks.entries()).map(([index, chunk]) => ({
        index,
        bytes: chunk.bytes,
        sha256: chunk.sha256,
        ...(chunk.storageKey !== undefined ? { objectKey: chunk.storageKey } : {}),
        receivedAt: session.updatedAt
      }))
    })),
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    version: 1,
    expiresAt: session.expiresAt,
    ...(session.closedAt !== undefined ? { closedAt: session.closedAt } : {}),
    ...(session.completedJobId !== undefined ? { completedJobId: session.completedJobId } : {}),
    ...(session.cleanup !== undefined ? { cleanup: session.cleanup } : {})
  };
}

export function toUploadSession(session: PersistentUploadSession): UploadSession {
  const cleanup = toUploadSessionCleanup(session.cleanup);
  return {
    id: session.id,
    launchId: session.launchId,
    path: session.path,
    status: session.status,
    totalChunks: session.totalChunks,
    receivedChunks: session.receivedChunks,
    ...(session.totalBytes !== undefined ? { totalBytes: session.totalBytes } : {}),
    receivedBytes: session.receivedBytes,
    files: new Map(
      session.files.map((file) => [
        file.path,
        {
          path: file.path,
          totalChunks: file.totalChunks,
          receivedChunks: file.receivedChunks,
          ...(file.totalBytes !== undefined ? { totalBytes: file.totalBytes } : {}),
          receivedBytes: file.receivedBytes,
          chunks: new Map(
            file.chunks.map((chunk) => [
              chunk.index,
              {
                storage: chunk.objectKey === undefined ? "memory" : "object",
                bytes: chunk.bytes,
                sha256: chunk.sha256 ?? "",
                ...(chunk.objectKey !== undefined ? { storageKey: chunk.objectKey } : {})
              }
            ])
          )
        }
      ])
    ),
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    expiresAt: session.expiresAt,
    ...(session.closedAt !== undefined ? { closedAt: session.closedAt } : {}),
    ...(cleanup !== undefined ? { cleanup } : {}),
    ...(session.completedJobId !== undefined ? { completedJobId: session.completedJobId } : {})
  };
}

function toUploadSessionCleanup(
  cleanup: PersistentUploadSession["cleanup"] | undefined
): UploadSession["cleanup"] | undefined {
  if (
    cleanup === undefined ||
    (cleanup.reason !== "completed" &&
      cleanup.reason !== "aborted" &&
      cleanup.reason !== "expired" &&
      cleanup.reason !== "failed")
  ) {
    return undefined;
  }

  return {
    reason: cleanup.reason,
    ...(cleanup.chunksClearedAt !== undefined ? { chunksClearedAt: cleanup.chunksClearedAt } : {})
  };
}

export function toPersistentArtifact(artifact: ArtifactDescriptor): PersistentArtifact {
  return {
    id: artifact.id,
    launchId: artifact.launchId,
    ...(artifact.projectId !== undefined ? { projectId: artifact.projectId } : {}),
    path: artifact.path,
    kind: artifact.kind,
    ...(artifact.contentType !== undefined ? { contentType: artifact.contentType } : {}),
    originalBytes: artifact.originalBytes,
    storedBytes: artifact.storedBytes,
    sha256: artifact.sha256,
    compression: artifact.compression,
    storageKey: artifact.storageKey,
    storage: artifact.storage as unknown as Record<string, unknown>,
    expiresAt: artifact.expiresAt,
    retention: artifact.retention as unknown as Record<string, unknown>,
    cleanup: artifact.cleanup as unknown as Record<string, unknown>,
    upload: artifact.upload as unknown as Record<string, unknown>,
    createdAt: artifact.createdAt,
    updatedAt: artifact.createdAt,
    version: 1
  };
}

export function toPersistentTestCase(testCase: TestCaseRecord): PersistentTestCase {
  return {
    id: testCase.id,
    projectId: testCase.projectId,
    ...(testCase.allureId !== undefined ? { allureId: testCase.allureId } : {}),
    name: testCase.name,
    ...(testCase.fullName !== undefined ? { fullName: testCase.fullName } : {}),
    workflowStatus: testCase.workflowStatus,
    tags: testCase.tags,
    ...(testCase.layer !== undefined ? { layer: testCase.layer } : {}),
    ...(testCase.description !== undefined ? { description: testCase.description } : {}),
    customFields: testCase.customFields,
    members: testCase.members,
    links: testCase.links,
    issues: testCase.issues,
    testKeys: testCase.testKeys,
    relations: testCase.relations,
    ...(testCase.scenario !== undefined ? { scenario: testCase.scenario } : {}),
    ...(testCase.expectedResult !== undefined ? { expectedResult: testCase.expectedResult } : {}),
    createdAt: testCase.createdAt,
    updatedAt: testCase.updatedAt,
    version: 1
  };
}

export function toPersistentTestCaseHistory(
  testCaseId: string,
  projectId: string,
  history: TestCaseRecord["historyVersions"][number]
): PersistentTestCaseHistoryVersion {
  return {
    id: `${testCaseId}:${history.launchId}:${history.resultUuid}`,
    testCaseId,
    projectId,
    launchId: history.launchId,
    resultUuid: history.resultUuid,
    status: history.status,
    seenAt: history.seenAt,
    ...(history.historyId !== undefined ? { historyId: history.historyId } : {}),
    createdAt: history.seenAt,
    updatedAt: history.seenAt,
    version: 1
  };
}

export function toApiLaunch(launch: DomainLaunch): Launch;
export function toApiLaunch(launch: DomainLaunch | undefined): Launch | undefined;
export function toApiLaunch(launch: DomainLaunch | undefined): Launch | undefined {
  return launch as Launch | undefined;
}
