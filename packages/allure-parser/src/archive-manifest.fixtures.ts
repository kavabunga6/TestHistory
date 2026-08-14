import type { AllureArchiveManifestEntryInput } from "./index.js";

export type SyntheticArchiveDiagnosticReplayFixtureName =
  | "corrupt"
  | "empty"
  | "denied"
  | "partial"
  | "duplicate"
  | "retry"
  | "materialized"
  | "adapter-variants"
  | "corrupt-partial-records";

export type SyntheticArchiveDiagnosticReplayFixture = {
  name: SyntheticArchiveDiagnosticReplayFixtureName;
  manifestEntries: AllureArchiveManifestEntryInput[];
  resultFiles: Array<{
    path: string;
    content: string;
  }>;
  expected: {
    supportedFiles: number;
    attachmentFiles: number;
    ignoredFiles: number;
    warningCount: number;
    parseErrors: number;
    attemptGroups: number;
    latestStatuses: string[];
  };
};

export const syntheticArchiveManifestEntries: AllureArchiveManifestEntryInput[] = [
  {
    path: "allure-results/0b62f8-result.json",
    size: 2048,
    compressedSize: 512
  },
  {
    name: "allure-results/0b62f8-container.json",
    uncompressedSize: 900,
    compressedSizeBytes: 300
  },
  "allure-results/environment.properties",
  "allure-results/history/history-trend.json",
  {
    fileName: "allure-results/91dd11-attachment.png",
    size: 1_500_000,
    compressedSize: 1_100_000,
    comment: "synthetic metadata comment token=synthetic-fixture-token"
  },
  {
    path: "allure-results/readme.md",
    size: 120,
    compressedSize: 80
  },
  {
    path: "allure-results/empty-directory",
    directory: true
  }
];

export const syntheticUnsafeArchiveManifestEntries: AllureArchiveManifestEntryInput[] = [
  "../outside/result.json",
  "%2e%2e/outside/result.json",
  "C:\\Users\\tester\\Downloads\\secret-result.json",
  "/tmp/secret-result.json",
  "allure-results\\..\\secret.txt",
  {
    path: "https://object.example.test/allure-results.zip?token=synthetic-url-token",
    size: 42
  },
  {
    name: "allure-results/safe-attachment.txt",
    localPath: "C:\\Users\\tester\\Downloads\\safe-attachment.txt",
    payload: "password=synthetic-payload-password"
  }
];

