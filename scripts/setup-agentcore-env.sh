#!/bin/bash
set -e

# AgentCore Environment Setup Script
# Automatically retrieves and sets required environment variables for deployment

# Configuration
AWS_REGION="${AWS_REGION:-us-east-1}"
AWS_PROFILE="${AWS_PROFILE:-brain}"

# Auto-detect AWS account ID
ACCOUNT_ID="${ACCOUNT_ID:-$(aws sts get-caller-identity --query Account --output text 2>/dev/null || echo "")}"
if [ -z "$ACCOUNT_ID" ]; then
  echo "❌ Error: Could not determine AWS account ID"
  echo "   Make sure AWS credentials are configured"
  exit 1
fi

REPO="${REPO:-brain-agent}"
STACK_NAME_PATTERN="amplify-brainincup-*-sandbox-*"
TRACE_ENABLED_VALUE="${AGENTCORE_TRACE_ENABLED:-false}"
TRACE_SAMPLE_RATE_VALUE="${AGENTCORE_TRACE_SAMPLE_RATE:-0.0}"

echo "🔧 AgentCore Environment Setup"
echo "=============================="
echo ""
echo "📍 Region: $AWS_REGION"
echo "🔢 Account: $ACCOUNT_ID"
echo ""

# Check AWS CLI
if ! command -v aws &> /dev/null; then
  echo "❌ Error: AWS CLI is not installed"
  exit 1
fi

# Get the latest deployed root stack name
echo "🔍 Finding Amplify stack..."
STACK_NAME=$(aws cloudformation list-stacks \
  --region "$AWS_REGION" \
  --stack-status-filter CREATE_COMPLETE UPDATE_COMPLETE UPDATE_ROLLBACK_COMPLETE \
  --query "StackSummaries[?starts_with(StackName, 'amplify-brainincup-')].StackName" \
  --output text | tr '\t' '\n' | grep -E '^amplify-brainincup-.*-sandbox-[A-Za-z0-9]+$' | head -n 1 || true)

if [ -z "$STACK_NAME" ]; then
  echo "⚠️  No deployed Amplify stack found"
  echo "   Using container URI method instead..."
  AGENTCORE_RUNTIME_ARN=""
else
  echo "✅ Found stack: $STACK_NAME"
  echo ""
  
  # Try to get AgentCore runtime ARN from stack outputs
  echo "🔍 Looking for AgentCore runtime ARN..."
  AGENTCORE_RUNTIME_ARN=$(aws cloudformation describe-stacks \
    --region "$AWS_REGION" \
    --stack-name "$STACK_NAME" \
    --query "Stacks[0].Outputs[?OutputKey=='AgentCoreRuntimeArn'].OutputValue" \
    --output text 2>/dev/null || echo "")
fi

# Get container URI
echo "🔍 Getting container URI from ECR..."
CONTAINER_URI=$(aws ecr describe-images \
  --region "$AWS_REGION" \
  --repository-name "$REPO" \
  --query "sort_by(imageDetails,& imagePushedAt)[-1].imageTags[0]" \
  --output text 2>/dev/null || echo "")

if [ -n "$CONTAINER_URI" ] && [ "$CONTAINER_URI" != "None" ]; then
  AGENTCORE_CONTAINER_URI="$ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$REPO:$CONTAINER_URI"
else
  AGENTCORE_CONTAINER_URI="$ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$REPO:latest"
fi

# Display configuration
echo ""
echo "📋 Environment Variables"
echo "========================"
echo ""

if [ -n "$AGENTCORE_RUNTIME_ARN" ]; then
  echo "export AGENTCORE_RUNTIME_ARN='$AGENTCORE_RUNTIME_ARN'"
  echo ""
  echo "✅ Using existing runtime ARN from stack"
else
  echo "export AGENTCORE_CONTAINER_URI='$AGENTCORE_CONTAINER_URI'"
  echo "export AGENTCORE_NETWORK_MODE='PUBLIC'"
  echo ""
  echo "✅ Using container URI to provision new runtime"
fi

echo "export AGENTCORE_TRACE_ENABLED='${TRACE_ENABLED_VALUE}'"
echo "export AGENTCORE_TRACE_SAMPLE_RATE='${TRACE_SAMPLE_RATE_VALUE}'"
echo ""

# Auto-export by default (non-interactive mode)
if [ -n "$AGENTCORE_RUNTIME_ARN" ]; then
  export AGENTCORE_RUNTIME_ARN="$AGENTCORE_RUNTIME_ARN"
else
  export AGENTCORE_CONTAINER_URI="$AGENTCORE_CONTAINER_URI"
  export AGENTCORE_NETWORK_MODE="PUBLIC"
fi

export AGENTCORE_TRACE_ENABLED="${TRACE_ENABLED_VALUE}"
export AGENTCORE_TRACE_SAMPLE_RATE="${TRACE_SAMPLE_RATE_VALUE}"

echo "✅ Variables exported"
echo ""
