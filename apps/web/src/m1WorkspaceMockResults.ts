import type { M1WorkspaceResponse } from "./m1WorkspaceTypes.js";
import {
  PREVIEW_MAX_BYTES,
  previewSafety,
  SYNTHETIC_JPG_PREVIEW_URL,
  SYNTHETIC_MOV_PREVIEW_URL,
  SYNTHETIC_MP4_PREVIEW_URL,
  SYNTHETIC_PNG_PREVIEW_URL
} from "./m1WorkspaceMockPreview.js";

export const mockM1Results: M1WorkspaceResponse["results"] = [
  {
    id: "AUTH-483420",
    allureId: "483420",
    name: "Авторизация по логину и паролю",
    suite: "web.auth.SignInTest",
    status: "failed",
    duration: "1.24s",
    owner: "Platform QA",
    caseType: "automated",
    workflow: "Ready",
    severity: "critical",
    layer: "E2E",
    tags: ["login", "smoke"],
    links: ["Story AUTH-41", "Spec SSO-7"],
    issues: ["AUTH-912"],
    testKeys: ["AUTH-TC-102", "SSO-REG-4"],
    members: ["Platform QA", "A. Ivanova"],
    customFields: [
      { label: "Priority", value: "P0" },
      { label: "Component", value: "Identity" }
    ],
    muted: false,
    description:
      "Проверяет, что пользователь входит с корректными учетными данными и попадает в рабочую область продукта.",
    parameters: [
      { name: "browser", value: "Chrome 126" },
      { name: "environment", value: "staging" },
      { name: "username", value: "synthetic-user" },
      { name: "password", value: "[redacted]", masked: true, excluded: true }
    ],
    attachments: [
      {
        name: "screenshot-after-submit.png",
        mediaType: "image/png",
        size: "642 B",
        source: "AUTH-483420-attachment-1",
        retained: true,
        previewUrl: SYNTHETIC_PNG_PREVIEW_URL,
        preview: {
          id: "preview-AUTH-483420-screenshot",
          artifactId: "artifact-AUTH-483420-screenshot",
          kind: "image",
          flavor: "image",
          support: "inline",
          status: "ready",
          reason: "eligible",
          originalBytes: 642,
          previewBytes: 642,
          maxPreviewBytes: PREVIEW_MAX_BYTES,
          contentType: "image/png",
          sha256: "sha256-auth-screenshot-synthetic",
          body: {
            type: "image-metadata",
            mediaType: "image/png",
            inline: false,
            downloadRequired: true
          },
          safety: previewSafety(false)
        }
      },
      {
        name: "expected-state.jpg",
        mediaType: "image/jpeg",
        size: "648 B",
        source: "AUTH-483420-attachment-2",
        retained: true,
        previewUrl: SYNTHETIC_JPG_PREVIEW_URL,
        preview: {
          id: "preview-AUTH-483420-jpg",
          artifactId: "artifact-AUTH-483420-jpg",
          kind: "image",
          flavor: "image",
          support: "inline",
          status: "ready",
          reason: "eligible",
          originalBytes: 648,
          previewBytes: 648,
          maxPreviewBytes: PREVIEW_MAX_BYTES,
          contentType: "image/jpeg",
          sha256: "sha256-auth-jpg-synthetic",
          body: {
            type: "image-metadata",
            mediaType: "image/jpeg",
            inline: false,
            downloadRequired: true
          },
          safety: previewSafety(false)
        }
      },
      {
        name: "browser-console.log",
        mediaType: "text/plain",
        size: "18 KB",
        source: "AUTH-483420-attachment-3",
        retained: true,
        preview: {
          id: "preview-AUTH-483420-console",
          artifactId: "artifact-AUTH-483420-console",
          kind: "text",
          flavor: "log",
          support: "inline",
          status: "ready",
          reason: "too-large",
          originalBytes: 18432,
          previewBytes: 214,
          maxPreviewBytes: PREVIEW_MAX_BYTES,
          contentType: "text/plain",
          sha256: "sha256-auth-console-synthetic",
          body: {
            type: "redacted-text",
            encoding: "utf8",
            value: [
              "[09:41:18] navigation complete",
              "[09:41:19] auth.submit started",
              "[09:41:20] credential redacted",
              "[09:41:20] assertion failed: user menu was not visible"
            ].join("\n"),
            lineCount: 4,
            truncated: true,
            redacted: true
          },
          safety: previewSafety(true)
        }
      },
      {
        name: "network-trace.har",
        mediaType: "application/json",
        size: "2.4 MB",
        source: "AUTH-483420-attachment-4",
        retained: false,
        preview: {
          id: "preview-AUTH-483420-network",
          artifactId: "artifact-AUTH-483420-network",
          kind: "json",
          flavor: "json",
          support: "metadata-only",
          status: "metadata-only",
          reason: "content-unavailable",
          originalBytes: 2516582,
          previewBytes: 0,
          maxPreviewBytes: PREVIEW_MAX_BYTES,
          contentType: "application/json",
          sha256: "sha256-auth-network-synthetic",
          body: { type: "metadata-only" },
          safety: previewSafety(false)
        }
      },
      {
        name: "device-video.mp4",
        mediaType: "video/mp4",
        size: "1.5 KB",
        source: "AUTH-483420-attachment-5",
        retained: false,
        previewUrl: SYNTHETIC_MP4_PREVIEW_URL,
        preview: {
          id: "preview-AUTH-483420-video",
          artifactId: "artifact-AUTH-483420-video",
          kind: "none",
          flavor: "unsupported-binary",
          support: "unsupported",
          status: "metadata-only",
          reason: "unsupported-binary",
          originalBytes: 1536,
          previewBytes: 1536,
          maxPreviewBytes: PREVIEW_MAX_BYTES,
          contentType: "video/mp4",
          sha256: "sha256-auth-video-synthetic",
          body: { type: "metadata-only" },
          safety: previewSafety(false)
        }
      },
      {
        name: "device-video.mov",
        mediaType: "video/quicktime",
        size: "1.5 KB",
        source: "AUTH-483420-attachment-6",
        retained: false,
        previewUrl: SYNTHETIC_MOV_PREVIEW_URL,
        preview: {
          id: "preview-AUTH-483420-mov",
          artifactId: "artifact-AUTH-483420-mov",
          kind: "none",
          flavor: "unsupported-binary",
          support: "unsupported",
          status: "metadata-only",
          reason: "unsupported-binary",
          originalBytes: 1536,
          previewBytes: 1536,
          maxPreviewBytes: PREVIEW_MAX_BYTES,
          contentType: "video/quicktime",
          sha256: "sha256-auth-mov-synthetic",
          body: { type: "metadata-only" },
          safety: previewSafety(false)
        }
      }
    ],
    trace: {
      message: "AssertionError: expected user menu to be visible",
      stack: [
        "SignInPage.assertAuthenticated at tests/auth/sign-in.spec.ts:41:12",
        "Auth smoke launch at tests/auth/sign-in.spec.ts:19:5"
      ]
    },
    defect: "AUTH-912",
    history: ["passed", "passed", "failed", "passed", "failed"],
    retryAttempts: [
      {
        attempt: 1,
        status: "failed",
        duration: "1.31s",
        startedAt: "2026-05-30T06:40:12Z",
        message: "Первый прогон упал на проверке меню пользователя.",
        final: false
      },
      {
        attempt: 2,
        status: "failed",
        duration: "1.24s",
        startedAt: "2026-05-30T06:41:00Z",
        message: "Последняя попытка в этом запуске. Этот статус считается итоговым.",
        final: true
      }
    ],
    historyCompare: {
      from: {
        launchId: "L-1288",
        launchName: "Nightly Auth Smoke",
        startedAt: "2026-05-29T21:40:00Z",
        status: "passed",
        duration: "1.12s",
        retry: 0,
        flaky: false,
        branch: "main",
        build: "build 7841",
        executor: "runner-auth-01"
      },
      to: {
        launchId: "L-1289",
        launchName: "PR-1289 Checkout Regression",
        startedAt: "2026-05-30T06:41:00Z",
        status: "failed",
        duration: "1.24s",
        retry: 1,
        flaky: true,
        branch: "feature/card-retry",
        build: "build 7842",
        executor: "runner-auth-03"
      },
      scope: {
        actor: "history-compare-api",
        project: "My project",
        permission: "redacted",
        redactionApplied: true,
        redactedFields: ["labels.securityTier"]
      },
      permissionAudit: {
        state: "ready",
        actor: "history-compare-api",
        project: "My project",
        evaluatedAt: "2026-05-30T06:43:00Z",
        replay: {
          eventCount: 12,
          acceptedCount: 10,
          deniedCount: 0,
          partialCount: 2,
          duplicateCount: 1,
          ignoredCount: 0
        },
        digest: {
          projectionDigest: "hcmp-projection-digest-auth-001",
          rawHistoryDigest: "sha256:raw-history-auth-digest-001",
          algorithm: "sha256",
          rawHistoryExposed: false
        },
        reason: { state: "redacted" },
        redactedFields: ["permission.reason", "labels.securityTier", "rawHistory"]
      },
      permissionAuditInvariant: {
        state: "ready",
        actor: "history-compare-api",
        project: "My project",
        evaluatedAt: "2026-05-30T06:44:00Z",
        source: "local-read-model",
        access: {
          scope: "test-cases:read",
          projectScoped: true,
          actorScoped: true,
          mutation: false,
          redacted: true
        },
        page: {
          limit: 3,
          offset: 0,
          returned: 2,
          total: 2,
          hasMore: false
        },
        invariant: {
          boundary: "read-only-history-compare-permission-audit-replay-invariant",
          source: "in-memory-history-compare-permission-audit-wip",
          consistency: "append-only-replay",
          mutationBoundary: "rest-read-only-no-replay-mutation",
          deterministic: true,
          recomputable: true,
          projectScoped: true,
          actorScoped: true,
          leakedActorIds: [],
          projectionDigest: "sha256:hcmp-invariant-auth-001",
          recomputedDigest: "sha256:hcmp-invariant-auth-001"
        },
        appendOnly: {
          uniqueProjectedEventIds: true,
          duplicateEventIds: [],
          totalProjectedEventIds: 2
        },
        rawCompareInputs: {
          included: false,
          preserved: true,
          digestCount: 2,
          itemCount: 4
        },
        redaction: {
          passed: true,
          leakedMarkerCount: 0,
          leakedMarkers: [],
          rawHistoryIncluded: false,
          rawCompareInputsIncluded: false,
          hiddenOrMaskedValuesIncluded: false,
          tokensIncluded: false,
          pathsIncluded: false,
          storageLocationsIncluded: false,
          artifactUrlsIncluded: false,
          policy:
            "Invariant evidence renders metadata only; raw compare inputs and raw history remain outside the selected-case UI."
        },
        items: [
          {
            ordinal: 0,
            eventId: "history-compare-permission:AUTH-483420:accepted",
            redacted: true
          },
          {
            ordinal: 1,
            eventId: "history-compare-permission:AUTH-483420:partial",
            redacted: true
          }
        ]
      },
      offset: 0,
      limit: 6,
      total: 8,
      hasMore: true,
      changes: [
        {
          id: "AUTH-483420-status",
          field: "status",
          label: "Status changed",
          before: "passed",
          after: "failed",
          impact: "high"
        },
        {
          id: "AUTH-483420-labels",
          field: "labels",
          label: "Labels changed",
          before: "tag: login, owner: Platform QA",
          after: {
            state: "redacted",
            reason: "labels.securityTier is hidden by compare read permission"
          },
          impact: "medium"
        },
        {
          id: "AUTH-483420-executor",
          field: "executor",
          label: "Executor changed",
          before: "runner-auth-01",
          after: "runner-auth-03",
          impact: "medium"
        },
        {
          id: "AUTH-483420-branch-build",
          field: "branchBuild",
          label: "Branch and build changed",
          before: "main / build 7841",
          after: "feature/card-retry / build 7842",
          impact: "medium"
        },
        {
          id: "AUTH-483420-defect-signature",
          field: "defectSignature",
          label: "Defect signature changed",
          before: "none",
          after: "AUTH-912: assertion-user-menu",
          impact: "high"
        },
        {
          id: "AUTH-483420-duration",
          field: "duration",
          label: "Duration changed",
          before: "1.12s",
          after: "1.24s",
          impact: "low"
        }
      ]
    },
    identity: {
      state: "corrected",
      historyId: "web.auth.SignInTest#authenticate:username-password",
      canonicalTestCaseId: "AUTH-483420",
      reason: "Automation rename matched the existing AllureID and stable parameter set.",
      confidence: 0.98,
      actor: "identity-correction-worker",
      changedAt: "2026-05-30T02:20:00Z",
      previousHistoryIds: ["web.auth.SignInTest#login-with-credentials"],
      relatedTestCaseIds: ["AUTH-483420"]
    }
  },
  {
    id: "AUTH-483421",
    allureId: "483421",
    name: "Запрет входа заблокированного пользователя",
    suite: "web.auth.SignInTest",
    status: "passed",
    duration: "830ms",
    owner: "Platform QA",
    caseType: "automated",
    workflow: "Ready",
    severity: "normal",
    layer: "API",
    tags: ["login", "negative"],
    links: ["Story AUTH-42"],
    issues: [],
    testKeys: ["AUTH-TC-114"],
    members: ["Platform QA"],
    customFields: [{ label: "Priority", value: "P1" }],
    muted: false,
    description: "Checks lockout handling for users that cannot start an authenticated session.",
    parameters: [
      { name: "browser", value: "Chrome 126" },
      { name: "accountState", value: "locked" }
    ],
    attachments: [],
    history: ["passed", "passed", "passed", "passed", "passed"],
    historyCompare: {
      from: {
        launchId: "L-1288",
        launchName: "Nightly Auth Smoke",
        startedAt: "2026-05-29T21:40:00Z",
        status: "passed",
        duration: "810ms",
        retry: 0,
        flaky: false
      },
      to: {
        launchId: "L-1289",
        launchName: "PR-1289 Checkout Regression",
        startedAt: "2026-05-30T06:41:00Z",
        status: "passed",
        duration: "830ms",
        retry: 0,
        flaky: false
      },
      offset: 0,
      limit: 0,
      total: 0,
      hasMore: false,
      changes: []
    },
    identity: {
      state: "split",
      historyId: "web.auth.SignInTest#reject-locked-user",
      canonicalTestCaseId: "AUTH-483421",
      reason: "Negative auth scenario separated from the generic sign-in history bucket.",
      confidence: 0.94,
      actor: "identity-correction-worker",
      changedAt: "2026-05-30T02:24:00Z",
      previousHistoryIds: ["web.auth.SignInTest#sign-in-negative"],
      relatedTestCaseIds: ["AUTH-483420", "AUTH-483421"]
    }
  },
  {
    id: "PAY-1042",
    allureId: "1042",
    name: "Создание заказа с сохраненной картой",
    suite: "web.checkout.PaymentTest",
    status: "broken",
    duration: "4.81s",
    owner: "Checkout",
    caseType: "automated",
    workflow: "Review",
    severity: "critical",
    layer: "E2E",
    tags: ["checkout", "payments"],
    links: ["Story PAY-18", "Risk register"],
    issues: ["PAY-337"],
    testKeys: ["PAY-TC-44"],
    members: ["Checkout", "M. Petrov"],
    customFields: [
      { label: "Priority", value: "P0" },
      { label: "Gateway", value: "Saved cards" }
    ],
    muted: false,
    defectMute: {
      id: "mute-PAY-337-regression",
      scope: "defect",
      reason: "Known provider sandbox outage, tracked by Checkout until the gateway fix lands.",
      actor: "quality-gate-reviewer",
      mutedAt: "2026-05-30T02:38:00Z",
      expiresAt: "2026-06-06T02:38:00Z",
      affectedTestCaseIds: ["PAY-1042"]
    },
    description: "Creates an order using a saved card and validates payment confirmation.",
    parameters: [
      { name: "gateway", value: "saved-card" },
      { name: "currency", value: "USD" }
    ],
    attachments: [
      {
        name: "payment-provider-response.json",
        mediaType: "application/json",
        size: "6 KB",
        source: "PAY-1042-attachment-1",
        retained: true
      }
    ],
    trace: {
      message: "Runtime error interrupted the scenario",
      stack: [
        "PaymentProvider.confirm at tests/checkout/payment.spec.ts:72:9",
        "Checkout flow at tests/checkout/payment.spec.ts:34:7"
      ]
    },
    defect: "PAY-337",
    history: ["passed", "broken", "broken", "failed", "broken"],
    retryAttempts: [
      {
        attempt: 1,
        status: "failed",
        duration: "5.14s",
        startedAt: "2026-05-30T06:38:21Z",
        message: "Платежный sandbox вернул timeout.",
        final: false
      },
      {
        attempt: 2,
        status: "broken",
        duration: "4.97s",
        startedAt: "2026-05-30T06:39:40Z",
        message: "Ошибка провайдера повторилась при повторном запуске теста.",
        final: false
      },
      {
        attempt: 3,
        status: "broken",
        duration: "4.81s",
        startedAt: "2026-05-30T06:41:00Z",
        message: "Последняя попытка в этом запуске. Этот статус считается итоговым.",
        final: true
      }
    ],
    historyCompare: {
      from: {
        launchId: "L-1287",
        launchName: "Release Candidate 24.06",
        startedAt: "2026-05-28T20:15:00Z",
        status: "failed",
        duration: "5.20s",
        retry: 2,
        flaky: true
      },
      to: {
        launchId: "L-1289",
        launchName: "PR-1289 Checkout Regression",
        startedAt: "2026-05-30T06:41:00Z",
        status: "broken",
        duration: "4.81s",
        retry: 2,
        flaky: true
      },
      offset: 0,
      limit: 3,
      total: 3,
      hasMore: false,
      changes: [
        {
          id: "PAY-1042-status",
          field: "status",
          label: "Status changed",
          before: "failed",
          after: "broken",
          impact: "high"
        },
        {
          id: "PAY-1042-status-details",
          field: "statusDetails",
          label: "Failure class changed",
          before: "AssertionError",
          after: "Runtime error",
          impact: "high"
        },
        {
          id: "PAY-1042-duration",
          field: "duration",
          label: "Duration changed",
          before: "5.20s",
          after: "4.81s",
          impact: "low"
        }
      ]
    },
    identity: {
      state: "merged",
      historyId: "web.checkout.PaymentTest#create-order:saved-card",
      canonicalTestCaseId: "PAY-1042",
      reason: "Duplicate generated test-case ids collapsed into the canonical payment history.",
      confidence: 0.91,
      actor: "identity-correction-worker",
      changedAt: "2026-05-30T02:28:00Z",
      previousHistoryIds: [
        "web.checkout.PaymentTest#create-order-card",
        "web.checkout.PaymentTest#create-order:saved-card:retry"
      ],
      relatedTestCaseIds: ["PAY-1042", "PAY-1042-DUP"]
    }
  },
  {
    id: "CAT-228",
    allureId: "228",
    name: "Поиск в каталоге по части названия",
    suite: "web.catalog.SearchTest",
    status: "passed",
    duration: "1.05s",
    owner: "Catalog",
    caseType: "manual",
    workflow: "Ready",
    severity: "normal",
    layer: "UI",
    tags: ["catalog", "search"],
    links: ["Story CAT-88"],
    issues: [],
    testKeys: ["CAT-TC-9"],
    members: ["Catalog"],
    customFields: [{ label: "Priority", value: "P2" }],
    muted: false,
    description: "Searches catalog by partial product name and verifies relevant results.",
    parameters: [{ name: "query", value: "wireless" }],
    attachments: [],
    history: ["passed", "passed", "passed", "passed", "passed"],
    identity: {
      state: "uncertain",
      historyId: "web.catalog.SearchTest#search-catalog:partial-name",
      canonicalTestCaseId: "CAT-228",
      reason: "Manual case title and imported automation labels are similar but not conclusive.",
      confidence: 0.62,
      actor: "identity-reviewer",
      changedAt: "2026-05-30T02:31:00Z",
      relatedTestCaseIds: ["CAT-228", "CAT-229"]
    }
  },
  {
    id: "USR-884",
    allureId: "884",
    name: "Обновление аватара профиля",
    suite: "web.profile.ProfileTest",
    status: "skipped",
    duration: "0ms",
    owner: "Accounts",
    caseType: "manual",
    workflow: "Draft",
    severity: "minor",
    layer: "UI",
    tags: ["profile"],
    links: ["Story USR-22"],
    issues: [],
    testKeys: ["USR-TC-19"],
    members: ["Accounts"],
    customFields: [{ label: "Priority", value: "P3" }],
    muted: false,
    description: "Manual avatar update flow kept for account profile regression coverage.",
    parameters: [],
    attachments: [],
    history: ["skipped", "passed", "skipped", "skipped", "skipped"]
  }
];
