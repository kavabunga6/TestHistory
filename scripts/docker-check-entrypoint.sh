#!/usr/bin/env bash
set -euo pipefail

cd /workspace

if [[ ! -d node_modules || package-lock.json -nt node_modules/.package-lock.json ]]; then
  npm ci
fi

exec "$@"
