# Allure-Compatible Test Intelligence Platform

## 1. Цель проекта

Мы строим собственную платформу уровня Allure EE/TestOps, но с более сильной аналитикой, удобной историей тестов и полной совместимостью с текущей экосистемой Allure.

Правильная продуктовая формулировка: **Allure-compatible Test Intelligence Platform**.

Ключевая цель: не копировать бренд, закрытые реализации или UI Allure TestOps, а создать сервис, который:

- принимает существующие `allure-results` без изменения тестов;
- работает с текущими Allure adapters для Java, Python, JavaScript, C#, Ruby, PHP и других стеков;
- хранит сырые Allure-артефакты для совместимости и аудита;
- нормализует результаты в собственную доменную модель;
- строит богатую историю тестов;
- помогает понимать причины падений, flaky-тесты, деградации и готовность релиза;
- поддерживает автотесты, ручные тесты, тест-планы, quality gates, интеграции с CI/CD и issue trackers.

Главная идея продукта: **Allure показывает запуск, а наша платформа должна хранить память тестов и объяснять состояние качества продукта**.

## 2. Архитектурные принципы

1. **Совместимость сначала**
   - Любой проект, который уже генерирует `allure-results`, должен загружаться без изменений.
   - Все нестандартные поля из Allure JSON должны сохраняться в raw-представлении.

2. **Raw + Normalized + Analytics + Search**
   - Один загруженный результат превращается в четыре представления:
     - raw artifact;
     - canonical domain object;
     - analytical fact;
     - search document.

3. **Асинхронная обработка**
   - Upload не должен ждать полного расчета аналитики.
   - Ingestion, attachment preview, clustering, flaky detection и dashboards считаются воркерами.

4. **Контракты между агентами**
   - Сначала фиксируются OpenAPI, JSON Schemas, DB migrations и event schemas.
   - После этого backend, frontend, ingestion и analytics могут идти параллельно.

5. **Тестируемость как часть архитектуры**
   - Для каждого слоя есть contract tests.
   - Для Allure-совместимости создается corpus из реальных и синтетических `allure-results`.

6. **Наблюдаемость с первого дня**
   - Каждый upload, parse, normalize, link, close launch и analytics job должны иметь trace/log/metric.

## 3. Совместимость с Allure

Минимально поддерживаемые входные файлы:

```text
{uuid}-result.json
{uuid}-container.json
{uuid}-attachment.{ext}
environment.properties
environment.xml
executor.json
categories.json
history/history.json
history/history-trend.json
history/duration-trend.json
history/retry-trend.json
history/categories-trend.json
```

Основные поля `*-result.json`:

```ts
type AllureResult = {
  uuid: string;
  historyId?: string;
  testCaseId?: string;
  fullName?: string;
  name: string;
  description?: string;
  descriptionHtml?: string;
  status?: "failed" | "broken" | "passed" | "skipped" | "unknown";
  statusDetails?: {
    known?: boolean;
    muted?: boolean;
    flaky?: boolean;
    message?: string;
    trace?: string;
  };
  stage?: "scheduled" | "running" | "finished" | "pending" | "interrupted";
  steps?: AllureStep[];
  attachments?: AllureAttachment[];
  parameters?: AllureParameter[];
  labels?: AllureLabel[];
  links?: AllureLink[];
  start?: number;
  stop?: number;
};
```

Вложенные сущности:

```ts
type AllureStep = {
  name: string;
  status?: AllureStatus;
  statusDetails?: AllureStatusDetails;
  stage?: string;
  steps?: AllureStep[];
  attachments?: AllureAttachment[];
  parameters?: AllureParameter[];
  start?: number;
  stop?: number;
};

type AllureAttachment = {
  name: string;
  source: string;
  type?: string;
};

type AllureParameter = {
  name: string;
  value?: string;
  excluded?: boolean;
  mode?: "default" | "masked" | "hidden";
};

type AllureLabel = {
  name: string;
  value: string;
};

type AllureLink = {
  name?: string;
  url: string;
  type?: string;
};
```

Идентификаторы:

- `uuid` - уникальный id конкретного результата;
- `historyId` - связь истории одного теста с тем же набором параметров;
- `testCaseId` - связь разных запусков с одним автотестом/тест-кейсом;
- `fullName` - fallback для сопоставления, если `testCaseId` отсутствует.

## 4. Доменная модель

Основные сущности:

```text
Organization
User
Team
Project
Repository
Branch
Build
Launch
LaunchJob
TestCase
TestResult
TestAttempt
TestStep
Fixture
Attachment
Parameter
Label
Link
Environment
Executor
Defect
FailureCluster
FlakySignal
MuteRule
CategoryRule
TestPlan
ManualTestCase
ManualRun
Dashboard
SavedQuery
NotificationRule
Integration
AuditEvent
```

Важное разделение:

- `TestResult` - одна попытка выполнения теста в конкретном launch;
- `TestCase` - стабильная сущность теста, собирающая историю многих результатов;
- `TestAttempt` или retry - повтор выполнения внутри одного launch;
- параметризованный тест может иметь один `TestCase`, но много `TestResult`.

