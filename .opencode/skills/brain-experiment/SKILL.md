---
name: brain-experiment
description: Use when the user wants to prototype an experimental Brain feature, interactive toy, or new experience concept
---

# Explore an Experiment

Read [the product charter](../../../docs/PRODUCT.md). An experiment can be a
small interaction, capability, or full role. It need not become a new mode.
For design-only requests, produce the proposal without editing.

## Frame the smallest useful slice

Describe what the user should experience and what we want to learn. Use
[the short brief](experiment-brief.md) when helpful; keep it in the conversation
for small experiments instead of generating paperwork.

Inspect the nearest existing implementation. Separate known product decisions
from suggestions, and ask only about choices that materially change identity,
memory, data lifecycle, or the requested experience.

## Build for discovery

- Reuse Brain's shared conversation, atmosphere, and context patterns.
- Put novelty in a focused component, hook, adapter, or mode implementation.
  Introduce an abstraction when it solves a demonstrated need.
- Use the existing development previews for fixture-only exploration. Clearly
  identify what is mocked and what is connected.
- Keep experiments reversible. Choose a simple removal path; introduce feature
  flags or stored schema only when the experiment actually needs them.
- If the concept is a new role or changes a role contract, also load `brain-mode`.
- Do not silently convert a toy into a roadmap, monetization system, or
  autonomous background process.

## Learn from a working result

Run checks appropriate to the changed behavior using
[development](../../../docs/DEVELOPMENT.md). For visual work, leave the local
demo running, open it for the user, and provide a direct link.

Report what was built, what was actually tested/viewed, what remains simulated,
and what the user can try. A useful outcome can be keeping, revising, or retiring
the idea. Update durable product guidance only for accepted decisions.
