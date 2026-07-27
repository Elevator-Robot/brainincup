#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

cd "${PROJECT_ROOT}"

export AWS_PROFILE="${AWS_PROFILE:-brain}"
export AWS_PAGER="${AWS_PAGER:-}"

echo "🗑️  Deleting Amplify sandbox..."
NODE_OPTIONS=--no-experimental-webstorage npx ampx sandbox delete --yes "$@"
