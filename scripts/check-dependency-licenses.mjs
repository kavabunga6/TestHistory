import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const allowedLicenses = new Set([
  "0BSD",
  "Apache-2.0",
  "BlueOak-1.0.0",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "CC-BY-4.0",
  "CC0-1.0",
  "ISC",
  "MIT",
  "MIT-0",
  "OFL-1.1",
  "Python-2.0"
]);

const lock = JSON.parse(await readFile(resolve(repositoryRoot, "package-lock.json"), "utf8"));
const failures = [];
const counts = new Map();

for (const [packagePath, metadata] of Object.entries(lock.packages ?? {})) {
  if (packagePath === "") {
    if (metadata.license !== "Apache-2.0") {
      failures.push("package.json: root license must be Apache-2.0");
    }
    continue;
  }

  if (metadata.link === true) {
    continue;
  }

  if (!packagePath.startsWith("node_modules/")) {
    if (metadata.license !== "Apache-2.0") {
      failures.push(`${packagePath}: workspace license must be Apache-2.0`);
    }
    continue;
  }

  const license = metadata.license;
  if (typeof license !== "string" || license.trim().length === 0) {
    failures.push(`${packagePath}: missing license metadata`);
    continue;
  }

  counts.set(license, (counts.get(license) ?? 0) + 1);
  if (!allowedLicenses.has(license)) {
    failures.push(`${packagePath}: license ${license} requires explicit review`);
  }
}

for (const requiredFile of ["LICENSE", "NOTICE", "THIRD_PARTY_NOTICES.md"]) {
  try {
    await readFile(resolve(repositoryRoot, requiredFile), "utf8");
  } catch {
    failures.push(`${requiredFile}: required licensing file is missing`);
  }
}

for (const dockerfile of ["apps/api/Dockerfile", "apps/worker/Dockerfile", "apps/mcp/Dockerfile"]) {
  const contents = await readFile(resolve(repositoryRoot, dockerfile), "utf8");
  if (!contents.includes("COPY LICENSE NOTICE THIRD_PARTY_NOTICES.md ./")) {
    failures.push(`${dockerfile}: runtime image must include project licensing files`);
  }
}

const webPackage = JSON.parse(
  await readFile(resolve(repositoryRoot, "apps/web/package.json"), "utf8")
);
if (!webPackage.scripts?.build?.includes("generate-web-license-bundle.mjs")) {
  failures.push("apps/web/package.json: production build must generate the web license bundle");
}

if (failures.length > 0) {
  console.error("Dependency license guard failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exitCode = 1;
} else {
  const summary = [...counts.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([license, count]) => `${license}: ${count}`)
    .join(", ");
  console.log(`Dependency license guard passed (${summary})`);
}