## 5. Рекомендуемый стек

Базовый вариант:

```text
Backend API:        Kotlin/Spring Boot, Java/Spring, Go или Node/NestJS
Frontend:           React / Next.js / TypeScript
Primary DB:         PostgreSQL
Analytics DB:       ClickHouse
Search:             OpenSearch / Elasticsearch
Object Storage:     S3 / MinIO
Queue:              Kafka / RabbitMQ / Redpanda
Cache:              Redis
Auth:               OIDC/SAML/LDAP + internal tokens
Observability:      OpenTelemetry + Prometheus + Grafana + Loki
```

Для быстрой первой реализации лучше модульный монолит:

```text
apps/api
apps/worker
apps/web
packages/allure-parser
packages/domain
packages/contracts
packages/analytics
packages/client-sdk
packages/test-fixtures
infra/docker-compose
infra/migrations
docs
```

## 6. Backend: сервисы и модули

Даже если физически это модульный монолит, логически нужны такие bounded contexts:

```text
identity-service
project-service
launch-service
result-ingestion-service
testcase-service
artifact-service
analytics-service
defect-service
notification-service
integration-service
query-service
audit-service
```

### 6.1 Launch Service

Отвечает за:

- создание launch;
- open/closed lifecycle;
- auto-close policy;
- привязку к branch, commit, build, executor;
- aggregate status;
- counters по статусам;
- блокировку повторного закрытия;
- idempotency upload.

Основные API:

```http
POST /api/v1/projects/{projectId}/launches
GET  /api/v1/projects/{projectId}/launches
GET  /api/v1/launches/{launchId}
POST /api/v1/launches/{launchId}/close
POST /api/v1/launches/{launchId}/reopen
DELETE /api/v1/launches/{launchId}
```

### 6.2 Ingestion Service

Отвечает за:

- upload zip/tar/direct multipart;
- прием больших архивов chunked upload;
- сохранение raw files;
- распаковку;
- детект структуры `allure-results`;
- schema validation;
- нормализацию;
- deduplication;
- публикацию событий.

Pipeline:

```text
Upload API
  -> Raw artifact storage
  -> Archive unpacker
  -> Allure file detector
  -> JSON schema validation
  -> Compatibility normalizer
  -> Deduplication
  -> Result linker
  -> Attachment processor
  -> Analytics event writer
  -> Search index writer
  -> Launch state updater
```

Основные API:

```http
POST /api/v1/launches/{launchId}/results
POST /api/v1/launches/{launchId}/results/archive
POST /api/v1/launches/{launchId}/results/chunks
GET  /api/v1/uploads/{uploadId}
```

### 6.3 TestCase Service

Отвечает за:

- автоматическое создание test cases;
- сопоставление результатов с test cases;
- merge/split тестов;
- workflow status;
- ownership;
- ручное редактирование metadata;
- историю изменений.

Алгоритм сопоставления:

```text
1. Если есть testCaseId, ищем test_cases.allure_test_case_id.
2. Если нет, но есть fullName, ищем canonical_full_name.
3. Если есть labels package/suite/testClass/testMethod, строим canonical key.
4. Если тест параметризованный, TestCase один, TestResult много.
5. Если тест переименован, предлагаем merge candidates по похожести labels, file path, method, history.
```

### 6.4 Artifact Service

Отвечает за:

- attachment storage;
- preview generation;
- signed download URLs;
- attachment retention;
- media type detection;
- HTML sandbox preview;
- size limits;
- optional malware scanning.

Поддерживаемые preview:

```text
image/*
video/*
text/plain
application/json
application/xml
text/csv
text/tab-separated-values
text/html in sandbox
```

### 6.5 Analytics Service

Отвечает за:

- запись фактов в ClickHouse;
- materialized views;
- dashboards;
- flaky score;
- stability score;
- duration regression;
- release readiness;
- branch comparison;
- team ownership metrics.

### 6.6 Defect Service

Отвечает за:

- failure clustering;
- defect lifecycle;
- manual triage;
- mute rules;
- known issue rules;
- link to Jira/YouTrack/GitHub Issues;
- matching новых результатов с существующими дефектами.

## 7. База данных

PostgreSQL: транзакционная модель.

