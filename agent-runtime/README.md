# Optional AgentCore Container Runtime

This is a retained container transport implementation. Current Brain/GM
orchestration lives in `amplify/functions/brain/src/experiences/`; see
[the architecture](../docs/BACKEND_ARCHITECTURE.md).

## Wiring and status

`amplify/functions/brain/src/core/config.py` selects direct Bedrock when no
AgentCore runtime ARN is configured, with an optional AgentCore client path.
Inspect current infrastructure and source before changing that selection.
This document does not establish deployed runtime configuration.

`app/main.py` contains a FastAPI model-invocation endpoint; `Dockerfile` and
`app/requirements.txt` define the container. This is not a verified drop-in
fallback for the current role graphs.

The retained implementation includes a legacy cross-region model default.
Activation would first require bringing model selection and transport contracts
into alignment with the project's `us-east-1`-only rules. Do not restore the
removed Controller path or follow older "uncomment the runtime" recipes.

## Development

Read [scoped guidance](AGENTS.md) and use mocked inference for local checks.
Starting the real handler is not an offline test: it constructs an AWS client.
Keep role logic and memory ownership in the existing experience layer.

Registry pushes and runtime deployment require the delegated workflow in
[AWS access](../docs/AWS_ACCESS.md).
