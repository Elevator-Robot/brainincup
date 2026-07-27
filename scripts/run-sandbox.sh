#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

cd "${PROJECT_ROOT}"

export AWS_PROFILE="${AWS_PROFILE:-brain}"
export AWS_PAGER="${AWS_PAGER:-}"

EXISTING_SANDBOX_PIDS="$(ps -Ao pid,command | grep -E 'npx ampx sandbox|ampx sandbox --once' | grep -v grep | awk '{print $1}' | tr '\n' ' ' || true)"
if [ -n "${EXISTING_SANDBOX_PIDS// }" ]; then
  echo "❌ Multiple sandbox instances detected."
  echo "Existing sandbox PID(s): ${EXISTING_SANDBOX_PIDS}"
  echo "Please stop the other sandbox process(es) and run this command again."
  exit 1
fi

echo "🚀 Running Amplify sandbox (direct Bedrock mode)..."
NODE_OPTIONS=--no-experimental-webstorage npx ampx sandbox --once
