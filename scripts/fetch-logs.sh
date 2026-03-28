#!/bin/bash

# Script to tail Lambda logs from the deployed sandbox environment
# Streams logs to stdout in real-time

set -e

# Get the sandbox identifier from the user or environment
SANDBOX_ID="${USER:-default}"

# Common log group patterns for Amplify Gen 2 sandbox
LOG_GROUP_PATTERNS=(
  "/aws/lambda/amplify-brainincup-${SANDBOX_ID}-sandbox-*"
  "/aws/lambda/*brainincup*${SANDBOX_ID}*"
  "/aws/lambda/*brainincup*sandbox*"
)

# Check if we have AWS credentials configured
if ! aws sts get-caller-identity &>/dev/null; then
  echo "❌ ERROR: AWS credentials not configured. Run 'aws configure' first." >&2
  exit 1
fi

# Try to find sandbox log groups automatically
echo "🔍 Searching for sandbox Lambda log groups..." >&2

# Find sandbox log groups
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

# Remove duplicates and filter for sandbox
UNIQUE_GROUPS=($(printf '%s\n' "${FOUND_GROUPS[@]}" | grep -i "sandbox\|${SANDBOX_ID}" | sort -u))

if [ ${#UNIQUE_GROUPS[@]} -eq 0 ]; then
  echo "❌ No sandbox log groups found for user '$SANDBOX_ID'" >&2
  echo "Tried patterns:" >&2
  for pattern in "${LOG_GROUP_PATTERNS[@]}"; do
    echo "  - $pattern" >&2
  done
  echo "" >&2
  echo "Available log groups:" >&2
  aws logs describe-log-groups --query 'logGroups[*].logGroupName' --output text 2>/dev/null | tr '\t' '\n' >&2 || echo "  (none or error)" >&2
  exit 1
fi

echo "✅ Found ${#UNIQUE_GROUPS[@]} sandbox log group(s)" >&2

# Find the log group with most recent activity
echo "🔍 Finding most recently active log group..." >&2
ACTIVE_GROUP=""
LATEST_TIME=0

for group in "${UNIQUE_GROUPS[@]}"; do
  # Get the last event timestamp for this log group
  last_event=$(aws logs describe-log-groups --log-group-name-pattern "$group" --query 'logGroups[0].storedBytes' --output text 2>/dev/null)
  
  if [ -n "$last_event" ] && [ "$last_event" != "None" ] && [ "$last_event" -gt 0 ]; then
    # Check for recent events (last 10 minutes)
    recent_count=$(aws logs filter-log-events --log-group-name "$group" --start-time $(( $(date +%s) * 1000 - 600000 )) --max-items 1 --query 'events | length(@)' --output text 2>/dev/null || echo "0")
    
    if [ "$recent_count" -gt 0 ]; then
      ACTIVE_GROUP="$group"
      echo "   ✓ Found recent activity in: $group" >&2
      break
    fi
  fi
done

# If no recent activity found, use the first group
if [ -z "$ACTIVE_GROUP" ]; then
  ACTIVE_GROUP="${UNIQUE_GROUPS[0]}"
  echo "   ⚠️  No recent activity detected, using first group: $ACTIVE_GROUP" >&2
fi

LOG_GROUP="$ACTIVE_GROUP"

echo "📡 Streaming live logs from: $LOG_GROUP" >&2
echo "   (Press Ctrl+C to stop)" >&2
echo "================================================" >&2
echo "" >&2

# Tail logs in follow mode to stdout
aws logs tail "$LOG_GROUP" --follow --format short
