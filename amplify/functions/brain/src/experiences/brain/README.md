# Brain's stateful turn graph

Brain is one fictional character, not a committee of seven model agents. The
compiled graph lives in `cognition/graph.py`; node behavior is in
`cognition/nodes.py`. Both `process_message` and `stream_message` execute it.

```text
load_state ── recent receipt ───────────────────────────┐
    ↓                                                 │
  recall ─── existing historical response ──────────────┤
    ↓                                                 │
 appraise                                             │
    ↓                                                 │
 respond / recollect / reflect / clarify intention      │
    ↓                                                 │
 respond: ONE LanguageAgent invocation                 │
    ↓                                                 │
 consolidate: validate proposals + conditional save    │
    ↓                                                 │
 publish ←─────────────────────────────────────────────┘
```

Intention selection and appraisal are deterministic and bounded. Explicit recall
gets a wider memory search; reflection focuses on canonical uncertainties;
clarification focuses on the latest exchange and unresolved user questions.
No recursive reflection loops, random philosophical appendices, or extra model
calls are added. Ordinary greetings can stay brief.

## What persists

`Conversation.brainState` stores an AWSJSON-encoded payload, protected by the
existing Conversation owner authorization. No additional table or IAM expansion
is needed. Existing rows initialize lazily. `brainStateVersion` is an opaque
revision token used for optimistic concurrency, not a displayed character level.

- Fictional mood, arousal, curiosity, completed turn count, and previous intention.
- Up to 16 useful **verbatim user-reported quotes**, with message provenance.
- Up to 8 short shared-conversation episodes. Assistant statements are labeled as
  dialogue, not evidence of an actual bodily biography.
- Up to 4 unresolved questions quoted from the user, not fabricated mysteries.
- Up to 4 complete recent message receipts, with input hashes, for replay without
  another inference or state update. Older canonical responses in history also
  suppress reprocessing when available.

The character's identity and uncertainty about his former body remain in
`system_prompt.md`, not mutable model-created facts. Numeric state changes are
bounded to 0–1 and at most 0.08 per turn. Durable user memories require a matching
quote in the current input; invented recollections are not promoted to facts.
Retrieval uses bounded lexical relevance and recency, not an embedding service.

The stored payload has a 250 KB cap. Failed inference does not advance or save the
character. A model failure can persist a terminal technical-difficulties reply in
ordinary chat history, but not personal state, so reload does not leave an endlessly
pending message. Ownership/reset conflicts emit no response-persistence event.
Concurrent writes cannot overwrite a newer revision, cleared memory,
a changed owner, or a conversation switched to another experience. A duplicate
concurrent turn may reuse the winning receipt; other conflicts fail without an
automatic second model call. LangGraph itself has no database checkpointer here:
the store explicitly loads and commits JSON-safe character state per turn.

## Streaming and compatibility

The model's structured JSON stream is buffered until parsed and validated. Only
the public reply is emitted as AG-UI `TEXT_MESSAGE_*`; raw JSON/hidden reasoning is
not relabeled as a public stream of consciousness. This retains the previous
validated-reply delivery timing, rather than claiming token-by-token speech.

Both paths return the existing `response`, `sensations`, `thoughts`, `memories`,
and `self_reflection` shape. Public metadata additionally includes bounded
`brain_state` indicators, not stored user quotes or the complete state document.
The legacy handler remains responsible for BrainResponse persistence; graph
receipts do **not** make that handler's writes globally exactly-once.

Clear Brain chat now resets state with a fresh revision **before** deleting
history and aborts active client streaming without triggering the fallback turn.
An older in-flight graph cannot restore state over that reset. Deleting the
Conversation/account removes its state with the existing row. No natural-language
memory-editing tool is exposed; the graph must not promise deletion it cannot do.

## Security and rollout

**Pre-existing production blocker:** the public Function URL and web-server stream
transport currently trust a caller-supplied `owner`. Store checks verify that the
conversation and persisted message share that owner, but do not authenticate an
HTTP caller. Add transport authentication and derive ownership from verified
identity before relying on this endpoint for private persistent memory. The
`/events` passthrough also requires an authentication/security review. This branch
does not change endpoint authorization or claim to fix those existing gaps.

The schema additions, Lambda graph code, and clear-chat frontend must be released
together. Regenerate Amplify outputs so client model introspection includes the
new fields, and rebuild the Lambda dependency layer if required. Clear chat verifies
the returned revision and null state before deleting history; a mixed/old schema
fails visibly instead of claiming memory was erased. Reset operations explicitly
select the state and revision fields; a partial mutation echo requires a verified
read-back, and serialized AWSJSON null is treated as empty state. History cleanup
selects only row IDs, avoiding unrelated legacy metadata failures. Stage-specific
errors distinguish a reset failure from partial history cleanup without logging
chat contents. Sending and duplicate clears are blocked during cleanup. No AWS changes are applied
by implementing or running these tests.
Inference continues through the existing regional client configuration in
`us-east-1`; no cross-region profiles or new inference dependencies are added.

## Offline validation

Use the dependencies in the Lambda layer requirements in a local virtualenv.
From `amplify/functions/brain/src`, run:

```sh
env -u AWS_PROFILE -u AWS_DEFAULT_PROFILE \
  AWS_EC2_METADATA_DISABLED=true AWS_ACCESS_KEY_ID=testing \
  AWS_SECRET_ACCESS_KEY=testing AWS_DEFAULT_REGION=us-east-1 \
  LANGSMITH_TRACING=false LANGCHAIN_TRACING_V2=false \
  python -m unittest tests.test_brain_graph tests.test_brain_state_store -v
```

Tests inject model/history/store stand-ins, exercise the real compiled graph,
and never make account-connected AWS calls or perform model inference.
