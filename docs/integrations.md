# Integration Guide

This guide is the operator-facing starting point for adding external systems to TestHistory. It
covers display-only links, outbound issue creation, notifications, inbound CI webhooks, and
enterprise identity. Route schemas are also available in Swagger at `/docs`.

## Authentication used in the examples

Production requests use a session or API token:

```text
Authorization: Bearer <token>
Content-Type: application/json
```

For local development with trusted-header authentication enabled, the equivalent project headers
are:

```text
x-testhistory-actor-id: admin
x-testhistory-project-scope: <project-id>
x-testhistory-scopes: settings:read,settings:write,test-cases:write
```

Never put credentials in a provider URL or a project settings payload. Settings refer to an
environment variable; the secret value stays in the process environment or deployment secret
manager.

## Clickable Jira and external links in result reports

Link providers turn imported issue keys, test keys, labels, custom fields, or links into safe URLs.
They only affect navigation in the UI; they do not call the external service.

Configure a Jira issue provider:

```http
PATCH /api/v1/projects/<project-id>/settings/access
Content-Type: application/json

{
  "integrationProviders": [
    {
      "id": "jira-issues",
      "enabled": true,
      "name": "Jira issues",
      "preset": "jira",
      "source": {
        "kind": "issue",
        "name": "issue",
        "matchMode": "all"
      },
      "baseUrl": "https://jira.example.com/browse/",
      "suffixTemplate": "{value}",
      "encodeSuffix": true
    }
  ]
}
```

An imported issue value `ANDROID-431` is then rendered as
`https://jira.example.com/browse/ANDROID-431`. `baseUrl` must use HTTPS (localhost is allowed for
development), must not contain credentials, and must not contain token-like query parameters.
`suffixTemplate` must contain `{value}`.

Supported `source.kind` values are `label`, `customField`, `issue`, `testKey`, `link`, `testCaseId`,
`historyId`, `fullName`, and `name`. Supported presets are `jira`, `youtrack`, `github`, `linear`,
`testrail`, and `custom`.

## Outbound issue creation

This is separate from display-only links. It creates issues through the durable delivery outbox.

1. Put the credential in an environment variable. A value beginning with `Basic ` or `Bearer ` is
   sent unchanged; other values are sent as a bearer token.

```text
TESTHISTORY_JIRA_CREDENTIAL=Bearer <jira-token>
```

2. Register the tracker adapter:

```http
POST /api/v1/projects/<project-id>/integrations/issue-trackers
Content-Type: application/json

{
  "name": "Android Jira",
  "provider": "jira",
  "baseUrl": "https://jira.example.com/",
  "projectKey": "ANDROID",
  "credentialEnvVar": "TESTHISTORY_JIRA_CREDENTIAL"
}
```

Providers are `jira`, `youtrack`, `github`, and `generic`. For GitHub, `projectKey` is
`owner/repository`; for Jira it is the project key.

3. Queue and optionally dispatch an issue:

```http
POST /api/v1/projects/<project-id>/issues
Content-Type: application/json

{
  "integrationId": "<integration-id>",
  "summary": "Checkout test failed",
  "description": "Result: failedAssertionIsReportedWithVisibleScreenshot",
  "labels": ["testhistory", "android"],
  "dispatchNow": true
}
```

Inspect delivery state with
`GET /api/v1/projects/<project-id>/integration-deliveries?kind=issue`. A worker can claim bounded
batches through `POST /api/v1/integrations/deliveries/dispatch` with
`{"workerId":"integrations-1","limit":25}`. Failed calls are retried and eventually become `dead`.

## Notifications

Register a generic signed webhook, Slack, Teams, or Pachca destination:

```http
POST /api/v1/projects/<project-id>/integrations/notifications
Content-Type: application/json

{
  "name": "QA alerts",
  "provider": "generic",
  "endpointUrl": "https://hooks.example.com/testhistory",
  "events": ["launch.closed", "launch.failed", "quality-gate.failed"],
  "secretEnvVar": "TESTHISTORY_NOTIFICATION_SECRET"
}
```

