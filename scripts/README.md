# Scripts Directory

Utility scripts for Brain In Cup development and deployment.

## Available Scripts

### `build-lambda-layer.sh`

Builds the Lambda layer with Python dependencies for the Brain function.

**Location**: Symlink to `../amplify/functions/brain/build-layer.sh`

**Usage**:
```bash
./scripts/build-lambda-layer.sh
```

**Requirements**:
- Docker (recommended) OR Python 3.12 with pip
- Internet connection to download dependencies

**What it does**:
1. Cleans existing layer directory
2. Installs Python packages for Linux x86_64 / Python 3.12
3. Builds native extensions (like pydantic_core) for Lambda runtime
4. Displays layer size and verifies binary compatibility

**When to use**:
- Before first deployment
- After updating `amplify/functions/brain/layer/requirements.txt`
- When Lambda import errors occur
- When switching between development machines

**Troubleshooting**:
- If Docker not available, script automatically falls back to pip with platform flags
- Start Docker Desktop if you see "Docker daemon not running"
- See `amplify/functions/brain/README.md` for detailed troubleshooting

## Quick Reference

```bash
# Build Lambda layer
./scripts/build-lambda-layer.sh

# Deploy to sandbox
npx ampx sandbox --profile brain

# Local development
npm run dev
```

## Script Organization

Scripts are organized as follows:
- **This directory** (`scripts/`): Convenient access to utility scripts via symlinks
- **Function-specific scripts** (`amplify/functions/*/`): Scripts that live with their related Lambda functions
- **Build scripts**: Integrated into package.json as npm scripts when possible

## Adding New Scripts

When adding new scripts:
1. Place function-specific scripts in the function's directory (e.g., `amplify/functions/brain/`)
2. Create symlinks in `scripts/` for convenient access
3. Make scripts executable: `chmod +x script-name.sh`
4. Add documentation to this README
5. Use bash shebang: `#!/bin/bash`
6. Include error handling: `set -e` for strict mode
