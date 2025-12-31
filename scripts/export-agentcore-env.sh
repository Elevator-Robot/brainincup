#!/bin/bash

# Simple AgentCore Environment Variables Export
# Run with: source scripts/export-agentcore-env.sh

export AGENTCORE_CONTAINER_URI="431515038332.dkr.ecr.us-east-1.amazonaws.com/brain-agent:latest"
export AGENTCORE_RUNTIME_NAME="BrainInCupRuntime"
export AGENTCORE_NETWORK_MODE="PUBLIC"
export AGENTCORE_TRACE_ENABLED="false"
export AGENTCORE_TRACE_SAMPLE_RATE="0.0"

echo "✅ AgentCore environment variables exported"
echo ""
echo "AGENTCORE_CONTAINER_URI=$AGENTCORE_CONTAINER_URI"
echo "AGENTCORE_RUNTIME_NAME=$AGENTCORE_RUNTIME_NAME"
echo "AGENTCORE_NETWORK_MODE=$AGENTCORE_NETWORK_MODE"
echo "AGENTCORE_TRACE_ENABLED=$AGENTCORE_TRACE_ENABLED"
echo "AGENTCORE_TRACE_SAMPLE_RATE=$AGENTCORE_TRACE_SAMPLE_RATE"
echo ""
echo "Now run: npm run sandbox"
