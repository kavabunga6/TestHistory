import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";

const execFileAsync = promisify(execFile);
const defaultProjectKey = "WS";
const defaultProjectName = "Web Sandbox";
const maxBatchEncodedBytes = 12 * 1024 * 1024;

export async function importLocalAllureEvidence(options = {}) {
  const baseUrl = (
    options.baseUrl ??
    process.env.TESTHISTORY_API_URL ??
    "http://127.0.0.1:18080"
  ).replace(/\/$/, "");
  const archivePaths = options.archivePaths ?? (await discoverEvidenceArchives());
  if (archivePaths.length === 0) {
    throw new Error(
      "No TestHistory evidence archives were found. Expected .tmp/testhistory-evidence-*.tar.gz"
    );
  }

  await assertReady(`${baseUrl}/health`);
  const project = await findOrCreateProject(baseUrl, defaultProjectKey, defaultProjectName);
  const summaries = [];

  for (const archivePath of archivePaths) {
    summaries.push(await importArchive({ archivePath, baseUrl, project }));
  }

  const { seedLocalTestCaseMetadata } = await import("./seed-local-test-case-metadata.mjs");
  const metadata = await seedLocalTestCaseMetadata({ baseUrl, projectIds: [project.id] });

  const result = {
    projectId: project.id,
    projectKey: project.key,
    archives: summaries,
    importedLaunches: summaries.filter((item) => !item.skipped).length,
    skippedLaunches: summaries.filter((item) => item.skipped).length,
    importedResults: summaries.reduce((sum, item) => sum + item.importedResults, 0),
    storedArtifacts: summaries.reduce((sum, item) => sum + item.storedArtifacts, 0),
    enrichedTestCases: metadata.updatedTestCases
  };
  console.log(JSON.stringify(result, null, 2));
  return result;
}

async function importArchive({ archivePath, baseUrl, project }) {
  const absoluteArchivePath = path.resolve(archivePath);
  const archiveId = evidenceArchiveId(absoluteArchivePath);
  const buildNumber = `android-evidence-${archiveId}`;
  const existingLaunches = await loadProjectLaunches(baseUrl, project.id);
  const existing = existingLaunches.find((launch) => launch.buildNumber === buildNumber);
  if (existing?.status === "closed") {
    return {
      archiveId,
      launchId: existing.id,
      launchName: existing.name,
      importedResults: 0,
      storedArtifacts: 0,
      skipped: true,
      status: existing.status
    };
  }

  const extractionRoot = await mkdtemp(path.resolve(".testhistory", "evidence-import-"));
  try {
    await execFileAsync("tar", ["-xzf", absoluteArchivePath, "-C", extractionRoot], {
      windowsHide: true
    });
    const allureResultsDir = path.join(extractionRoot, "allure-results");
    if (!existsSync(allureResultsDir)) {
      throw new Error(`${archivePath} does not contain an allure-results directory`);
    }

    const launch =
      existing ??
      (await postJson(baseUrl, `/api/v1/projects/${project.id}/launches`, {
        name: `Android instrumentation evidence #${archiveId}`,
        branch: "gitlab/android-evidence",
        buildNumber,
        commitSha: `evidence-${archiveId}`
      }));
    const uploadFiles = await readUploadFiles(allureResultsDir);
    const batches = buildResultAwareBatches(uploadFiles);
    let importedResults = 0;
    let storedArtifacts = 0;

    for (const batch of batches) {
      const upload = await postJson(baseUrl, `/api/v1/launches/${launch.id}/results/json`, {
        files: batch
      });
      importedResults += upload.job?.importedResults ?? 0;
      storedArtifacts += upload.job?.storedArtifacts ?? 0;
    }

    const closed = await postJson(baseUrl, `/api/v1/launches/${launch.id}/close`, {});
    return {
      archiveId,
      launchId: launch.id,
      launchName: launch.name,
      batches: batches.length,
      files: uploadFiles.length,
      importedResults,
      storedArtifacts,
      skipped: false,
      status: closed.status
    };
  } finally {
    await rm(extractionRoot, { force: true, recursive: true });
  }
}

export function buildResultAwareBatches(files) {
  const byPath = new Map(files.map((file) => [normalizePath(file.path), file]));
  const resultFiles = files.filter((file) => file.path.toLowerCase().endsWith("-result.json"));
  const claimedPaths = new Set();
  const batches = [];

  for (const resultFile of resultFiles) {
    const referencedPaths = collectAttachmentSources(JSON.parse(resultFile.content));
    const batch = [resultFile];
    claimedPaths.add(normalizePath(resultFile.path));
    for (const source of referencedPaths) {
      const attachment = byPath.get(normalizePath(source));
      if (attachment !== undefined) {
        batch.push(attachment);
        claimedPaths.add(normalizePath(attachment.path));
      }
    }
    assertBatchSize(batch, resultFile.path);
    batches.push(batch);
  }

  let remainder = [];
  let remainderBytes = 0;
  for (const file of files.filter((item) => !claimedPaths.has(normalizePath(item.path)))) {
    const fileBytes = encodedFileBytes(file);
    if (remainder.length > 0 && remainderBytes + fileBytes > maxBatchEncodedBytes) {
      batches.push(remainder);
      remainder = [];
      remainderBytes = 0;
    }
    remainder.push(file);
    remainderBytes += fileBytes;
  }
  if (remainder.length > 0) {
    batches.push(remainder);
  }
  return batches;
}

