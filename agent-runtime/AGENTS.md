# Optional Container Runtime

- This directory holds the optional AgentCore container transport. Current
  experience orchestration lives in `amplify/functions/brain/src/experiences/`.
  Inspect `core/config.py` and the current infrastructure before changing wiring.
- Preserve Brain's identity and structured response contracts across transports.
  Do not create a second source of mode rules or memory here.
- Direct Bedrock is the source-code default when no AgentCore runtime ARN is
  configured. That is not a claim about deployed account configuration.
- Container builds, registry pushes, and runtime deployment are separate from
  local source edits. Follow `docs/AWS_ACCESS.md` and the required cloud agents.
- Historical container restoration instructions reference removed code; do not
  use them as an executable migration plan.
- The retained container has a legacy cross-region model default. Reconcile it
  with regional inference and current contracts before proposing activation;
  do not treat it as a verified drop-in fallback.
