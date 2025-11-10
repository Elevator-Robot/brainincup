#!/bin/bash
set -e

# Build Lambda layer for Python 3.12 on Linux (Lambda runtime)
# This ensures binary dependencies like pydantic_core are built for the correct platform

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LAYER_DIR="${SCRIPT_DIR}/layer"

echo "🧹 Cleaning existing layer..."
rm -rf "${LAYER_DIR}/python"
mkdir -p "${LAYER_DIR}/python"

# Check if Docker is available and running
if docker info > /dev/null 2>&1; then
  echo "🐳 Building dependencies using Docker for Lambda Python 3.12 runtime..."
  docker run --rm \
    --platform linux/amd64 \
    -v "${LAYER_DIR}:/layer" \
    -w /layer \
    public.ecr.aws/lambda/python:3.12 \
    pip install -r requirements.txt -t python/ --no-cache-dir
else
  echo "⚠️  Docker not available. Using pip with --platform flag..."
  echo "⚠️  Note: This may not work for all binary dependencies."
  echo ""
  
  # Install dependencies for manylinux (Linux) platform
  pip install \
    -r "${LAYER_DIR}/requirements.txt" \
    -t "${LAYER_DIR}/python" \
    --platform manylinux2014_x86_64 \
    --only-binary=:all: \
    --python-version 3.12 \
    --implementation cp \
    --no-cache-dir
fi

echo ""
echo "✅ Layer built successfully!"
echo "📦 Layer size:"
du -sh "${LAYER_DIR}/python"
echo ""
echo "🔍 Checking pydantic_core binary:"
find "${LAYER_DIR}/python" -name "_pydantic_core*.so" -exec file {} \;
