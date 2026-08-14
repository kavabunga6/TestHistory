#!/usr/bin/env sh
set -u

publish_ci_evidence_archive() {
  if [ -z "${GITLAB_API_BASE_URL:-}" ] || [ -z "${GITLAB_DOWNLOAD_TOKEN:-}" ] || [ -z "${CI_PROJECT_ID:-}" ] || [ -z "${CI_JOB_ID:-}" ]; then
    echo "Evidence package upload skipped: GitLab package registry variables are not available"
    return 0
  fi

  if [ ! -d allure-results ] || ! find allure-results -mindepth 1 -print -quit | grep -q .; then
    echo "Evidence package upload skipped: allure-results is empty"
    return 0
  fi

  evidence_paths="allure-results"
  for path in android-instrumentation.log app/build/reports/androidTests app/build/outputs/androidTest-results; do
    if [ -e "$path" ]; then
      evidence_paths="$evidence_paths $path"
    fi
  done

  archive_name="testhistory-evidence.tar.gz"
  tar -czf "$archive_name" $evidence_paths

  package_url="${GITLAB_API_BASE_URL}/projects/${CI_PROJECT_ID}/packages/generic/android-allure-results/${CI_JOB_ID}/${archive_name}"
  curl --fail --location --request PUT --header "PRIVATE-TOKEN: ${GITLAB_DOWNLOAD_TOKEN}" --upload-file "$archive_name" "$package_url"
  echo "Evidence package uploaded: ${package_url}"
}

test_status=0
sh scripts/ci-run-android.sh || test_status=$?

mkdir -p allure-results
timeout 30s adb pull /sdcard/Android/data/com.testhistory.sample/files/allure-results . || true
timeout 30s adb pull /sdcard/Download/testhistory-full-run.mp4 allure-results/full-run-video.mp4 || true
timeout 10s adb emu kill || true
if [ -f allure-results/full-run-video.mp4 ]; then
  if command -v node >/dev/null 2>&1; then
    node scripts/attach-run-video.mjs allure-results full-run-video.mp4 || test_status=$?
  else
    sh scripts/ci-node.sh scripts/attach-run-video.mjs allure-results full-run-video.mp4 || test_status=$?
  fi
fi
if [ -d allure-results ] && find allure-results -name '*-result.json' -print -quit | grep -q .; then
  result_count="$(find allure-results -name '*-result.json' | wc -l | tr -d ' ')"
  screenshot_count="$(find allure-results -name '*.png' | wc -l | tr -d ' ')"
  video_count="$(find allure-results -name '*.mp4' | wc -l | tr -d ' ')"
  log_count="$(find allure-results -name '*.log' | wc -l | tr -d ' ')"
  echo "Evidence summary: results=${result_count}, screenshots=${screenshot_count}, videos=${video_count}, logs=${log_count}"
  if [ "$video_count" -lt 1 ]; then
    echo "Android evidence contract failed: no video/mp4 files were collected."
    test_status=1
  fi
fi
publish_status=0
publish_ci_evidence_archive || publish_status=$?

if [ ! -d allure-results ] || ! find allure-results -name '*-result.json' -print -quit | grep -q .; then
  echo "TestHistory upload skipped: no Allure result files found"
else
  has_token_auth=false
  if [ -n "${TESTHISTORY_TOKEN:-}" ]; then
    has_token_auth=true
  fi

  has_password_auth=false
  if [ -n "${TESTHISTORY_USERNAME:-}" ] && [ -n "${TESTHISTORY_PASSWORD:-}" ]; then
    has_password_auth=true
  fi

  if [ -n "${TESTHISTORY_BASE_URL:-}" ] && [ -n "${TESTHISTORY_PROJECT_ID:-}" ] && { [ "$has_token_auth" = "true" ] || [ "$has_password_auth" = "true" ]; }; then
    if command -v node >/dev/null 2>&1; then
      node scripts/upload-to-testhistory.mjs || test_status=$?
    else
      sh scripts/ci-node.sh scripts/upload-to-testhistory.mjs || test_status=$?
    fi
  else
    echo "TestHistory upload skipped: TESTHISTORY_BASE_URL, TESTHISTORY_PROJECT_ID, and TESTHISTORY_TOKEN or TESTHISTORY_USERNAME/TESTHISTORY_PASSWORD are required"
  fi
fi

exit "$test_status"