```sql
organizations(id, name, slug, created_at)
users(id, email, name, avatar_url, created_at)
teams(id, org_id, name)
team_members(team_id, user_id, role)

projects(id, org_id, key, name, settings_json, created_at)

launches(
  id, project_id, name, status,
  branch, commit_sha, build_number,
  started_at, finished_at, closed_at,
  created_by, metadata_json
)

test_cases(
  id, project_id,
  external_id,
  allure_test_case_id,
  canonical_full_name,
  name,
  automation_status,
  workflow_status,
  owner_user_id,
  owner_team_id,
  created_at,
  updated_at
)

test_results(
  id, project_id, launch_id, test_case_id,
  uuid, history_id, allure_test_case_id,
  full_name, name,
  status, stage,
  start_time, stop_time, duration_ms,
  retry_index,
  is_latest_retry,
  status_message_hash,
  trace_hash,
  raw_json_id,
  created_at
)

test_parameters(id, result_id, name, value, excluded, mode)
test_labels(id, result_id, name, value)
test_links(id, result_id, name, url, type)

test_steps(
  id, result_id, parent_step_id,
  name, status, stage,
  start_time, stop_time, duration_ms,
  status_message, trace_hash,
  sort_order
)

attachments(
  id, project_id, result_id, step_id,
  name, source, media_type,
  storage_key, size_bytes, sha256,
  preview_status, created_at
)

environments(id, launch_id, name, value)
executors(id, launch_id, name, type, url, build_name, build_url, report_url)

defects(
  id, project_id, title, type, status,
  signature_hash, first_seen_at, last_seen_at,
  owner_team_id
)

failure_clusters(
  id, project_id, defect_id,
  signature_hash, normalized_message,
  normalized_trace_top,
  sample_result_id,
  confidence
)

result_defects(result_id, defect_id, match_type, confidence)

mute_rules(
  id, project_id, test_case_id, defect_id,
  reason, active_from, active_until,
  created_by
)

audit_events(
  id, org_id, project_id, actor_user_id,
  entity_type, entity_id, action,
  before_json, after_json, created_at
)
```

ClickHouse: аналитические факты.

```sql
test_result_events(
  org_id,
  project_id,
  launch_id,
  test_case_id,
  history_id,
  branch,
  commit_sha,
  status,
  duration_ms,
  start_time,
  stop_time,
  owner_team_id,
  framework,
  language,
  suite,
  package,
  epic,
  feature,
  story,
  severity,
  defect_id,
  is_flaky,
  is_muted,
  retry_index
)
```

OpenSearch document:

```json
{
  "projectId": "WEB",
  "launchId": "launch-1",
  "testCaseId": "case-1",
  "resultId": "result-1",
  "name": "should checkout order",
  "fullName": "com.company.CheckoutTest.shouldCheckout",
  "status": "failed",
  "labels": {
    "epic": ["Commerce"],
    "feature": ["Checkout"],
    "severity": ["critical"]
  },
  "statusMessage": "Expected total to be 100",
  "trace": "...",
  "branch": "main",
  "createdAt": "2026-05-30T00:00:00Z"
}
```

## 8. Frontend

Рекомендуемый стек:

```text
React / Next.js
TypeScript
TanStack Query
TanStack Table
Zustand или Redux Toolkit
ECharts
Monaco Editor
Virtualized lists
Playwright E2E
Storybook
MSW для API mocks
```

Основные экраны:

```text
Projects
Launches
Launch Details
Test Results Table
Result Details
Test Case Details
History
Defects
Analytics
Dashboards
Test Plans
Manual Testing
Settings
Integrations
Admin
```

### 8.1 Launch Details

Состав:

```text
Header:
- name
- status
- branch
- build
- commit
- duration
- close/reopen controls

Summary:
- passed/failed/broken/skipped/unknown
- new failures
- flaky
- muted
- unresolved
- duration trend

Main table:
- status
- test name
- suite/package
- duration
- retries
- owner
- defect
- environment
- labels
- last 10 history dots

Side panel:
- selected result details
- stack trace
- steps
- attachments
- parameters
- links
- raw Allure JSON
```

### 8.2 Test Case Details

Состав:

```text
Header:
- name
- owner
- workflow status
- automation status
- tags/severity/feature/story

Tabs:
- Overview
- History
- Results
- Parameters
- Defects
- Attachments
- Analytics
- Raw Allure
```

### 8.3 History UI

История должна быть главным конкурентным преимуществом:

```text
Timeline dots by launch
Status heatmap
Duration sparkline
Branch filter
Environment filter
Parameter filter
Compare selected runs
Failure clusters over time
Owner/team view
```

Карточка здоровья теста:

```text
Status timeline
Pass rate за 7/14/30/90 дней
Flakiness score
Median / p95 duration
Last failure
First seen / last seen
Branches coverage
Failure reasons
Retries behavior
Linked defects
Affected builds
Environment matrix
Parameter matrix
```

## 9. Аналитика

Основные витрины:

```text
Quality Overview
Launch Comparison
Failure Intelligence
Flaky Tests
Slow Tests
Test Health
Team Ownership
Release Readiness
Defect Impact
Environment Matrix
Branch Stability
Code Area Risk
```

Метрики:

```text
Pass Rate = passed / completed
Stability Score = passed_runs / completed_runs
Flaky Score = status_transitions / total_runs + retry_recovery_rate
Failure Recency = weighted failures with exponential decay
Duration Regression = current_p95 / baseline_p95
Ownership Risk = failures without owner or unresolved defect
Release Confidence = weighted quality gate score
```

Примеры инсайтов:

```text
Новые падения по сравнению с main
Падения, появившиеся после commit X
Тесты, которые чаще всего проходят после retry
Топ нестабильных тестов по командам
Тесты, которые давно не запускались
Тесты, которые всегда skipped
Фича с худшим трендом за 30 дней
Падения с одинаковым stack trace в разных проектах
Ускорение или замедление suite после релиза
Release confidence score
```

