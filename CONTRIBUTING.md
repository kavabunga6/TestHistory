# Contributing to TestHistory

Thank you for helping improve TestHistory. The project is still a work in progress, so APIs, storage
formats, migrations, deployment manifests, and UI behavior may change before the first stable
release.

## Before You Start

- Search existing issues and pull requests before opening a new one.
- Use an issue or discussion for large features, schema changes, security-sensitive work, or major UI
  redesigns before implementation.
- Report vulnerabilities privately according to [SECURITY.md](SECURITY.md).
- Do not submit real credentials, customer data, production logs, or production `allure-results`.

TestHistory is licensed under the [Apache License 2.0](LICENSE). Unless explicitly stated otherwise,
an intentional contribution submitted for inclusion in TestHistory is provided under the same
license, without additional terms or conditions. Submit only work you have the right to license.

## Development Setup

Requirements and local workflows are documented in:

- [README.md](README.md) for the quick start;
- [docs/local-development.md](docs/local-development.md) for local services and test data;
- [docs/design-system.md](docs/design-system.md) for UI rules;
- [docs/api.md](docs/api.md) for API usage;
- [docs/kubernetes-deployment.md](docs/kubernetes-deployment.md) for Kubernetes deployments.

Install exact dependencies with:

```bash
npm ci
```

## Making Changes

1. Create a focused branch from the latest `main`.
2. Keep changes scoped; avoid mixing refactoring with unrelated behavior changes.
3. Add or update tests for observable behavior.
4. Update documentation and OpenAPI contracts when behavior changes.
5. Use synthetic, non-sensitive fixtures.
6. Keep commits small enough to review and use an imperative summary.

For UI changes:

- follow the design system and typography categories;
- preserve independent scrolling and persisted split-pane widths;
- test long text, empty states, loading states, errors, permissions, and narrow viewports;
- include before/after screenshots when the visual impact is material.

For API, persistence, or deployment changes:

- document authentication and authorization behavior;
- provide forward and rollback migration considerations;
- keep OpenAPI and runtime routes in sync;
- update operational and deployment instructions;
- avoid weakening secret, artifact, SSRF, upload, or tenant-isolation boundaries.

## Validation

Run the baseline checks before requesting review:

```bash
npm run check
npm run lint
npm run format
npm run licenses:check
```

Run the relevant additional checks when applicable:

```bash
npm run openapi:check
npm run k8s:validate:all
npm run security:audit
```

Some Kubernetes rendering checks require `kubectl`. A skipped renderer is not equivalent to a
successful render in a production-like environment.

## Pull Requests

A pull request should explain:

- what changed and why;
- user and operator impact;
- security, compatibility, and migration implications;
- tests and manual checks performed;
- remaining limitations or follow-up work.

Reviewers may request smaller commits, additional tests, documentation, or evidence for risky
changes. Be respectful and follow [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
