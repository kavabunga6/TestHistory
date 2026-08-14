import { lstatSync, readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MAX_EVIDENCE_BYTES = 256 * 1024;
const DEFAULT_MAX_AGE_HOURS = 168;
const MAX_MAX_AGE_HOURS = 720;
const PROVIDERS = new Set([
  "notification:generic",
  "notification:slack",
  "notification:teams",
  "notification:pachca",
  "issue:jira",
  "issue:youtrack",
  "issue:github",
  "issue:generic"
]);
const IDENTITY_MODES = new Set(["disabled", "oidc", "oidc-scim"]);
const PLACEHOLDER_PATTERN = /(?:replace[-_ ]with|placeholder|example|dummy|todo|tbd)/i;
const SECRET_KEY_PATTERN = /^(?:password|secret|token|authorization|cookie|privateKey|accessKey)$/i;
const SECRET_VALUE_PATTERNS = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{12,}/i,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\b(?:ghp|github_pat)_[A-Za-z0-9_]{20,}\b/
];

export function verifyProductionReadinessEvidence(evidence, options) {
  const now = options.now ?? new Date();
  const failures = [];
  const check = (condition, message) => {
    if (!condition) failures.push(message);
  };

  check(isPlainObject(evidence), "evidence must be a JSON object");
  if (!isPlainObject(evidence)) return failures;

  check(evidence.schemaVersion === 1, "schemaVersion must be 1");
  expectOnlyKeys(
    evidence,
    [
      "schemaVersion",
      "environment",
      "releaseId",
      "generatedAt",
      "validUntil",
      "attestation",
      "backupRestore",
      "objectStorage",
      "outboundProviders",
      "identity"
    ],
    "$",
    failures
  );
  check(
    evidence.environment === options.environment,
    "environment does not match the requested environment"
  );
  check(evidence.releaseId === options.releaseId, "releaseId does not match the requested release");
  check(
    safeIdentifier(evidence.environment),
    "environment must be a bounded non-placeholder identifier"
  );
  check(
    safeIdentifier(evidence.releaseId),
    "releaseId must be a bounded non-placeholder identifier"
  );

  const generatedAt = timestamp(evidence.generatedAt, "generatedAt", failures);
  const validUntil = timestamp(evidence.validUntil, "validUntil", failures);
  if (generatedAt !== undefined) {
    const ageHours = (now.getTime() - generatedAt) / 3_600_000;
    check(ageHours >= 0, "generatedAt cannot be in the future");
    check(ageHours <= options.maxAgeHours, `evidence is older than ${options.maxAgeHours} hours`);
  }
  if (validUntil !== undefined) check(validUntil >= now.getTime(), "evidence has expired");
  if (generatedAt !== undefined && validUntil !== undefined) {
    check(validUntil > generatedAt, "validUntil must be later than generatedAt");
  }
  validateCompletionTimes(evidence, generatedAt, now, options.maxAgeHours, failures);

  validateAttestation(evidence.attestation, failures);
  validateBackupRestore(evidence.backupRestore, failures);
  validateObjectStorage(evidence.objectStorage, failures);
  validateOutboundProviders(evidence.outboundProviders, options.enabledProviders, failures);
  validateIdentity(evidence.identity, options.identityMode, failures);
  scanForSecrets(evidence, "$", failures);

  return failures;
}

export function parseEnabledProviders(value) {
  if (value === undefined || value.trim() === "") {
    throw new Error(
      "TESTHISTORY_ENABLED_OUTBOUND_PROVIDERS must be set to 'none' or an explicit comma-separated list"
    );
  }
  if (value.trim().toLowerCase() === "none") return [];
  const providers = [
    ...new Set(
      value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
    )
  ].sort();
  for (const provider of providers) {
    if (!PROVIDERS.has(provider)) throw new Error(`Unsupported outbound provider: ${provider}`);
  }
  return providers;
}

