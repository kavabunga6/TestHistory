#!/usr/bin/env sh
set -eu

GRADLE_VERSION="${GRADLE_VERSION:-8.10.2}"
if [ -z "${GRADLE_DOWNLOAD_URL:-}" ] && [ -n "${GITLAB_API_BASE_URL:-}" ] && [ -n "${CI_PROJECT_ID:-}" ]; then
  GRADLE_DOWNLOAD_URL="${GITLAB_API_BASE_URL}/projects/${CI_PROJECT_ID}/packages/generic/gradle-distributions/${GRADLE_VERSION}/gradle-${GRADLE_VERSION}-bin.zip"
else
  GRADLE_DOWNLOAD_URL="${GRADLE_DOWNLOAD_URL:-https://downloads.gradle.org/distributions/gradle-${GRADLE_VERSION}-bin.zip}"
fi
GRADLE_HOME_DIR="${GRADLE_HOME_DIR:-${CI_PROJECT_DIR:-$(pwd)}/.gradle-dist}"
GRADLE_DIST_DIR="${GRADLE_HOME_DIR}/gradle-${GRADLE_VERSION}"
GRADLE_BIN="${GRADLE_DIST_DIR}/bin/gradle"

download_gradle() {
  if [ -n "${GITLAB_DOWNLOAD_TOKEN:-}" ] && echo "$GRADLE_DOWNLOAD_URL" | grep -q "/packages/generic/"; then
    curl --fail --location --connect-timeout 45 --max-time 360 --retry 5 --retry-all-errors --header "PRIVATE-TOKEN: ${GITLAB_DOWNLOAD_TOKEN}" "$GRADLE_DOWNLOAD_URL" --output "${GRADLE_HOME_DIR}/gradle.zip"
  else
    curl --fail --location --connect-timeout 45 --max-time 360 --retry 5 --retry-all-errors "$GRADLE_DOWNLOAD_URL" --output "${GRADLE_HOME_DIR}/gradle.zip"
  fi
}

if [ ! -x "$GRADLE_BIN" ]; then
  mkdir -p "$GRADLE_HOME_DIR"
  rm -f "${GRADLE_HOME_DIR}/gradle.zip"
  download_gradle
  rm -rf "$GRADLE_DIST_DIR"
  unzip -q "${GRADLE_HOME_DIR}/gradle.zip" -d "$GRADLE_HOME_DIR"
fi

exec "$GRADLE_BIN" "$@"
