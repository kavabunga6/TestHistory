# Security Policy

TestHistory is a work in progress. It has not reached a stable release and does not yet provide
production support guarantees. Security reports are nevertheless welcome and are handled as a
priority.

## Supported Versions

Only the latest commit on the default branch is currently supported. There are no supported tagged
releases yet.

| Version                           | Security support           |
| --------------------------------- | -------------------------- |
| Latest `main`                     | Best-effort security fixes |
| Older commits and untagged builds | Not supported              |

## Reporting a Vulnerability

Do not disclose suspected vulnerabilities in public issues, pull requests, discussions, logs, or
test artifacts.

Use GitHub private vulnerability reporting:

1. Open the repository's **Security** tab.
2. Select **Advisories**.
3. Select **Report a vulnerability**.

If **Report a vulnerability** is not available, open a public issue containing only the title
`Private security contact requested`. Do not include technical details or evidence. A maintainer
will establish a private channel before requesting more information.

Include, when available:

- the affected commit, component, endpoint, or deployment mode;
- prerequisites and a minimal reproduction;
- expected and observed impact;
- whether credentials, personal data, or tenant boundaries are involved;
- suggested mitigations or fixes;
- any intended disclosure timeline.

Never include real credentials, session tokens, customer data, or production `allure-results` in a
report. Use synthetic fixtures and redact identifiers.

## What to Expect

Maintainers will acknowledge a complete report as soon as reasonably possible, validate its scope,
and coordinate remediation and disclosure through the private advisory. Response times are not an
SLA while the project is in WIP status.

Reports may be closed when they depend on unsupported deployments, require trusted administrator
access without crossing a security boundary, or cannot be reproduced. The reasoning will be shared
privately.

## Research Guidelines

Good-faith research must:

- avoid privacy violations, data destruction, persistence, and service disruption;
- use systems and data you own or are explicitly authorized to test;
- stop after demonstrating the minimum impact necessary;
- avoid social engineering, denial of service, and automated scanning of third-party deployments;
- give maintainers reasonable time to address the issue before disclosure.

Following this policy does not authorize access to third-party systems or data and does not override
applicable law.
