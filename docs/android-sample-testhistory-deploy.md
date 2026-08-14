# Android sample to TestHistory deployment

## TestHistory on a remote development host

Deploy the current workspace over SSH:

```powershell
.\scripts\deploy-remote-testhistory.ps1 -HostName testhistory.internal.example -User <ssh-user>
```

The script uploads the workspace to `/opt/testhistory`, writes a deployment `.env`, runs Docker
Compose, and exposes:

- API: `http://testhistory.internal.example:18080`
- Web: `http://testhistory.internal.example:5173`

The API bind is `0.0.0.0`, so GitLab runner containers can reach it through the host IP.

## GitLab sample project variables

Set these variables in the Android sample GitLab project:

- `TESTHISTORY_BASE_URL=http://testhistory.internal.example:18080`
- `TESTHISTORY_PROJECT_ID=<TestHistory project id>`
- `TESTHISTORY_TOKEN=<project or personal token with upload rights>`
- `GITLAB_DOWNLOAD_TOKEN=<GitLab token allowed to read the repository archive>`

Optional:

- `TESTHISTORY_LAUNCH_NAME=GitLab Android job $CI_JOB_ID`
- `TESTHISTORY_CLOSE_LAUNCH=true`
- `TESTHISTORY_UPLOAD_CHUNK_BYTES=4194304`

## CI behavior

`android_device_test_upload` starts an accelerated emulator, runs 25 instrumentation tests, pulls
`allure-results`, uploads JSON, screenshots, videos, and logcat files through TestHistory chunked
upload, processes the upload job, and closes the launch.
