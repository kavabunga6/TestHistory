import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const command = process.argv[2] ?? "validate";
const kustomizePath = readOption("--path") ?? "infra/k8s";
const namespace = readOption("--namespace") ?? "testhistory";
const smokeUrl = readOption("--smoke-url") ?? process.env.TESTHISTORY_K8S_SMOKE_URL;
const webUrl = readOption("--web-url") ?? process.env.TESTHISTORY_K8S_WEB_URL;
const requireKubectl =
  process.argv.includes("--require-kubectl") ||
  process.env.TESTHISTORY_K8S_REQUIRE_KUBECTL === "1" ||
  process.env.TESTHISTORY_K8S_REQUIRE_KUBECTL === "true";
const allowPlaceholders = process.argv.includes("--allow-placeholders");

const allowedCommands = new Set([
  "help",
  "validate",
  "validate-all",
  "deploy",
  "undeploy",
  "status",
  "logs",
  "migrate",
  "smoke"
]);
if (process.argv.includes("--help") || process.argv.includes("-h")) {
  printHelp();
  process.exit(0);
}
if (!allowedCommands.has(command)) {
  fail(`Unknown Kubernetes command "${command}". Use one of: ${[...allowedCommands].join(", ")}`);
}

try {
  switch (command) {
    case "help":
      printHelp();
      break;
    case "validate":
      validateManifests();
      break;
    case "validate-all":
      validateAllManifests();
      break;
    case "deploy":
      assertNoDeploymentPlaceholders();
      requireCommands(["kubectl"]);
      validateManifests();
      recreateMigrationJob();
      waitRollout();
      await liveSmokeIfConfigured();
      break;
    case "undeploy":
      requireCommands(["kubectl"]);
      run(["kubectl", "delete", "-k", kustomizePath, "--ignore-not-found"]);
      break;
    case "status":
      requireCommands(["kubectl"]);
      run(["kubectl", "get", "all,ingress,pvc,configmap,secret", "-n", namespace]);
      break;
    case "logs":
      requireCommands(["kubectl"]);
      run(["kubectl", "logs", "-n", namespace, "deploy/testhistory-api", "--tail=120"]);
      run(["kubectl", "logs", "-n", namespace, "deploy/testhistory-worker", "--tail=120"]);
      run(["kubectl", "logs", "-n", namespace, "deploy/testhistory-web", "--tail=120"]);
      break;
    case "migrate":
      assertNoDeploymentPlaceholders();
      requireCommands(["kubectl"]);
      recreateMigrationJob();
      waitMigrationJob();
      break;
    case "smoke":
      requireCommands(["npm"]);
      run(["npm", "run", "smoke:k8s"]);
      await liveSmokeIfConfigured();
      break;
  }
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}

function validateManifests() {
  requireCommands(["npm"]);
  run(["npm", "run", "smoke:k8s"]);
  validateKustomizePath(kustomizePath);
}

function validateAllManifests() {
  requireCommands(["npm"]);
  run(["npm", "run", "smoke:k8s"]);
  for (const path of ["infra/k8s", "infra/k8s/overlays/local", "infra/k8s/overlays/prod"]) {
    validateKustomizePath(path);
  }
}

function validateKustomizePath(path) {
  if (hasCommand("kubectl")) {
    run(["kubectl", "kustomize", path]);
  } else if (requireKubectl) {
    fail(`kubectl not found; required Kubernetes manifest render for ${path}`);
  } else {
    console.warn(`kubectl not found; skipped Kubernetes manifest render for ${path}`);
  }
}

function assertNoDeploymentPlaceholders() {
  if (allowPlaceholders) {
    console.warn("Allowed placeholder values for this Kubernetes action by explicit flag.");
    return;
  }

  const findings = findPlaceholderFindings(kustomizePath);
  if (findings.length > 0) {
    throw new Error(
      [
        `Kubernetes ${command} refused placeholder values in ${kustomizePath}.`,
        "Replace these values in an overlay or pass --allow-placeholders only for non-production dry labs:",
        ...findings.slice(0, 20).map((finding) => `- ${finding}`)
      ].join("\n")
    );
  }
}

function findPlaceholderFindings(rootPath) {
  const root = path.resolve(rootPath);
  const files = listManifestFiles(root);
  const findings = [];
  const placeholderPattern = /\b(?:replace-with-[\w-]+|replace-prod-[\w-]+)\b/g;

  for (const file of files) {
    const relativePath = path.relative(process.cwd(), file);
    const content = readFileSync(file, "utf8");
    const lines = content.split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      const matches = lines[index].match(placeholderPattern);
      if (matches !== null) {
        findings.push(`${relativePath}:${index + 1} ${[...new Set(matches)].join(", ")}`);
      }
    }
  }

  return findings;
}

function listManifestFiles(rootPath) {
  const stats = statSync(rootPath);
  if (stats.isFile()) {
    return isManifestFile(rootPath) ? [rootPath] : [];
  }

  return readdirSync(rootPath, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(rootPath, entry.name);
    if (entry.isDirectory()) {
      return listManifestFiles(entryPath);
    }
    return isManifestFile(entryPath) ? [entryPath] : [];
  });
}

