#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

cd "${PROJECT_ROOT}"

export AWS_PROFILE="${AWS_PROFILE:-brain}"
export AWS_PAGER="${AWS_PAGER:-}"

echo "== AWS identity =="
aws sts get-caller-identity --output json

echo "== Build lambda layer =="
"${SCRIPT_DIR}/build-lambda-layer.sh"

echo "== Setup AgentCore env =="
# shellcheck source=/dev/null
source "${SCRIPT_DIR}/setup-agentcore-env.sh" <<< "y"
echo "AGENTCORE_RUNTIME_ARN=${AGENTCORE_RUNTIME_ARN:-}"
echo "AGENTCORE_CONTAINER_URI=${AGENTCORE_CONTAINER_URI:-}"

if [ -z "${AGENTCORE_RUNTIME_ARN:-}" ] && [ -z "${AGENTCORE_CONTAINER_URI:-}" ]; then
  echo "❌ Error: AgentCore runtime configuration is missing."
  exit 1
fi

if [ -z "${AGENTCORE_RUNTIME_ARN:-}" ] && [ -n "${AGENTCORE_CONTAINER_URI:-}" ]; then
  TAG="${AGENTCORE_CONTAINER_URI##*:}"
  REGION="${AWS_REGION:-us-east-1}"
  REPO_NAME="${REPO:-brain-agent}"

  echo "== Verify ECR image tag ${TAG} in ${REPO_NAME} =="
  if ! aws ecr describe-images --region "${REGION}" --repository-name "${REPO_NAME}" --image-ids imageTag="${TAG}" >/dev/null 2>&1; then
    echo "== Image tag missing; building/pushing agent image =="
    "${SCRIPT_DIR}/update-agent-image.sh"
    ACCOUNT_ID_VALUE="${ACCOUNT_ID:-431515038332}"
    IMAGE_TAG_VALUE="${IMAGE_TAG:-latest}"
    export AGENTCORE_CONTAINER_URI="${ACCOUNT_ID_VALUE}.dkr.ecr.${REGION}.amazonaws.com/${REPO_NAME}:${IMAGE_TAG_VALUE}"
    echo "AGENTCORE_CONTAINER_URI reset to ${AGENTCORE_CONTAINER_URI}"
  fi
fi

echo "== Deploy sandbox local =="
AMPLIFY_EXTERNAL_PROVIDERS=false NODE_OPTIONS=--no-experimental-webstorage npx ampx sandbox --once
