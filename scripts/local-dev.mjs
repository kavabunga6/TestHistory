import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, resolve } from "node:path";

const flags = new Set(process.argv.slice(2));
const seedEvidence = flags.has("--seed-evidence");
const withWorker = !flags.has("--no-worker");
const apiPort = readPort(process.env.API_PORT, 18_080, "API_PORT");
const webPort = readPort(process.env.WEB_PORT, 5_173, "WEB_PORT");
const apiUrl = `http://127.0.0.1:${apiPort}`;
const webUrl = `http://127.0.0.1:${webPort}`;
const launcherStatePath = resolve(".testhistory", "local-dev-processes.json");
const tsxCli = resolve("node_modules", "tsx", "dist", "cli.mjs");
const viteCli = resolve("node_modules", "vite", "bin", "vite.js");
const children = [];
let stopping = false;

const sharedEnvironment = {
  ...process.env,
  NODE_ENV: "development",
  API_PORT: String(apiPort),
  WEB_PORT: String(webPort),
  TESTHISTORY_API_URL: apiUrl,
  TESTHISTORY_STORE_FILE:
    process.env.TESTHISTORY_STORE_FILE ?? resolve(".testhistory", "local-store.json"),
  TESTHISTORY_WORKER_TOKEN: process.env.TESTHISTORY_WORKER_TOKEN ?? "local-dev-worker-token"
};

if (flags.has("--stop")) {
  try {
    stopManagedLauncher();
    process.exit(0);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

try {
  claimLauncherState();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
registerShutdownHandlers();

try {
  await assertPortAvailable(apiPort, "API");
  await assertPortAvailable(webPort, "web");
  start(
    "api",
    [process.execPath, "--watch-path=src", "--import", "tsx", "src/server.ts"],
    sharedEnvironment,
    resolve("apps", "api")
  );
  await waitForUrl(`${apiUrl}/health`, "API");
  await ensureLocalProject(apiUrl);
  if (seedEvidence) {
    const { importLocalAllureEvidence } = await import("./import-local-allure-evidence.mjs");
    await importLocalAllureEvidence({ baseUrl: apiUrl });
  }

  if (withWorker) {
    start(
      "worker",
      [process.execPath, tsxCli, "watch", "src/index.ts"],
      sharedEnvironment,
      resolve("apps", "worker")
    );
  }

  start(
    "web",
    [process.execPath, viteCli, "--host", "127.0.0.1", "--port", String(webPort)],
    sharedEnvironment,
    resolve("apps", "web")
  );
  await waitForUrl(webUrl, "web");

  console.log(`\nTestHistory local development is ready:
  UI:      ${webUrl}
  API:     ${apiUrl}
  Swagger: ${apiUrl}/docs
  Store:   ${sharedEnvironment.TESTHISTORY_STORE_FILE}
  Login:   admin / admin (development only)

Press Ctrl+C to stop all local processes.\n`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  stopAll(1);
}

await new Promise(() => {});

function start(name, args, env, cwd) {
  const [file, ...commandArgs] = args;
  console.log(`> [${name}] ${args.join(" ")}`);
  const child = spawn(file, commandArgs, {
    cwd,
    env,
    stdio: "inherit",
    windowsHide: true
  });
  children.push({ child, name });
  persistLauncherState();
  child.once("exit", (code, signal) => {
    if (stopping) {
      return;
    }
    console.error(`[${name}] stopped unexpectedly (${signal ?? code ?? "unknown"})`);
    stopAll(code ?? 1);
  });
  child.once("error", (error) => {
    if (!stopping) {
      console.error(`[${name}] failed to start: ${error.message}`);
      stopAll(1);
    }
  });
}

async function waitForUrl(url, label) {
  const deadline = Date.now() + 45_000;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2_000) });
      if (response.ok) {
        return;
      }
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await delay(250);
  }
  throw new Error(
    `${label} did not become ready at ${url}: ${lastError instanceof Error ? lastError.message : "timeout"}`
  );
}

function assertPortAvailable(port, label) {
  return new Promise((resolvePromise, reject) => {
    const server = createServer();
    server.once("error", () => {
      reject(new Error(`${label} port ${port} is already in use`));
    });
    server.listen(port, "127.0.0.1", () => {
      server.close(resolvePromise);
    });
  });
}

function registerShutdownHandlers() {
  process.once("SIGINT", () => stopAll(0));
  process.once("SIGTERM", () => stopAll(0));
  process.once("SIGHUP", () => stopAll(0));
}

