# UI Design Audit

This audit captures the current TestHistory UI review direction. It is based on the
`docs/screenshots/final/*` evidence and the Allure TestOps reference target: dense operational
screens, clear list/detail hierarchy, restrained cards, and readable tables.

## Review Update · 2026-09-29

The current pass builds on earlier ordinary-user and UI/UX reviews, uses 34 synthetic 1440×1000
screenshots for visual checks, and was checked against the official [TestOps 26.3 release notes](https://docs.qameta.io/reference/release-notes/),
[launches](https://docs.qameta.io/use-testops/test-plans-and-launches/launches-overview/),
[test results](https://docs.qameta.io/use-testops/results-and-analytics/test-results/), and
[dashboards](https://docs.qameta.io/use-testops/results-and-analytics/dashboards/) documentation.
This is a workflow and hierarchy comparison, not a claim of full feature parity.

Implemented in this pass: consistent 25/50/100 pagination for launch, result, defect, and
comparison lists; project launch lookup for comparison beyond the current list page; selected-item
context across pages; copyable result identifiers and direct data-section navigation; distinct
unknown and broken statuses, with skipped results shown in gray; a jump from the result diagnostic
to the failed scenario step; and visible expiry for API tokens. The dashboard now places the
selected launch summary above compact, content-sized widgets. Its saved THQL widget for failed
results grouped by owner renders the groups, and the screenshot set includes that state. The
launch duration chart now reads the complete launch from the API, independently of result-page
pagination. Test-case failure traces appear inside the terminal failed step; the launch list,
analytics signal panels, and defect owner/tag rows use less space without hiding their context.
Result durations use the same Russian units across detail surfaces. The screenshot set also
includes populated automation, launch errors, charts, comparison, result and test-case tabs,
settings, and dialogs.

Product gaps visible in the comparison: dashboard widgets currently aggregate one selected
launch, while project-wide analysis lives on a separate Analytics screen; the comparison view
does not yet provide a TestOps-style multi-launch matrix.

## Target UI Contract

- Use one application rhythm: left rail, breadcrumb/title, toolbar or tabs, then list/detail or
  table/detail content.
- Use cards only for KPI widgets, charts, repeated entities, and dialogs. Factual detail content
  should be rows, definition lists, tables, and section blocks.
- Make every section visually separable without decorative cards: plain section titles, restrained
  row separators, consistent 14-16px vertical rhythm, and no nested card stacks. Header bands are
  for dense tables and settings grids, not selected entity overview copy.
- Keep UI copy Russian except project names, logins, suite/test identifiers, raw metadata keys, and
  external service names.
- Keep buttons compact and icon-led, with text clipping guarded by shared button overflow rules.
- Use the same modal contract everywhere: backdrop, header, scrollable body, footer actions, 8px
  radius, and aligned controls.
- Use the same tab contract everywhere: 42-44px height, active underline, optional count badge,
  horizontal overflow, and stable widths.

## Current Review Outcomes

- Test case details use direct section headings and compact metadata instead of gray title bands.
  Empty rail groups render only a muted heading.
- The launch overview keeps the result chart framed and presents defects, variables, and unparsed
  results as dense lists with pagination or an explicit loaded-page scope.
- Dashboard and analytics expose their different data scopes. Defect details and settings use the
  same restrained list, table, and dialog rhythm as other entity screens.
- The screenshot set covers deep result routes and dialogs. UI labels remain Russian unless they
  represent raw identifiers, project data, or external service names.

## Next Priorities

- Add a multi-launch comparison matrix if cross-launch trend analysis is a product requirement.
- Decide whether project trends belong on the dashboard or remain in Analytics; the scope labels
  should stay explicit either way.
- Add visual fixtures for longer URLs, token names, scopes, and custom field mappings.
- Continue making empty, loading, denied, error, and partial states consistent across less-used
  dialogs and project workflows.
- Keep table headers high-contrast enough for modal and settings tables.

## Evidence To Refresh

Run `npm run screenshots:capture` locally when Playwright Chromium is available, or use the CI
`ui-screenshot-evidence` artifact. The acceptance set includes:

- `auth-login`
- `dashboard`
- `dashboard-owner-groups`
- `launches`
- `launch-detail`
- `launch-results`
- `launch-result-history`
- `launch-result-defects`
- `launch-errors`
- `launch-charts`
- `launch-comparison`
- `selected-test-case`
- `selected-test-case-history`
- `selected-test-case-defects`
- `defects`
- `automation`, `automation-plans`, `automation-jobs`, and `automation-integrations`
- `analytics`
- all `settings-*`
- all `dialog-*`