function isManifestFile(filePath) {
  return /\.(?:ya?ml|json)$/.test(filePath);
}

function recreateMigrationJob() {
  run(["kubectl", "delete", "job/testhistory-db-migrate", "-n", namespace, "--ignore-not-found"]);
  run(["kubectl", "apply", "-k", kustomizePath]);
}

function requireCommands(commandNames) {
  const missing = commandNames.filter((commandName) => !hasCommand(commandName));
  if (missing.length > 0) {
    fail(
      `Missing required command(s): ${missing.join(", ")}. Install prerequisites or run "node scripts/k8s.mjs help".`
    );
  }
}

function waitRollout() {
  waitMigrationJob();
  run([
    "kubectl",
    "rollout",
    "status",
    "deploy/testhistory-api",
    "-n",
    namespace,
    "--timeout=180s"
  ]);
  run([
    "kubectl",
    "rollout",
    "status",
    "deploy/testhistory-worker",
    "-n",
    namespace,
    "--timeout=180s"
  ]);
  run([
    "kubectl",
    "rollout",
    "status",
    "deploy/testhistory-web",
    "-n",
    namespace,
    "--timeout=180s"
  ]);
}

function waitMigrationJob() {
  run([
    "kubectl",
    "wait",
    "--for=condition=complete",
    "job/testhistory-db-migrate",
    "-n",
    namespace,
    "--timeout=180s"
  ]);
}

async function liveSmokeIfConfigured() {
  if (smokeUrl === undefined || smokeUrl.trim() === "") {
    console.warn("TESTHISTORY_K8S_SMOKE_URL not set; skipped live Kubernetes HTTP smoke");
  } else {
    const baseUrl = smokeUrl.replace(/\/+$/, "");
    await expectHttpOk(`${baseUrl}/health`, "Kubernetes API health");
    await expectHttpOk(`${baseUrl}/docs`, "Kubernetes Swagger");
  }

  if (webUrl === undefined || webUrl.trim() === "") {
    console.warn("TESTHISTORY_K8S_WEB_URL not set; skipped live Kubernetes web smoke");
    return;
  }

  await expectHttpOk(webUrl.replace(/\/+$/, ""), "Kubernetes Web UI");
}

async function expectHttpOk(url, label) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`${label} smoke returned HTTP ${response.status} for ${url}`);
    }
  } finally {
    clearTimeout(timeout);
  }
}

function readOption(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

function hasCommand(commandName) {
  const probe =
    process.platform === "win32"
      ? spawnSync("where.exe", [commandName], { stdio: "ignore" })
      : spawnSync("sh", ["-lc", `command -v ${commandName}`], { stdio: "ignore" });
  return probe.status === 0;
}

function run(args) {
  console.log(`> ${args.join(" ")}`);
  const command = resolveCommand(args);
  const result = spawnSync(command.file, command.args, { stdio: "inherit" });
  if (result.status !== 0) {
    throw new Error(`Command failed: ${args.join(" ")}`);
  }
}

function printHelp() {
  console.log(`TestHistory Kubernetes wrapper

Usage:
  node scripts/k8s.mjs <command> [--path infra/k8s/overlays/prod] [--namespace testhistory] [--smoke-url https://api-host] [--web-url https://web-host] [--require-kubectl] [--allow-placeholders]

Commands:
  validate  Run manifest/readiness smoke and offline kubectl kustomize render when kubectl is installed
  validate-all  Validate base, local overlay, and prod overlay paths
  deploy    Validate, kubectl apply, wait migration and rollouts, then optional API/docs/web smoke
  undeploy  kubectl delete selected kustomize path with --ignore-not-found
  status    Show workload, ingress, PVC, ConfigMap, and Secret status
  logs      Tail API worker web logs
  migrate   Recreate and wait the migration job
  smoke     Run Kubernetes readiness smoke and optional live HTTP smoke
  help      Print this help

Options:
  --path       Kustomize path, default infra/k8s
  --namespace  Kubernetes namespace, default testhistory
  --smoke-url  Public API/docs base URL for live /health and /docs smoke
  --web-url    Public web base URL for live UI smoke
  --require-kubectl  Fail validation when kubectl cannot render manifests; CI sets TESTHISTORY_K8S_REQUIRE_KUBECTL=1
  --allow-placeholders  Permit replace-with-* and replace-prod-* values for isolated non-production labs
`);
}

function resolveCommand(args) {
  const [commandName, ...commandArgs] = args;
  if (process.platform === "win32" && commandName === "npm") {
    return { args: ["/d", "/s", "/c", commandName, ...commandArgs], file: "cmd.exe" };
  }

  if (process.platform === "win32" && commandName === "kubectl") {
    return { args: commandArgs, file: "kubectl.exe" };
  }

  return { args: commandArgs, file: commandName };
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
