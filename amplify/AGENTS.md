# Backend and Infrastructure Guidance

Read `docs/BACKEND_ARCHITECTURE.md` for current paths and
`docs/AWS_ACCESS.md` before any account-connected work.

## Experience boundaries

- Brain is the shared identity; experience classes implement his roles.
  Extend `experiences/base.py` and `experiences/registry.py` contracts.
  Preserve both `process_message` and `stream_message` behavior.
- The live Python path is `functions/brain/src/`. `handler.py` delegates to
  `experiences/handler.py`; `web_server.py` serves the Lambda Web Adapter.
  Do not restore removed Controller/mode-handler pipelines from older docs.
- Brain uses `experiences/brain/cognition/`: explicit state load, recall,
  bounded appraisal/intention, one response inference, consolidation, publication.
  Preserve provenance, budgets, revision checks, replay handling, and reset fences.
  Model failures must not advance personal state.
- GM uses `experiences/game_master/orchestrator/`: deterministic systems resolve
  outcomes; the model narrates the resulting facts. Rules, inventory, rewards,
  location, dice, and quest progression must not be extracted from free-form prose.
- Define identity, state ownership, memory scope, and clearing/deletion behavior
  for a new mode. Cross-mode recall is not implied by shared identity.

## Persistence and delivery

- `data/resource.ts` owns the Amplify schema. Keep ownership and account
  isolation explicit; caller-provided owner fields are not authentication.
- Use existing indexes/query services and bounded retrieval. Avoid broad scans
  when an indexed path exists.
- Keep AG-UI events, response metadata, persistence, and hydration compatible.
  Surface terminal failures; do not leave an endlessly pending message.
- Treat `sensations`, `thoughts`, `memories`, and `self_reflection` as authored
  player-facing annotations. Strip GM narrator trailers from text and speech.
- Coordinate schema, backend, and client changes. Generated Amplify outputs
  come from the authorized workflow, not hand-written resource IDs or credentials.
- Read the transport limitation in the Brain cognition README when touching
  HTTP ownership/auth. Do not claim the public stream is authenticated.

## Runtime and checks

- Lambda currently targets Python 3.12 in `functions/brain/resource.ts`.
  Layer dependencies live in `functions/brain/layer/requirements.txt`;
  the root Poetry file is not the Lambda dependency definition.
- Use injected/mocked model, history, persistence, and memory services for local
  tests. Follow the isolated environment in `docs/DEVELOPMENT.md`.
- Local checks do not deploy, invoke paid inference, or inspect an AWS account.
  Delegate cloud work under the root rules. Keep all inference/workloads in
  `us-east-1`, including fallback/error paths.
