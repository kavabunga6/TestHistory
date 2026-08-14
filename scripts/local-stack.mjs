import { spawnSync } from "node:child_process";

const command = process.argv[2] ?? "up";
const flags = new Set(process.argv.slice(3));
const withMcp = flags.has("--mcp");
const noBuild = flags.has("--no-build");

const allowedCommands = new Set([
  "help",
  "doctor",
  "up",
  "down",
  "restart",
  "status",
  "logs",
  "smoke",
  "reset",
  "migrate"
]);
if (process.argv.includes("--help") || process.argv.includes("-h")) {
  printHelp();
  process.exit(0);
}
if (!allowedCommands.has(command)) {
  fail(`Unknown local stack command "${command}". Use one of: ${[...allowedCommands].join(", ")}`);
}

try {
  switch (command) {
    case "help":
      printHelp();
      break;
    case "doctor":
      requireCommands(["docker", "npm"]);
      run(composeArgs(["config", "--quiet"]));
      printEndpoints();
      break;
    case "up":
      requireCommands(["docker", "npm"]);
      run(composeArgs(["config", "--quiet"]));
      run(
        composeArgs([
          "up",
          ...(noBuild ? [] : ["--build"]),
          "--wait",
          "api",
          "worker",
          "web",
          ...(withMcp ? ["mcp"] : [])
        ])
      );
      run(composeArgs(["--profile", "operations", "run", "--rm", "api-migrate"]));
      await smoke();
      printEndpoints();
      break;
    case "down":
      requireCommands(["docker"]);
      run(composeArgs(["down", "--remove-orphans"]));
      break;
    case "restart":
      requireCommands(["docker", "npm"]);
      run(composeArgs(["restart", "api", "worker", "web"]));
      await smoke();
      break;
    case "status":
      requireCommands(["docker"]);
      run(composeArgs(["ps"]));
      break;
    case "logs":
      requireCommands(["docker"]);
      run(composeArgs(["logs", "--tail", "120", "api", "worker", "web"]));
      break;
    case "smoke":
      requireCommands(["npm"]);
      await smoke();
      break;
    case "reset":
      requireCommands(["docker"]);
      run(composeArgs(["down", "--volumes", "--remove-orphans"]));
      break;
    case "migrate":
      requireCommands(["docker"]);
      run(composeArgs(["--profile", "operations", "run", "--rm", "api-migrate"]));
      break;
  }
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}

function composeArgs(tail) {
  return ["docker", "compose", ...(withMcp ? ["--profile", "mcp"] : []), ...tail];
}

async function smoke() {
  run(["npm", "run", "smoke:api"], {
    ...process.env,
    SMOKE_API_BASE_URL: "http://127.0.0.1:18080"
  });
  await expectHttpOk("http://127.0.0.1:5173/", "web");
  await expectHttpOk("http://127.0.0.1:18080/docs", "Swagger");
  await expectHttpOk("http://127.0.0.1:5173/docs", "web Swagger proxy");
  await expectHttpOk("http://127.0.0.1:5173/docs/json", "web OpenAPI proxy");
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

function run(args, env = process.env) {
  console.log(`> ${args.join(" ")}`);
  const command = resolveCommand(args);
  const result = spawnSync(command.file, command.args, {
    env,
    stdio: "inherit"
  });
  if (result.status !== 0) {
    throw new Error(`Command failed: ${args.join(" ")}`);
  }
}

function requireCommands(commandNames) {
  const missing = commandNames.filter((commandName) => !hasCommand(commandName));
  if (missing.length > 0) {
    fail(
      `Missing required command(s): ${missing.join(", ")}. Install prerequisites or run "node scripts/local-stack.mjs help".`
    );
  }
}

function hasCommand(commandName) {
  const probe =
    process.platform === "win32"
      ? spawnSync("where.exe", [commandName], { stdio: "ignore" })
      : spawnSync("sh", ["-lc", `command -v ${commandName}`], { stdio: "ignore" });
  return probe.status === 0;
}

function printHelp() {
  console.log(`TestHistory local stack

Usage:
  node scripts/local-stack.mjs <command> [--mcp] [--no-build]

Commands:
  doctor    Check Docker/npm prerequisites and Compose config without starting containers
  up        Validate Compose, build/start API worker web, run migrations, then smoke API/web/docs
  down      Stop the stack and remove orphan containers
  restart   Restart API worker web and run smoke checks
  status    Show Docker Compose service status
  logs      Tail API worker web logs
  smoke     Run API, web, and Swagger smoke checks against the local stack
  migrate   Run the migration job through the operations profile
  reset     Stop the stack and remove volumes
  help      Print this help

Options:
  --mcp       Include the MCP service/profile where supported
  --no-build  Start existing images without rebuilding
`);
}

function printEndpoints() {
  console.log(`Local endpoints:
  Web:     http://127.0.0.1:5173
  API:     http://127.0.0.1:18080
  Swagger: http://127.0.0.1:18080/docs
  OpenAPI: http://127.0.0.1:18080/docs/json
  Web docs proxy: http://127.0.0.1:5173/docs`);
}

function resolveCommand(args) {
  const [commandName, ...commandArgs] = args;
  if (process.platform === "win32" && commandName === "npm") {
    return { args: ["/d", "/s", "/c", commandName, ...commandArgs], file: "cmd.exe" };
  }

  if (process.platform === "win32" && commandName === "docker") {
    return { args: commandArgs, file: "docker.exe" };
  }

  return { args: commandArgs, file: commandName };
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
