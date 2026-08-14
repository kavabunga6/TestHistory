import {
  expectNoRealExportEndpointsCredentialsOrSignedUrls,
  expectOperationsWorkflowCoverage,
  markdownSection,
  parsePolicyConfigMap
} from "./k8s-policy-readiness.mjs";

export function expectAttachmentPreviewRetentionDescriptorPolicy(manifests, docs, workflows) {
  const policy = manifests.get("attachment-preview-retention-policy.yaml") ?? "";
  const kustomization = manifests.get("kustomization.yaml") ?? "";
  const operations = docs.get("docs/operations.md") ?? "";
  const descriptorSection = markdownSection(
    operations,
    "Attachment Preview Retention Descriptor Policy",
    "Security Audit Retention And Export Policy"
  );
  const config = parsePolicyConfigMap(policy);

  if (!kustomization.includes("attachment-preview-retention-policy.yaml")) {
    throw new Error("kustomization.yaml must include attachment preview retention policy");
  }

  for (const [key, expected] of [
    ["ATTACHMENT_PREVIEW_RETENTION_DESCRIPTOR_MODE", "materialized-descriptor-dry-run-only"],
    ["ATTACHMENT_PREVIEW_RETENTION_DESCRIPTOR_SURFACE", "existing-read-model-descriptor-only"],
    ["ATTACHMENT_PREVIEW_RETENTION_DESCRIPTOR_PAYLOAD_CLASS", "metadata-only-redacted"],
    ["ATTACHMENT_PREVIEW_RETENTION_DESCRIPTOR_SCOPE", "project-and-actor-placeholder"],
    [
      "ATTACHMENT_PREVIEW_RETENTION_DESCRIPTOR_STATES",
      "eligible,retained,expired,previewed,skipped"
    ],
    ["ATTACHMENT_PREVIEW_RETENTION_DESCRIPTOR_SAMPLE_LIMIT", "25"],
    ["ATTACHMENT_PREVIEW_RETENTION_DESCRIPTOR_DELETE_MODE", "preview-before-delete"],
    ["ATTACHMENT_PREVIEW_RETENTION_DESCRIPTOR_EXECUTION", "none-dry-run"],
    ["ATTACHMENT_PREVIEW_RETENTION_DESCRIPTOR_PROVIDER_ENDPOINTS", "none"],
    ["ATTACHMENT_PREVIEW_RETENTION_DESCRIPTOR_SECRET_MOUNTS", "none"],
    ["ATTACHMENT_PREVIEW_RETENTION_DESCRIPTOR_STORAGE_REFS", "none"],
    ["ATTACHMENT_PREVIEW_RETENTION_DESCRIPTOR_SIGNED_URLS", "none"],
    ["ATTACHMENT_PREVIEW_RETENTION_DESCRIPTOR_TOKENS", "none"],
    ["ATTACHMENT_PREVIEW_RETENTION_DESCRIPTOR_RAW_ATTACHMENTS", "none"]
  ]) {
    if (config.get(key) !== expected) {
      throw new Error(`${key} must be ${expected}`);
    }
  }

  for (const file of ["api-deployment.yaml", "mcp-deployment.yaml"]) {
    const manifest = manifests.get(file) ?? "";
    for (const snippet of [
      'testhistory.io/attachment-preview-retention-descriptor: "dry-run-redacted"',
      'testhistory.io/attachment-preview-retention-secret-mount: "none"',
      'testhistory.io/attachment-preview-retention-provider-endpoints: "none"'
    ]) {
      if (!manifest.includes(snippet)) {
        throw new Error(`${file} is missing attachment descriptor annotation: ${snippet}`);
      }
    }
    for (const forbidden of [
      "ATTACHMENT_PREVIEW_RETENTION_SECRET",
      "ATTACHMENT_PREVIEW_RETENTION_TOKEN",
      "ATTACHMENT_PREVIEW_RETENTION_ENDPOINT",
      "ATTACHMENT_PREVIEW_RETENTION_STORAGE"
    ]) {
      if (manifest.includes(forbidden)) {
        throw new Error(`${file} must not wire ${forbidden} for descriptor reads`);
      }
    }
  }

  const worker = manifests.get("worker-deployment.yaml") ?? "";
  for (const snippet of [
    'testhistory.io/attachment-preview-retention-descriptor: "dry-run-redacted"',
    'testhistory.io/attachment-preview-retention-execution: "none-dry-run"'
  ]) {
    if (!worker.includes(snippet)) {
      throw new Error(
        `worker-deployment.yaml is missing attachment descriptor annotation: ${snippet}`
      );
    }
  }

  for (const snippet of [
    "ATTACHMENT_PREVIEW_RETENTION_DESCRIPTOR_MODE=materialized-descriptor-dry-run-only",
    "ATTACHMENT_PREVIEW_RETENTION_DESCRIPTOR_SURFACE=existing-read-model-descriptor-only",
    "ATTACHMENT_PREVIEW_RETENTION_DESCRIPTOR_PAYLOAD_CLASS=metadata-only-redacted",
    "ATTACHMENT_PREVIEW_RETENTION_DESCRIPTOR_DELETE_MODE=preview-before-delete",
    "ATTACHMENT_PREVIEW_RETENTION_DESCRIPTOR_EXECUTION=none-dry-run",
    "ATTACHMENT_PREVIEW_RETENTION_DESCRIPTOR_PROVIDER_ENDPOINTS=none",
    "ATTACHMENT_PREVIEW_RETENTION_DESCRIPTOR_SECRET_MOUNTS=none",
    "ATTACHMENT_PREVIEW_RETENTION_DESCRIPTOR_STORAGE_REFS=none",
    "ATTACHMENT_PREVIEW_RETENTION_DESCRIPTOR_SIGNED_URLS=none",
    "ATTACHMENT_PREVIEW_RETENTION_DESCRIPTOR_TOKENS=none",
    "ATTACHMENT_PREVIEW_RETENTION_DESCRIPTOR_RAW_ATTACHMENTS=none",
    "provider-neutral, secret-free, storage-reference-free, signed-URL-free, token-free, and raw-attachment-free",
    "does not introduce a new runtime endpoint",
    "descriptor contract validation only",
    "must never execute deletion",
    "npm run k8s:validate",
    "npm run guard:sensitive",
    "git diff --check -- infra/k8s .github/workflows docs/operations.md docs/screenshots/README.md scripts"
  ]) {
    if (!descriptorSection.includes(snippet)) {
      throw new Error(`docs/operations.md is missing attachment descriptor wording: ${snippet}`);
    }
  }

  const sample = buildAttachmentPreviewRetentionDescriptorSample(config);
  if (
    sample.readOnly !== true ||
    sample.dryRun !== true ||
    sample.providerNeutral !== true ||
    sample.secretFree !== true ||
    sample.storageRefsIncluded !== false ||
    sample.signedUrlsIncluded !== false ||
    sample.tokensIncluded !== false ||
    sample.rawAttachmentsIncluded !== false ||
    sample.deletionExecution !== false ||
    sample.providerEndpointsIncluded !== false ||
    sample.secretMountPolicy !== "none"
  ) {
    throw new Error(
      `Attachment descriptor sample must stay dry-run redacted: ${JSON.stringify(sample)}`
    );
  }

  const serialized = JSON.stringify(sample);
  for (const marker of [
    "https://",
    "http://",
    "X-Amz-Signature",
    "Authorization",
    "Bearer ",
    "C:\\",
    "/Users/",
    "storage://",
    "minio://",
    "blob://",
    '"signedUrl":',
    "token="
  ]) {
    if (serialized.includes(marker)) {
      throw new Error(`Attachment descriptor sample leaked forbidden marker: ${marker}`);
    }
  }

  expectNoRealExportEndpointsCredentialsOrSignedUrls(
    "infra/k8s/base/attachment-preview-retention-policy.yaml",
    policy
  );
  expectNoRealExportEndpointsCredentialsOrSignedUrls(
    "docs/operations.md#attachment-preview-retention-descriptor-policy",
    descriptorSection
  );

  expectOperationsWorkflowCoverage(workflows, "attachment descriptor");
}