export function loadExternalEvidence(file, workspace) {
  if (!path.isAbsolute(file)) throw new Error("Production evidence path must be absolute");
  const sourceStat = lstatSync(file);
  if (sourceStat.isSymbolicLink())
    throw new Error("Production evidence must be a regular non-symlink file");
  const workspaceReal = realpathSync(workspace);
  const evidenceReal = realpathSync(file);
  if (isInside(evidenceReal, workspaceReal)) {
    throw new Error("Production evidence must be stored outside the repository");
  }
  const stat = lstatSync(evidenceReal);
  if (!stat.isFile()) throw new Error("Production evidence must be a regular non-symlink file");
  if (stat.size === 0 || stat.size > MAX_EVIDENCE_BYTES) {
    throw new Error(`Production evidence must be between 1 and ${MAX_EVIDENCE_BYTES} bytes`);
  }
  return JSON.parse(readFileSync(evidenceReal, "utf8"));
}

function validateAttestation(value, failures) {
  requireObject(value, "attestation", failures);
  if (!isPlainObject(value)) return;
  expectOnlyKeys(
    value,
    ["performedByRole", "approvedByRole", "changeTicket"],
    "attestation",
    failures
  );
  requireSafe(value.performedByRole, "attestation.performedByRole", failures);
  requireSafe(value.approvedByRole, "attestation.approvedByRole", failures);
  requireSafe(value.changeTicket, "attestation.changeTicket", failures);
  if (typeof value.performedByRole === "string" && typeof value.approvedByRole === "string") {
    if (value.performedByRole === value.approvedByRole)
      failures.push("drill performer and approver roles must differ");
  }
}

function validateBackupRestore(value, failures) {
  requireObject(value, "backupRestore", failures);
  if (!isPlainObject(value)) return;
  expectOnlyKeys(
    value,
    [
      "status",
      "completedAt",
      "evidenceRef",
      "postgresBaseRestorePassed",
      "postgresPointInTimeRecoveryPassed",
      "artifactRestorePassed",
      "isolatedEnvironment",
      "migrationVersionVerified",
      "migrationVersion",
      "apiSmokePassed"
    ],
    "backupRestore",
    failures
  );
  requirePassed(value, "backupRestore", failures);
  for (const field of [
    "postgresBaseRestorePassed",
    "postgresPointInTimeRecoveryPassed",
    "artifactRestorePassed",
    "isolatedEnvironment",
    "migrationVersionVerified",
    "apiSmokePassed"
  ]) {
    requireTrue(value[field], `backupRestore.${field}`, failures);
  }
  requireSafe(value.migrationVersion, "backupRestore.migrationVersion", failures);
  requireEvidenceRef(value.evidenceRef, "backupRestore.evidenceRef", failures);
}

function validateObjectStorage(value, failures) {
  requireObject(value, "objectStorage", failures);
  if (!isPlainObject(value)) return;
  expectOnlyKeys(
    value,
    [
      "status",
      "completedAt",
      "evidenceRef",
      "provider",
      "writeReadDeletePassed",
      "retentionPassed",
      "credentialRotationPassed"
    ],
    "objectStorage",
    failures
  );
  requirePassed(value, "objectStorage", failures);
  if (value.provider !== "s3-compatible")
    failures.push("objectStorage.provider must be s3-compatible");
  for (const field of ["writeReadDeletePassed", "retentionPassed", "credentialRotationPassed"]) {
    requireTrue(value[field], `objectStorage.${field}`, failures);
  }
  requireEvidenceRef(value.evidenceRef, "objectStorage.evidenceRef", failures);
}

function validateOutboundProviders(value, enabledProviders, failures) {
  if (!Array.isArray(value)) {
    failures.push("outboundProviders must be an array");
    return;
  }
  const found = new Map();
  for (const item of value) {
    if (!isPlainObject(item) || typeof item.provider !== "string") {
      failures.push("each outboundProviders item must contain provider");
      continue;
    }
    expectOnlyKeys(
      item,
      [
        "status",
        "completedAt",
        "evidenceRef",
        "provider",
        "lifecyclePassed",
        "endpointAllowlistVerified",
        "secretManagerReferenceVerified",
        "credentialRotationPassed",
        "retryDeadLetterAlertingPassed"
      ],
      `outboundProviders.${item.provider}`,
      failures
    );
    if (found.has(item.provider))
      failures.push(`duplicate outbound provider evidence: ${item.provider}`);
    found.set(item.provider, item);
  }
  const expected = new Set(enabledProviders);
  for (const provider of found.keys()) {
    if (!expected.has(provider))
      failures.push(`unexpected outbound provider evidence: ${provider}`);
  }
  for (const provider of expected) {
    const item = found.get(provider);
    if (!isPlainObject(item)) {
      failures.push(`missing outbound provider evidence: ${provider}`);
      continue;
    }
    requirePassed(item, `outboundProviders.${provider}`, failures);
    for (const field of [
      "lifecyclePassed",
      "endpointAllowlistVerified",
      "secretManagerReferenceVerified",
      "credentialRotationPassed",
      "retryDeadLetterAlertingPassed"
    ]) {
      requireTrue(item[field], `outboundProviders.${provider}.${field}`, failures);
    }
    requireEvidenceRef(item.evidenceRef, `outboundProviders.${provider}.evidenceRef`, failures);
  }
}

