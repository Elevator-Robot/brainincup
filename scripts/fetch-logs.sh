#!/bin/bash

# Script to tail Lambda logs from the deployed sandbox environment
# Continuously streams logs and overwrites the log file

set -e

# Configuration
LOG_FILE="lambda-logs.txt"
FOLLOW="${1:-false}"  # Pass 'follow' to stream live logs

# Get the sandbox identifier from the user or environment
SANDBOX_ID="${USER:-default}"

# Common log group patterns for Amplify Gen 2 sandbox
LOG_GROUP_PATTERNS=(
  "/aws/lambda/amplify-brainincup-${SANDBOX_ID}-sandbox-*"
  "/aws/lambda/*brainincup*${SANDBOX_ID}*"
  "/aws/lambda/*brainincup*sandbox*"
)

echo "================================================" > "$LOG_FILE"
echo "Lambda Sandbox Logs - $(date)" >> "$LOG_FILE"
echo "Sandbox: $SANDBOX_ID" >> "$LOG_FILE"
echo "Mode: Tailing deployed sandbox environment" >> "$LOG_FILE"
echo "================================================" >> "$LOG_FILE"
echo "" >> "$LOG_FILE"

# Function to tail logs from a log group (write to file continuously)
tail_logs_to_file() {
  local log_group=$1
  echo "Tailing logs from: $log_group" >> "$LOG_FILE"
  echo "----------------------------------------" >> "$LOG_FILE"
  echo "" >> "$LOG_FILE"
  
  # Tail logs and append to file, overwriting on each new batch
  aws logs tail "$log_group" --follow --format short 2>&1 | while IFS= read -r line; do
    echo "$line" >> "$LOG_FILE"
  done
}

# Function to tail logs from a log group (print to stdout)
tail_logs_to_stdout() {
  local log_group=$1
  echo "📡 Tailing logs from: $log_group"
  echo "----------------------------------------"
  
  # Tail logs in follow mode
  aws logs tail "$log_group" --follow --format short 2>&1
}

# Try to find sandbox log groups automatically
echo "🔍 Searching for sandbox Lambda log groups..." >&2

# Check if we have AWS credentials configured
if ! aws sts get-caller-identity &>/dev/null; then
  echo "❌ ERROR: AWS credentials not configured. Run 'aws configure' first." >&2
  echo "" >> "$LOG_FILE"
  echo "ERROR: AWS credentials not configured." >> "$LOG_FILE"
  echo "Run 'aws configure' to set up AWS CLI credentials." >> "$LOG_FILE"
  exit 1
fi

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
  echo "" >> "$LOG_FILE"
  echo "No sandbox log groups found for user '$SANDBOX_ID'" >> "$LOG_FILE"
  echo "Tried patterns:" >> "$LOG_FILE"
  for pattern in "${LOG_GROUP_PATTERNS[@]}"; do
    echo "  - $pattern" >> "$LOG_FILE"
  done
  echo "" >> "$LOG_FILE"
  echo "Available log groups:" >> "$LOG_FILE"
  aws logs describe-log-groups --query 'logGroups[*].logGroupName' --output text 2>/dev/null | tr '\t' '\n' >> "$LOG_FILE" || echo "  (none or error)" >> "$LOG_FILE"
  
  echo "Check $LOG_FILE for details." >&2
  exit 1
fi

echo "✅ Found ${#UNIQUE_GROUPS[@]} sandbox log group(s):" >&2
for group in "${UNIQUE_GROUPS[@]}"; do
  echo "   📋 $group" >&2
done
echo "" >&2

# Use the first log group (typically there's only one brain function)
LOG_GROUP="${UNIQUE_GROUPS[0]}"

if [ "${FOLLOW}" == "follow" ]; then
  echo "📡 Streaming live logs from: $LOG_GROUP" >&2
  echo "   (Press Ctrl+C to stop)" >&2
  echo "" >&2
  tail_logs_to_stdout "$LOG_GROUP"
else
  echo "📝 Tailing logs to file: $LOG_FILE" >&2
  echo "   Log group: $LOG_GROUP" >&2
  echo "   (This will run continuously. Press Ctrl+C to stop)" >&2
  echo "" >&2
  tail_logs_to_file "$LOG_GROUP"
fi
