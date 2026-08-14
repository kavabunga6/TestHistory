#!/usr/bin/env sh
set -eu

NODE_VERSION="${NODE_VERSION:-22.11.0}"
if [ -z "${NODE_DOWNLOAD_URL:-}" ] && [ -n "${GITLAB_API_BASE_URL:-}" ] && [ -n "${CI_PROJECT_ID:-}" ]; then
  NODE_DOWNLOAD_URL="${GITLAB_API_BASE_URL}/projects/${CI_PROJECT_ID}/packages/generic/node-distributions/${NODE_VERSION}/node-v${NODE_VERSION}-linux-x64.tar.xz"
else
  NODE_DOWNLOAD_URL="${NODE_DOWNLOAD_URL:-https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-x64.tar.xz}"
fi
NODE_HOME_DIR="${NODE_HOME_DIR:-${CI_PROJECT_DIR:-$(pwd)}/.node-dist}"
NODE_DIST_DIR="${NODE_HOME_DIR}/node-v${NODE_VERSION}-linux-x64"
NODE_BIN="${NODE_DIST_DIR}/bin/node"

if [ ! -x "$NODE_BIN" ]; then
  mkdir -p "$NODE_HOME_DIR"
  if [ -n "${GITLAB_DOWNLOAD_TOKEN:-}" ] && echo "$NODE_DOWNLOAD_URL" | grep -q "/packages/generic/"; then
    curl --fail --location --connect-timeout 20 --max-time 180 --retry 3 --retry-all-errors --header "PRIVATE-TOKEN: ${GITLAB_DOWNLOAD_TOKEN}" "$NODE_DOWNLOAD_URL" --output "${NODE_HOME_DIR}/node.tar.xz"
  else
    curl --fail --location --connect-timeout 20 --max-time 180 --retry 3 --retry-all-errors "$NODE_DOWNLOAD_URL" --output "${NODE_HOME_DIR}/node.tar.xz"
  fi
  rm -rf "$NODE_DIST_DIR"
  tar -xJf "${NODE_HOME_DIR}/node.tar.xz" -C "$NODE_HOME_DIR"
fi

exec "$NODE_BIN" "$@"