async function ensureLocalProject(baseUrl) {
  const listResponse = await fetch(`${baseUrl}/api/v1/projects`);
  if (!listResponse.ok) {
    throw new Error(`Could not inspect local projects: HTTP ${listResponse.status}`);
  }

  const projects = await listResponse.json();
  if (!Array.isArray(projects)) {
    throw new Error("Could not inspect local projects: API returned a non-array payload");
  }
  if (projects.length > 0) {
    return;
  }

  const createResponse = await fetch(`${baseUrl}/api/v1/projects`, {
    body: JSON.stringify({ key: "WS", name: "Web Sandbox" }),
    headers: { "content-type": "application/json" },
    method: "POST"
  });
  if (!createResponse.ok) {
    throw new Error(`Could not create the local starter project: HTTP ${createResponse.status}`);
  }
  console.log("> [local] created starter project WS / Web Sandbox");
}

function stopAll(exitCode) {
  if (stopping) {
    return;
  }
  stopping = true;
  let allStopped = true;
  for (const { child, name } of [...children].reverse()) {
    if (child.exitCode !== null || child.pid === undefined) {
      continue;
    }
    console.log(`> stopping ${name}`);
    if (!terminateProcessTree(child.pid)) {
      allStopped = false;
      console.error(`Could not stop managed ${name} process ${child.pid}`);
    }
  }
  if (allStopped) {
    removeLauncherState();
  }
  process.exit(exitCode);
}

function claimLauncherState() {
  const previousState = readLauncherState();
  if (previousState !== undefined) {
    if (isProcessAlive(previousState.launcherPid)) {
      throw new Error(
        `TestHistory local development is already managed by process ${previousState.launcherPid}`
      );
    }
    cleanupStaleChildren(previousState.childPids);
  }
  persistLauncherState();
}

function readLauncherState() {
  try {
    const parsed = JSON.parse(readFileSync(launcherStatePath, "utf8"));
    if (
      Number.isInteger(parsed.launcherPid) &&
      Array.isArray(parsed.childPids) &&
      parsed.childPids.every(Number.isInteger)
    ) {
      return parsed;
    }
  } catch (error) {
    if (!(error instanceof Error) || !Reflect.has(error, "code") || error.code !== "ENOENT") {
      console.warn(
        `Ignoring unreadable local launcher state: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
  return undefined;
}

function persistLauncherState() {
  mkdirSync(dirname(launcherStatePath), { recursive: true });
  writeFileSync(
    launcherStatePath,
    `${JSON.stringify(
      {
        launcherPid: process.pid,
        childPids: children.flatMap(({ child }) => (child.pid === undefined ? [] : [child.pid]))
      },
      null,
      2
    )}\n`,
    "utf8"
  );
}

function removeLauncherState() {
  try {
    unlinkSync(launcherStatePath);
  } catch (error) {
    if (!(error instanceof Error) || !Reflect.has(error, "code") || error.code !== "ENOENT") {
      console.warn(
        `Could not remove local launcher state: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}

function cleanupStaleChildren(childPids) {
  for (const pid of [...childPids].reverse()) {
    if (!isProcessAlive(pid)) {
      continue;
    }
    console.log(`> stopping stale managed process ${pid}`);
    if (!terminateProcessTree(pid)) {
      throw new Error(`Could not stop stale managed process ${pid}`);
    }
  }
}

function stopManagedLauncher() {
  const state = readLauncherState();
  if (state === undefined) {
    console.log("TestHistory local development is not running");
    return;
  }

  if (isProcessAlive(state.launcherPid)) {
    if (!terminateProcessTree(state.launcherPid)) {
      throw new Error(`Could not stop managed launcher process ${state.launcherPid}`);
    }
  }
  cleanupStaleChildren(state.childPids);

  removeLauncherState();
  console.log("TestHistory local development stopped");
}

function terminateProcessTree(pid) {
  if (!isProcessAlive(pid)) {
    return true;
  }
  if (process.platform === "win32") {
    const result = spawnSync("taskkill.exe", ["/pid", String(pid), "/t", "/f"], {
      stdio: "ignore",
      timeout: 5_000,
      windowsHide: true
    });
    return result.status === 0 || !isProcessAlive(pid);
  }
  try {
    process.kill(pid, "SIGTERM");
    return true;
  } catch {
    return !isProcessAlive(pid);
  }
}

function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function readPort(value, fallback, name) {
  const port = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`${name} must be an integer between 1 and 65535`);
  }
  return port;
}

function delay(milliseconds) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}
