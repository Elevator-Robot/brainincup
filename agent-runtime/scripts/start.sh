#!/bin/bash
# Optional bootstrap script for AgentCore runtime container
# Add any initialization logic here if needed

set -e

echo "Starting Brain Agent runtime..."
exec python -m app.main