## 10. Failure clustering

Нужно нормализовать:

```text
raw message
raw stack trace
exception class
top application frame
assertion diff
browser/device/os
screenshot perceptual hash
log snippets
HTTP status/error code
```

Signature:

```ts
signatureHash = hash(
  exceptionType + normalizedMessage + topRelevantStackFrame + assertionType + productArea
);
```

Удалять из signature:

```text
UUID
timestamps
ports
random ids
memory addresses
absolute paths
line numbers optionally
dynamic parameter values
```

## 11. API

REST API:

```http
GET  /api/v1/projects
POST /api/v1/projects

GET  /api/v1/projects/{id}/launches
POST /api/v1/projects/{id}/launches

GET  /api/v1/launches/{id}
POST /api/v1/launches/{id}/close
GET  /api/v1/launches/{id}/results

GET  /api/v1/results/{id}
GET  /api/v1/test-cases/{id}
GET  /api/v1/test-cases/{id}/history

GET  /api/v1/analytics/flaky
GET  /api/v1/analytics/failures/clusters
GET  /api/v1/analytics/release-readiness

POST /api/v1/query
```

Query DSL:

```json
{
  "project": "WEB",
  "where": {
    "status": ["failed", "broken"],
    "branch": "main",
    "label.feature": "Checkout",
    "createdAt": { "gte": "now-14d" }
  },
  "groupBy": ["testCaseId", "defectId"],
  "metrics": ["count", "passRate", "p95Duration"]
}
```

Позже можно добавить AQL-подобный язык:

```text
status in (failed, broken)
and branch = "main"
and label.feature = "Checkout"
and flaky = true
```

## 12. CLI

Команды:

```bash
testops login --host https://qa.example.com
testops upload ./allure-results --project WEB --launch "PR-123"
testops watch --launch-id 42
testops close --launch-id 42
testops quality-gate --launch-id 42 --fail-on-new-failures
```

CI example:

```bash
pytest --alluredir=allure-results
testops upload allure-results \
  --project WEB \
  --launch "$GITHUB_RUN_NUMBER" \
  --branch "$GITHUB_REF_NAME" \
  --commit "$GITHUB_SHA"
```

## 13. Quality gates

Правила:

```text
fail if new_failed > 0
fail if critical_failed > 0
fail if pass_rate < 95%
fail if flaky_critical > 3
fail if duration_regression > 30%
warn if skipped_rate > 10%
```

Ответ API:

```json
{
  "status": "failed",
  "score": 82,
  "violations": [
    {
      "rule": "new_failed",
      "actual": 4,
      "expected": 0
    }
  ]
}
```

## 14. Безопасность

RBAC:

```text
Org Admin
Project Admin
QA Lead
Developer
Viewer
CI Uploader
External Reporter
```

Permissions:

```text
project:read
launch:create
launch:upload
launch:close
result:triage
testcase:update
defect:manage
dashboard:write
settings:admin
```

Auth:

```text
OIDC
SAML
LDAP
API tokens
CI upload tokens
SCIM provisioning
```

Audit events:

```text
кто закрыл launch
кто замьютил тест
кто поменял owner
кто удалил attachment
кто изменил quality gate
кто изменил интеграцию
кто сделал merge/split test case
```

## 15. Параллельная разработка агентами

Проект надо вести как набор параллельных потоков. Каждый агент владеет своей зоной и обязан публиковать контракты, тесты и статус.

### 15.1 Agent 0: Tech Lead / Architect

Зона ответственности:

- финальная архитектура;
- границы модулей;
- технические решения;
- code ownership;
- dependency policy;
- review сложных PR;
- контроль совместимости между агентами.

Deliverables:

```text
docs/architecture.md
docs/domain-model.md
docs/api-guidelines.md
docs/testing-strategy.md
docs/adr/*.md
CODEOWNERS
```

Definition of Done:

- описаны bounded contexts;
- утверждены API conventions;
- утверждены naming conventions;
- есть ADR для ключевых решений;
- все агенты знают owned paths.

### 15.2 Agent 1: Contracts / Schemas

Зона ответственности:

- OpenAPI;
- JSON Schema для Allure input;
- internal event schemas;
- TypeScript/Kotlin/Go DTO generation;
- backward compatibility rules.

Owned paths:

```text
packages/contracts
docs/openapi
docs/schemas
```

Deliverables:

```text
openapi.yaml
schemas/allure-result.schema.json
schemas/allure-container.schema.json
schemas/events/*.json
generated clients/types
contract tests
```

Тесты:

```text
schema validation tests
OpenAPI lint
backward compatibility tests
consumer-driven contract tests
```

Параллельные зависимости:

- блокирует backend API и frontend client;
- должен первым выдать минимальный OpenAPI для Project, Launch, Result.

### 15.3 Agent 2: Allure Parser / Compatibility

Зона ответственности:

- чтение `allure-results`;
- поддержка `*-result.json`;
- поддержка `*-container.json`;
- environment/executor/categories/history;
- tolerant parser;
- сохранение неизвестных полей;
- corpus fixtures.

