# Release Evidence Summary

Use this page as the PR or release baseline evidence summary for TestHistory readiness work. Keep
links current in the PR description; do not paste secrets, raw `allure-results`, signed URLs,
customer screenshots, or local machine paths.

## Required Links

| Area                  | Evidence to attach                                                                                                                                      | Source                                            |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| CI                    | Green `Lint`, `Build and test`, `API smoke`, `OpenAPI contract`, `UI screenshot evidence`, `Kubernetes readiness smoke`, and `Operations contract` jobs | GitHub Actions run for the pushed branch or PR    |
| UI screenshots        | `ui-screenshot-evidence` artifact with `docs/screenshots/final/manifest.json`                                                                           | `UI screenshot evidence` job                      |
| Local stack           | Output from `npm run local:help`, `npm run local:doctor`, `npm run local:up`, and `npm run local:smoke`                                                 | Local terminal or CI transcript                   |
| Kubernetes            | Output from `npm run k8s:help`, `npm run k8s:validate:all`, and the selected deploy/undeploy command                                                    | Local terminal, CI transcript, or cluster runbook |
| API docs              | `npm run openapi:check`, Swagger UI `/docs`, and OpenAPI JSON `/docs/json`                                                                              | CI `OpenAPI contract` job and running API         |
| Load/soak             | `load-soak-evidence` artifact or `.tmp/performance/load-soak-evidence.json` for manual workflow dispatch runs                                           | `Load soak evidence` job                          |
| Production operations | Passing `npm run production:evidence:check` against a sanitized, environment-specific evidence file outside the repository                              | Approved environment operations system            |

## Local Baseline Commands

Run these before opening or updating a readiness PR:

```bash
npm run lint
npm run test
npm run build
npm run openapi:check
npm run release:evidence:check
npm run production:evidence:test
npm run local:help
npm run local:doctor
npm run docker:help
npm run k8s:help
npm run k8s:validate:all
```

Run browser evidence when Playwright Chromium is available locally:

```bash
npx playwright install chromium
npm run guard:ui-design
npm run guard:button-overflow
npm run guard:ui-interactions
npm run screenshots:capture
```

When local browser download is blocked, use the GitHub Actions `ui-screenshot-evidence` artifact as
the screenshot source of truth.

## PR Summary Template

```text
CI:
- Actions run:
- OpenAPI contract:
- UI screenshot evidence artifact:
- Load/soak artifact:

Deployability:
- Local stack smoke:
- Kubernetes validate/deploy:
- Kubernetes undeploy:

API docs:
- Swagger UI:
- OpenAPI JSON:
- Web docs proxy:
- Static/runtime parity:

Residual risks:
- Local Chromium availability:
- Cluster-specific overlays/secrets:
- External production evidence reference and expiry:
```

## Acceptance Notes

- Every visible UI route, tab, button, switch, toolbar action, and dialog touched by the PR must be
  working, hidden by permissions, read-only with concrete evidence, or lifecycle-disabled with a
  clear reason.
- Local and Kubernetes deploy commands must be represented by wrapper output, not by handwritten
  command fragments only.
- API documentation claims must be backed by `docs/openapi/openapi.yaml`, runtime `/docs/json`, and
  `npm run openapi:check`.
- CI and static smoke never satisfy the production operations gate. Backup/restore, S3, each enabled
  outbound provider, and enabled OIDC/SCIM drills must be verified with
  `npm run production:evidence:check` against sanitized evidence stored outside git.
