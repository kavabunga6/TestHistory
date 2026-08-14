# Auth, Roles, and Project Access

TestHistory authorization is project-scoped. Test-case `owner` and `member` labels remain test
metadata; they are not project access controls.

## Roles

Project memberships use these roles:

- `owner`: manage project settings, members, API tokens, integrations, visibility, defects, quarantine, launches, results, and exports.
- `maintainer`: operate launches/results, defects, quarantine, integrations, and read settings.
- `editor`: upload and edit test results, defects, quarantine, and test-case data.
- `viewer`: read project data allowed by visibility policies.
- `ci`: upload/read CI-owned launch and result data through scoped API tokens.

Project settings access is enforced by both scope and active project membership role for verified
user sessions and project API tokens:

- `settings:read` requires an active `owner` or `maintainer` membership.
- `settings:write` requires an active `owner` membership.
- Bearer API tokens are authorized by token scope/status/expiry and do not inherit a user
  membership role.

## API Tokens

User authentication is available through:

- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `GET /api/v1/auth/me`

Registration and login return a raw session token once. The UI stores it locally and displays the
current user in the sidebar. Personal API tokens are managed through:

- `GET /api/v1/auth/tokens`
- `POST /api/v1/auth/tokens`
- `DELETE /api/v1/auth/tokens/{tokenId}`

In production, public registration is disabled by default. Bootstrap the first administrator with
`TESTHISTORY_BOOTSTRAP_ADMIN_EMAIL` and `TESTHISTORY_BOOTSTRAP_ADMIN_PASSWORD` (minimum 12
characters) supplied through deployment secrets. Set `TESTHISTORY_ALLOW_REGISTRATION=true` only
when self-registration is intentional. Passwords are stored using salted `scrypt`; legacy SHA-256
password hashes are upgraded after a successful login.

Personal token reads and revokes return only redacted metadata. The raw personal token secret is
returned only by the create response.

Project API tokens are created through:

- `POST /api/v1/projects/{projectId}/settings/access/tokens`

The response returns the raw `secret` once. Subsequent reads return only redacted token metadata:
`id`, `name`, `prefix`, `fingerprint`, `ownerSubject`, `scopes`, `status`, and timestamps.
`secretHash` and the raw secret are never returned by read or revoke endpoints.

Use tokens through the standard header:

```http
Authorization: Bearer th_live_<prefix>_<secret>
```

Tokens are validated against the project access settings by SHA-256 hash, active status, expiry, and
required scope. Invalid tokens and denied responses must not echo the submitted bearer value.

Token creation and revocation append redacted security audit events:

- `auth.token.created`
- `auth.token.revoked`

Audit metadata includes token id, prefix, fingerprint, owner subject, scopes, and status. It does not
include the raw secret or `secretHash`.

## Scopes

Current production scopes:

- `projects:read`, `projects:write`
- `launches:read`, `launches:write`
- `uploads:read`, `uploads:write`
- `results:read`, `results:write`
- `test-cases:read`, `test-cases:write`
- `artifacts:read`, `artifacts:write`
- `analytics:read`
- `dashboards:read`, `dashboards:write`
- `defects:read`, `defects:write`
- `quarantine:write`
- `settings:read`, `settings:write`
- `exports:read`
- `security:audit:read`
- `quality-gates:evaluate`
- `mcp:discover`

## Visibility

Project visibility has three modes: `private`, `internal`, and `public-demo`.

Authenticated project and launch read APIs apply both scopes and visibility:

- `private`: requires the requested read scope, project scope, and an active project membership
  (`owner`, `maintainer`, `editor`, `viewer`, or `ci`).
- `internal`: requires the requested read scope, project scope, and an authenticated user.
- `public-demo`: still requires authentication in production; development may expose demo-visible
  data through the explicit no-auth fallback.

Fresh projects without saved access settings behave as `private` with the bootstrap
`project-owner` membership.

Production always requires authentication for project-scoped reads and writes. Browser requests use
the verified session bearer token; CI integrations use a scoped project API token. Client-provided
`x-testhistory-actor-id`, `x-testhistory-project-scope`, and `x-testhistory-scopes` headers are
ignored in production. They remain available in development/tests, or behind the explicit
`TESTHISTORY_TRUSTED_HEADER_AUTH=true` opt-in for a trusted identity-aware proxy.

The internal upload queue uses a separate `TESTHISTORY_WORKER_TOKEN`. Configure the same secret on
the API and worker; never reuse a user session or project token for worker polling.

Membership role/status changes append `auth.role.changed` events with previous/next role metadata.

Visibility policies must keep these values out of project UI and normal read models:

- raw API tokens, token hashes, bearer headers, and credentials
- signed URLs, storage keys, and object-storage refs
- local filesystem paths
- raw result payloads and hidden parameters
- token-like query parameters in integration provider URLs

## Link Providers

Integrations are generic link providers. A provider combines:

- `baseUrl`: HTTPS prefix without credentials or token-like query parameters
- `source`: label/custom field/issue/testKey/link/testCaseId/historyId/fullName/name
- `suffixTemplate`: must contain `{value}`
- `matchMode`: `first`, `all`, or `regex`

This makes Jira, YouTrack, GitHub, Linear, TestRail, and custom services presets over one data model.

## Required Evidence

Before merging auth/access changes, run:

```bash
npm run format
npm run lint
npm run test -w @testhistory/api
npm run test -w @testhistory/web
npm run build
npm run openapi:check
```

For UI changes, also run screenshot capture and button overflow guards before publishing evidence.
