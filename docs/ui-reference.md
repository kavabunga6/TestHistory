# UI Reference

This document gives implementation agents a shared visual target for the
TestHistory UI. It is based on the current local prototype plus behavioral
research from Allure TestOps documentation. Do not copy Qameta branding,
screenshots, icons, or pixel styling directly. Use these notes to implement a
compatible operational workflow with TestHistory's own product language.

## Source Pages Studied

- Allure TestOps architecture: https://docs.qameta.io/allure-testops/setup/architecture/
- Kubernetes deployment: https://docs.qameta.io/allure-testops/install/kubernetes/
- S3-compatible storage: https://docs.qameta.io/allure-testops/install/s3/
- Launches: https://docs.qameta.io/allure-testops/briefly/launches/
- Test results: https://docs.qameta.io/allure-testops/briefly/test-results/
- Test cases: https://docs.qameta.io/allure-testops/briefly/test-cases/
- Upload metadata policy: https://docs.qameta.io/allure-testops/briefly/launches/upload_policy/
- Cleanup rules: https://docs.qameta.io/allure-testops/briefly/project/cleanup/
- MCP server: https://docs.qameta.io/allure-testops/howto/mcp/

## Approved Visual References

The user provided five local Telegram screenshots as visual references for the
project list, Launches, Test cases, selected test-case details, and Defects
screens. These original files are not copied into the repository because local
messenger/download images can contain sensitive project, account, and external
system details. Agents must use only the behavioral notes below.

| Reference          | Route / Surface      | Product Pattern To Preserve                                                                                         | Production Rule                                                                                                                              |
| ------------------ | -------------------- | ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Project list       | `#projects`          | Centered searchable list with project avatars, counters, options, and add-project action                            | Search/list/details are ready; creation or settings controls must be backed by API behavior, read-only evidence, or hidden.                  |
| Launches           | `#launch`            | Compact search/filter header, tag strip, launch cards with open/closed state, metadata, and status distribution bar | Launch rows, search, details, and result navigation are ready; import/options must be backed by API behavior, read-only evidence, or hidden. |
| Test cases list    | `#case`              | Left list with filters/search and right selected-case panel; no runtime, jobs, architecture, or retention panels    | Search/filter/list/details are ready; create/import/display/bulk controls must be backed by API behavior, read-only evidence, or hidden.     |
| Selected test case | `#case` detail panel | Status, AllureID, automated/manual marker, overview/history/attachments/defects/change-log style sections           | Visible tabs and sections contain selected-case content with empty/error/permission states; no visible WIP or placeholder tabs.              |
| Defects            | `#defects`           | Defect list on the left and selected/empty defect detail area on the right                                          | Defect rows, linked tests, linked results, filters, and read-state evidence are ready; unsupported mutations are hidden or read-only.        |

Current M5-AI scope is intentionally narrower than a full clone: it aligns the
existing ready routes with these reference patterns and blocks regressions where
product tabs show unrelated internal/runtime panels.

## Current Design Contract

The latest designer subagent review found two competing visual languages: dense
Allure/TestOps-like list-detail screens and looser widget/card dashboards. Use
the list-detail language as the default product surface.

- Primary shell: left rail, breadcrumb/title row, contextual toolbar, then a
  list/detail or table/detail workspace.
- Cards are reserved for KPI counters, charts, modals, and repeated compact
  objects. Do not wrap whole page sections in decorative nested cards.
- Rows and tables should use stable heights, row separators, sticky or tinted
  headers where useful, and selected-row highlighting through a light background
  plus accent state.
- Detail panels use an entity header, tabs, and section blocks with clear
  headers. Metadata is a compact definition/list layout, not scattered chips.
- Dashboard and analytics use the same language: summary strip, compact chart or
  KPI blocks, and primary tables/lists. Dashboard widgets must not feel like a
  separate marketing/card system.
- Empty, loading, denied, partial, and error states use compact state blocks
  with the same spacing and typography across routes.
- Radius stays at 8px or less for app cards, panels, modals, icon wells, and
  controls unless a component is a semantic pill or circular chart.
- Blue is reserved for navigation, focus, and primary actions. Status colors are
  semantic: passed green, failed red, broken orange, skipped gray, unknown or
  muted violet/neutral.

## Launch Detail Reference

