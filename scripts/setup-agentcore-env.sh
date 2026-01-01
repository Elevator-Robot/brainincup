#!/bin/bash
set -e

# AgentCore Environment Setup Script
# Automatically retrieves and sets required environment variables for deployment

echo "🔧 AgentCore Environment Setup"
echo "=============================="
echo ""

# Configuration
AWS_REGION="${AWS_REGION:-us-east-1}"
ACCOUNT_ID="${ACCOUNT_ID:-431515038332}"
REPO="${REPO:-brain-agent}"
STACK_NAME_PATTERN="amplify-brainincup-*-sandbox-*"

echo "📍 Region: $AWS_REGION"
echo "🔢 Account: $ACCOUNT_ID"
echo ""

# Check AWS CLI
if ! command -v aws &> /dev/null; then
  echo "❌ Error: AWS CLI is not installed"
  exit 1
fi

# Get the latest deployed stack name
echo "🔍 Finding Amplify stack..."
STACK_NAME=$(aws cloudformation list-stacks \
  --region "$AWS_REGION" \
  --stack-status-filter CREATE_COMPLETE UPDATE_COMPLETE UPDATE_ROLLBACK_COMPLETE \
  --query "StackSummaries[?starts_with(StackName, 'amplify-brainincup-')].StackName" \
  --output text | head -n 1)

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
  echo "export AGENTCORE_RUNTIME_NAME='BrainInCupRuntime'"
  echo "export AGENTCORE_NETWORK_MODE='PUBLIC'"
  echo ""
  echo "✅ Using container URI to provision new runtime"
fi

echo "export AGENTCORE_TRACE_ENABLED='false'"
echo "export AGENTCORE_TRACE_SAMPLE_RATE='0.0'"
echo ""

# Option to automatically export
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
read -p "Export these variables to current shell? (y/n) " -n 1 -r
echo ""

if [[ $REPLY =~ ^[Yy]$ ]]; then
  if [ -n "$AGENTCORE_RUNTIME_ARN" ]; then
    export AGENTCORE_RUNTIME_ARN="$AGENTCORE_RUNTIME_ARN"
  else
    export AGENTCORE_CONTAINER_URI="$AGENTCORE_CONTAINER_URI"
    export AGENTCORE_RUNTIME_NAME="BrainInCupRuntime"
    export AGENTCORE_NETWORK_MODE="PUBLIC"
  fi
  
  export AGENTCORE_TRACE_ENABLED="false"
  export AGENTCORE_TRACE_SAMPLE_RATE="0.0"
  
  echo "✅ Variables exported to current shell"
  echo ""
  echo "Run: npm run sandbox"
else
  echo ""
  echo "💡 To export manually, copy the commands above and run them"
  echo ""
  echo "Then run: npm run sandbox"
fi

echo ""