Owned paths:

```text
packages/allure-parser
packages/test-fixtures/allure-results
docs/allure-compatibility.md
```

Deliverables:

```text
AllureResult parser
AllureContainer parser
Environment parser
Executor parser
Categories parser
History parser
Normalizer
Compatibility matrix
```

Тесты:

```text
unit tests на каждый тип файла
golden tests на fixtures
property tests для неизвестных labels/parameters
corrupt input tests
large fixture performance tests
```

Definition of Done:

- парсер не падает на неизвестных полях;
- invalid file дает диагностируемую ошибку;
- attachments связываются по source;
- вложенные steps сохраняют порядок;
- параметры с `masked` и `hidden` не раскрываются в UI DTO.

### 15.4 Agent 3: Backend Core / Domain

Зона ответственности:

- domain entities;
- repositories;
- migrations;
- project/launch/test result/test case APIs;
- transactional logic;
- idempotency.

Owned paths:

```text
apps/api
packages/domain
infra/migrations
```

Deliverables:

```text
Project API
Launch API
Result API
TestCase API
DB migrations
Repository layer
Service layer
```

Тесты:

```text
unit tests для domain logic
integration tests с PostgreSQL
API tests
idempotency tests
migration tests
```

Definition of Done:

- можно создать проект;
- можно создать launch;
- можно получить launch details;
- можно закрыть launch;
- test results сохраняются транзакционно;
- повторная загрузка не создает дубли.

### 15.5 Agent 4: Ingestion / Workers

Зона ответственности:

- upload archive;
- unpack;
- queue jobs;
- parse jobs;
- normalize jobs;
- link jobs;
- retry failed jobs;
- job status API.

Owned paths:

```text
apps/worker
apps/api/src/ingestion
packages/ingestion
```

Deliverables:

```text
Upload endpoint
Archive extractor
Ingestion job model
Queue workers
Retry policy
Dead-letter handling
Progress tracking
```

Тесты:

```text
integration tests upload zip
large archive tests
duplicate archive tests
partial failure tests
worker retry tests
dead-letter tests
```

Definition of Done:

- zip с `allure-results` загружается;
- результат появляется в launch;
- статус ingestion виден через API;
- ошибка в одном файле не ломает весь launch, если включен tolerant mode;
- есть отчет об ошибках импорта.

### 15.6 Agent 5: Artifact / Attachments

Зона ответственности:

- S3/MinIO storage;
- attachment metadata;
- preview generation;
- signed URLs;
- retention policies;
- safe HTML preview.

Owned paths:

```text
packages/artifacts
apps/api/src/artifacts
apps/worker/src/artifacts
infra/minio
```

Deliverables:

```text
Attachment upload
Attachment download
Preview API
Storage abstraction
Retention job
```

Тесты:

```text
unit tests media detection
integration tests MinIO
security tests HTML sandbox
size limit tests
missing attachment tests
```

Definition of Done:

- screenshot открывается в result details;
- JSON/text preview работает;
- большие файлы не грузятся целиком в память;
- signed URL истекает;
- удаление launch удаляет или помечает artifacts согласно retention.

### 15.7 Agent 6: Analytics / ClickHouse

Зона ответственности:

- analytical events;
- ClickHouse schema;
- materialized views;
- metrics;
- dashboard endpoints;
- history calculations.

Owned paths:

```text
packages/analytics
apps/api/src/analytics
apps/worker/src/analytics
infra/clickhouse
```

Deliverables:

```text
test_result_events schema
event writer
pass rate queries
flaky queries
duration queries
history API
release readiness API
```

Тесты:

```text
query snapshot tests
integration tests ClickHouse
metric correctness tests
time window tests
branch comparison tests
```

Definition of Done:

- история теста строится по нескольким launch;
- pass rate считается корректно;
- p95 duration считается корректно;
- branch comparison показывает new failures;
- API работает на большом наборе фикстур.

### 15.8 Agent 7: Failure Intelligence / Defects

Зона ответственности:

- normalization stack traces;
- failure signature;
- clustering;
- defect lifecycle;
- mute rules;
- known issue rules.

Owned paths:

```text
packages/failure-intelligence
apps/api/src/defects
apps/worker/src/defects
```

Deliverables:

```text
Trace normalizer
Message normalizer
Signature hash
Cluster matcher
Defect API
Mute API
Known issue rules
```

Тесты:

```text
unit tests normalization
golden tests signatures
cluster confidence tests
regression tests dynamic values
integration tests defect matching
```

Definition of Done:

- одинаковые stack traces группируются;
- dynamic ids не ломают grouping;
- дефект можно создать из failed result;
- новое падение связывается с существующим defect;
- muted result исключается из нужных метрик.

### 15.9 Agent 8: Frontend Shell / UX System

Зона ответственности:

- app shell;
- routing;
- layout;
- auth screens;
- design system;
- tables;
- filters;
- empty/loading/error states.

Owned paths:

```text
apps/web
packages/ui
docs/frontend-guidelines.md
```

Deliverables:

```text
App shell
Navigation
Project switcher
Reusable table
Filter components
Status badges
History dots
Chart primitives
API client integration
```