export const syntheticArchiveDiagnosticReplayFixtures: SyntheticArchiveDiagnosticReplayFixture[] = [
  {
    name: "corrupt",
    manifestEntries: [
      {
        path: "allure-results/replay/corrupt-result.json",
        size: 128,
        compressedSize: 64
      },
      {
        path: "allure-results/replay/corrupt-attachment.txt",
        size: 32,
        compressedSize: 16
      }
    ],
    resultFiles: [
      {
        path: "allure-results/replay/corrupt-result.json",
        content: "{"
      }
    ],
    expected: {
      supportedFiles: 2,
      attachmentFiles: 1,
      ignoredFiles: 0,
      warningCount: 0,
      parseErrors: 1,
      attemptGroups: 0,
      latestStatuses: []
    }
  },
  {
    name: "empty",
    manifestEntries: [],
    resultFiles: [],
    expected: {
      supportedFiles: 0,
      attachmentFiles: 0,
      ignoredFiles: 0,
      warningCount: 0,
      parseErrors: 0,
      attemptGroups: 0,
      latestStatuses: []
    }
  },
  {
    name: "denied",
    manifestEntries: [
      "Z:\\synthetic-denied\\result.json",
      "storage://synthetic-bucket/replay/result.json",
      "https://object.invalid/replay.zip?X-Amz-Signature=synthetic-denied-signature",
      "../synthetic-denied/outside-result.json"
    ],
    resultFiles: [],
    expected: {
      supportedFiles: 0,
      attachmentFiles: 0,
      ignoredFiles: 0,
      warningCount: 4,
      parseErrors: 0,
      attemptGroups: 0,
      latestStatuses: []
    }
  },
  {
    name: "partial",
    manifestEntries: [
      {
        path: "allure-results/replay/partial-result.json",
        size: 512,
        compressedSize: 256
      },
      {
        path: "allure-results/replay/partial-container.json",
        size: 256,
        compressedSize: 128
      },
      {
        path: "allure-results/replay/partial-unsupported.log",
        size: 64,
        compressedSize: 32
      },
      {
        path: "allure-results/replay/partial-attachment.png",
        size: 2048,
        compressedSize: 1024
      }
    ],
    resultFiles: [
      {
        path: "allure-results/replay/partial-result.json",
        content: JSON.stringify({
          uuid: "partial-result",
          historyId: "archive-diagnostic-partial",
          name: "partial archive diagnostic",
          status: "failed",
          start: 100,
          stop: 145,
          statusDetails: {
            message: "Synthetic failure while reading token=synthetic-partial-token"
          },
          attachments: [
            {
              name: "partial screenshot",
              source: "replay/partial-attachment.png",
              type: "image/png"
            }
          ]
        })
      }
    ],
    expected: {
      supportedFiles: 3,
      attachmentFiles: 1,
      ignoredFiles: 1,
      warningCount: 1,
      parseErrors: 0,
      attemptGroups: 1,
      latestStatuses: ["failed"]
    }
  },
  {
    name: "duplicate",
    manifestEntries: [
      {
        path: "allure-results/replay/a/duplicate-result.json",
        size: 256
      },
      {
        path: "allure-results/replay/b/duplicate-result.json",
        size: 512
      },
      {
        path: "allure-results/replay/b/duplicate-attachment.txt",
        size: 128
      }
    ],
    resultFiles: [
      {
        path: "allure-results/replay/a/duplicate-result.json",
        content: JSON.stringify({
          uuid: "duplicate-a",
          historyId: "archive-diagnostic-duplicate-a",
          name: "duplicate archive diagnostic a",
          status: "passed",
          start: 10,
          stop: 20
        })
      },
      {
        path: "allure-results/replay/b/duplicate-result.json",
        content: JSON.stringify({
          uuid: "duplicate-b",
          historyId: "archive-diagnostic-duplicate-b",
          name: "duplicate archive diagnostic b",
          status: "broken",
          start: 30,
          stop: 35
        })
      }
    ],
    expected: {
      supportedFiles: 3,
      attachmentFiles: 1,
      ignoredFiles: 0,
      warningCount: 1,
      parseErrors: 0,
      attemptGroups: 2,
      latestStatuses: ["passed", "broken"]
    }
  },
  {
    name: "retry",
    manifestEntries: [
      {
        path: "allure-results/replay/retry-first-result.json",
        size: 256
      },
      {
        path: "allure-results/replay/retry-second-result.json",
        size: 256
      }
    ],
    resultFiles: [
      {
        path: "allure-results/replay/retry-second-result.json",
        content: JSON.stringify({
          uuid: "retry-second",
          historyId: "archive-diagnostic-retry",
          name: "retry archive diagnostic",
          status: "passed",
          start: 200,
          stop: 230,
          retry: true,
          statusDetails: {
            flaky: true,
            message: "Recovered without leaking Authorization: Bearer synthetic-retry-token"
          }
        })
      },
      {
        path: "allure-results/replay/retry-first-result.json",
        content: JSON.stringify({
          uuid: "retry-first",
          historyId: "archive-diagnostic-retry",
          name: "retry archive diagnostic",
          status: "failed",
          start: 100,
          stop: 150,
          statusDetails: {
            message: "First synthetic attempt failed"
          }
        })
      }
    ],
    expected: {
      supportedFiles: 2,
      attachmentFiles: 0,
      ignoredFiles: 0,
      warningCount: 0,
      parseErrors: 0,
      attemptGroups: 1,
      latestStatuses: ["passed"]
    }
  },
  {
    name: "materialized",
    manifestEntries: [
      {
        path: "allure-results/materialized/materialized-result.json",
        size: 512,
        compressedSize: 128,
        payload: "raw archive payload token=synthetic-materialized-manifest-token",
        body: "raw archive body secret=synthetic-materialized-manifest-secret",
        localPath: "Z:\\synthetic-local\\materialized\\materialized-result.json"
      },
      {
        path: "allure-results/materialized/materialized-container.json",
        bodyBytes: "synthetic-materialized-body-bytes"
      },
      {
        path: "allure-results/materialized/materialized-attachment.txt",
        content: "raw attachment body token=synthetic-materialized-attachment-token"
      },
      "Z:\\synthetic-local\\materialized\\unsafe-result.json"
    ],
    resultFiles: [
      {
        path: "allure-results/materialized/materialized-result.json",
        content: JSON.stringify({
          uuid: "materialized-result",
          historyId: "archive-diagnostic-materialized",
          name: "materialized archive diagnostic",
          status: "custom-materialized-status",
          statusDetails: {
            message:
              "Materialized replay preserved context without Authorization: Bearer synthetic-materialized-bearer"
          },
          attachments: [
            {
              name: "materialized diagnostic payload",
              source: "materialized/materialized-attachment.txt",
              type: "text/plain",
              rawPayload: "raw payload token=synthetic-materialized-raw-payload-token",
              body: "raw body secret=synthetic-materialized-body-secret",
              localPath: "Z:\\synthetic-local\\materialized\\materialized-attachment.txt",
              signedUrl:
                "https://object.invalid/materialized?X-Amz-Signature=synthetic-materialized-signature"
            }
          ]
        })
      },
      {
        path: "Z:\\synthetic-local\\materialized\\broken-result.json",
        content: "{"
      }
    ],
    expected: {
      supportedFiles: 3,
      attachmentFiles: 1,
      ignoredFiles: 0,
      warningCount: 1,
      parseErrors: 1,
      attemptGroups: 1,
      latestStatuses: ["unknown"]
    }
  },
  {
    name: "adapter-variants",
    manifestEntries: [
      {
        name: ".\\allure-results\\adapter\\playwright-result.json",
        size: 301,
        payload: "raw archive payload token=synthetic-adapter-manifest-token"
      },
      {
        fileName: "allure-results%2Fadapter%2Fcypress-result.json",
        compressedSizeBytes: 144
      },
      {
        path: "allure-results/adapter/browser-attachment.txt",
        body: "raw archive attachment token=synthetic-adapter-attachment-token"
      },
      {
        path: "allure-results/adapter/adapter-metadata.bin",
        localPath: "Z:\\synthetic-local\\adapter\\adapter-metadata.bin"
      }
    ],
    resultFiles: [
      {
        path: "allure-results/adapter/playwright-result.json",
        content: JSON.stringify({
          uuid: "adapter-playwright-result",
          historyId: "archive-diagnostic-adapter-playwright",
          fullName: "synthetic.adapter.playwright",
          name: "adapter playwright result",
          status: "passed",
          start: 10,
          stop: 20,
          parameters: [
            { name: "browser", value: "chromium" },
            { name: "apiToken", value: "synthetic-adapter-parameter-token", mode: "masked" },
            { name: "session", value: "synthetic-adapter-session", mode: "hidden" }
          ],
          labels: [
            { name: "framework", value: "playwright" },
            { name: "secret", value: "synthetic-adapter-label-secret" }
          ],
          adapterMetadata: {
            framework: "playwright",
            retryOf: null,
            signedUrl: "https://object.invalid/adapter?X-Amz-Signature=synthetic-adapter-signed-url"
          },
          attachments: [
            {
              name: "adapter browser log",
              source: "adapter/browser-attachment.txt",
              type: "application/text",
              rawPayload: "raw payload token=synthetic-adapter-raw-payload-token"
            }
          ]
        })
      },
      {
        path: "allure-results/adapter/cypress-result.json",
        content: JSON.stringify({
          uuid: "adapter-cypress-result",
          testCaseId: "archive-diagnostic-adapter-cypress",
          name: "adapter cypress result",
          status: "adapter-flaky",
          start: 30,
          stop: 45,
          cypressMetadata: {
            retries: { current: 1, limit: 2 },
            cookie: "session=synthetic-adapter-cookie"
          },
          steps: [
            {
              name: "adapter before hook",
              statusDetails: {
                message:
                  "Adapter hook context at Z:\\synthetic-local\\adapter\\hook.log with token=synthetic-adapter-hook-token"
              },
              attachments: [
                {
                  name: "adapter hook payload",
                  source: "adapter/hook-attachment.json",
                  content: "raw hook content token=synthetic-adapter-hook-attachment-token"
                }
              ]
            }
          ]
        })
      }
    ],
    expected: {
      supportedFiles: 3,
      attachmentFiles: 1,
      ignoredFiles: 1,
      warningCount: 1,
      parseErrors: 0,
      attemptGroups: 2,
      latestStatuses: ["passed", "unknown"]
    }
  },
  {
    name: "corrupt-partial-records",
    manifestEntries: [
      {
        path: "allure-results/replay/partial-valid-result.json",
        size: 128
      },
      {
        path: "allure-results/replay/partial-missing-result.json",
        size: 96
      },
      {
        path: "allure-results/replay/partial-corrupt-result.json",
        size: 32
      },
      {
        path: "allure-results/replay/partial-corrupt-attachment.txt",
        size: 12
      },
      {
        path: "allure-results/replay/partial-corrupt-record.tmp",
        payload: "raw partial payload token=synthetic-corrupt-partial-manifest-token"
      }
    ],
    resultFiles: [
      {
        path: "allure-results/replay/partial-valid-result.json",
        content: JSON.stringify({
          uuid: "corrupt-partial-valid",
          historyId: "archive-diagnostic-corrupt-partial",
          name: "corrupt partial archive diagnostic",
          status: "failed",
          start: 5,
          stop: 9,
          statusDetails: {
            trace:
              "Synthetic stack included C:\\synthetic-local\\corrupt-partial\\corrupt.log and password=synthetic-corrupt-partial-password"
          }
        })
      },
      {
        path: "allure-results/replay/partial-missing-result.json",
        content: JSON.stringify({
          uuid: "",
          name: "",
          status: "passed",
          adapterMetadata: {
            payload: "raw missing field payload token=synthetic-corrupt-partial-missing-token"
          }
        })
      },
      {
        path: "Z:\\synthetic-local\\corrupt-partial\\partial-corrupt-result.json",
        content: "{"
      }
    ],
    expected: {
      supportedFiles: 4,
      attachmentFiles: 1,
      ignoredFiles: 1,
      warningCount: 1,
      parseErrors: 2,
      attemptGroups: 1,
      latestStatuses: ["failed"]
    }
  }
];
