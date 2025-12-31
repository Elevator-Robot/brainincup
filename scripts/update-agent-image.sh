#!/bin/bash
set -e

# AgentCore Runtime Image Build & Push Script
# This script rebuilds and pushes the Brain Agent container to ECR

# Configuration
AWS_REGION="${AWS_REGION:-us-east-1}"
ACCOUNT_ID="${ACCOUNT_ID:-431515038332}"
REPO="${REPO:-brain-agent}"
IMAGE_TAG="${IMAGE_TAG:-latest}"

echo "🔧 AgentCore Runtime Image Update"
echo "=================================="
echo "Region: $AWS_REGION"
echo "Account: $ACCOUNT_ID"
echo "Repository: $REPO"
echo "Tag: $IMAGE_TAG"
echo ""

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
  echo "❌ Error: Docker is not running. Please start Docker and try again."
  exit 1
fi

# Navigate to project root
cd "$(dirname "$0")/.."

# Login to ECR
echo "🔐 Logging in to ECR..."
aws ecr get-login-password --region "$AWS_REGION" \
  | docker login --username AWS --password-stdin "$ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com"

if [ $? -ne 0 ]; then
  echo "❌ Error: ECR login failed"
  exit 1
fi

# Build the image
echo ""
echo "🏗️  Building Docker image..."
docker build -t "$REPO:$IMAGE_TAG" ./agent-runtime

if [ $? -ne 0 ]; then
  echo "❌ Error: Docker build failed"
  exit 1
fi

# Tag for ECR
echo ""
echo "🏷️  Tagging image for ECR..."
docker tag "$REPO:$IMAGE_TAG" "$ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$REPO:$IMAGE_TAG"

# Push to ECR
echo ""
echo "📤 Pushing image to ECR..."
docker push "$ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$REPO:$IMAGE_TAG"

if [ $? -ne 0 ]; then
  echo "❌ Error: Docker push failed"
  exit 1
fi

# Display the URI
echo ""
echo "✅ Image successfully pushed!"
echo ""
echo "📋 Container URI:"
echo "   $ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$REPO:$IMAGE_TAG"
echo ""
echo "To update the deployed runtime, run:"
echo "   export AGENTCORE_CONTAINER_URI=$ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$REPO:$IMAGE_TAG"
echo "   npm run sandbox"
echo ""
echo "Or update via AWS Console:"
echo "   Bedrock → AgentCore → Runtimes → Update container"
echo ""
