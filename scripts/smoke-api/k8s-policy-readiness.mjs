export function expectOperationsWorkflowCoverage(workflows, label) {
  const ci = workflows.get(".github/workflows/ci.yml") ?? "";
  for (const snippet of [
    "operations-contract:",
    "Kubernetes operations readiness smoke",
    "azure/setup-kubectl@v4",
    "TESTHISTORY_K8S_REQUIRE_KUBECTL",
    "Deployment wrapper help contract",
    "npm run docker:help && npm run k8s:help",
    "Release evidence contract",
    "npm run release:evidence:check",
    "npx prettier --check docs/api.md docs/kubernetes-deployment.md docs/local-development.md docs/operations.md docs/screenshots/README.md .github/workflows infra/k8s scripts",
    "npm run k8s:validate",
    "npm run guard:sensitive",
    "git diff --check -- infra/k8s .github/workflows docs/operations.md docs/screenshots/README.md scripts"
  ]) {
    if (!ci.includes(snippet)) {
      throw new Error(`.github/workflows/ci.yml is missing ${label} coverage: ${snippet}`);
    }
  }
}

export function parsePolicyConfigMap(policy) {
  const configSection = policy.split("\n---")[0] ?? "";
  const entries = [...configSection.matchAll(/^  ([A-Z0-9_]+):\s+"([^"]*)"$/gm)];
  return new Map(entries.map(([, key, value]) => [key, value]));
}

export function parsePolicySecret(policy) {
  const secretSection = policy.split("\n---")[1] ?? "";
  const name = secretSection.match(/^\s+name:\s+([A-Za-z0-9._-]+)\s*$/m)?.[1];
  if (!name) {
    throw new Error("security-audit-policy.yaml Secret name is missing or not parseable");
  }

  const entries = [...secretSection.matchAll(/^  ([A-Z0-9_]+):\s+"([^"]*)"$/gm)];
  return {
    name,
    stringData: new Map(entries.map(([, key, value]) => [key, value]))
  };
}

export function expectWorkerExportSecretRefs(worker, secretName, requiredSecretKeys) {
  for (const key of requiredSecretKeys) {
    const secretRef = new RegExp(
      [
        `-\\s+name:\\s+${escapeRegExp(key)}\\s*`,
        "[\\s\\S]*?valueFrom:\\s*",
        "[\\s\\S]*?secretKeyRef:\\s*",
        `[\\s\\S]*?name:\\s+${escapeRegExp(secretName)}\\s*`,
        `[\\s\\S]*?key:\\s+${escapeRegExp(key)}\\s*`
      ].join(""),
      "m"
    );
    if (!secretRef.test(worker)) {
      throw new Error(`worker-deployment.yaml must wire ${key} from Secret ${secretName}`);
    }
  }
}

export function expectNoRealExportEndpointsCredentialsOrSignedUrls(label, text) {
  const forbiddenPatterns = [
    /\bhttps?:\/\/(?!replace-with-)[^\s"`')]+/i,
    /\b[A-Z0-9]{20}:[A-Za-z0-9+/=_-]{20,}\b/,
    /\bAKIA[0-9A-Z]{16}\b/,
    /\bASIA[0-9A-Z]{16}\b/,
    /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/,
    /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\b/,
    /-----BEGIN [A-Z ]+PRIVATE KEY-----/,
    /[?&](?:X-Amz-Signature|X-Amz-Credential|X-Goog-Signature|X-Goog-Credential|sig|signature)=/i,
    /\b(?:aws|amazon\s+s3|google\s+cloud\s+storage|gcs|azure\s+blob|cloudflare\s+r2)\b/i
  ];

  for (const pattern of forbiddenPatterns) {
    if (pattern.test(text)) {
      throw new Error(
        `${label} contains a real endpoint, credential, signed URL, or provider claim`
      );
    }
  }
}

export function markdownSection(markdown, startHeading, nextHeading) {
  const start = markdown.indexOf(`## ${startHeading}`);
  if (start === -1) {
    throw new Error(`docs/operations.md is missing section ${startHeading}`);
  }

  const next = markdown.indexOf(`## ${nextHeading}`, start + 1);
  return next === -1 ? markdown.slice(start) : markdown.slice(start, next);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
