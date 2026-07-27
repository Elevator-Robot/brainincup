#!/bin/bash
set -e

# AgentCore Environment Setup Script
# Automatically retrieves and sets required environment variables.
# In direct code mode, the Lambda calls Bedrock directly and does not
# require any AgentCore runtime ARN or container URI.
# These variables configure observability and tracing only.

AWS_REGION="${AWS_REGION:-us-east-1}"
AWS_PROFILE="${AWS_PROFILE:-brain}"

echo "🔧 Environment Setup (Direct Bedrock Mode)"
echo "=========================================="
echo ""
echo "📍 Region: $AWS_REGION"
echo ""
echo "ℹ️  This project is configured for direct Bedrock invocation."
echo "   No AgentCore runtime ARN or container URI is needed."
echo "   See agent-runtime/README.md to switch back to container mode."
echo ""

export AGENTCORE_TRACE_ENABLED="${AGENTCORE_TRACE_ENABLED:-true}"
export AGENTCORE_TRACE_SAMPLE_RATE="${AGENTCORE_TRACE_SAMPLE_RATE:-1.0}"

echo "export AGENTCORE_TRACE_ENABLED='${AGENTCORE_TRACE_ENABLED}'"
echo "export AGENTCORE_TRACE_SAMPLE_RATE='${AGENTCORE_TRACE_SAMPLE_RATE}'"
echo ""

echo "✅ Variables exported"
echo ""
