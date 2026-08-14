import { describe, expect, it } from "vitest";
import {
  buildAllureParameterVariant,
  normalizeAllureArchiveManifest,
  normalizeAllureResult,
  normalizeAllureResultAttempts,
  parseAllureCategoriesJson,
  parseAllureCompatibilityFile,
  parseAllureResultJson,
  parseEnvironmentProperties
} from "./index.js";
import {
  syntheticArchiveManifestEntries,
  syntheticArchiveDiagnosticReplayFixtures,
  syntheticUnsafeArchiveManifestEntries
} from "./archive-manifest.fixtures.js";

describe("allure parser", () => {
  it("parses and normalizes a minimal result", () => {
    const parsed = parseAllureResultJson(
      JSON.stringify({
        uuid: "result-1",
        name: "checks order total",
        status: "passed",
        start: 1000,
        stop: 1250,
        labels: [{ name: "feature", value: "Checkout" }]
      })
    );

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }

    const normalized = normalizeAllureResult(parsed.value);
    expect(normalized.durationMs).toBe(250);
    expect(normalized.labels.feature).toEqual(["Checkout"]);
    expect(normalized.status).toBe("passed");
  });

  it("keeps parser tolerant for unknown statuses", () => {
    const parsed = parseAllureResultJson(
      JSON.stringify({
        uuid: "result-1",
        name: "checks order total",
        status: "custom"
      })
    );

    expect(parsed.ok).toBe(true);
    expect(parsed.warnings).toHaveLength(1);
    if (!parsed.ok) {
      return;
    }

    expect(normalizeAllureResult(parsed.value).status).toBe("unknown");
  });

  it("hides hidden parameters and masks masked parameters", () => {
    const parsed = parseAllureResultJson(
      JSON.stringify({
        uuid: "result-1",
        name: "login",
        parameters: [
          { name: "login", value: "admin" },
          { name: "password", value: "secret", mode: "masked" },
          { name: "token", value: "jwt", mode: "hidden" }
        ]
      })
    );

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }

    expect(normalizeAllureResult(parsed.value).parameters).toEqual([
      { name: "login", value: "admin" },
      { name: "password", value: "***", mode: "masked" },
      { name: "token", mode: "hidden" }
    ]);
  });

  it("preserves parameter modes for variants without revealing hidden values", () => {
    const variant = buildAllureParameterVariant([
      { name: "browser", value: "chromium" },
      { name: "password", value: "synthetic-password", mode: "masked" },
      { name: "token", value: "synthetic-jwt", mode: "hidden", excluded: true },
      { name: "seed", value: "synthetic-seed", excluded: true }
    ]);

    expect(variant.parameters).toEqual([
      { name: "browser", value: "chromium" },
      { name: "password", value: "***", mode: "masked" },
      { name: "token", mode: "hidden", excluded: true },
      { name: "seed", value: "synthetic-seed", excluded: true }
    ]);
    expect(variant.signature).toBe(
      JSON.stringify([
        { name: "browser", value: "chromium" },
        { name: "password", mode: "masked", value: "<masked>" }
      ])
    );
    expect(JSON.stringify(variant)).not.toContain("synthetic-password");
    expect(JSON.stringify(variant)).not.toContain("synthetic-jwt");
  });

  it("normalizes repeated results as ordered retry attempts without collapsing metadata", () => {
    const firstAttempt = {
      uuid: "attempt-1",
      historyId: "history-login-chromium",
      testCaseId: "case-login",
      name: "logs in",
      status: "failed" as const,
      start: 100,
      stop: 200,
      statusDetails: {
        message: "Expected dashboard",
        trace: "first synthetic stack"
      },
      parameters: [{ name: "browser", value: "chromium" }],
      adapterRetryMetadata: {
        reason: "synthetic assertion"
      }
    };
    const retryAttempt = {
      uuid: "attempt-2",
      historyId: "history-login-chromium",
      testCaseId: "case-login",
      name: "logs in",
      status: "passed" as const,
      start: 250,
      stop: 320,
      retry: true,
      statusDetails: {
        flaky: true,
        message: "Recovered on retry"
      },
      parameters: [{ name: "browser", value: "chromium" }],
      adapterRetryMetadata: {
        reason: "synthetic retry"
      }
    };

    const groups = normalizeAllureResultAttempts([retryAttempt, firstAttempt]);

    expect(groups).toHaveLength(1);
    expect(groups[0]?.identity).toEqual({
      source: "historyId",
      value: "history-login-chromium"
    });
    expect(groups[0]?.parameterVariant.parameters).toEqual([
      { name: "browser", value: "chromium" }
    ]);
    expect(groups[0]?.attempts.map((attempt) => attempt.result.uuid)).toEqual([
      "attempt-1",
      "attempt-2"
    ]);
    expect(groups[0]?.attempts.map((attempt) => attempt.retry)).toEqual([false, true]);
    expect(groups[0]?.attempts.map((attempt) => attempt.flaky)).toEqual([false, true]);
    expect(groups[0]?.latest.result.status).toBe("passed");
    expect(groups[0]?.attempts[0]?.statusDetails?.message).toBe("Expected dashboard");
    expect(groups[0]?.attempts[1]?.statusDetails?.flaky).toBe(true);
    expect((groups[0]?.latest.result.raw as Record<string, unknown>).retry).toBe(true);
    expect((groups[0]?.latest.result.raw as Record<string, unknown>).adapterRetryMetadata).toEqual({
      reason: "synthetic retry"
    });
  });

  it("keeps parameterized variants separate while excluded parameters do not split attempts", () => {
    const groups = normalizeAllureResultAttempts([
      {
        uuid: "chromium-1",
        testCaseId: "case-login",
        name: "logs in",
        status: "failed",
        start: 100,
        parameters: [
          { name: "browser", value: "chromium" },
          { name: "seed", value: "seed-a", excluded: true }
        ]
      },
      {
        uuid: "chromium-2",
        testCaseId: "case-login",
        name: "logs in",
        status: "passed",
        start: 200,
        parameters: [
          { name: "browser", value: "chromium" },
          { name: "seed", value: "seed-b", excluded: true }
        ]
      },
      {
        uuid: "firefox-1",
        testCaseId: "case-login",
        name: "logs in",
        status: "passed",
        start: 150,
        parameters: [
          { name: "browser", value: "firefox" },
          { name: "seed", value: "seed-c", excluded: true }
        ]
      }
    ]);

    expect(groups).toHaveLength(2);
    const chromium = groups.find((group) => group.parameterVariant.signature.includes("chromium"));
    const firefox = groups.find((group) => group.parameterVariant.signature.includes("firefox"));

    expect(chromium?.attempts.map((attempt) => attempt.result.uuid)).toEqual([
      "chromium-1",
      "chromium-2"
    ]);
    expect(chromium?.attempts.map((attempt) => attempt.retry)).toEqual([false, true]);
    expect(firefox?.attempts.map((attempt) => attempt.result.uuid)).toEqual(["firefox-1"]);
  });

  it("redacts hidden and masked parameters in raw payload exposed to API clients", () => {
    const parsed = parseAllureResultJson(
      JSON.stringify({
        uuid: "result-1",
        name: "login",
        steps: [
          {
            name: "submit credentials",
            parameters: [
              { name: "password", value: "secret", mode: "masked" },
              { name: "token", value: "jwt", mode: "hidden" }
            ]
          }
        ],
        parameters: [
          { name: "password", value: "secret", mode: "masked" },
          { name: "token", value: "jwt", mode: "hidden" }
        ]
      })
    );

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }

    const normalized = normalizeAllureResult(parsed.value);
    expect(JSON.stringify(normalized.raw)).not.toContain("secret");
    expect(JSON.stringify(normalized.raw)).not.toContain("jwt");
    expect(normalized.raw.parameters).toEqual([
      { name: "password", value: "***", mode: "masked" },
      { name: "token", mode: "hidden" }
    ]);
    expect(normalized.raw.steps?.[0]?.parameters).toEqual([
      { name: "password", value: "***", mode: "masked" },
      { name: "token", mode: "hidden" }
    ]);
  });

  it("redacts obvious credential text in raw result details without removing failure context", () => {
    const parsed = parseAllureResultJson(
      JSON.stringify({
        uuid: "result-1",
        name: "login failure keeps context",
        statusDetails: {
          message:
            "Synthetic assertion failure while calling checkout: password=synthetic-status-password",
          trace:
            "Expected status 401 after Authorization: Bearer synthetic-bearer-token\nat synthetic.test"
        },
        description:
          "Failure reproduces with https://user:synthetic-url-password@example.test/path?token=synthetic-description-token&state=open",
        descriptionHtml:
          '<p data-api-key="synthetic-html-api-key">Checkout failed with signature=synthetic-html-signature</p>',
        labels: [
          { name: "feature", value: "Checkout token=synthetic-label-token" },
          { name: "client_secret", value: "synthetic-label-secret" }
        ],
        adapterMetadata: {
          access_token: "synthetic-extra-token",
          note: "Adapter context secret=synthetic-extra-note-secret"
        },
        steps: [
          {
            name: "Submit checkout",
            statusDetails: {
              message: "Step failed with apiKey=synthetic-step-api-key"
            }
          }
        ]
      })
    );

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }

    const normalized = normalizeAllureResult(parsed.value);
    const serialized = JSON.stringify(normalized);
    expect(serialized).not.toContain("synthetic-status-password");
    expect(serialized).not.toContain("synthetic-bearer-token");
    expect(serialized).not.toContain("synthetic-url-password");
    expect(serialized).not.toContain("synthetic-description-token");
    expect(serialized).not.toContain("synthetic-html-api-key");
    expect(serialized).not.toContain("synthetic-html-signature");
    expect(serialized).not.toContain("synthetic-label-token");
    expect(serialized).not.toContain("synthetic-label-secret");
    expect(serialized).not.toContain("synthetic-extra-token");
    expect(serialized).not.toContain("synthetic-extra-note-secret");
    expect(serialized).not.toContain("synthetic-step-api-key");
    expect(normalized.raw.statusDetails?.message).toBe(
      "Synthetic assertion failure while calling checkout: password=***"
    );
    expect(normalized.raw.statusDetails?.trace).toContain("Expected status 401");
    expect(normalized.raw.statusDetails?.trace).toContain("Authorization: Bearer ***");
    expect(normalized.raw.description).toContain("https://***:***@example.test/path?token=***");
    expect(normalized.raw.description).toContain("state=open");
    expect(normalized.raw.descriptionHtml).toBe(
      '<p data-api-key="***">Checkout failed with signature=***</p>'
    );
    expect(normalized.labels.feature).toEqual(["Checkout token=***"]);
    expect(normalized.labels.client_secret).toEqual(["***"]);
    expect(normalized.raw.steps?.[0]?.statusDetails?.message).toBe("Step failed with apiKey=***");
  });

  it("normalizes Android-style top-level attachments without embedding local files", () => {
    const parsed = parseAllureResultJson(
      JSON.stringify({
        uuid: "android-result-1",
        name: "opens dashboard",
        status: "broken",
        stage: "finished",
        descriptionHtml: "<p>sanitized fixture text</p>",
        rerunOf: "previous-run-id",
        attachments: [
          {
            name: " hierarchy_dump ",
            type: "application/xml; charset=utf-8",
            source: "synthetic-hierarchy-attachment.xml"
          },
          {
            name: "failure-screenshot",
            source: "synthetic-failure-attachment.png"
          },
          {
            name: "logcat.txt",
            type: "application/text",
            source: "synthetic-logcat-attachment.txt"
          },
          {
            name: "unsafe traversal",
            source: "../secrets.txt"
          }
        ],
        steps: Array.from({ length: 8 }, (_, index) => ({
          name: `Synthetic Android step ${index + 1}`,
          status: index === 7 ? "broken" : "passed"
        }))
      })
    );

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }

    const normalized = normalizeAllureResult(parsed.value);
    expect(normalized.status).toBe("broken");
    expect(normalized.steps).toHaveLength(8);
    expect(normalized.attachments).toEqual([
      {
        name: "hierarchy_dump",
        type: "application/xml",
        source: "synthetic-hierarchy-attachment.xml"
      },
      {
        name: "failure-screenshot",
        type: "image/png",
        source: "synthetic-failure-attachment.png"
      },
      {
        name: "logcat.txt",
        type: "text/plain",
        source: "synthetic-logcat-attachment.txt"
      }
    ]);
    expect(JSON.stringify(normalized)).not.toContain("../secrets.txt");
  });

  it("preserves unknown raw result fields while keeping attachment sources relative", () => {
    const parsed = parseAllureResultJson(
      JSON.stringify({
        uuid: "result-with-extra-fields",
        name: "keeps extension payload",
        adapterMetadata: {
          framework: "synthetic-runner",
          retryReason: "synthetic flaky signal"
        },
        attachments: [
          {
            name: "raw payload",
            source: "payloads/result-extra.json",
            type: "application/json; charset=utf-8",
            sha256: "synthetic-digest"
          },
          {
            name: "unsafe absolute",
            source: "/var/tmp/secret.txt",
            sha256: "synthetic-unsafe-digest"
          }
        ],
        steps: [
          {
            name: "outer step",
            syntheticStepField: "preserved",
            attachments: [
              {
                name: "nested screenshot",
                source: "screens/nested.png",
                syntheticAttachmentField: "preserved"
              },
              {
                name: "unsafe traversal",
                source: "../unsafe.txt"
              }
            ],
            steps: [
              {
                name: "inner step",
                syntheticNestedField: true
              }
            ]
          }
        ]
      })
    );

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }

    const normalized = normalizeAllureResult(parsed.value);
    expect((normalized.raw as Record<string, unknown>).adapterMetadata).toEqual({
      framework: "synthetic-runner",
      retryReason: "synthetic flaky signal"
    });
    expect(normalized.raw.attachments).toEqual([
      {
        name: "raw payload",
        source: "payloads/result-extra.json",
        type: "application/json",
        sha256: "synthetic-digest"
      }
    ]);
    expect(normalized.attachments).toEqual([
      {
        name: "raw payload",
        source: "payloads/result-extra.json",
        type: "application/json"
      }
    ]);
    expect(
      (normalized.raw.steps?.[0] as Record<string, unknown> | undefined)?.syntheticStepField
    ).toBe("preserved");
    expect(normalized.raw.steps?.[0]?.attachments).toEqual([
      {
        name: "nested screenshot",
        source: "screens/nested.png",
        type: "image/png",
        syntheticAttachmentField: "preserved"
      }
    ]);
    expect(
      (normalized.raw.steps?.[0]?.steps?.[0] as Record<string, unknown> | undefined)
        ?.syntheticNestedField
    ).toBe(true);
    expect(JSON.stringify(normalized)).not.toContain("../unsafe.txt");
    expect(JSON.stringify(normalized)).not.toContain("/var/tmp/secret.txt");
  });

  it("normalizes malformed optional fields and unusual labels/links without leaking paths", () => {
    const parsed = parseAllureResultJson(
      JSON.stringify({
        uuid: "malformed-optionals",
        name: "adapter emits odd optional fields",
        statusDetails: "adapter wrote a string instead of an object",
        labels: [
          { name: "suite", value: "Checkout token=synthetic-label-query-token" },
          { name: "empty-value" },
          { name: "authorization", value: "Bearer synthetic-label-bearer" },
          "malformed-label"
        ],
        links: [
          {
            name: "object-store preview",
            type: "tms",
            url: "https://object.example.test/case?X-Amz-Signature=synthetic-link-signature&safe=1"
          },
          {
            name: "local report",
            url: "file:///C:/Users/tester/Downloads/synthetic-report.html",
            localPath: "C:\\Users\\tester\\Downloads\\synthetic-report.html"
          },
          {
            name: "malformed url",
            url: 42
          }
        ],
        parameters: "not an array",
        attachments: "not an array",
        steps: "not an array"
      })
    );

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }

    const normalized = normalizeAllureResult(parsed.value);
    const serialized = JSON.stringify(normalized);

    expect(normalized.labels).toEqual({
      suite: ["Checkout token=***"],
      authorization: ["***"]
    });
    expect(normalized.parameters).toEqual([]);
    expect(normalized.attachments).toEqual([]);
    expect(normalized.steps).toEqual([]);
    expect(normalized.raw.parameters).toEqual([]);
    expect(normalized.raw.attachments).toEqual([]);
    expect(normalized.raw.steps).toEqual([]);
    expect(normalized.raw.statusDetails).toBeUndefined();
    expect(serialized).not.toContain("synthetic-label-query-token");
    expect(serialized).not.toContain("synthetic-label-bearer");
    expect(serialized).not.toContain("synthetic-link-signature");
    expect(serialized).not.toContain("C:\\Users\\tester\\Downloads");
    expect(serialized).not.toContain("C:/Users/tester/Downloads");
    expect(normalized.raw.links?.[0]?.url).toContain("X-Amz-Signature=***");
    expect(normalized.raw.links?.[1]?.url).toBe("file:///[redacted-local-path]");
  });

  it("redacts preserved attachment metadata that looks like payloads, paths, or signed URLs", () => {
    const parsed = parseAllureResultJson(
      JSON.stringify({
        uuid: "attachment-metadata-redaction",
        name: "redacts attachment metadata",
        attachments: [
          {
            name: "api log",
            source: "attachments/api.log",
            type: "application/text",
            content: "raw synthetic attachment content with password=synthetic-attachment-password",
            rawPayload: "raw payload token=synthetic-raw-payload-token",
            bodyBytes: "Ym9keS1ieXRlcy1ub3QtcmVhbA==",
            localPath: "C:\\Users\\tester\\Downloads\\synthetic-api.log",
            signedUrl:
              "https://object.example.test/bucket/api.log?X-Amz-Signature=synthetic-attachment-signature",
            metadata: {
              safeNote: "kept with token=synthetic-nested-note-token redacted",
              body: "nested raw body secret=synthetic-nested-body-secret"
            }
          },
          {
            name: "remote source is ignored",
            source: "https://object.example.test/bucket/remote.log?token=synthetic-source-token"
          },
          {
            name: "windows source is ignored",
            source: "C:\\Users\\tester\\Downloads\\synthetic-windows-source.log"
          },
          {
            name: "backslash source normalizes",
            source: "screens\\nested\\login.png"
          }
        ]
      })
    );

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }

    const normalized = normalizeAllureResult(parsed.value);
    const serialized = JSON.stringify(normalized);

    expect(normalized.attachments).toEqual([
      {
        name: "api log",
        source: "attachments/api.log",
        type: "text/plain"
      },
      {
        name: "backslash source normalizes",
        source: "screens/nested/login.png",
        type: "image/png"
      }
    ]);
    expect(normalized.raw.attachments).toEqual([
      {
        name: "api log",
        source: "attachments/api.log",
        type: "text/plain",
        content: "***",
        rawPayload: "***",
        bodyBytes: "***",
        localPath: "***",
        signedUrl: "***",
        metadata: {
          safeNote: "kept with token=*** redacted",
          body: "***"
        }
      },
      {
        name: "backslash source normalizes",
        source: "screens/nested/login.png",
        type: "image/png"
      }
    ]);
    expect(serialized).not.toContain("raw synthetic attachment content");
    expect(serialized).not.toContain("synthetic-attachment-password");
    expect(serialized).not.toContain("synthetic-raw-payload-token");
    expect(serialized).not.toContain("synthetic-attachment-signature");
    expect(serialized).not.toContain("synthetic-source-token");
    expect(serialized).not.toContain("synthetic-windows-source.log");
    expect(serialized).not.toContain("C:\\Users\\tester\\Downloads");
    expect(serialized).not.toContain("synthetic-nested-note-token");
    expect(serialized).not.toContain("synthetic-nested-body-secret");
  });

  it("keeps duplicate history ids compatible while parameter variants separate ambiguity", () => {
    const groups = normalizeAllureResultAttempts([
      {
        uuid: "dup-history-firefox",
        historyId: "duplicate-history-id",
        name: "search works",
        fullName: "spec.search.firefox",
        status: "passed",
        start: 30,
        parameters: [
          { name: "browser", value: "firefox" },
          { name: "password", value: "synthetic-firefox-password", mode: "masked" },
          { name: "session", value: "synthetic-firefox-session", mode: "hidden" }
        ]
      },
      {
        uuid: "dup-history-chromium-retry",
        historyId: "duplicate-history-id",
        name: "search works",
        fullName: "spec.search.chromium",
        status: "passed",
        start: 20,
        parameters: [
          { name: "browser", value: "chromium" },
          { name: "password", value: "synthetic-chromium-retry-password", mode: "masked" },
          { name: "session", value: "synthetic-chromium-retry-session", mode: "hidden" }
        ]
      },
      {
        uuid: "dup-history-chromium-first",
        historyId: "duplicate-history-id",
        name: "search works",
        fullName: "spec.search.chromium",
        status: "failed",
        start: 10,
        parameters: [
          { name: "browser", value: "chromium" },
          { name: "password", value: "synthetic-chromium-first-password", mode: "masked" },
          { name: "session", value: "synthetic-chromium-first-session", mode: "hidden" }
        ]
      }
    ]);

    const serialized = JSON.stringify(groups);
    const chromium = groups.find((group) => group.parameterVariant.signature.includes("chromium"));
    const firefox = groups.find((group) => group.parameterVariant.signature.includes("firefox"));

    expect(groups).toHaveLength(2);
    expect(chromium?.identity).toEqual({
      source: "historyId",
      value: "duplicate-history-id"
    });
    expect(chromium?.attempts.map((attempt) => attempt.result.uuid)).toEqual([
      "dup-history-chromium-first",
      "dup-history-chromium-retry"
    ]);
    expect(chromium?.attempts.map((attempt) => attempt.retry)).toEqual([false, true]);
    expect(firefox?.attempts.map((attempt) => attempt.result.uuid)).toEqual([
      "dup-history-firefox"
    ]);
    expect(serialized).not.toContain("synthetic-chromium-first-password");
    expect(serialized).not.toContain("synthetic-chromium-retry-password");
    expect(serialized).not.toContain("synthetic-firefox-password");
    expect(serialized).not.toContain("synthetic-chromium-first-session");
    expect(serialized).not.toContain("synthetic-chromium-retry-session");
    expect(serialized).not.toContain("synthetic-firefox-session");
    expect(chromium?.parameterVariant.parameters).toEqual([
      { name: "browser", value: "chromium" },
      { name: "password", value: "***", mode: "masked" },
      { name: "session", mode: "hidden" }
    ]);
  });

  it("parses and normalizes container fixtures with nested steps and safe attachments", () => {
    const parsed = parseAllureCompatibilityFile(
      "synthetic-results/container-1-container.json",
      JSON.stringify({
        uuid: "container-1",
        name: "synthetic fixture container",
        children: ["result-1", "", 42],
        befores: [
          {
            name: "create account fixture",
            status: "passed",
            syntheticFixtureField: "preserved",
            attachments: [
              {
                name: "fixture log",
                source: "fixtures/create-account.log",
                type: "application/text",
                syntheticAttachmentField: "preserved"
              },
              {
                name: "absolute path",
                source: "/tmp/not-imported.txt"
              },
              {
                name: "remote path",
                source: "https://example.test/not-imported.txt"
              }
            ],
            steps: [
              {
                name: "seed user",
                syntheticNestedStepField: 123,
                attachments: [
                  {
                    name: "seed payload",
                    source: "fixtures/seed-user.json"
                  }
                ]
              }
            ]
          }
        ],
        afters: [
          {
            name: "cleanup fixture",
            attachments: [
              {
                name: "cleanup log",
                source: "fixtures/cleanup.txt"
              },
              {
                name: "traversal",
                source: "../not-imported.txt"
              }
            ]
          }
        ],
        vendorContainerField: {
          value: "preserved"
        }
      })
    );

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }

    expect(parsed.value.kind).toBe("container");
    if (parsed.value.kind !== "container") {
      return;
    }

    expect(parsed.value.value.children).toEqual(["result-1"]);
    expect(parsed.value.value.vendorContainerField).toEqual({ value: "preserved" });
    expect(parsed.value.value.befores?.[0]?.syntheticFixtureField).toBe("preserved");
    expect(parsed.value.value.befores?.[0]?.attachments).toEqual([
      {
        name: "fixture log",
        source: "fixtures/create-account.log",
        type: "text/plain",
        syntheticAttachmentField: "preserved"
      }
    ]);
    expect(parsed.value.value.befores?.[0]?.steps?.[0]?.syntheticNestedStepField).toBe(123);
    expect(parsed.value.value.befores?.[0]?.steps?.[0]?.attachments).toEqual([
      {
        name: "seed payload",
        source: "fixtures/seed-user.json",
        type: "application/json"
      }
    ]);
    expect(parsed.value.value.afters?.[0]?.attachments).toEqual([
      {
        name: "cleanup log",
        source: "fixtures/cleanup.txt",
        type: "text/plain"
      }
    ]);
    expect(JSON.stringify(parsed.value.value)).not.toContain("/tmp/not-imported.txt");
    expect(JSON.stringify(parsed.value.value)).not.toContain("../not-imported.txt");
    expect(JSON.stringify(parsed.value.value)).not.toContain("https://example.test");
  });

  it("parses environment properties with per-file diagnostics for malformed lines", () => {
    const parsed = parseEnvironmentProperties(
      [
        "# synthetic environment",
        "Browser = Chromium",
        "OS: Windows",
        "malformed line",
        "= missing key",
        "Browser = Firefox"
      ].join("\n"),
      "synthetic-results/environment.properties"
    );

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }

    expect(parsed.value).toEqual({
      Browser: "Firefox",
      OS: "Windows"
    });
    expect(parsed.warnings).toEqual([
      "synthetic-results/environment.properties: Line 4 was ignored because it has no delimiter",
      "synthetic-results/environment.properties: Line 5 was ignored because its key is empty",
      "synthetic-results/environment.properties: Line 6 overrides key 'Browser'"
    ]);
  });

  it("parses executor, categories, and history files while preserving unknown fields", () => {
    const executor = parseAllureCompatibilityFile(
      "synthetic-results/executor.json",
      JSON.stringify({
        name: "Synthetic CI",
        buildOrder: 12,
        reportUrl: "https://ci.example.test/build/12",
        syntheticExecutorField: {
          shard: "api"
        }
      })
    );
    const categories = parseAllureCategoriesJson(
      JSON.stringify([
        {
          name: "Synthetic product defect",
          matchedStatuses: ["failed"],
          messageRegex: "AssertionError.*",
          syntheticCategoryField: "preserved"
        },
        "malformed",
        {
          name: "Malformed statuses",
          matchedStatuses: "failed"
        }
      ]),
      "synthetic-results/categories.json"
    );
    const history = parseAllureCompatibilityFile(
      "synthetic-results/history/history-trend.json",
      JSON.stringify([
        {
          buildOrder: 11,
          reportName: "Synthetic previous launch",
          data: {
            failed: 1,
            passed: 9
          },
          syntheticHistoryField: "preserved"
        },
        42
      ])
    );

    expect(executor.ok).toBe(true);
    expect(categories.ok).toBe(true);
    expect(history.ok).toBe(true);
    if (!executor.ok || !categories.ok || !history.ok) {
      return;
    }

    expect(executor.value.kind).toBe("executor");
    if (executor.value.kind === "executor") {
      expect(executor.value.value.syntheticExecutorField).toEqual({ shard: "api" });
    }

    expect(categories.value[0]?.syntheticCategoryField).toBe("preserved");
    expect(categories.value[1]?.name).toBe("Malformed statuses");
    expect(categories.warnings).toEqual([
      "synthetic-results/categories.json: Category at index 1 was ignored because it is not an object",
      "synthetic-results/categories.json: Category at index 2 has non-array matchedStatuses"
    ]);

    expect(history.value.kind).toBe("history");
    if (history.value.kind === "history" && Array.isArray(history.value.value)) {
      expect(history.value.value).toEqual([
        {
          buildOrder: 11,
          reportName: "Synthetic previous launch",
          data: {
            failed: 1,
            passed: 9
          },
          syntheticHistoryField: "preserved"
        }
      ]);
    }
    expect(history.warnings).toEqual([
      "synthetic-results/history/history-trend.json: History item at index 1 was ignored because it is not an object"
    ]);
  });
});
