# UI Design Audit

This audit captures the current TestHistory UI review direction. It is based on the committed
`docs/screenshots/final/*` evidence and the Allure/TestOps-like reference target: dense operational
screens, clear list/detail hierarchy, restrained cards, and readable tables.

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

## P0

- Test case details need Allure-like section rhythm. `Описание`, `Параметры`, `Сценарий`,
  `История`, `Теги`, `Кастомные поля`, and links should read as selected-entity sections: title
  text, immediate content, restrained row separators, and no gray title bands in overview copy.
- Screenshot evidence must include the deep routes and dialogs listed in
  `docs/screenshots/README.md`, not only the top-level pages.
- UI text should stay Russian. Regressions to English labels such as `payload`, `digest`,
  `worker queue`, `Pass rate`, or `Test keys` should be treated as UI readiness issues unless they
  are raw data identifiers.

## P1

- Launch overview should keep the chart framed, but variables, defects, participants, retries, and
  unparsed results should use dense list sections with pagination.
- Dashboard and analytics should use a summary strip plus one or two dense table/list sections;
  avoid turning operational screens into a wall of decorative cards.
- Defect details should use the same header, rows, and secondary metadata rhythm as launch result
  and test case details.
- Settings should show integrations, fields, tokens, and members primarily as tables/lists; editing
  belongs behind icon actions and dialogs.

## P2

- Add visual evidence for long URLs, long token names, long scopes, and long custom field mappings.
- Standardize empty, loading, denied, error, and partial states: compact icon, title, one explanatory
  line, and a single action when one exists.
- Keep table headers high-contrast enough for modal and settings tables.

## Evidence To Refresh

Run `npm run screenshots:capture` locally when Playwright Chromium is available, or use the CI
`ui-screenshot-evidence` artifact. The acceptance set should include:

- `auth-login`
- `dashboard`
- `launches`
- `launch-detail`
- `launch-results`
- `launch-result-history`
- `launch-result-defects`
- `selected-test-case`
- `selected-test-case-history`
- `selected-test-case-defects`
- `defects`
- `analytics`
- all `settings-*`
- all `dialog-*`
