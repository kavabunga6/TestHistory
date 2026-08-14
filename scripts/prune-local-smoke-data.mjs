import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync
} from "node:fs";
import path from "node:path";

const args = new Set(process.argv.slice(2));
const apply = args.has("--apply");
const dedupeEmptyProjects = args.has("--dedupe-empty-projects");
const storePath = path.resolve(
  process.env.TESTHISTORY_STORE_FILE ?? path.join(".testhistory", "local-store.json")
);

if (!existsSync(storePath)) {
  throw new Error(`Local store not found: ${storePath}`);
}
if (apply && isManagedLocalRuntimeActive()) {
  throw new Error("Stop the managed local runtime before pruning: npm run local:dev:stop");
}

const snapshot = JSON.parse(readFileSync(storePath, "utf8"));
const projects = getMapEntries(snapshot, "projects");
const smokeProjectIds = new Set(
  projects
    .filter(([, project]) => /^SMOKE-\d+$/.test(project.key) && project.name === "Smoke project")
    .map(([id]) => id)
);
const duplicateProjectIds = dedupeEmptyProjects
  ? findEmptyDuplicateProjectIds(snapshot, projects)
  : new Set();
const targetProjectIds = new Set([...smokeProjectIds, ...duplicateProjectIds]);

if (targetProjectIds.size === 0) {
  console.log(`No isolated smoke or empty duplicate projects found in ${storePath}`);
  process.exit(0);
}

const launchIds = new Set(
  getMapEntries(snapshot, "launches")
    .filter(([, launch]) => targetProjectIds.has(launch.projectId))
    .map(([id]) => id)
);
const dashboardIds = new Set(
  getMapEntries(snapshot, "dashboards")
    .filter(([, dashboard]) => targetProjectIds.has(dashboard.projectId))
    .map(([id]) => id)
);

const removals = new Map();
filterMap(snapshot, "projects", ([id]) => targetProjectIds.has(id), removals);
filterMap(snapshot, "launches", ([, value]) => targetProjectIds.has(value.projectId), removals);
filterMap(snapshot, "testCases", ([, value]) => targetProjectIds.has(value.projectId), removals);
filterMap(snapshot, "dashboards", ([, value]) => targetProjectIds.has(value.projectId), removals);
filterMap(snapshot, "widgets", ([, value]) => dashboardIds.has(value.dashboardId), removals);
filterMap(snapshot, "thqlFilters", ([, value]) => targetProjectIds.has(value.projectId), removals);
filterMap(
  snapshot,
  "artifacts",
  ([, value]) => targetProjectIds.has(value.projectId) || launchIds.has(value.launchId),
  removals
);
filterMap(snapshot, "uploadJobs", ([, value]) => launchIds.has(value.launchId), removals);
filterMap(snapshot, "uploadSessions", ([, value]) => launchIds.has(value.launchId), removals);
filterMap(
  snapshot,
  "cleanupRules",
  ([, value]) =>
    targetProjectIds.has(value.scope?.projectId) || launchIds.has(value.scope?.launchId),
  removals
);

const auditEvents = snapshot.arrays?.securityAuditEvents;
if (Array.isArray(auditEvents)) {
  const retained = auditEvents.filter((event) => !targetProjectIds.has(event.projectId));
  removals.set("securityAuditEvents", auditEvents.length - retained.length);
  snapshot.arrays.securityAuditEvents = retained;
}

const summary = Object.fromEntries([...removals].filter(([, count]) => count > 0));
summary.smokeProjects = smokeProjectIds.size;
summary.emptyDuplicateProjects = duplicateProjectIds.size;
console.log(
  `${apply ? "Pruning" : "Would prune"} isolated smoke data from ${storePath}:\n${JSON.stringify(summary, null, 2)}`
);

if (apply) {
  const timestamp = new Date().toISOString().replaceAll(":", "-");
  const backupDir = path.join(path.dirname(storePath), "backups");
  const backupPath = path.join(backupDir, `local-store.before-smoke-prune.${timestamp}.json`);
  const temporaryPath = `${storePath}.prune-${process.pid}.tmp`;
  mkdirSync(backupDir, { recursive: true });
  copyFileSync(storePath, backupPath);
  snapshot.savedAt = new Date().toISOString();
  writeFileSync(temporaryPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  renameSync(temporaryPath, storePath);
  console.log(`Smoke data pruned. Recovery backup: ${backupPath}`);
}

function getMapEntries(snapshot, name) {
  const encoded = snapshot.maps?.[name];
  if (encoded?.__testhistoryMap !== true || !Array.isArray(encoded.entries)) {
    throw new Error(`Invalid local store map: ${name}`);
  }
  return encoded.entries;
}

function filterMap(snapshot, name, shouldRemove, removals) {
  const entries = getMapEntries(snapshot, name);
  const retained = entries.filter((entry) => !shouldRemove(entry));
  removals.set(name, entries.length - retained.length);
  snapshot.maps[name].entries = retained;
}

function findEmptyDuplicateProjectIds(snapshot, projects) {
  const referencedProjectIds = new Set();
  for (const mapName of ["launches", "testCases", "dashboards", "thqlFilters", "artifacts"]) {
    for (const [, value] of getMapEntries(snapshot, mapName)) {
      if (typeof value.projectId === "string") {
        referencedProjectIds.add(value.projectId);
      }
    }
  }
  for (const [, value] of getMapEntries(snapshot, "cleanupRules")) {
    if (typeof value.scope?.projectId === "string") {
      referencedProjectIds.add(value.scope.projectId);
    }
  }
  for (const event of snapshot.arrays?.securityAuditEvents ?? []) {
    if (typeof event.projectId === "string") {
      referencedProjectIds.add(event.projectId);
    }
  }

  const groups = new Map();
  for (const entry of projects) {
    const normalizedKey = entry[1].key.trim().toUpperCase();
    groups.set(normalizedKey, [...(groups.get(normalizedKey) ?? []), entry]);
  }

  const duplicates = new Set();
  for (const entries of groups.values()) {
    if (entries.length < 2) {
      continue;
    }
    const ordered = [...entries].sort((left, right) => {
      const leftReferenced = referencedProjectIds.has(left[0]) ? 1 : 0;
      const rightReferenced = referencedProjectIds.has(right[0]) ? 1 : 0;
      return (
        rightReferenced - leftReferenced || left[1].createdAt.localeCompare(right[1].createdAt)
      );
    });
    for (const [id, project] of ordered.slice(1)) {
      if (!referencedProjectIds.has(id) && project.accessSettings === undefined) {
        duplicates.add(id);
      }
    }
  }
  return duplicates;
}

function isManagedLocalRuntimeActive() {
  const statePath = path.resolve(".testhistory", "local-dev-processes.json");
  if (!existsSync(statePath)) {
    return false;
  }
  try {
    const state = JSON.parse(readFileSync(statePath, "utf8"));
    if (!Number.isInteger(state.launcherPid)) {
      return false;
    }
    process.kill(state.launcherPid, 0);
    return true;
  } catch {
    return false;
  }
}
