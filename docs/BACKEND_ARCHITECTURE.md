# Brain in Cup — Current Architecture

This is a source-code map, not a report of deployed AWS state.
Product intent lives in [PRODUCT.md](PRODUCT.md); all modes are roles Brain plays.

## Application layers

| Layer | Current implementation |
| --- | --- |
| UI | React/TypeScript, Vite, shared chat, cosmic styling, mobile/PWA shell |
| Entry and routing | `src/main.tsx`, `src/router.tsx`, `src/App.tsx` |
| Frontend data | Amplify client, AppSync subscriptions, TanStack Query helpers |
| Identity/data schema | Amplify Gen2 Cognito and `amplify/data/resource.ts` |
| Turn transport | Python Lambda Web Adapter HTTP/SSE and DynamoDB stream fallback |
| Role orchestration | `amplify/functions/brain/src/experiences/` and LangGraph |
| Inference | Regional Bedrock client; optional AgentCore transport for Brain |
| Speech | Authenticated AppSync mutation / ElevenLabs; local server-only demo proxy |

AWS workloads and inference stay in `us-east-1`.

## Shared frontend, role-specific behavior

`src/chat/presentation.ts` defines the shared presentation contract.
`experienceAdapters.ts` supplies composer capabilities; GM message extensions
handle domain controls. `ChatTranscript`, `MessageBubble`, and `ChatComposer`
remain common across roles, including the assistant identity "Brain."

Mode IDs currently normalize to `brain` or `game_master`, with legacy
`default`/`rpg_dm` aliases. Routes are `/brain/$conversationId` and
`/quest/$conversationId`. New roles need end-to-end routing and normalization
work as well as a backend registry entry.

## Turn delivery

1. The UI persists a user `Message` through AppSync.
2. Streaming turns use the Lambda Function URL and `web_server.py`, which
   normalizes the request and dispatches the conversation's experience.
3. `ExperienceRegistry` constructs a `BaseExperience` implementation.
4. The experience runs its graph and emits AG-UI events.
5. `experiences/handler.py::_iter_sse` handles `response_complete` and saves a
   `BrainResponse` through AppSync. Subscriptions support hydration/update.
6. The DynamoDB stream path processes eligible non-streaming messages through
   `process_message`. Streaming flags suppress duplicate processing paths.

`handler.py` is a compatibility entry point delegating to `experiences.handler`.
`web_server.py` runs under Lambda Web Adapter for actual HTTP streaming.
Do not infer globally exactly-once delivery from the streaming flag or graph
receipts; preserve replay and reconciliation behavior when changing this flow.

## Brain's cognitive turn

Source: `experiences/brain/experience.py` and `experiences/brain/cognition/`.

```text
load state → recall → appraise → choose intention → respond → consolidate → publish
      └────────────── cached reply / replay ────────────────────────────────┘
```

Brain has one character voice and one response-generating model call per fresh
turn. Appraisal and intention selection are bounded deterministic steps.
The graph persists mood/curiosity, provenance-backed user quotes, shared
episodes, unresolved questions, and recent replay receipts in
`Conversation.brainState`, with `brainStateVersion` for conditional writes.

Identity stays in `system_prompt.md`. User-reported facts and uncertain bodily
impressions are distinct. Failed inference does not advance personal state;
clear-chat resets state with a new revision before deleting history.

Structured model JSON is parsed before the public reply is emitted. Brain's
delivery is not token-by-token public reasoning. See
[the cognition README](../amplify/functions/brain/src/experiences/brain/README.md)
for budgets, replay, reset, and rollout details.

## Game Master's turn

Source: `experiences/game_master/experience.py` and its `orchestrator/`.

The graph loads authoritative player/campaign state, resumes a fictional
character interview or routes intent, resolves rules, and narrates locked facts.
Goal-driven stages advance independently of pacing. The finalizer atomically
commits campaign/player/dice changes and a replay receipt before publishing
successful completion.
The LLM does not decide inventory changes, rewards, travel, dice outcomes, or
quest progression. Current content is **Alderheart: The Missing Lantern**,
a finite authored playable slice in `orchestrator/content.py`.

GM streams narration plus a validated, stripped narrator-notes trailer.
Exact character details live in the adventure and optionally sync to
adventure-isolated AgentCore semantic memory. The episodic adapter is a separate,
optional integration; the current backend configuration wires semantic memory.
Shared identity does not currently provide a universal cross-mode memory store.

See [orchestration](ORCHESTRATION.md), [location flow](LOCATION_FLOW.md), and
[shared chat/annotations](shared-chat.md).

## Persistence contracts

- `Conversation`, `Message`, `BrainResponse`: identity/history, public replies,
  annotations, and Brain's bounded state.
- `GameMasterCharacter`, `GameMasterAdventure`: authoritative character and
  campaign data, versioned story stages, interview answers, and replay receipts.
- `BrainResponse.gameEvents` / `.story`: engine events and public context
  snapshots across SSE, fallback, and history.
- `PlayerState`: pending dice and roll log; older progression fields and
  `ActiveQuest` rows remain legacy UI fallbacks.
- Quest steps/player choices and world/content models support campaign history
  and content; inspect actual read/write paths before assuming a model is active.

Model authorization varies; inspect the schema rather than assuming all rows
are owner-only. The existing public Function URL trusts caller-supplied owner
information; the cognition README documents this transport limitation.
Treat authentication improvements as explicit engineering work, not a feature
already supplied by the frontend auth gate.

## Runtime and source of truth

- `core/config.py` selects direct Bedrock by default, or the optional AgentCore
  client when configured. Regional model/client rules live in `core/` and
  `amplify/regional-inference.ts`; inspect them rather than copying an old model ID.
- `amplify/functions/brain/resource.ts` defines Python 3.12/Lambda Web Adapter.
  Layer dependencies are in `layer/requirements.txt`.
- `agent-runtime/` is the optional container transport, not the current role
  orchestrator. AgentCore Memory and AgentCore Runtime are separate integrations.
- `amplify_outputs.json` is generated environment configuration.

Use [development](DEVELOPMENT.md) for offline checks and
[AWS access](AWS_ACCESS.md) for delegated cloud investigation.
The [historical architecture](history/backend-architecture.md) is retained for
context, not implementation instructions.
