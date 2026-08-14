# Agent Notes

## Environment

- Workspace root: the repository root returned by `git rev-parse --show-toplevel`.
- Shell: PowerShell on Windows.
- If PowerShell blocks `npm.ps1`, run npm through `cmd /c npm ...` or resolve `npm.cmd` with
  `Get-Command npm.cmd`.
- Resolve Node and GitHub CLI through `Get-Command node` and `Get-Command gh`; do not hardcode
  user-profile installation paths.
- Prefer Playwright's installed Chrome channel when bundled Chromium is unavailable.

## Local Services

- Local web dev server target: `http://127.0.0.1:5173`.
- If port `5173` is free, start web with:

```powershell
cmd /c npm run dev -w @testhistory/web -- --host 127.0.0.1 --port 5173
```

- Remote deployment hosts are environment-specific. Read them from the task context or environment;
  do not store workstation or LAN addresses in the repository.

## API/Auth Checks

- For browser-like read checks against TestHistory API, do not send a user session token as `Authorization: Bearer ...` to launch/project routes; those routes treat bearer tokens as project API tokens and may return `API token is invalid`.
- Use frontend-style headers for read-only checks:

```text
x-testhistory-actor-id: admin
x-testhistory-project-scope: *
x-testhistory-scopes: projects:read,launches:read,results:read,settings:read
```

- Default local test users used in this workspace:
  - `admin` / `admin`
  - `user` / `user`

## GitLab Android Sample

- Sample repository working copy: `.tmp\gitlab-sample-working`.
- Source template in this repo: `samples\android-allure-testhistory`.
- GitLab project id used for the Android sample: `2`.
- Android sample CI intentionally contains failed and broken tests; a manual device job can be `failed` while still successfully uploading evidence.
- Expected healthy evidence summary for the current sample shape:
  - 27 result JSON files
  - screenshots present
  - at least 1 mp4 video
  - logcat files present
  - TestHistory upload completed with 27 imported results

## UI Regression Notes

- Right-side result metadata must render as compact chips/bubbles, not plain row text.
- Empty rail sections should show a muted heading only, without an empty body.
- Avoid reintroducing compact property-row CSS for `.launches-reference-result-rail .launches-reference-value-list`; it caused the "wall of text" rail.