Тесты:

```text
component tests
storybook stories
visual regression tests
accessibility tests
responsive layout tests
```

Definition of Done:

- базовая навигация работает;
- UI не ломается на больших именах тестов;
- таблицы виртуализированы;
- есть единые colors/icons/status components;
- все API states отображаются.

### 15.10 Agent 9: Frontend Launches / Results

Зона ответственности:

- страницы launches;
- launch details;
- result table;
- result side panel;
- steps tree;
- attachments viewer;
- raw JSON viewer.

Owned paths:

```text
apps/web/src/features/launches
apps/web/src/features/results
```

Deliverables:

```text
Launch list
Launch details
Result table
Result details panel
Steps tree
Attachments tab
Parameters tab
Labels/links tab
Raw JSON tab
```

Тесты:

```text
component tests with MSW
Playwright tests
large table performance tests
attachment preview tests
```

Definition of Done:

- пользователь видит загруженный launch;
- может открыть failed result;
- видит trace, steps, parameters, attachments;
- фильтрует по status/label/suite;
- может закрыть launch.

### 15.11 Agent 10: Frontend Analytics / History

Зона ответственности:

- test case page;
- history timeline;
- analytics dashboards;
- flaky view;
- release readiness;
- launch comparison.

Owned paths:

```text
apps/web/src/features/test-cases
apps/web/src/features/analytics
apps/web/src/features/dashboards
```

Deliverables:

```text
TestCase details
History timeline
Status heatmap
Duration chart
Flaky dashboard
Slow tests dashboard
Release readiness dashboard
Launch comparison UI
```

Тесты:

```text
component tests charts
MSW API tests
Playwright dashboard tests
visual regression tests
timezone/date tests
```

Definition of Done:

- история теста понятна без открытия launch;
- flaky score виден и объясним;
- можно сравнить launch с baseline;
- графики корректно работают на пустых данных.

### 15.12 Agent 11: CLI / CI Integrations

Зона ответственности:

- CLI;
- GitHub Actions examples;
- GitLab CI examples;
- Jenkins examples;
- upload tokens;
- quality gate command.

Owned paths:

```text
apps/cli
docs/ci
examples/ci
```

Deliverables:

```text
login command
upload command
watch command
close command
quality-gate command
CI documentation
```

Тесты:

```text
CLI unit tests
CLI integration tests
mock server tests
quality gate exit code tests
archive upload tests
```

Definition of Done:

- CLI загружает локальный `allure-results`;
- CI token работает без user session;
- quality gate возвращает правильный exit code;
- команда watch показывает progress.

### 15.13 Agent 12: Auth / Security / Admin

Зона ответственности:

- users;
- organizations;
- teams;
- RBAC;
- API tokens;
- audit;
- OIDC/SAML preparation.

Owned paths:

```text
apps/api/src/identity
apps/api/src/security
apps/web/src/features/admin
docs/security.md
```

Deliverables:

```text
User model
Org/team model
RBAC middleware
API token model
Audit events
Admin UI basics
```

Тесты:

```text
permission tests
token tests
audit tests
negative authorization tests
admin UI tests
```

Definition of Done:

- пользователь видит только свои проекты;
- CI token может только upload;
- audit пишется для важных действий;
- forbidden responses не раскрывают лишние данные.

### 15.14 Agent 13: QA Automation / Validation

Зона ответственности:

- общая тестовая стратегия;
- test fixtures;
- E2E flows;
- compatibility validation;
- performance test scenarios;
- release checklist.

Owned paths:

```text
tests
packages/test-fixtures
docs/testing-strategy.md
docs/release-checklist.md
```

Deliverables:

```text
Allure fixture corpus
E2E tests
Compatibility tests
Performance tests
Smoke tests
Release checklist
```

Тесты:

```text
upload real allure-results
verify launch UI
verify result details
verify history after multiple launches
verify quality gate
verify permissions
```

Definition of Done:

- каждый PR гоняет unit + contract tests;
- nightly гоняет E2E + compatibility corpus;
- есть performance baseline;
- есть smoke сценарий для demo.

### 15.15 Agent 14: DevOps / Platform

Зона ответственности:

- local docker-compose;
- CI pipeline;
- deployment manifests;
- migrations;
- observability;
- backups.

Owned paths:

```text
infra
.github/workflows
deploy
docs/operations.md
```

Deliverables:

```text
docker-compose
local dev scripts
CI pipeline
DB migration pipeline
Helm/Kubernetes baseline
Prometheus metrics
Grafana dashboards
Backup/restore docs
```

Тесты:

```text
docker-compose healthcheck
migration up/down tests
CI smoke tests
backup restore test
load test environment
```

Definition of Done:

- проект стартует одной командой локально;
- CI собирает backend/frontend/worker/cli;
- миграции применяются автоматически;
- health endpoints работают;
- основные метрики видны.

### 15.16 Уточнение ролей по TestOps-like поведению

Исследование Qameta/TestOps добавляет несколько обязательных зон ответственности, которые надо закрепить за агентами до начала активной реализации.