function validateIdentity(value, expectedMode, failures) {
  requireObject(value, "identity", failures);
  if (!isPlainObject(value)) return;
  expectOnlyKeys(
    value,
    expectedMode === "disabled"
      ? ["mode"]
      : expectedMode === "oidc"
        ? ["mode", "oidc"]
        : ["mode", "oidc", "scim"],
    "identity",
    failures
  );
  if (value.mode !== expectedMode) failures.push(`identity.mode must be ${expectedMode}`);
  if (expectedMode === "disabled") return;
  requireObject(value.oidc, "identity.oidc", failures);
  if (isPlainObject(value.oidc)) {
    expectOnlyKeys(
      value.oidc,
      [
        "status",
        "completedAt",
        "evidenceRef",
        "issuerDiscoveryPassed",
        "loginPassed",
        "clientSecretReferenceVerified",
        "clientSecretRotationPassed",
        "securityAuditVerified"
      ],
      "identity.oidc",
      failures
    );
    requirePassed(value.oidc, "identity.oidc", failures);
    for (const field of [
      "issuerDiscoveryPassed",
      "loginPassed",
      "clientSecretReferenceVerified",
      "clientSecretRotationPassed",
      "securityAuditVerified"
    ]) {
      requireTrue(value.oidc[field], `identity.oidc.${field}`, failures);
    }
    requireEvidenceRef(value.oidc.evidenceRef, "identity.oidc.evidenceRef", failures);
  }
  if (expectedMode !== "oidc-scim") return;
  requireObject(value.scim, "identity.scim", failures);
  if (isPlainObject(value.scim)) {
    expectOnlyKeys(
      value.scim,
      [
        "status",
        "completedAt",
        "evidenceRef",
        "tokenRotationPassed",
        "provisionPassed",
        "deactivationPassed",
        "membershipVerified",
        "securityAuditVerified"
      ],
      "identity.scim",
      failures
    );
    requirePassed(value.scim, "identity.scim", failures);
    for (const field of [
      "tokenRotationPassed",
      "provisionPassed",
      "deactivationPassed",
      "membershipVerified",
      "securityAuditVerified"
    ]) {
      requireTrue(value.scim[field], `identity.scim.${field}`, failures);
    }
    requireEvidenceRef(value.scim.evidenceRef, "identity.scim.evidenceRef", failures);
  }
}

function requirePassed(value, label, failures) {
  if (value.status !== "passed") failures.push(`${label}.status must be passed`);
  timestamp(value.completedAt, `${label}.completedAt`, failures);
}

function requireEvidenceRef(value, label, failures) {
  if (
    typeof value !== "string" ||
    value.length < 8 ||
    value.length > 512 ||
    PLACEHOLDER_PATTERN.test(value)
  ) {
    failures.push(`${label} must be a non-placeholder HTTPS or URN reference`);
    return;
  }
  try {
    const parsed = new URL(value);
    if (
      !["https:", "urn:"].includes(parsed.protocol) ||
      parsed.username ||
      parsed.password ||
      parsed.search ||
      parsed.hash
    ) {
      failures.push(
        `${label} must be an HTTPS or URN reference without credentials, query, or fragment`
      );
    }
  } catch {
    failures.push(`${label} must be a valid HTTPS or URN reference`);
  }
}

function requireObject(value, label, failures) {
  if (!isPlainObject(value)) failures.push(`${label} must be an object`);
}

function requireSafe(value, label, failures) {
  if (!safeIdentifier(value))
    failures.push(`${label} must be a bounded non-placeholder identifier`);
}

function requireTrue(value, label, failures) {
  if (value !== true) failures.push(`${label} must be true`);
}

function expectOnlyKeys(value, allowedKeys, label, failures) {
  const allowed = new Set(allowedKeys);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) failures.push(`${label}.${key} is not allowed by the evidence schema`);
  }
}