Other supported events are `automation-job.succeeded`, `automation-job.failed`, and
`automation-job.canceled`. Generic webhooks are signed in `x-testhistory-signature` with HMAC-SHA256
when `secretEnvVar` is configured. The secret must be at least 16 characters. Use `provider: "pachca"`
with the incoming Webhook URL copied from the Pachca bot settings:

```json
{
  "name": "Pachca QA alerts",
  "provider": "pachca",
  "endpointUrl": "https://your-workspace.pachca.com/webhooks/...",
  "events": ["automation-job.failed", "quality-gate.failed"]
}
```

TestHistory sends the documented `{ "message": "..." }` payload. See the
[Pachca incoming-webhook guide](https://dev.pachca.com/guides/incoming-webhooks) for bot and chat
setup.

## Inbound CI webhooks

Create an integration for `gitlab`, `github`, `jenkins`, `teamcity`, or `generic`:

```http
POST /api/v1/projects/<project-id>/integrations/ci
Content-Type: application/json

{
  "name": "Android GitLab",
  "provider": "gitlab"
}
```

The response contains a one-time `secret` and
`webhookUrl: /api/v1/webhooks/ci/<integration-id>`. Store the secret immediately. GitLab may send it
in `x-gitlab-token`; other compact webhook clients may use `x-testhistory-webhook-token`. GitHub may
use `x-hub-signature-256: sha256=<hmac>` over the exact request body. Production GitHub integration
requires `TESTHISTORY_INTEGRATION_MASTER_KEY` with at least 32 random characters so the webhook
secret can be encrypted at rest.

Compact payload example:

```json
{
  "eventId": "pipeline-4821-finished",
  "pipelineId": "4821",
  "name": "Android instrumentation",
  "status": "succeeded",
  "pipelineUrl": "https://gitlab.example.com/mobile/android/-/pipelines/4821",
  "branch": "develop",
  "commitSha": "0123456789abcdef",
  "launchId": "<optional-launch-id>"
}
```

Native GitLab pipeline and GitHub `workflow_run` payloads are normalized by the same endpoint.
Repeated events are idempotent and invalid backward status transitions are ignored.

## OIDC and SCIM

OIDC configuration stores only the environment-variable name for the client secret:

```http
POST /api/v1/projects/<project-id>/enterprise-access/oidc
Content-Type: application/json

{
  "name": "Corporate SSO",
  "issuer": "https://identity.example.com/realms/company",
  "clientId": "testhistory",
  "clientSecretEnvVar": "TESTHISTORY_OIDC_CLIENT_SECRET",
  "scopes": ["openid", "profile", "email"],
  "defaultRole": "viewer",
  "enabled": true
}
```

Validate discovery through
`POST /api/v1/projects/<project-id>/enterprise-access/oidc/<provider-id>/discover`.

Create or rotate a SCIM token with
`POST /api/v1/projects/<project-id>/enterprise-access/scim/token` and
`{"defaultRole":"viewer"}`. The secret is returned once. The SCIM base is
`/api/scim/v2/projects/<project-id>` and implements Users list, create, patch, and deactivate.

## Adding a new provider safely

1. Add the provider value to the domain type and request schema.
2. Add request translation in the delivery service or inbound normalization in the CI route.
3. Keep credentials as environment-variable references and pass every outbound URL through the
   SSRF-safe URL parser.
4. Redact credentials and response bodies from read models, errors, and audit events.
5. Add route tests for authorization, validation, successful delivery, retry/idempotency, and
   redaction.
6. Update OpenAPI and run:

```bash
npm run openapi:check
npm test
npm run build
```

See also [API documentation](api.md), [authentication and access](auth-access.md), and
[local development](local-development.md).
