import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { basename, join, relative, sep } from "node:path";

const baseUrl = requiredEnv("TESTHISTORY_BASE_URL").replace(/\/$/, "");
const configuredProjectId = requiredEnv("TESTHISTORY_PROJECT_ID");
const resultsDir = process.env.ALLURE_RESULTS_DIR ?? "allure-results";
const launchName =
  process.env.TESTHISTORY_LAUNCH_NAME ??
  `Android Allure sample ${new Date().toISOString()}`;
const closeLaunch = process.env.TESTHISTORY_CLOSE_LAUNCH !== "false";
const chunkBytes = Number(process.env.TESTHISTORY_UPLOAD_CHUNK_BYTES ?? 4 * 1024 * 1024);

await assertTestHistoryReachable();
const token = await resolveToken();
const headers = {
  authorization: `Bearer ${token}`,
  "content-type": "application/json",
  "x-testhistory-project-scope": configuredProjectId,
  "x-testhistory-actor-id": process.env.TESTHISTORY_ACTOR_ID ?? "gitlab-ci/android-sample",
  "x-testhistory-scopes":
    process.env.TESTHISTORY_SCOPES ??
    "projects:read,projects:write,launches:write,launches:read,uploads:write,uploads:read,results:write"
};

await ensureExecutorJson();
const projectId = await resolveProjectId(configuredProjectId);
headers["x-testhistory-project-scope"] = projectId;

const launch = await postJson(`/api/v1/projects/${encodeURIComponent(projectId)}/launches`, {
  name: launchName,
  branch: process.env.TESTHISTORY_BRANCH ?? process.env.CI_COMMIT_REF_NAME,
  commitSha: process.env.TESTHISTORY_COMMIT_SHA ?? process.env.CI_COMMIT_SHA,
  buildNumber: process.env.TESTHISTORY_BUILD_NUMBER ?? process.env.CI_PIPELINE_ID
});

const launchId = launch.id;
const files = await collectAllureUploadFiles(resultsDir);
if (files.length === 0) {
  throw new Error(`No supported Allure files found in ${resultsDir}`);
}

const upload = await uploadChunked(launchId, files);
const processed = await postJson(`/api/v1/uploads/${encodeURIComponent(upload.job.id)}/process`, {});

let close = null;
if (closeLaunch) {
  close = await postJson(`/api/v1/launches/${encodeURIComponent(launchId)}/close`, {});
}

console.log(
  JSON.stringify(
    {
      launchId,
      uploadId: upload.session.id,
      jobId: upload.job.id,
      uploadedFiles: files.length,
      uploadedBytes: files.reduce((total, file) => total + file.content.byteLength, 0),
      importedResults: processed.job?.importedResults ?? upload.job?.importedResults,
      uploadStatus: processed.job?.status ?? upload.job?.status,
      closed: close !== null
    },
    null,
    2
  )
);

async function uploadChunked(launchId, files) {
  if (!Number.isFinite(chunkBytes) || chunkBytes < 1024) {
    throw new Error(`TESTHISTORY_UPLOAD_CHUNK_BYTES must be at least 1024, got ${chunkBytes}`);
  }

  const session = await postJson(`/api/v1/launches/${encodeURIComponent(launchId)}/uploads/chunked`, {
    files: files.map((file) => ({
      path: file.path,
      totalChunks: Math.max(1, Math.ceil(file.content.byteLength / chunkBytes)),
      totalBytes: file.content.byteLength
    }))
  });

  for (const file of files) {
    const totalChunks = Math.max(1, Math.ceil(file.content.byteLength / chunkBytes));
    for (let index = 0; index < totalChunks; index += 1) {
      const start = index * chunkBytes;
      const end = Math.min(file.content.byteLength, start + chunkBytes);
      const chunk = file.content.subarray(start, end);
      await putJson(`/api/v1/uploads/${encodeURIComponent(session.id)}/chunks/${index}`, {
        path: file.path,
        content: chunk.toString("base64"),
        contentEncoding: "base64",
        sha256: sha256(chunk)
      });
    }
  }

  return postJson(`/api/v1/uploads/${encodeURIComponent(session.id)}/complete`, {});
}

