#!/bin/bash

# Script to tail Lambda logs from the deployed sandbox environment
# Streams logs to stdout in real-time

set -e

# Get the sandbox identifier from the user or environment
SANDBOX_ID="${USER:-default}"

# Check if we have AWS credentials configured
if ! aws sts get-caller-identity &>/dev/null; then
  echo "❌ ERROR: AWS credentials not configured. Run 'aws configure' first." >&2
  exit 1
fi

# Get the Lambda function name from amplify_outputs.json
LAMBDA_URL=$(cat amplify_outputs.json 2>/dev/null | jq -r '.custom.brainApiUrl // empty')

if [ -z "$LAMBDA_URL" ]; then
  echo "❌ ERROR: No Lambda URL found in amplify_outputs.json" >&2
  echo "   Make sure you've deployed with 'npm run deploy'" >&2
  exit 1
fi

# Extract Lambda URL ID to help identify the right log group
LAMBDA_URL_ID=$(echo "$LAMBDA_URL" | grep -o "https://[^/]*" | sed 's/https:\/\///' | cut -d'.' -f1)
echo "🔍 Looking for Lambda function with URL ID: $LAMBDA_URL_ID" >&2

# Common log group patterns for Amplify Gen 2 sandbox
LOG_GROUP_PATTERNS=(
  "/aws/lambda/amplify-brainincup-${SANDBOX_ID}-*BrainFunction*"
  "/aws/lambda/amplify-brainincup-*BrainFunction*"
)

# Find sandbox log groups
echo "🔍 Searching for sandbox Lambda log groups..." >&2
FOUND_GROUPS=()
for pattern in "${LOG_GROUP_PATTERNS[@]}"; do
  # Extract prefix for describe-log-groups
  prefix=$(echo "$pattern" | sed 's/\*.*$//')
  
  if groups=$(aws logs describe-log-groups --log-group-name-prefix "$prefix" --query 'logGroups[*].logGroupName' --output text 2>/dev/null); then
    if [ -n "$groups" ]; then
      for group in $groups; do
        FOUND_GROUPS+=("$group")
      done
    fi
  fi
done

# Remove duplicates
UNIQUE_GROUPS=($(printf '%s\n' "${FOUND_GROUPS[@]}" | sort -u))

if [ ${#UNIQUE_GROUPS[@]} -eq 0 ]; then
  echo "❌ No Lambda log groups found" >&2
  exit 1
fi

echo "✅ Found ${#UNIQUE_GROUPS[@]} log group(s)" >&2

# Find the log group with most recent activity
echo "🔍 Finding most recently active log group..." >&2
ACTIVE_GROUP=""

for group in "${UNIQUE_GROUPS[@]}"; do
  # Check for recent events (last 5 minutes)
  if aws logs filter-log-events \
    --log-group-name "$group" \
    --start-time $(($(date +%s) * 1000 - 300000)) \
    --max-items 1 \
    --query 'events[0]' \
    --output text 2>/dev/null | grep -q "START\|END\|RequestId"; then
    ACTIVE_GROUP="$group"
    echo "   ✓ Found recent activity in: $group" >&2
    break
  fi
done

# If no recent activity, use the lexicographically last one (newest deployments have later suffixes)
if [ -z "$ACTIVE_GROUP" ]; then
  ACTIVE_GROUP=$(printf '%s\n' "${UNIQUE_GROUPS[@]}" | sort | tail -1)
  echo "   ⚠️  No recent activity detected, using latest group: $ACTIVE_GROUP" >&2
fi

LOG_GROUP="$ACTIVE_GROUP"

echo "📡 Streaming live logs from: $LOG_GROUP" >&2
echo "   (Press Ctrl+C to stop)" >&2
echo "================================================" >&2
echo "" >&2

# Tail logs in follow mode to stdout
aws logs tail "$LOG_GROUP" --follow --format short
