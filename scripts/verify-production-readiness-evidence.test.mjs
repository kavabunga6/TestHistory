import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  loadExternalEvidence,
  parseEnabledProviders,
  verifyProductionReadinessEvidence
} from "./verify-production-readiness-evidence.mjs";

const now = new Date("2026-08-09T12:00:00.000Z");

test("accepts complete current evidence for explicitly enabled providers", () => {
  const failures = verifyProductionReadinessEvidence(fixture(), {
    environment: "production-eu",
    releaseId: "sha-1234567890",
    enabledProviders: ["notification:pachca", "issue:jira"],
    identityMode: "oidc-scim",
    maxAgeHours: 168,
    now
  });
  assert.deepEqual(failures, []);
});

test("fails closed when a required provider drill or restore assertion is absent", () => {
  const evidence = fixture();
  evidence.backupRestore.apiSmokePassed = false;
  evidence.outboundProviders = evidence.outboundProviders.filter(
    (item) => item.provider !== "issue:jira"
  );
  const failures = verifyProductionReadinessEvidence(evidence, {
    environment: "production-eu",
    releaseId: "sha-1234567890",
    enabledProviders: ["notification:pachca", "issue:jira"],
    identityMode: "oidc-scim",
    maxAgeHours: 168,
    now
  });
  assert.ok(failures.includes("backupRestore.apiSmokePassed must be true"));
  assert.ok(failures.includes("missing outbound provider evidence: issue:jira"));
});

test("rejects expired, mismatched, placeholder, and secret-bearing evidence", () => {
  const evidence = fixture();
  evidence.environment = "staging";
  evidence.validUntil = "2026-08-08T12:00:00.000Z";
  evidence.backupRestore.evidenceRef = "urn:testhistory:evidence:placeholder";
  evidence.password = "should-never-be-here";
  const failures = verifyProductionReadinessEvidence(evidence, {
    environment: "production-eu",
    releaseId: "sha-1234567890",
    enabledProviders: ["notification:pachca", "issue:jira"],
    identityMode: "oidc-scim",
    maxAgeHours: 168,
    now
  });
  assert.ok(failures.some((failure) => failure.startsWith("environment does not match")));
  assert.ok(failures.includes("evidence has expired"));
  assert.ok(failures.some((failure) => failure.startsWith("backupRestore.evidenceRef")));
  assert.ok(failures.includes("$.password is a forbidden secret field"));
});

test("rejects a freshly wrapped attestation around a stale drill", () => {
  const evidence = fixture();
  evidence.backupRestore.completedAt = "2026-07-01T10:00:00.000Z";
  const failures = verifyProductionReadinessEvidence(evidence, {
    environment: "production-eu",
    releaseId: "sha-1234567890",
    enabledProviders: ["notification:pachca", "issue:jira"],
    identityMode: "oidc-scim",
    maxAgeHours: 168,
    now
  });
  assert.ok(failures.includes("$.backupRestore.completedAt is older than 168 hours"));
});

test("requires an explicit provider set", () => {
  assert.throws(() => parseEnabledProviders(undefined), /must be set/);
  assert.deepEqual(parseEnabledProviders("none"), []);
  assert.deepEqual(parseEnabledProviders("issue:jira,notification:pachca,issue:jira"), [
    "issue:jira",
    "notification:pachca"
  ]);
  assert.throws(
    () => parseEnabledProviders("notification:unknown"),
    /Unsupported outbound provider/
  );
});

test("loads only bounded evidence files outside the repository", () => {
  const root = mkdtempSync(path.join(tmpdir(), "testhistory-evidence-test-"));
  const workspace = path.join(root, "workspace");
  mkdirSync(workspace);
  const external = path.join(root, "evidence.json");
  writeFileSync(external, JSON.stringify(fixture()));
  assert.equal(loadExternalEvidence(external, workspace).schemaVersion, 1);

  const internal = path.join(workspace, "evidence.json");
  writeFileSync(internal, JSON.stringify(fixture()));
  assert.throws(() => loadExternalEvidence(internal, workspace), /outside the repository/);
  assert.throws(() => loadExternalEvidence("relative.json", workspace), /must be absolute/);
});

function fixture() {
  const passed = (suffix) => ({
    status: "passed",
    completedAt: "2026-08-09T10:00:00.000Z",
    evidenceRef: `urn:testhistory:evidence:${suffix}`
  });
  return {
    schemaVersion: 1,
    environment: "production-eu",
    releaseId: "sha-1234567890",
    generatedAt: "2026-08-09T11:00:00.000Z",
    validUntil: "2026-08-10T11:00:00.000Z",
    attestation: {
      performedByRole: "platform-operator",
      approvedByRole: "release-manager",
      changeTicket: "CHG-1042"
    },
    backupRestore: {
      ...passed("restore-1042"),
      postgresBaseRestorePassed: true,
      postgresPointInTimeRecoveryPassed: true,
      artifactRestorePassed: true,
      isolatedEnvironment: true,
      migrationVersionVerified: true,
      migrationVersion: "2026.08.09-1",
      apiSmokePassed: true
    },
    objectStorage: {
      ...passed("s3-1042"),
      provider: "s3-compatible",
      writeReadDeletePassed: true,
      retentionPassed: true,
      credentialRotationPassed: true
    },
    outboundProviders: ["notification:pachca", "issue:jira"].map((provider) => ({
      ...passed(provider.replace(":", "-")),
      provider,
      lifecyclePassed: true,
      endpointAllowlistVerified: true,
      secretManagerReferenceVerified: true,
      credentialRotationPassed: true,
      retryDeadLetterAlertingPassed: true
    })),
    identity: {
      mode: "oidc-scim",
      oidc: {
        ...passed("oidc-1042"),
        issuerDiscoveryPassed: true,
        loginPassed: true,
        clientSecretReferenceVerified: true,
        clientSecretRotationPassed: true,
        securityAuditVerified: true
      },
      scim: {
        ...passed("scim-1042"),
        tokenRotationPassed: true,
        provisionPassed: true,
        deactivationPassed: true,
        membershipVerified: true,
        securityAuditVerified: true
      }
    }
  };
}
