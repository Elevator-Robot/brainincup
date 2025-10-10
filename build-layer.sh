#!/bin/bash

# Build Lambda layer with dependencies for Python 3.12 runtime
# This ensures native extensions are compiled for Amazon Linux 2 (Lambda runtime)

set -e

LAYER_DIR="amplify/functions/brain/layer"
PYTHON_DIR="$LAYER_DIR/python"

echo "Cleaning existing layer..."
rm -rf "$PYTHON_DIR"
mkdir -p "$PYTHON_DIR"

echo "Installing dependencies using Docker for Lambda runtime..."
docker run --rm \
  --platform linux/amd64 \
  --entrypoint "" \
  -v "$(pwd)/$LAYER_DIR/requirements.txt:/requirements.txt" \
  -v "$(pwd)/$PYTHON_DIR:/python" \
  public.ecr.aws/lambda/python:3.12 \
  pip install -r /requirements.txt -t /python --no-cache-dir

echo "Optimizing layer size..."
echo "Removing boto3 and botocore (already in Lambda runtime)..."
rm -rf "$PYTHON_DIR/boto3" "$PYTHON_DIR/boto3"* "$PYTHON_DIR/botocore" "$PYTHON_DIR/botocore"* 2>/dev/null || true

echo "Removing test files and unnecessary data..."
find "$PYTHON_DIR" -type d -name "tests" -exec rm -rf {} + 2>/dev/null || true
find "$PYTHON_DIR" -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
find "$PYTHON_DIR" -name "*.pyc" -delete 2>/dev/null || true
find "$PYTHON_DIR" -name "*.pyo" -delete 2>/dev/null || true
find "$PYTHON_DIR" -name "*.dist-info" -type d -exec sh -c 'rm -f "$1"/RECORD "$1"/INSTALLER' _ {} \; 2>/dev/null || true

echo "Removing .so.X symlinks and keeping only actual binaries..."
find "$PYTHON_DIR" -type l -name "*.so.*" -delete 2>/dev/null || true

echo "Stripping debug symbols from binaries..."
find "$PYTHON_DIR" -name "*.so" -exec strip {} \; 2>/dev/null || true

FINAL_SIZE=$(du -sh "$PYTHON_DIR" | cut -f1)
echo "Layer built successfully at $PYTHON_DIR"
echo "Final size: $FINAL_SIZE"
