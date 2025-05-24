#!/bin/bash
# This script prepares the Lambda layer by installing Python dependencies

# Create python directory if it doesn't exist
mkdir -p python

# Install dependencies into the python directory
pip install -r requirements.txt -t python/

echo "Layer dependencies installed successfully"