Agent 1: Contracts / Schemas:

```text
launch close/reopen contracts
metadata source policy contracts
cleanup rule and cleanup candidate schemas
MCP tool/resource schemas
test case fields: AllureID, workflow status, tags, layers, custom fields, members, issues, test keys, relations
```

Agent 3: Backend Core / Domain:

```text
open/closed launch lifecycle
close-launch finalization transaction boundary
test case create/update on launch close
reopen policy
metadata source policy enforcement
cleanup rule domain model
```

Agent 4: Ingestion / Workers:

```text
RabbitMQ-backed job model
provisional processing while launch is open
final processing on launch close
slow cleanup batches
cleanup candidate collection
artifact deletion audit trail
```

Agent 5: Artifact Storage:

```text
S3-compatible artifact storage separate from DB disk
SSD/frequent-access storage class guidance
attachment retention classes
signed/proxied downloads
artifact cleanup integration
```

Agent 8/9/10: Frontend:

```text
launch list statuses, metadata, defects, members, counters
close/reopen actions
sorting/filtering/display options
test case list plus right detail panel with tabs
run history: status, launch, duration, date, executor, parameters
compare results and filters
manual step statuses and attachments
```

Agent 11: CLI / CI Integrations:

```text
upload while launch is open
close launch as explicit CI step
quality gate after close processing
metadata source policy flags where needed
```

Agent 12: Security / Identity:

```text
production DB/storage/queue/Redis are not end-user accessible
MCP tools respect RBAC and masking
API tokens scoped for upload, close, gate, read-only MCP, and admin use
```

Agent 13: QA Automation / Validation:

```text
open-to-close launch E2E
metadata source policy tests
cleanup only closed launches
retention default tests: passed attachments 168h, failed/other attachments 720h, scenarios/fixtures 720h
MCP tool contract tests
```

Agent 14: DevOps / Platform:

```text
PostgreSQL, RabbitMQ, Redis, and S3-compatible storage as external production dependencies
supporting services use managed offerings or their own production Helm charts
Kubernetes baseline for high workload
CSI-backed artifact storage guidance for self-hosted S3/MinIO
private network exposure for DB/storage/queue/Redis
```

## 16. Порядок параллельной работы

Рабочая декомпозиция фаз, потоков, API/UI backlog, ingestion, MCP и Docker/Kubernetes вынесена в `docs/implementation-roadmap.md`. Этот документ остается продуктово-архитектурным источником, а roadmap используется агентами как исполнимый план работ и критерии приемки.

### Phase 0: Foundation

Цель: зафиксировать каркас, чтобы агенты не мешали друг другу.

Параллельно:

```text
Agent 0: architecture docs, ADR, ownership
Agent 1: OpenAPI draft, schemas
Agent 14: repo structure, docker-compose, CI skeleton
Agent 13: testing strategy, fixture corpus plan
```

Exit criteria:

```text
repo structure created
OpenAPI draft exists
DB baseline selected
CI skeleton runs
owned paths documented
```

### Phase 1: Compatibility MVP

Цель: загрузить `allure-results` и увидеть launch/results.

Параллельно:

```text
Agent 2: parser
Agent 3: backend core
Agent 4: ingestion
Agent 5: artifact storage
Agent 8: frontend shell
Agent 9: launch/results UI
Agent 13: compatibility tests
```

Exit criteria:

```text
zip upload works
result JSON parsed
steps displayed
attachments displayed
launch can be closed
basic tests green
```

### Phase 2: History and Test Cases

Цель: платформа начинает отличаться от простого отчета.

Параллельно:

```text
Agent 3: testcase linking
Agent 6: history facts and queries
Agent 10: test case history UI
Agent 7: basic failure signature
Agent 13: multi-launch E2E tests
```

Exit criteria:

```text
same test links across launches
history timeline works
duration trend works
basic failure grouping works
multi-launch E2E green
```

### Phase 3: Analytics and Quality Gates

Цель: добавить ценность для CI/CD и релизов.

Параллельно:

```text
Agent 6: flaky, pass rate, release readiness
Agent 7: defect clustering, mute rules
Agent 10: analytics dashboards
Agent 11: CLI quality gate
Agent 12: RBAC/API tokens
Agent 13: analytics validation
```

Exit criteria:

```text
quality gate can fail CI
flaky dashboard works
release readiness works
mute rules affect metrics
CI token permissions verified
```

### Phase 4: Manual Testing and Enterprise Features

Цель: приблизиться к TestOps-классу продукта.

Параллельно:

```text
Agent 3: manual test domain
Agent 9/10: manual test UI
Agent 12: enterprise auth
Agent 11: CI integrations
Agent 14: production deployment
Agent 13: regression suite
```

Exit criteria:

```text
manual test cases exist
test plans exist
OIDC ready
deployment documented
regression suite stable
```

## 17. Pull request правила

Каждый PR должен содержать:

```text
short description
owned area
contracts changed or not
migrations changed or not
tests added
screenshots for UI changes
compatibility impact
rollback notes
```

Запрещено:

