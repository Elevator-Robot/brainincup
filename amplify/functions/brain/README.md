# Brain Lambda

This function executes Brain's roles through the experience registry and
role-specific graphs. Read [the current architecture](../../../docs/BACKEND_ARCHITECTURE.md)
and [backend guidance](../../AGENTS.md).

## Source map

- `resource.ts`: Python 3.12 Lambda and Lambda Web Adapter configuration.
- `src/web_server.py`: HTTP/SSE entry point and event passthrough.
- `src/handler.py`, `src/experiences/handler.py`: dispatch and persistence.
- `src/experiences/brain/`: Brain's identity and bounded cognitive turn.
- `src/experiences/game_master/orchestrator/`: deterministic game systems and narration.
- `src/experiences/agui/`: shared event contracts.
- `src/core/`: inference transports and regional configuration.
- `src/tests/`: mocked unit/contract tests.
- `layer/requirements.txt`: Lambda dependencies.

See [Brain's state graph](src/experiences/brain/README.md) for memory, replay,
reset behavior, and the existing stream-authentication limitation.

## Local verification and packaging

Follow [development](../../../docs/DEVELOPMENT.md) for virtualenv setup and
mocked tests. The root Poetry project is not the Lambda dependency definition.

Packaged native dependencies must match Lambda's Linux x86_64/Python 3.12
runtime. Inspect packaging helpers before use: the retained `build-layer.sh`
currently computes `FUNCTION_DIR` as though it lived in a root scripts directory.
The old `scripts/build-lambda-layer.sh` README shortcut is not present.
Correct packaging paths as a scoped implementation task before relying on it.

Deployment and live checks follow [AWS access](../../../docs/AWS_ACCESS.md).