async function readUploadFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true, recursive: true });
  const files = [];
  for (const entry of entries) {
    if (!entry.isFile()) {
      continue;
    }
    const absolutePath = path.join(entry.parentPath, entry.name);
    const relativePath = normalizePath(path.relative(directory, absolutePath));
    const content = await readFile(absolutePath);
    if (isUtf8File(relativePath)) {
      files.push({
        path: relativePath,
        content: content.toString("utf8"),
        contentEncoding: "utf8"
      });
    } else {
      files.push({
        path: relativePath,
        content: content.toString("base64"),
        contentEncoding: "base64"
      });
    }
  }
  return files.sort((left, right) => left.path.localeCompare(right.path));
}

function collectAttachmentSources(value, sources = new Set()) {
  if (Array.isArray(value)) {
    for (const item of value) collectAttachmentSources(item, sources);
    return sources;
  }
  if (value === null || typeof value !== "object") {
    return sources;
  }
  if (Array.isArray(value.attachments)) {
    for (const attachment of value.attachments) {
      if (typeof attachment?.source === "string") sources.add(attachment.source);
    }
  }
  for (const [key, nested] of Object.entries(value)) {
    if (key !== "attachments") collectAttachmentSources(nested, sources);
  }
  return sources;
}

async function discoverEvidenceArchives() {
  const directory = path.resolve(".tmp");
  if (!existsSync(directory)) return [];
  return (await readdir(directory))
    .filter((name) => /^testhistory-evidence-\d+\.tar\.gz$/.test(name))
    .sort((left, right) => Number(evidenceArchiveId(left)) - Number(evidenceArchiveId(right)))
    .map((name) => path.join(directory, name));
}

async function findOrCreateProject(baseUrl, key, name) {
  const projects = await getJson(baseUrl, "/api/v1/projects");
  const existing = projects.find((project) => project.key === key);
  return existing ?? postJson(baseUrl, "/api/v1/projects", { key, name });
}

async function loadProjectLaunches(baseUrl, projectId) {
  const payload = await getJson(
    baseUrl,
    `/api/v1/projects/${encodeURIComponent(projectId)}/launches?limit=100`
  );
  return Array.isArray(payload) ? payload : (payload.items ?? []);
}

async function assertReady(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(3_000) });
  if (!response.ok)
    throw new Error(`TestHistory API is not ready at ${url}: HTTP ${response.status}`);
}

async function getJson(baseUrl, url) {
  const response = await fetch(`${baseUrl}${url}`);
  return responseJson(response, "GET", url);
}

async function postJson(baseUrl, url, body) {
  const response = await fetch(`${baseUrl}${url}`, {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
    method: "POST"
  });
  return responseJson(response, "POST", url);
}

async function responseJson(response, method, url) {
  const text = await response.text();
  const body = text === "" ? undefined : JSON.parse(text);
  if (!response.ok) {
    throw new Error(`${method} ${url} returned ${response.status}: ${text.slice(0, 1_000)}`);
  }
  return body;
}

function assertBatchSize(files, label) {
  const bytes = files.reduce((sum, file) => sum + encodedFileBytes(file), 0);
  if (bytes > maxBatchEncodedBytes) {
    throw new Error(
      `${label} requires an upload batch of ${bytes} bytes, above ${maxBatchEncodedBytes}`
    );
  }
}

function encodedFileBytes(file) {
  return Buffer.byteLength(file.content, "utf8") + Buffer.byteLength(file.path, "utf8") + 128;
}

function isUtf8File(filePath) {
  return /\.(?:json|log|properties|txt|xml|html|csv)$/i.test(filePath);
}

function normalizePath(filePath) {
  return filePath.replaceAll("\\", "/").replace(/^\.\//, "");
}

function evidenceArchiveId(filePath) {
  const match = path.basename(filePath).match(/testhistory-evidence-(\d+)/);
  if (match?.[1] === undefined) throw new Error(`Cannot derive evidence id from ${filePath}`);
  return match[1];
}

const isMain =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  const archivePaths = process.argv.slice(2).filter((argument) => !argument.startsWith("--"));
  await importLocalAllureEvidence({ ...(archivePaths.length > 0 ? { archivePaths } : {}) });
}