The approved reference captures are the current visual reference for
the `#launch` launch detail surface. The page should keep a dense operational
layout: a light app canvas, left navigation, breadcrumb/title line, rounded
launch frame, status distribution bar, and tabs for Overview, Test results,
Errors, Charts, and Timeline. Implement only behavior backed by existing launch
and result read models. Icon-only controls may be present only when they trigger implemented
behavior or communicate a read-only, permission, or lifecycle state. New mutation or analysis
features must not be invented.

Preserve these launch-detail patterns:

- Overview uses a two-column section grid, but only charts or dense counters may
  be framed. Variables, defects, participants, reruns, and unresolved results
  render as list sections with row separators and pagination where needed.
- Test results uses a left searchable result list and right selected-result
  preview/empty state.
- Errors uses a left category list and right selected-result details or empty
  state.
- Charts uses the duration distribution chart inside a single framed card.
- Long launch names, test names, ids, and values must truncate without shifting
  card, tab, or row dimensions.

## UI Principles

- Keep the app as a dense operational tool, not a marketing page.
- Prefer a stable shell: left rail, top breadcrumb, contextual toolbar, and a
  list/detail workspace.
- Use tabs for result and test-case details: Overview, History, Defects,
  Attachments, Raw/Change log where appropriate.
- Status colors must stay semantically stable: passed green, failed red, broken
  orange, skipped gray, unknown violet.
- Long test names, suite names, traces, and artifact names must truncate or wrap
  intentionally without shifting the layout.
- Every upload, launch close, cleanup, and quality-gate action must have visible
  state: pending, running, completed, partial, failed, aborted.
- Analytics should be embedded near work surfaces instead of isolated in a
  separate dashboard only.

## Required Screens

| Screen            | Layout                            | Must show                                                                          |
| ----------------- | --------------------------------- | ---------------------------------------------------------------------------------- |
| Launches          | launch list/detail or card/detail | open/closed state, counters, metadata, members, defects, close/reopen action       |
| Launch result     | table/tree + right detail panel   | status, suite/name, duration, owner, failure message, steps, attachments, raw JSON |
| Test cases        | searchable list + detail panel    | AllureID, workflow status, overview/history/attachments/defects/change log         |
| Test case history | timeline/list                     | status, launch, duration, date, executor, parameters, compare affordance           |
| Uploads           | readiness panel + progress        | mode, chunk progress, policy, retry/abort/complete, validation errors              |
| Cleanup           | policy list + preview             | global/project rules, target, status, delay hours, affected artifacts              |
| MCP/API           | capability view                   | exposed tools, OpenAPI link, auth/readiness, safe examples                         |

## Route Boundary Matrix

| Route        | Allowed Content                                                                                                   | Forbidden Content                                                                                                                |
| ------------ | ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `#case`      | Test-case list, search/filter chips, selected-case overview/history/attachments/defects/change-log style sections | Launch runtime, worker queues, architecture diagrams, cleanup schedules, archive intake panels                                   |
| `#launch`    | Launch list, launch report header, selected launch results, compact selected-result preview, launch actions       | Worker telemetry, architecture lifecycle cards, deep trace/raw result tabs, defect mute invariant panels, security export panels |
| `#defects`   | Defect list, linked failed/broken results, mute read state, read-only defect evidence                             | Launch result tables, test-case repository controls, jobs/cleanup/runtime architecture                                           |
| `#jobs`      | Upload sessions, worker jobs, cleanup, retention, operational diagnostics                                         | Selected test-case or defect details unless linked as navigation targets                                                         |
| `#analytics` | Trends, quality gates, risk summaries, defect/flake metrics                                                       | Runtime architecture or job queue internals                                                                                      |

## Agent Responsibilities

- Frontend developers own interaction polish, responsive behavior, empty/error
  states, and visual parity with this document.
- Backend developers own data completeness so UI panels do not need hard-coded
  fallback copy for launch lifecycle, histories, policies, and artifacts.
- Ingestion developers own upload progress, chunk state, artifact metadata,
  compression, and cleanup state models.
- MCP developers own AI-agent-safe discovery/read/write tools and redaction.
- Validators own screenshot coverage, browser checks, API samples, and
  compatibility fixtures.
- Reviewers must check that TestHistory is inspired by TestOps workflows without
  copying proprietary UI assets or brand presentation.
