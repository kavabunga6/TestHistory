import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const forbiddenPathPatterns = [
  /(^|\/)allure-results(\/|$)/i,
  /(^|\/)[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-result\.json$/i,
  /(^|\/)[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-container\.json$/i,
  /(^|\/)[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-attachment\.[^.]+$/i
];

const allowedPaths = new Set([]);

const documentationPathPatterns = [
  /^README\.md$/i,
  /^AGENTS\.md$/i,
  /^docs\/.*\.mdx?$/i,
  /^samples\/.*\/README\.md$/i,
  /\.example$/i
];

const forbiddenDocumentationPatterns = [
  {
    label: "absolute Windows workstation path",
    pattern: /\b[A-Za-z]:\\/
  },
  {
    label: "absolute user-home path",
    pattern: /(?:^|[\s`"'(])\/(?:Users|home)\/[A-Za-z0-9._-]+(?:\/|\\)/m
  },
  {
    label: "private workstation or LAN IPv4 address",
    pattern:
      /\b(?:10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})\b/
  },
  {
    label: "unfinished-work marker",
    pattern: /\b(?:TODO|FIXME|TBD|HACK)\b/i
  }
];

function gitFiles(args) {
  const output = execFileSync("git", args, { encoding: "utf8" });
  return output
    .split("\0")
    .map((file) => file.trim())
    .filter(Boolean)
    .map((file) => file.split(path.sep).join("/"));
}

const candidates = new Set([
  ...gitFiles(["ls-files", "-z"]),
  ...gitFiles(["ls-files", "--others", "--exclude-standard", "-z"]),
  ...gitFiles(["diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z"])
]);

const violations = [...candidates]
  .filter((file) => !allowedPaths.has(file))
  .filter((file) => forbiddenPathPatterns.some((pattern) => pattern.test(file)))
  .sort();

const documentationViolations = [...candidates]
  .filter((file) => documentationPathPatterns.some((pattern) => pattern.test(file)))
  .filter((file) => existsSync(file))
  .flatMap((file) => {
    const content = readFileSync(file, "utf8");
    return forbiddenDocumentationPatterns
      .filter(({ pattern }) => pattern.test(content))
      .map(({ label }) => `${file}: ${label}`);
  })
  .sort();

if (violations.length > 0) {
  console.error("Sensitive local Allure artifacts must not be committed:");
  for (const file of violations) {
    console.error(`- ${file}`);
  }
  console.error("Use synthetic fixtures or generated minimal test data instead.");
  process.exit(1);
}

if (documentationViolations.length > 0) {
  console.error("Documentation must remain portable and free of workstation-specific data:");
  for (const violation of documentationViolations) {
    console.error(`- ${violation}`);
  }
  console.error(
    "Use repository-relative paths, environment variables, and reserved example hosts."
  );
  process.exit(1);
}

console.log("Sensitive artifact and portable documentation guard passed");
