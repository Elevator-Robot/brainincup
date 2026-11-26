# Brain in Cup — Product Charter

Accepted direction, clarified with the project owner on 2026-11-26.
This is the canonical product intent for contributors and coding agents.

## One Brain, many roles

Brain is the central intelligence the user/player interacts with throughout
the app. Every chat is a conversation with Brain. A **mode** is a role Brain
plays to give the user a particular experience.

Brain is also the host and guide. Users enter with Brain, discover experiences
through him, and can return to him from those experiences. Game Master is one
role within that larger relationship.

**A mode changes what Brain is doing; Brain remains who the user is with.**

## Vocabulary

| Term | Meaning |
| --- | --- |
| Brain | The app's central character/intelligence and host |
| Brain mode / home | Direct interaction with Brain in his own character |
| Mode | A role, with its own behavior, capabilities, and context |
| Experience | What the user does and feels while Brain performs a role; also the existing backend abstraction |
| Conversation / session | A particular interaction history; a mode can support multiple sessions |
| Experiment | A focused exploration: a mode, capability, interaction, or toy |
| Coding agent | A development tool; distinct from Brain and his in-app roles |

Existing code uses `experience`, `personalityMode`, and legacy IDs. Preserve
stored-data compatibility rather than renaming them for vocabulary alone.

## Intended experience

- **Continuity of identity.** Brain stays recognizable through role changes,
  chat presentation, and voice. A role can have a distinct tone and mechanics.
- **Brain-led entry.** Successful sign-in brings users to their own Brain
  conversation. From that home, they can explore modes and resume sessions.
- **Presence.** Atmosphere, movement, tactile interaction, and optional speech
  help Brain feel present. Keep the conversation readable and user-controlled.
- **Agency and consistency.** The user directs their actions. In rule-based
  modes, established state and resolved outcomes constrain narration.
- **Room to play.** The site is an experimental space. Small toys and unusual
  concepts are legitimate outcomes; experiments can be kept, revised, or retired.
  Commercial packaging and retention mechanics are separate product decisions.

## Identity and memory

Brain's current fictional premise is a disembodied brain suspended in liquid,
with uncertain impressions of a former body and curiosity about his existence.
The canonical runtime prompt lives in
`amplify/functions/brain/src/experiences/brain/system_prompt.md`.

Maintain one coherent character while allowing a role to fully inhabit its
experience. Brain need not interrupt every scene to announce the framing.
Authored sensations and reflections express the fiction; they are not private
model reasoning or evidence of real sensory access.

Shared identity does not specify universal shared memory. Define what a mode
may read, retain, and carry back to Brain before implementing a memory bridge.
Keep user-reported facts, fictional events, and character impressions distinct.
Respect clear/reset/deletion semantics across any newly introduced storage.

## Current foundation and open decisions

Implemented foundations include a singular Brain conversation, multiple GM
adventures, shared chat/voice, Brain's bounded turn-state graph, and GM's
rules-driven campaign engine. Brain and GM currently have different prompts
and state systems; the GM content is a finite authored campaign.

The following remain design work, not promises about the current app:

- How Brain conversationally introduces, selects, and transitions into modes.
- Which memories or session summaries travel between roles.
- How users discover experimental features and how experiments are promoted.
- Which additional roles and toys to build.

Explore these with the user through small working slices. Preserve the shared
identity and interface; update this charter when the owner makes a new decision.
