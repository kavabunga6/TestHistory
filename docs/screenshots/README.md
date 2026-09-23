# Screenshot Evidence

This directory is reserved for production-readiness UI evidence captured from repo-owned synthetic
fixtures only.

Rules:

- Capture screenshots from the local web app or CI browser jobs using synthetic TestHistory data.
- Do not copy screenshots from messaging apps, download folders, desktops, customers, or other
  untrusted external sources into the repository.
- Do not commit images containing tokens, signed URLs, local filesystem paths, emails, or real
  project identifiers.
- Prefer CI artifacts for large screenshot sets; commit only small curated evidence when it is
  useful for review.
- Run `npm run smoke:upload-close-ui` before publishing final screen evidence for upload/close
  flows.

Expected final screen set:

- Auth login
- Projects
- Dashboard
- Launch list
- Launch detail
- Launch result tabs
- Selected test case
- Selected test case tabs
- Defects
- Analytics
- Project settings tabs
- Main dialogs

## Final Screenshot Manifest

Committed final screenshots are captured from repo-owned synthetic fixtures with a desktop viewport
through `npm run screenshots:capture`. The required route list lives in
`expected-manifest.json`; the capture script validates its internal screen list against that file
before writing screenshots. The command also writes `final/manifest.json` with the route, auth state,
dialog flag, and byte size for every PNG. CI captures the full deep set below and uploads the whole
`docs/screenshots/final/*` directory as an artifact; local capture requires Chrome or Playwright
Chromium. The capture script tries the installed Google Chrome channel first, then Playwright's
headless shell or a regular Chromium executable from the local cache. If local browser download is
blocked, use the CI `ui-screenshot-evidence` artifact.

| File                           | Screen             | Evidence purpose                                                                  |
| ------------------------------ | ------------------ | --------------------------------------------------------------------------------- |
| `final/projects.png`           | Projects           | Project navigation and project state surface.                                     |
| `final/dashboard.png`          | Dashboard          | Default THQL widgets: pass-rate metric, status distribution, and slow/risk table. |
| `final/launches.png`           | Launch list        | Launch table, filters, counters, and lifecycle state.                             |
| `final/launch-detail.png`      | Launch detail      | A 100-result launch with status counters, artifacts, and close/upload context.    |
| `final/selected-test-case.png` | Selected test case | History, retries/flaky state, metadata, and detail tabs.                          |
| `final/defects.png`            | Defects            | Defect grouping, mute/readiness state, and operational actions.                   |
| `final/analytics.png`          | Analytics          | Analytics metrics, risk signals, and table output.                                |

The capture script also records deeper route and dialog states for design review and CI evidence:

- `final/auth-login.png`
- `final/launch-results.png` shows the 100-result launch with a 25-row first page and test detail.
- `final/launch-result-history.png`
- `final/launch-result-defects.png`
- `final/selected-test-case-history.png`
- `final/selected-test-case-defects.png`
- `final/defects.png` from `#defects/PAY-337`
- `final/dialog-dashboard-widget-delete.png`
- `final/settings-access.png`
- `final/settings-tokens.png`
- `final/settings-integrations.png`
- `final/settings-retention.png`
- `final/settings-fields.png`
- `final/dialog-role-matrix.png`
- `final/dialog-member-edit.png`
- `final/dialog-integration-edit.png`
- `final/dialog-api-token.png`
- `final/dialog-quarantine.png`
- `final/dialog-delete-launch.png`

CI attempts to upload the same set as the one-day `ui-screenshot-evidence` artifact. The upload is supplemental and best effort because GitHub storage quota can reject it after all browser checks and screenshot capture have passed; the committed set and its checked `manifest.json` remain the required evidence.

The committed `expected-manifest.json` is the review contract for designers and CI:

- every `name` must be represented in `scripts/capture-ui-screenshots.mjs`;
- every route/dialog must stay listed here for reviewer orientation;
- the generated `final/manifest.json` must keep the same names, hashes, auth flags, dialog flags,
  and `1440x1000` viewport before evidence is accepted.
