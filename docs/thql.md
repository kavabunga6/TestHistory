# THQL Search

THQL (TestHistory Query Language) is the search language for flexible filtering across TestHistory data. It is intentionally close to Jira-style filters: a free query string plus saved filters with visibility scopes.

## Saved Filter Scopes

| Scope    | Visibility                               | Typical owner               |
| -------- | ---------------------------------------- | --------------------------- |
| Global   | Available to every user in the workspace | Admin/platform team         |
| Project  | Available only inside the project        | Project owner or maintainer |
| Personal | Available only to the current user       | Current user                |

Every user can additionally hide filters they do not want to see under the search bar. Hiding is personal and does not delete the filter for other users.

Management rules:

- Personal filters can be created and deleted by their owner.
- Project filters can be created and deleted by project owners or users with project settings write access.
- Global filters can be created and deleted only by global admins.
- Built-in filters are not deleted from the UI; users can hide them personally instead.
- UI does not show unavailable visibility scopes, so users do not see actions they cannot perform.

## Syntax

```thql
field = value
field != value
field ~= "contains text"
field in ["a", "b"]
field > 1000
field >= 1000
field < 5000
field <= 5000
not muted = true
(status = "failed" or status = "broken") and tag = "checkout"
```

Rules:

- Strings can use single or double quotes.
- Boolean values are `true` and `false`.
- Lists use square brackets.
- `and`, `or`, `not` are supported.
- Parentheses control priority.
- `~=` means case-insensitive contains.

## Test Result Fields

| Field               | Type         | Example                               |
| ------------------- | ------------ | ------------------------------------- |
| `name`              | string       | `name ~= "заказ"`                     |
| `suite`             | string       | `suite = "web.checkout.PaymentTest"`  |
| `status`            | enum         | `status in ["failed", "broken"]`      |
| `muted`             | boolean      | `muted = false`                       |
| `owner`             | string       | `owner = "Checkout"`                  |
| `severity`          | string       | `severity = "критичная"`              |
| `layer`             | string       | `layer = "E2E"`                       |
| `workflow`          | string       | `workflow = "Automated"`              |
| `caseType`          | string       | `caseType = "automated"`              |
| `allureId`          | string       | `allureId = "1042"`                   |
| `tag` / `tags`      | string list  | `tag = "smoke"`                       |
| `issue` / `defect`  | string list  | `defect = "PAY-337"`                  |
| `link`              | string list  | `link ~= "jira"`                      |
| `testKey`           | string list  | `testKey = "PAY-TC-44"`               |
| `member`            | string list  | `member = "Platform QA"`              |
| `durationMs`        | number       | `durationMs > 1000`                   |
| `cf["Name"]`        | custom field | `cf["Priority"] = "P0"`               |
| `parameter["name"]` | parameter    | `parameter["browser"] = "Chrome 126"` |

## Examples

Failed checkout smoke tests:

```thql
(status = "failed" or status = "broken") and tag = "checkout" and tag = "smoke"
```

Long-running successful tests:

```thql
status = "passed" and durationMs > 3000
```

Non-quarantined critical cases:

```thql
muted = false and severity = "критичная"
```

Specific browser and custom field:

```thql
parameter["browser"] = "Chrome 126" and cf["Priority"] = "P0"
```

Known defect family:

```thql
defect ~= "PAY-" or issue ~= "PAY-"
```

## UI Behavior

- The search bar accepts THQL and regular text. Text without THQL operators is treated as simple full-text search.
- Available filters are shown under the search bar.
- If filters do not fit, the `...` menu shows the rest.
- The `Фильтры` button opens visibility settings and allows saving the current query as a personal, project, or global filter according to the current user's rights.
- Selecting a saved filter replaces the query string with that filter query.
- Selecting a filter from the `...` menu temporarily promotes it to the first visible chip; clearing the query returns it to overflow.

## Backend Contract

The API search surface accepts THQL as a string:

```json
{
  "query": {
    "entity": "results",
    "projectId": "project-1",
    "thql": "status in [\"failed\", \"broken\"] and muted = false",
    "limit": 50
  }
}
```

Runtime validation returns normalized query data, parse errors, available fields, and bounded preview metadata without echoing sensitive data.

Saved filters are managed separately from query execution:

```json
{
  "entity": "testCases",
  "scope": "project",
  "projectId": "ws",
  "name": "Checkout",
  "query": "tag = \"checkout\" or suite ~= \"checkout\"",
  "description": "Project checkout checks"
}
```

Use `GET /api/v1/thql/filters?entity=testCases&projectId=ws` to load visible filters for a
search screen, `POST /api/v1/thql/filters` to save one, and
`DELETE /api/v1/thql/filters/{filterId}` to remove a user-created filter.
