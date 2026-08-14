# Android Allure TestHistory sample

Sample Android instrumentation project that produces Allure-compatible result files with:

- 25 JUnit4 UI tests.
- Structured steps.
- Final screenshot for each test.
- Failure screenshot when a test fails.
- Screen recording per test.
- Logcat attachment per test.
- GitLab CI artifacts.
- Upload of all Allure JSON results into one TestHistory launch.

## Requirements

- Android SDK 35.
- JDK 17.
- Gradle 8.10+ locally, or `scripts/ci-gradle.sh` in CI.
- Connected Android device or emulator.

## Run locally

```bash
cd samples/android-allure-testhistory
gradle :app:connectedDebugAndroidTest
adb pull /sdcard/Android/data/com.testhistory.sample/files/allure-results ./allure-results
node scripts/upload-to-testhistory.mjs
```

The uploader expects:

```bash
export TESTHISTORY_BASE_URL=http://127.0.0.1:18080
export TESTHISTORY_TOKEN=<session-or-project-token>
export TESTHISTORY_PROJECT_ID=<project-id>
export TESTHISTORY_LAUNCH_NAME="Android sample ${CI_COMMIT_SHORT_SHA:-local}"
```

`TESTHISTORY_TOKEN` can be replaced with `TESTHISTORY_USERNAME` and
`TESTHISTORY_PASSWORD`. In GitLab CI, `TESTHISTORY_BASE_URL` must be reachable
from inside the runner container, not only from the browser on the host machine.

Optional:

```bash
export TESTHISTORY_BRANCH=main
export TESTHISTORY_COMMIT_SHA=$(git rev-parse HEAD)
export TESTHISTORY_BUILD_NUMBER=local-1
export ALLURE_RESULTS_DIR=allure-results
export TESTHISTORY_CLOSE_LAUNCH=true
export TESTHISTORY_UPLOAD_CHUNK_BYTES=4194304
```

## Allure labels used by TestHistory

The sample writes labels that can be mapped in TestHistory settings:

- `JIRA_ISSUE = ANDROID-123`
- `feature = login`
- `feature = checkout`
- `owner = Mobile QA`
- `tag = smoke`
- `tag = regression`

Each result references attachments by file name:

- `*-final.png`
- `*-failure.png`
- `*-logcat.log`
- `*-video.mp4`

## GitLab CI

`.gitlab-ci.yml` has two jobs:

- `validate_android_sample` runs on every commit and performs a fast smoke check of the sample project, evidence rule, upload script, and documentation. It does not require KVM, ADB, Gradle download, or a connected device.
- `android_device_test_upload` is manual. It starts an emulator, runs the tests, pulls `allure-results`, and uploads the full directory into a single TestHistory launch through chunked upload. JSON results, screenshots, videos, and logcat files are uploaded together. Run it on a runner with working Android emulator support or a connected device.

The default CI image is `ghcr.io/cirruslabs/android-sdk:35`. The manual device job uses guarded ADB timeouts because software emulation without KVM is too slow for reliable automatic CI on the current runner.

Required CI variables:

- `TESTHISTORY_BASE_URL` - API URL reachable from the runner, for example
  `http://testhistory.internal.example:18080`.
- `TESTHISTORY_PROJECT_ID`
- `TESTHISTORY_TOKEN` or `TESTHISTORY_USERNAME` and `TESTHISTORY_PASSWORD`

The device job caches downloaded Gradle, Node, Gradle dependencies, and AVD
metadata between runs. If the runner cannot reach `TESTHISTORY_BASE_URL`, the
upload step fails before creating a launch and prints the unreachable URL.

## GitLab project

The sample is intended to live as a standalone GitLab repository. The GitLab MCP server can inspect
issues, merge requests, pipelines, and search results; repository creation and file publishing are
done through GitLab REST or normal `git push` with a token that has `api` and `write_repository`.
