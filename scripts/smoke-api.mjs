import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { smokeApi } from "./smoke-api/api-lifecycle.mjs";
import { smokeK8sReadiness } from "./smoke-api/k8s-readiness.mjs";

const args = new Set(process.argv.slice(2));

if (args.has("--k8s-readiness")) {
  smokeK8sReadiness();
  process.exit(0);
}

const configuredBaseUrl = process.env.SMOKE_API_BASE_URL ?? process.env.TESTHISTORY_API_URL;
const apiPort = process.env.API_PORT ?? String(await findAvailablePort());
const baseUrl = (configuredBaseUrl ?? `http://127.0.0.1:${apiPort}`).replace(/\/$/, "");
const shouldSpawnServer = configuredBaseUrl === undefined;

const smokeServerEnvironment = { ...process.env, API_PORT: apiPort, NODE_ENV: "test" };
delete smokeServerEnvironment.TESTHISTORY_STORE_FILE;
delete smokeServerEnvironment.TESTHISTORY_DATABASE_URL;
delete smokeServerEnvironment.DATABASE_URL;

const server = shouldSpawnServer
  ? spawn(process.execPath, ["apps/api/dist/server.js"], {
      env: smokeServerEnvironment,
      stdio: ["ignore", "pipe", "pipe"]
    })
  : undefined;

let output = "";
server?.stdout.on("data", (chunk) => {
  output += chunk.toString();
});
server?.stderr.on("data", (chunk) => {
  output += chunk.toString();
});

try {
  await smokeApi(baseUrl);
  console.log("API smoke passed");
} catch (error) {
  if (output.trim().length > 0) {
    console.error(output.trim());
  }
  throw error;
} finally {
  await stopServer(server);
}

async function findAvailablePort() {
  const probe = createServer();
  probe.unref();
  await new Promise((resolve, reject) => {
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", resolve);
  });
  const address = probe.address();
  if (address === null || typeof address === "string") {
    probe.close();
    throw new Error("Could not allocate an isolated API smoke port");
  }
  await new Promise((resolve, reject) =>
    probe.close((error) => (error ? reject(error) : resolve()))
  );
  return address.port;
}

async function stopServer(serverProcess) {
  if (serverProcess === undefined || serverProcess.exitCode !== null) {
    return;
  }
  serverProcess.kill();
  await Promise.race([
    once(serverProcess, "exit"),
    new Promise((resolve) => setTimeout(resolve, 2_000))
  ]);
}
