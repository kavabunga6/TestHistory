# UI Design Audit

This audit captures the current TestHistory UI review direction. It is based on the
`docs/screenshots/final/*` evidence and the Allure TestOps reference target: dense operational
screens, clear list/detail hierarchy, restrained cards, and readable tables.

## Review Update · 2026-09-29

The current pass was reviewed from 33 synthetic 1440×1000 screenshots by an ordinary-user
reviewer and a UI/UX reviewer, and checked against the official [TestOps 26.3 release notes](https://docs.qameta.io/reference/release-notes/),
[launches](https://docs.qameta.io/use-testops/test-plans-and-launches/launches-overview/),
[test results](https://docs.qameta.io/use-testops/results-and-analytics/test-results/), and
[dashboards](https://docs.qameta.io/use-testops/results-and-analytics/dashboards/) documentation.
This is a workflow and hierarchy comparison, not a claim of full feature parity.

Implemented in this pass: consistent 25/50/100 pagination for launch, result, defect, and
comparison lists; project launch lookup for comparison beyond the current list page; selected-item
context across pages; copyable result identifiers and direct data-section navigation; distinct
unknown and broken statuses, with skipped results shown in gray; a jump from the result diagnostic
to the failed scenario step; truthful scope labels on dashboards and charts; and visible expiry for
API tokens. Result durations use the same Russian units across detail surfaces. The screenshot set
now includes populated automation, launch errors, charts, comparison, result and test-case tabs,
settings, and dialogs.

Product gaps visible in the comparison: dashboard widgets currently aggregate one selected
launch, while project-wide analysis lives on a separate Analytics screen; the comparison view
does not yet provide a TestOps-style multi-launch matrix. Launch charts still derive from the
loaded result page and therefore state that scope explicitly. Full-launch chart aggregation needs
an API read model rather than silently presenting a page sample as the entire run.

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

- Add a full-launch chart aggregate to the API so the graph can cover all result pages.
- Add a multi-launch comparison matrix if cross-launch trend analysis is a product requirement.
- Add visual fixtures for longer URLs, token names, scopes, and custom field mappings.
- Continue making empty, loading, denied, error, and partial states consistent across less-used
  dialogs and project workflows.
- Keep table headers high-contrast enough for modal and settings tables.

## Evidence Set

Run `npm run screenshots:capture` locally when Playwright Chromium is available, or use the CI
`ui-screenshot-evidence` artifact. The acceptance set includes:

- `auth-login`
- `dashboard`
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
