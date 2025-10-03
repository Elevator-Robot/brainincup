#!/bin/bash

# Script to deploy Amplify sandbox environment with optional external providers
# Usage: ./scripts/sandbox-deploy.sh [--no-external-providers]

set -e

# Default: include external providers
INCLUDE_EXTERNAL_PROVIDERS=true

# Parse command line arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --no-external-providers)
      INCLUDE_EXTERNAL_PROVIDERS=false
      shift
      ;;
    --help)
      echo "Usage: $0 [--no-external-providers]"
      echo ""
      echo "Options:"
      echo "  --no-external-providers    Deploy without Google/Facebook login providers"
      echo "  --help                     Show this help message"
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      echo "Use --help for usage information"
      exit 1
      ;;
  esac
done

# Set environment variable based on flag
if [ "$INCLUDE_EXTERNAL_PROVIDERS" = "false" ]; then
  echo "🚀 Deploying sandbox WITHOUT external providers (Google, Facebook)"
  echo "   This deployment will succeed even if GOOGLE_CLIENT_ID, FACEBOOK_CLIENT_ID secrets are missing"
  export AMPLIFY_EXTERNAL_PROVIDERS=false
else
  echo "🚀 Deploying sandbox WITH external providers (Google, Facebook)"
  echo "   Make sure to configure the required secrets: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, FACEBOOK_CLIENT_ID, FACEBOOK_CLIENT_SECRET"
  export AMPLIFY_EXTERNAL_PROVIDERS=true
fi

echo ""
echo "Starting deployment..."

# Run the amplify sandbox command
npx ampx sandbox "$@"