function buildAttachmentPreviewRetentionDescriptorSample(config) {
  return {
    kind: "attachment-preview-retention-materialized-descriptor",
    mode: config.get("ATTACHMENT_PREVIEW_RETENTION_DESCRIPTOR_MODE"),
    surface: config.get("ATTACHMENT_PREVIEW_RETENTION_DESCRIPTOR_SURFACE"),
    payloadClass: config.get("ATTACHMENT_PREVIEW_RETENTION_DESCRIPTOR_PAYLOAD_CLASS"),
    scope: config.get("ATTACHMENT_PREVIEW_RETENTION_DESCRIPTOR_SCOPE"),
    states: config.get("ATTACHMENT_PREVIEW_RETENTION_DESCRIPTOR_STATES")?.split(",") ?? [],
    sampleLimit: Number(config.get("ATTACHMENT_PREVIEW_RETENTION_DESCRIPTOR_SAMPLE_LIMIT")),
    deleteMode: config.get("ATTACHMENT_PREVIEW_RETENTION_DESCRIPTOR_DELETE_MODE"),
    execution: config.get("ATTACHMENT_PREVIEW_RETENTION_DESCRIPTOR_EXECUTION"),
    providerEndpointPolicy: config.get(
      "ATTACHMENT_PREVIEW_RETENTION_DESCRIPTOR_PROVIDER_ENDPOINTS"
    ),
    secretMountPolicy: config.get("ATTACHMENT_PREVIEW_RETENTION_DESCRIPTOR_SECRET_MOUNTS"),
    storageRefPolicy: config.get("ATTACHMENT_PREVIEW_RETENTION_DESCRIPTOR_STORAGE_REFS"),
    signedUrlPolicy: config.get("ATTACHMENT_PREVIEW_RETENTION_DESCRIPTOR_SIGNED_URLS"),
    tokenPolicy: config.get("ATTACHMENT_PREVIEW_RETENTION_DESCRIPTOR_TOKENS"),
    rawAttachmentPolicy: config.get("ATTACHMENT_PREVIEW_RETENTION_DESCRIPTOR_RAW_ATTACHMENTS"),
    readOnly: true,
    dryRun: true,
    providerNeutral: true,
    secretFree: true,
    storageRefsIncluded: false,
    signedUrlsIncluded: false,
    tokensIncluded: false,
    rawAttachmentsIncluded: false,
    deletionExecution: false,
    providerEndpointsIncluded: false
  };
}
