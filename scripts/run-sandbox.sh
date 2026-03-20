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

echo "== Setup AgentCore env =="
# shellcheck source=/dev/null
source "${SCRIPT_DIR}/setup-agentcore-env.sh" <<< "y"

if [ -z "${AGENTCORE_RUNTIME_ARN:-}" ] && [ -z "${AGENTCORE_CONTAINER_URI:-}" ]; then
  echo "❌ Error: AgentCore runtime configuration is missing."
  echo "Set AGENTCORE_RUNTIME_ARN or AGENTCORE_CONTAINER_URI, then rerun."
  exit 1
fi

echo "== Run Amplify sandbox =="
NODE_OPTIONS=--no-experimental-webstorage npx ampx sandbox --once
