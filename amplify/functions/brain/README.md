# Brain Lambda Function

This Lambda function processes user input through 6 AI agents to simulate consciousness.

## Architecture
- **Runtime**: Python 3.12
- **Dependencies**: LangChain, AWS Bedrock, Pydantic
- **Structure**: 
  - `src/` - Lambda handler and agent code
  - `layer/` - Python dependencies (must be built for Linux)

## Building Dependencies

The Lambda layer contains Python packages with native binary extensions (like `pydantic_core`) that must be compiled for the Lambda runtime (Linux x86_64/Python 3.12).

### Prerequisites
- Docker Desktop (recommended) OR
- Python 3.12 with pip

### Build the Layer

**Option 1: Using Docker (Recommended)**
```bash
# Start Docker Desktop first, then:
./build-layer.sh
```

**Option 2: Without Docker**
```bash
# The script will automatically fall back to pip with platform flags
./build-layer.sh
```

### Verify the Build
After building, check that the binary is for Linux:
```bash
file layer/python/pydantic_core/_pydantic_core*.so
```

Should show: `ELF 64-bit LSB shared object, x86-64` (Linux binary)
Should NOT show: `Mach-O` (macOS binary) or `darwin` (macOS)

## Deploy

After building the layer:
```bash
cd ../../../../  # Back to project root
npx ampx sandbox --profile brain
```

## Troubleshooting

### Error: "No module named 'pydantic_core._pydantic_core'"
**Cause**: The layer was built for macOS instead of Linux.
**Fix**: Rebuild the layer using Docker (see above).

### Error: "Docker daemon not running"
**Fix**: Start Docker Desktop, or use Option 2 (pip with platform flags).

### Layer too large (>250MB)
Consider using AWS-provided Lambda layers for common dependencies, or split into multiple layers.
