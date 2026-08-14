import type { AppStore } from "../store.js";

export async function removeLaunchRecords(store: AppStore, launchId: string) {
  let artifacts = 0;
  let uploadJobs = 0;
  let uploadSessions = 0;
  let historyVersions = 0;

  const launchArtifacts = Array.from(store.artifacts.values()).filter(
    (artifact) => artifact.launchId === launchId
  );
  if (launchArtifacts.length > 0) {
    await store.artifactObjects.deleteObjects(
      launchArtifacts.map((artifact) => artifact.storageKey)
    );
  }
  for (const artifact of launchArtifacts) {
    store.artifacts.delete(artifact.id);
    artifacts += 1;
  }
  for (const [jobId, job] of store.uploadJobs) {
    if (job.launchId === launchId) {
      store.uploadJobs.delete(jobId);
      uploadJobs += 1;
    }
  }
  for (const [sessionId, session] of store.uploadSessions) {
    if (session.launchId === launchId) {
      store.uploadSessions.delete(sessionId);
      uploadSessions += 1;
    }
  }
  for (const testCase of store.testCases.values()) {
    const retainedVersions = testCase.historyVersions.filter(
      (version) => version.launchId !== launchId
    );
    historyVersions += testCase.historyVersions.length - retainedVersions.length;
    if (retainedVersions.length !== testCase.historyVersions.length) {
      testCase.historyVersions = retainedVersions;
      testCase.updatedAt = new Date().toISOString();
    }
  }

  store.launches.delete(launchId);
  if (store.driver === "postgres") {
    await store.repositories.launches.deleteById(launchId);
  }
  return { artifacts, historyVersions, launches: 1, uploadJobs, uploadSessions };
}
