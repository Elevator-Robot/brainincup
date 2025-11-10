#!/bin/bash

# Complete fix for Lambda layer deployment issue
# This ensures the layer with langchain is properly deployed

set -e

echo "🔧 Brain In Cup - Lambda Layer Fix"
echo "==================================="
echo ""

# Check if we're using the brain profile
if ! aws configure list --profile brain &>/dev/null; then
    echo "⚠️  Warning: 'brain' AWS profile not configured"
    echo "   Make sure AWS_PROFILE=brain is set or use --profile brain"
fi

echo "Step 1: Running diagnostics..."
./check-layer.sh

echo ""
echo "Step 2: Cleaning and rebuilding..."
./force-redeploy.sh

echo ""
echo "Step 3: Redeploying to AWS..."
echo ""
read -p "❓ Do you want to delete and recreate the sandbox? (recommended) [y/N]: " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "🗑️  Deleting existing sandbox..."
    AWS_PROFILE=brain npx ampx sandbox delete || echo "⚠️  Sandbox may not exist, continuing..."
    
    echo ""
    echo "🚀 Creating new sandbox..."
    AWS_PROFILE=brain npx ampx sandbox
else
    echo "🔄 Updating existing sandbox..."
    AWS_PROFILE=brain npx ampx sandbox
fi

echo ""
echo "✅ Deployment complete!"
echo ""
echo "🧪 Test your Lambda function to verify langchain.prompts is now available."
