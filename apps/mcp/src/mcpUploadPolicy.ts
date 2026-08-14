export const uploadPolicy = {
  version: "2026-05-30",
  purpose: "Help agents decide what to collect before uploading automated test history.",
  supportedInputs: [
    {
      format: "allure-results",
      acceptedFiles: [
        "*-result.json",
        "*-container.json",
        "categories.json",
        "environment.properties",
        "executor.json",
        "attachments/**/*"
      ],
      notes:
        "Prefer the raw Allure results directory or archive, not an already-rendered Allure report."
    },
    {
      format: "junit-xml",
      acceptedFiles: ["*.xml"],
      notes:
        "Keep suite, testcase, failure, skipped, stdout, and stderr fields intact when available."
    }
  ],
  sessionDiscovery: {
    required: ["projectId", "launchName", "sourceFormat"],
    recommended: ["branch", "commitSha", "buildUrl", "ciProvider", "environment", "startedAt"],
    identityGuidance: [
      "Use a stable projectId for the product or repository under test.",
      "Use a launchName that identifies the CI run, local run, or release candidate.",
      "Preserve test history identifiers from the source format when present."
    ]
  },
  uploadWorkflow: [
    "Discover or create a session descriptor using testhistory.upload.session.schema.",
    "Validate that result files are raw outputs from the test runner.",
    "Attach provenance such as branch, commit, build URL, and environment.",
    "Upload artifacts to the API ingestion endpoint selected by the client.",
    "Evaluate quality gates after ingestion using testhistory.quality-gate.rules."
  ],
  mcpBoundary: {
    access: "schema-only",
    mutationAllowed: false,
    chunkUploadsAllowed: false,
    backendCalls: false
  },
  safetyChecks: [
    "Do not upload secrets from environment files, logs, or attachments.",
    "Redact tokens, cookies, passwords, private keys, and customer personal data before upload.",
    "Keep attachment paths relative to the upload root.",
    "Avoid mixing results from unrelated projects or commits in one launch."
  ],
  backendRequirement:
    "This discovery response is static and does not require a running TestHistory API."
};
