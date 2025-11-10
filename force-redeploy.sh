#!/bin/bash

# Force clean redeployment of Lambda layer
# This script clears CDK asset cache and rebuilds the layer

set -e

echo "🧹 Step 1: Cleaning CDK asset cache..."
rm -rf .amplify/artifacts
rm -rf node_modules/.cache
rm -rf amplify_outputs.json

echo "🗑️  Step 2: Cleaning old layer build..."
rm -rf amplify/functions/brain/layer/python

echo "🔨 Step 3: Rebuilding Lambda layer with Docker..."
./build-layer.sh

echo "📦 Step 4: Verifying layer contents..."
if [ -d "amplify/functions/brain/layer/python/langchain" ]; then
    echo "✅ langchain found in layer"
    if [ -f "amplify/functions/brain/layer/python/langchain/prompts/__init__.py" ]; then
        echo "✅ langchain.prompts module exists"
        LAYER_SIZE=$(du -sh amplify/functions/brain/layer/python/ | cut -f1)
        echo "✅ Layer size: $LAYER_SIZE"
    else
        echo "❌ langchain.prompts module missing"
        exit 1
    fi
else
    echo "❌ langchain NOT found in layer - layer build failed"
    exit 1
fi

echo ""
echo "🚀 Layer is ready for deployment!"
echo ""
echo "📝 Next steps:"
echo "   1. Deploy with: npx ampx sandbox delete && npx ampx sandbox"
echo "      (This will force a complete redeployment)"
echo ""
echo "   OR for existing environment:"
echo "   2. npx ampx sandbox --profile brain"
echo ""
echo "⚠️  IMPORTANT: The sandbox delete will remove existing data!"
echo "   Consider backing up if needed."
