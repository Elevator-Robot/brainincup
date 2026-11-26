# Brain's Modes

A mode is a role Brain plays to give the user an experience. Every chat is
still with Brain. Read [the product charter](PRODUCT.md) for the shared identity
and [architecture](BACKEND_ARCHITECTURE.md) for the current implementation.

## Current inventory

| Mode ID | Role / experience | Session model |
| --- | --- | --- |
| `brain` | Brain in his own character: conversation, curiosity, reflection, and the app's home | One persistent Brain conversation per user |
| `game_master` | Brain performs the Game Master role: narration and player-led RPG actions within engine-resolved rules | Multiple adventures with their own character/campaign state |

Brain's direct conversation has bounded cognitive state and recall. GM
currently uses the authored **Alderheart: The Missing Lantern** campaign.
New adventures extend the race/class/name creator with four skippable
fictional-character questions, then follow goal-driven story stages. Each
adventure owns its answers, consequences, and optional semantic memory; resuming
continues that stage. Already-started adventures skip the interview. See
[orchestration](ORCHESTRATION.md) for the persistence/deletion contract.
Both use the same assistant identity, shared chat components, annotations
when available, and Brain's optional voice.

The intended journey is Brain-led: arrive with Brain, enter a role, experience
it, and return to Brain. Current entry uses the shared navigation and GM
character-creation flow. Conversational discovery/selection and cross-mode
memory bridges are still design work.

## Contract for a new or changed mode

Define the relevant parts before implementation:

1. **Experience:** what Brain does for the user in this role.
2. **Identity:** how the role's tone fits Brain while letting the fiction work.
3. **Lifecycle:** entry from Brain, setup, interaction, resume, exit, return.
4. **Capabilities:** actions/tools and deterministic rules, if any.
5. **State:** per-user versus per-session ownership, persistence, reset/deletion.
6. **Memory:** what the role may recall, and what may travel back to Brain.
7. **Presentation:** adapter/extension needs and the right-hand/mobile context.
8. **Evidence:** a usable local slice and observable behavior to verify.

Use only the detail the experiment needs. A toy or small interaction can extend
an existing mode; it does not automatically need a new role, route, or schema.

## Integration seams

- Frontend IDs/aliases: `src/constants/personalityModes.ts`.
- Shared chat contract/adapters: `src/chat/`.
- Routing/session lifecycle: `src/router.tsx`, `src/App.tsx`, navigation components.
- Backend role contract/dispatch:
  `amplify/functions/brain/src/experiences/base.py`, `registry.py`, `handler.py`.
- Persistence: `amplify/data/resource.ts` and each experience's store.

The source still contains explicit two-mode branching. Trace normalization,
dispatch, navigation, hydration, and reset behavior end-to-end when adding
a role. Preserve stored `default`/`rpg_dm` aliases and compatibility.

Shared presentation remains mode-independent. New capability belongs in an
adapter, extension, or context surface. See [shared chat](shared-chat.md) and
the OpenCode [`brain-mode` skill](../.opencode/skills/brain-mode/SKILL.md).
