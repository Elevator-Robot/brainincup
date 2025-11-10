#!/bin/bash

# Diagnostic script to check Lambda layer deployment status

echo "🔍 Checking Lambda Layer Status"
echo "================================"
echo ""

echo "📁 Local Layer Status:"
if [ -d "amplify/functions/brain/layer/python/langchain" ]; then
    LAYER_SIZE=$(du -sh amplify/functions/brain/layer/python/ | cut -f1)
    echo "✅ Layer exists locally: $LAYER_SIZE"
    echo "✅ langchain package: $(ls -d amplify/functions/brain/layer/python/langchain 2>/dev/null && echo 'present' || echo 'missing')"
    echo "✅ langchain.prompts: $(ls amplify/functions/brain/layer/python/langchain/prompts/__init__.py 2>/dev/null && echo 'present' || echo 'missing')"
    echo "✅ Package count: $(ls -d amplify/functions/brain/layer/python/*/ 2>/dev/null | wc -l | tr -d ' ')"
else
    echo "❌ Layer does NOT exist locally"
    echo "   Run: ./build-layer.sh"
fi

echo ""
echo "📦 CDK Asset Cache Status:"
if [ -d ".amplify/artifacts/cdk.out" ]; then
    ASSET_COUNT=$(find .amplify/artifacts/cdk.out/asset.*/python/ -type d -name "langchain" 2>/dev/null | wc -l | tr -d ' ')
    echo "✅ CDK assets exist: $ASSET_COUNT layer(s) with langchain"
    
    echo ""
    echo "Layer asset sizes:"
    for dir in .amplify/artifacts/cdk.out/asset.*/python/; do
        if [ -d "$dir/langchain" ]; then
            SIZE=$(du -sh "$dir" | cut -f1)
            HASH=$(basename $(dirname "$dir"))
            echo "  - $HASH: $SIZE"
        fi
    done
else
    echo "⚠️  No CDK artifacts found"
fi

echo ""
echo "🎯 Current Deployment Configuration:"
if [ -f ".amplify/artifacts/cdk.out/amplifybrainincupaphexlogsandbox31ac49a9f3functionE3A259EC.nested.template.json" ]; then
    DEPLOYED_HASH=$(grep -A10 "BrainDependenciesLayer" .amplify/artifacts/cdk.out/amplifybrainincupaphexlogsandbox31ac49a9f3functionE3A259EC.nested.template.json | grep "S3Key" | cut -d'"' -f4 | cut -d'.' -f1)
    if [ -n "$DEPLOYED_HASH" ]; then
        echo "✅ Configured layer asset: $DEPLOYED_HASH"
        if [ -d ".amplify/artifacts/cdk.out/asset.$DEPLOYED_HASH/python/langchain" ]; then
            SIZE=$(du -sh ".amplify/artifacts/cdk.out/asset.$DEPLOYED_HASH/python/" | cut -f1)
            echo "✅ Layer asset size: $SIZE"
            echo "✅ Layer has langchain: YES"
        else
            echo "❌ Layer asset does NOT have langchain!"
        fi
    fi
else
    echo "⚠️  No deployment configuration found"
fi

echo ""
echo "🔧 Recommendations:"
if [ ! -d "amplify/functions/brain/layer/python/langchain" ]; then
    echo "  1. Run ./build-layer.sh to build the layer"
fi
echo "  2. Run ./force-redeploy.sh to clear cache and rebuild"
echo "  3. Delete and redeploy sandbox: npx ampx sandbox delete && npx ampx sandbox"
echo ""
