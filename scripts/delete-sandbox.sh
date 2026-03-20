#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

cd "${PROJECT_ROOT}"

export AWS_PROFILE="${AWS_PROFILE:-brain}"
export AWS_PAGER="${AWS_PAGER:-}"

# Prefer explicit local config first.
if [ -f "${PROJECT_ROOT}/.env.agentcore" ]; then
  set -a
  # shellcheck disable=SC1091
  source "${PROJECT_ROOT}/.env.agentcore"
  set +a
fi

# Fallback to discovery script when required vars are missing.
if [ -z "${AGENTCORE_RUNTIME_ARN:-}" ] && [ -z "${AGENTCORE_CONTAINER_URI:-}" ]; then
  # shellcheck source=/dev/null
  source "${SCRIPT_DIR}/setup-agentcore-env.sh" <<< "y"
fi

if [ -z "${AGENTCORE_RUNTIME_ARN:-}" ] && [ -z "${AGENTCORE_CONTAINER_URI:-}" ]; then
  echo "❌ Error: AgentCore runtime configuration is missing."
  echo "Set AGENTCORE_RUNTIME_ARN or AGENTCORE_CONTAINER_URI, then rerun."
  exit 1
fi

export AGENTCORE_RUNTIME_ARN="${AGENTCORE_RUNTIME_ARN:-}"
export AGENTCORE_CONTAINER_URI="${AGENTCORE_CONTAINER_URI:-}"
export AGENTCORE_RUNTIME_NAME="${AGENTCORE_RUNTIME_NAME:-}"
export AGENTCORE_NETWORK_MODE="${AGENTCORE_NETWORK_MODE:-}"
export AGENTCORE_TRACE_ENABLED="${AGENTCORE_TRACE_ENABLED:-}"
export AGENTCORE_TRACE_SAMPLE_RATE="${AGENTCORE_TRACE_SAMPLE_RATE:-}"

NODE_OPTIONS=--no-experimental-webstorage npx ampx sandbox delete --yes "$@"
