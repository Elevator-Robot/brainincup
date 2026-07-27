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

# Deploy
echo "🚢 Deploying Amplify sandbox..."
AMPLIFY_EXTERNAL_PROVIDERS=false NODE_OPTIONS=--no-experimental-webstorage npx ampx sandbox --once
