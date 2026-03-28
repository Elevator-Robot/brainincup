#!/bin/bash

# Script to fetch all Lambda logs from the current deployment
# Overwrites the log file on each run

set -e

# Configuration
LOG_FILE="lambda-logs.txt"
SINCE_TIME="${1:-30m}"  # Default to last 30 minutes, can be overridden

# Get the sandbox identifier from the user or environment
SANDBOX_ID="${USER:-default}"

# Determine log group pattern based on branch
BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")
BRANCH_SAFE=$(echo "$BRANCH" | sed 's/[^a-zA-Z0-9]//g')

# Common log group patterns for Amplify Gen 2
LOG_GROUP_PATTERNS=(
  "/aws/lambda/amplify-brainincup-${BRANCH_SAFE}-brainlambda"
  "/aws/lambda/amplify-brainincup-${SANDBOX_ID}-sandbox-*"
  "/aws/lambda/*brainincup*brain*"
)

echo "================================================" > "$LOG_FILE"
echo "Lambda Logs - $(date)" >> "$LOG_FILE"
echo "Branch: $BRANCH" >> "$LOG_FILE"
echo "Sandbox: $SANDBOX_ID" >> "$LOG_FILE"
echo "Time Range: Last $SINCE_TIME" >> "$LOG_FILE"
echo "================================================" >> "$LOG_FILE"
echo "" >> "$LOG_FILE"

# Function to fetch logs from a log group
fetch_logs() {
  local log_group=$1
  echo "Fetching logs from: $log_group" >> "$LOG_FILE"
  echo "----------------------------------------" >> "$LOG_FILE"
  
  # Use AWS CLI to tail logs
  if aws logs tail "$log_group" --since "$SINCE_TIME" --format short 2>/dev/null >> "$LOG_FILE"; then
    echo "" >> "$LOG_FILE"
    echo "✓ Fetched logs from $log_group" >> "$LOG_FILE"
  else
    echo "✗ No logs or error fetching from $log_group" >> "$LOG_FILE"
  fi
  
  echo "" >> "$LOG_FILE"
  echo "" >> "$LOG_FILE"
}

# Try to find log groups automatically
echo "Searching for Lambda log groups..." >&2

# Check if we have AWS credentials configured
if ! aws sts get-caller-identity &>/dev/null; then
  echo "ERROR: AWS credentials not configured. Run 'aws configure' first." >&2
  echo "" >> "$LOG_FILE"
  echo "ERROR: AWS credentials not configured." >> "$LOG_FILE"
  echo "Run 'aws configure' to set up AWS CLI credentials." >> "$LOG_FILE"
  exit 1
fi

# Find all matching log groups
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
  echo "No Lambda log groups found. Checking for any brainincup-related logs..." >&2
  
  # Broader search
  if groups=$(aws logs describe-log-groups --query 'logGroups[?contains(logGroupName, `brainincup`)].logGroupName' --output text 2>/dev/null); then
    if [ -n "$groups" ]; then
      for group in $groups; do
        UNIQUE_GROUPS+=("$group")
      done
    fi
  fi
fi

if [ ${#UNIQUE_GROUPS[@]} -eq 0 ]; then
  echo "" >> "$LOG_FILE"
  echo "No log groups found for branch '$BRANCH' or sandbox '$SANDBOX_ID'" >> "$LOG_FILE"
  echo "Tried patterns:" >> "$LOG_FILE"
  for pattern in "${LOG_GROUP_PATTERNS[@]}"; do
    echo "  - $pattern" >> "$LOG_FILE"
  done
  echo "" >> "$LOG_FILE"
  echo "Available log groups:" >> "$LOG_FILE"
  aws logs describe-log-groups --query 'logGroups[*].logGroupName' --output text 2>/dev/null | tr '\t' '\n' >> "$LOG_FILE" || echo "  (none or error)" >> "$LOG_FILE"
  
  echo "No log groups found. Check $LOG_FILE for details." >&2
  exit 1
fi

echo "Found ${#UNIQUE_GROUPS[@]} log group(s):" >&2
for group in "${UNIQUE_GROUPS[@]}"; do
  echo "  - $group" >&2
done
echo "" >&2

# Fetch logs from each group
for group in "${UNIQUE_GROUPS[@]}"; do
  fetch_logs "$group"
done

echo "================================================" >> "$LOG_FILE"
echo "Log fetch completed at $(date)" >> "$LOG_FILE"
echo "================================================" >> "$LOG_FILE"

echo "✓ Logs written to: $LOG_FILE" >&2
echo "  Total log groups: ${#UNIQUE_GROUPS[@]}" >&2
echo "  Time range: Last $SINCE_TIME" >&2
