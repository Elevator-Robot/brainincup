#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

cd "${PROJECT_ROOT}"

export AWS_PROFILE="${AWS_PROFILE:-brain}"
export AWS_PAGER=""
export AWS_REGION="${AWS_REGION:-us-east-1}"

echo "🚀 Brain in Cup Deployment"
echo "=========================="
echo ""

# Get AWS account info
echo "📋 AWS Identity:"
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text 2>/dev/null || echo "")
if [ -z "$ACCOUNT_ID" ]; then
  echo "❌ Error: Could not determine AWS account ID"
  echo "   Make sure AWS credentials are configured"
  exit 1
fi

AWS_USER=$(aws sts get-caller-identity --query Arn --output text 2>/dev/null | sed 's/.*\///' || echo "unknown")
echo "   Account: $ACCOUNT_ID"
echo "   User: $AWS_USER"
echo "   Region: $AWS_REGION"
echo ""

# Build Lambda layer
echo "🔨 Building Lambda layer..."
"${SCRIPT_DIR}/build-lambda-layer.sh"
echo ""

# Setup AgentCore environment automatically
REPO="${REPO:-brain-agent}"
IMAGE_TAG="${IMAGE_TAG:-latest}"

# Check if ECR image exists — use `npm run deploy:all` to also rebuild the runtime image
echo "🔍 Checking for AgentCore container image..."
CONTAINER_URI="$ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$REPO:$IMAGE_TAG"

if ! aws ecr describe-images --region "$AWS_REGION" --repository-name "$REPO" --image-ids imageTag="$IMAGE_TAG" >/dev/null 2>&1; then
  echo "📦 Container image not found, building and pushing..."
  "${SCRIPT_DIR}/update-agent-image.sh"
else
  echo "✅ Container image found: $CONTAINER_URI"
fi
echo ""

# Set AgentCore environment variables
export AGENTCORE_CONTAINER_URI="$CONTAINER_URI"
export AGENTCORE_NETWORK_MODE="PUBLIC"

echo "🌐 AgentCore Configuration:"
echo "   Container: $AGENTCORE_CONTAINER_URI"
echo "   Network: $AGENTCORE_NETWORK_MODE"
echo ""

# Deploy
echo "🚢 Deploying Amplify sandbox..."
AMPLIFY_EXTERNAL_PROVIDERS=false NODE_OPTIONS=--no-experimental-webstorage npx ampx sandbox --once