function timestamp(value, label, failures) {
  if (typeof value !== "string") {
    failures.push(`${label} must be an ISO timestamp`);
    return undefined;
  }
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) {
    failures.push(`${label} must be an ISO timestamp`);
    return undefined;
  }
  return parsed;
}

function validateCompletionTimes(value, generatedAt, now, maxAgeHours, failures, location = "$") {
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      validateCompletionTimes(
        item,
        generatedAt,
        now,
        maxAgeHours,
        failures,
        `${location}[${index}]`
      )
    );
    return;
  }
  if (!isPlainObject(value)) return;
  for (const [key, item] of Object.entries(value)) {
    const itemLocation = `${location}.${key}`;
    if (key === "completedAt" && typeof item === "string") {
      const completedAt = Date.parse(item);
      if (Number.isFinite(completedAt)) {
        if (completedAt > now.getTime()) failures.push(`${itemLocation} cannot be in the future`);
        if (generatedAt !== undefined && completedAt > generatedAt) {
          failures.push(`${itemLocation} cannot be later than generatedAt`);
        }
        if ((now.getTime() - completedAt) / 3_600_000 > maxAgeHours) {
          failures.push(`${itemLocation} is older than ${maxAgeHours} hours`);
        }
      }
    }
    validateCompletionTimes(item, generatedAt, now, maxAgeHours, failures, itemLocation);
  }
}

function safeIdentifier(value) {
  return (
    typeof value === "string" &&
    value.length >= 2 &&
    value.length <= 160 &&
    /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/.test(value) &&
    !PLACEHOLDER_PATTERN.test(value)
  );
}

function scanForSecrets(value, location, failures) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => scanForSecrets(item, `${location}[${index}]`, failures));
    return;
  }
  if (!isPlainObject(value)) {
    if (typeof value === "string" && SECRET_VALUE_PATTERNS.some((pattern) => pattern.test(value))) {
      failures.push(`${location} appears to contain credential material`);
    }
    return;
  }
  for (const [key, item] of Object.entries(value)) {
    if (SECRET_KEY_PATTERN.test(key))
      failures.push(`${location}.${key} is a forbidden secret field`);
    scanForSecrets(item, `${location}.${key}`, failures);
  }
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isInside(candidate, parent) {
  const relative = path.relative(parent, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function cli() {
  const workspace = process.cwd();
  const file = requiredEnv("TESTHISTORY_PRODUCTION_EVIDENCE_FILE");
  const environment = requiredEnv("TESTHISTORY_PRODUCTION_ENVIRONMENT");
  const releaseId = requiredEnv("TESTHISTORY_RELEASE_ID");
  const enabledProviders = parseEnabledProviders(
    process.env.TESTHISTORY_ENABLED_OUTBOUND_PROVIDERS
  );
  const identityMode = requiredEnv("TESTHISTORY_IDENTITY_DRILL_MODE");
  if (!IDENTITY_MODES.has(identityMode))
    throw new Error(`Unsupported identity drill mode: ${identityMode}`);
  const maxAgeHours = Number(
    process.env.TESTHISTORY_EVIDENCE_MAX_AGE_HOURS ?? DEFAULT_MAX_AGE_HOURS
  );
  if (!Number.isInteger(maxAgeHours) || maxAgeHours < 1 || maxAgeHours > MAX_MAX_AGE_HOURS) {
    throw new Error(
      `TESTHISTORY_EVIDENCE_MAX_AGE_HOURS must be an integer from 1 to ${MAX_MAX_AGE_HOURS}`
    );
  }
  const evidence = loadExternalEvidence(file, workspace);
  const failures = verifyProductionReadinessEvidence(evidence, {
    environment,
    releaseId,
    enabledProviders,
    identityMode,
    maxAgeHours
  });
  if (failures.length > 0) {
    throw new Error(`Production readiness evidence rejected:\n- ${failures.join("\n- ")}`);
  }
  console.log(
    `Production readiness evidence passed: environment=${environment} release=${releaseId} outboundProviders=${enabledProviders.length} identity=${identityMode}`
  );
}

const invokedPath = process.argv[1] === undefined ? "" : path.resolve(process.argv[1]);
if (invokedPath === fileURLToPath(import.meta.url)) {
  try {
    cli();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