async function resolveToken() {
  if (process.env.TESTHISTORY_TOKEN) {
    return process.env.TESTHISTORY_TOKEN;
  }
  const username = process.env.TESTHISTORY_USERNAME;
  const password = process.env.TESTHISTORY_PASSWORD;
  if (!username || !password) {
    throw new Error("Set TESTHISTORY_TOKEN or TESTHISTORY_USERNAME/TESTHISTORY_PASSWORD");
  }
  const response = await fetch(`${baseUrl}/api/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: username, password })
  });
  if (!response.ok) {
    throw new Error(`Login failed: ${response.status} ${await response.text()}`);
  }
  const body = await response.json();
  return body.token ?? body.session?.token ?? body.accessToken;
}

async function resolveProjectId(projectRef) {
  const projects = await getJson("/api/v1/projects");
  const existing = projects.find((project) =>
    [project.id, project.key, project.name].map((value) => String(value).toLowerCase()).includes(projectRef.toLowerCase())
  );
  if (existing !== undefined) {
    return existing.id;
  }

  const created = await postJson("/api/v1/projects", {
    key: projectRef.toUpperCase().replaceAll(/[^A-Z0-9]+/g, "-").replaceAll(/^-|-$/g, "").slice(0, 32) || "ANDROID",
    name: process.env.TESTHISTORY_PROJECT_NAME ?? "Android Allure TestHistory Sample"
  });
  return created.id;
}

async function assertTestHistoryReachable() {
  try {
    await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: "OPTIONS",
      signal: AbortSignal.timeout(10_000)
    });
  } catch (error) {
    throw new Error(
      `TestHistory API is not reachable at ${baseUrl}. Check TESTHISTORY_BASE_URL and runner network access. ${error.message}`
    );
  }
}

async function postJson(path, payload) {
  return sendJson("POST", path, payload);
}

async function putJson(path, payload) {
  return sendJson("PUT", path, payload);
}

async function getJson(path) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "GET",
    headers
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(`GET ${path} returned ${response.status}: ${text}`);
  }
  return body;
}

async function sendJson(method, path, payload) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: JSON.stringify(payload)
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(`${method} ${path} returned ${response.status}: ${text}`);
  }
  return body;
}

async function collectAllureUploadFiles(root) {
  const paths = await walk(root);
  const files = [];
  for (const filePath of paths) {
    const normalized = relative(root, filePath).split(sep).join("/");
    if (!isSupportedAllureUploadFile(normalized)) {
      continue;
    }
    files.push({
      path: normalized,
      content: await readFile(filePath)
    });
  }
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(path)));
    } else if (entry.isFile()) {
      files.push(path);
    }
  }
  return files;
}

async function ensureExecutorJson() {
  const executor = {
    name: "GitLab CI Android",
    type: "gitlab",
    buildName: process.env.CI_JOB_NAME ?? "local",
    buildUrl: process.env.CI_JOB_URL,
    reportUrl: process.env.CI_PIPELINE_URL
  };
  await writeFile(join(resultsDir, "executor.json"), JSON.stringify(executor, null, 2));
}

function isSupportedAllureUploadFile(path) {
  const normalizedPath = path.replaceAll("\\", "/").toLowerCase();
  const name = basename(normalizedPath);
  return (
    isSupportedAllureCompatibilityFile(normalizedPath) ||
    name.endsWith(".png") ||
    name.endsWith(".mp4") ||
    name.endsWith(".log") ||
    name.endsWith(".txt") ||
    name.endsWith(".xml")
  );
}

function isSupportedAllureCompatibilityFile(path) {
  const name = basename(path);
  return (
    name.endsWith("-result.json") ||
    name.endsWith("-container.json") ||
    name === "environment.properties" ||
    name === "executor.json" ||
    name === "categories.json" ||
    ((path.startsWith("history/") || path.includes("/history/")) && name.endsWith(".json"))
  );
}

function sha256(content) {
  return createHash("sha256").update(content).digest("hex");
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env ${name}`);
  }
  return value;
}
