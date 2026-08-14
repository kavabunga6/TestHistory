export const uploadSessionSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  title: "TestHistoryUploadSession",
  type: "object",
  additionalProperties: false,
  required: ["projectId", "launchName", "sourceFormat", "results"],
  properties: {
    projectId: {
      type: "string",
      minLength: 1,
      description: "Stable TestHistory project identifier."
    },
    launchName: {
      type: "string",
      minLength: 1,
      description: "Human-readable run name, for example main #1842 or nightly chrome."
    },
    sourceFormat: {
      type: "string",
      enum: ["allure-results", "junit-xml"],
      description: "Raw test result format being uploaded."
    },
    branch: { type: "string" },
    commitSha: {
      type: "string",
      pattern: "^[a-fA-F0-9]{7,40}$"
    },
    buildUrl: {
      type: "string",
      format: "uri"
    },
    ciProvider: {
      type: "string",
      examples: ["github-actions", "gitlab-ci", "jenkins", "local"]
    },
    environment: {
      type: "object",
      additionalProperties: { type: "string" },
      description: "Small, non-secret key/value context such as browser, OS, region, or test shard."
    },
    startedAt: {
      type: "string",
      format: "date-time"
    },
    finishedAt: {
      type: "string",
      format: "date-time"
    },
    results: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["path"],
        properties: {
          path: {
            type: "string",
            minLength: 1,
            description: "Relative file or directory path included in the upload payload."
          },
          kind: {
            type: "string",
            enum: ["file", "directory", "archive"],
            default: "file"
          },
          mediaType: {
            type: "string",
            examples: ["application/json", "application/xml", "application/zip"]
          },
          sha256: {
            type: "string",
            pattern: "^[a-fA-F0-9]{64}$"
          }
        }
      }
    },
    labels: {
      type: "object",
      additionalProperties: { type: "string" },
      description: "Searchable launch labels. Avoid secrets."
    }
  },
  examples: [
    {
      projectId: "web",
      launchName: "main #1842",
      sourceFormat: "allure-results",
      branch: "main",
      commitSha: "4f3c2a1",
      ciProvider: "github-actions",
      buildUrl: "https://github.com/acme/web/actions/runs/1842",
      environment: {
        browser: "chromium",
        os: "ubuntu-24.04"
      },
      results: [{ path: "allure-results", kind: "directory" }]
    }
  ]
};