```text
менять чужие owned paths без согласования
ломать OpenAPI без versioning note
удалять raw Allure fields
делать ingestion синхронным на тяжелых операциях
добавлять аналитику без тестов корректности
добавлять UI без loading/error/empty states
```

## 18. Валидация и тесты

### 18.1 Unit tests

Покрывают:

```text
parser
normalizer
identity matching
duration calculation
status aggregation
flaky score
signature hashing
RBAC decisions
query builders
```

### 18.2 Contract tests

Покрывают:

```text
OpenAPI request/response
event schemas
Allure JSON schemas
frontend API expectations
CLI API expectations
```

### 18.3 Integration tests

Покрывают:

```text
PostgreSQL repositories
ClickHouse queries
OpenSearch indexing
S3/MinIO attachments
queue workers
upload archive flow
```

### 18.4 E2E tests

Основные сценарии:

```text
create project
create launch
upload allure-results zip
wait ingestion
open launch page
filter failed results
open result details
view steps and attachments
close launch
open test case history
compare launches
run quality gate
```

### 18.5 Compatibility tests

Corpus должен включать:

```text
pytest
junit5
testng
playwright
cypress
jest
mocha
robot framework
selenide
rest-assured
parameterized tests
retries
nested steps
fixtures
large attachments
missing attachments
malformed files
unknown labels
masked/hidden parameters
```

### 18.6 Performance tests

Сценарии:

```text
10k results in one launch
100k results in one launch
1M historical results
large zip upload
many small attachments
few huge attachments
concurrent CI uploads
dashboard under load
```

Целевые ориентиры для MVP:

```text
10k results upload accepted under 30s
10k results processed under 3m locally
launch table first render under 2s after API response
result details under 500ms p95 from DB/cache
history query under 1s for one test case
```

## 19. Observability

Метрики:

```text
uploads_total
upload_bytes_total
ingestion_jobs_total
ingestion_job_duration_seconds
parser_errors_total
results_processed_total
attachments_processed_total
analytics_events_written_total
quality_gate_runs_total
api_request_duration_seconds
```

Логи должны содержать:

```text
org_id
project_id
launch_id
upload_id
job_id
result_uuid when applicable
trace_id
```

Traces:

```text
upload request
archive unpack
parse files
normalize result
write DB
write analytics
index search
generate previews
```

## 20. Риски

### 20.1 Совместимость с Allure adapters

Риск: разные адаптеры генерируют немного разные поля.

Снижение:

```text
tolerant parser
compatibility corpus
unknown fields preservation
adapter-specific fixtures
golden tests
```

### 20.2 Большие attachments

Риск: память, диск, медленный UI.

Снижение:

```text
streaming upload
object storage
preview limits
signed URLs
retention policies
```

### 20.3 Неверное сопоставление test cases

Риск: история теста будет склеена неправильно.

Снижение:

```text
confidence score
manual merge/split
audit
fallback rules
do not merge aggressively
```

### 20.4 Тяжелая аналитика

Риск: PostgreSQL станет bottleneck.

Снижение:

```text
ClickHouse
materialized views
async projections
precomputed dashboards
query limits
```

### 20.5 UI на больших launches

Риск: браузер зависает.

Снижение:

```text
server-side pagination/filtering
virtualized tables
lazy details loading
debounced search
column pruning
```

## 21. MVP checklist

MVP считается готовым, если:

```text
проект создается
launch создается
allure-results zip загружается
result files парсятся
containers/fixtures парсятся хотя бы базово
attachments сохраняются
launch page показывает результаты
result details показывает trace, steps, params, labels, links
test cases создаются автоматически
history работает минимум по historyId/testCaseId
launch можно закрыть
basic analytics показывает pass/fail/broken/skipped
CLI умеет upload
quality gate умеет проверить new failures
RBAC минимум разделяет viewer/uploader/admin
E2E smoke зеленый
```

## 22. Команды локальной разработки

Желаемый DX:

```bash
make dev
make test
make test-contract
make test-e2e
make lint
make migrate
make seed
make upload-fixture
```

Docker Compose должен поднимать:

```text
postgres
redis
minio
clickhouse
opensearch
api
worker
web
```

## 23. Документация

Минимальный набор:

```text
README.md
docs/implementation-roadmap.md
docs/architecture.md
docs/allure-compatibility.md
docs/api.md
docs/ingestion.md
docs/analytics.md
docs/testing-strategy.md
docs/security.md
docs/operations.md
docs/ci/github-actions.md
docs/ci/gitlab-ci.md
docs/ci/jenkins.md
```

## 24. Итоговая стратегия

Самый короткий путь к сильному продукту:

1. Сначала добиться железной совместимости с Allure result files.
2. Затем сделать удобный launch/result viewer.
3. Потом построить историю test cases.
4. После этого добавить failure intelligence и flaky analytics.
5. Затем закрыть CI/CD через CLI и quality gates.
6. После стабилизации добавить manual testing, test plans и enterprise auth.

Ключевой критерий успеха: существующая команда должна суметь заменить обычный Allure Report upload на наш upload и сразу получить больше ценности без переписывания тестов.
