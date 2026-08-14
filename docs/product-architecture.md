# Product Architecture

This document describes the runtime architecture of TestHistory itself. It is
not a project-management plan and not a public API contract. Runtime topology is
implemented through infrastructure manifests, service configuration, worker
queues, storage boundaries, and internal modules.

## Runtime Shape

TestHistory starts as a modular monolith with separate processes:

- `testhistory-api`: REST API, Swagger, lifecycle commands, ingestion
  coordination.
- `testhistory-worker`: asynchronous ingestion, launch closing, analytics,
  test-case synchronization, artifact cleanup.
- `testhistory-web`: operational UI.
- `testhistory-mcp`: AI-agent facade over safe discovery and API-backed tools.

Stateful dependencies are not part of the public application surface:

- PostgreSQL: primary transactional store.
- RabbitMQ: durable job queue.
- S3-compatible object storage: raw Allure files, attachments, previews,
  archived uploads.
- Redis: sessions, locks, short-lived coordination state.
- ClickHouse: analytics path, optional for early MVP.
- OpenSearch: search path, optional for early MVP.

## Network Boundaries

Only the web/API/MCP surfaces are user or agent visible. PostgreSQL, RabbitMQ,
S3, Redis, ClickHouse, and OpenSearch must be reachable by application
processes, but not directly by end users.

## Processing Model

Uploads happen while a launch is open. The close-launch command is the product
boundary where TestHistory finalizes the run:

1. reconcile pending uploads;
2. normalize results, fixtures, steps, labels, links, parameters, and
   attachments;
3. create or update automated test cases;
4. materialize analytics facts;
5. index searchable documents;
6. schedule artifact retention and cleanup candidates.

Worker queues:

- `ingestion.parse`
- `launch.close`
- `testcase.sync`
- `analytics.materialize`
- `artifact.cleanup`

## Artifact Plane

Artifacts must not live on the same disk as the primary database. Production
deployments should use S3-compatible storage with SSD or frequent-access storage
class. Kubernetes deployments should connect self-hosted artifact storage
through CSI-backed volumes or use a managed S3-compatible service.

Cleanup only targets closed launches. It is staged: first collect eligible
records, then delete in slow batches so storage deletion does not compete with
active ingestion.
