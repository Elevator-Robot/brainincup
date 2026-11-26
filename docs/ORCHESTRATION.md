# Game Master: Story Stages, Events, and Memory

Brain plays the Game Master role in **Alderheart: The Missing Lantern**.
This document describes the source implementation, not a deployed environment.
Code: `amplify/functions/brain/src/experiences/game_master/orchestrator/`.

## Turn and adventure lifecycle

```text
bootstrap → replay ───────────────────────────────────────────┐
          → introduction subflow ─────────────────────────────┤
          → intent → deterministic rules → narration ─────────┤
                                                             ↓
                     stage transitions → atomic commit → memory sync → publish
```

The existing race/class/name/portrait creator saves the character first.
The first actual adventure response starts with **Alderheart Market Square**,
then the character's name, level, race/class, the scene, and the first question.
There is no fabricated welcome message in an empty transcript.

`introduction.json` supplies four Elder Scrolls-inspired, original questions:
origin, motive, bond, and a hypothetical dilemma. Each answer is stored verbatim
(apart from surrounding whitespace) with its source message, timestamp, and
`player_authored_fiction` provenance. Answers are limited to 1,200 characters.
`help` repeats guidance; `skip` leaves one detail unknown; `skip intro` leaves
the remaining details unknown and begins play. No traits, stats, alignment,
inventory, XP, or actual past events are inferred from an answer.

The interview resumes from persisted state. Leaving for Brain does not finish
it, and returning to this adventure retains its character. New adventures
start independently. Already-started legacy adventures skip the interview and
derive their initial stage from existing quest progress.

## Governing stages

`story.py` defines `Stage`, ordered `Transition` predicates, and one-time
consequences. The current chain is:

| Stage | Goal / exit condition |
| --- | --- |
| `introduction` | Finish or skip the interview |
| `lantern_lead` | Meet Bram at the tavern and explicitly accept the quest |
| `cellar` | Clear the cellar rats |
| `recovery` | Search the cleared cellar and recover the lantern |
| `return` | Return to Bram with the lantern and explicitly hand it over |
| `aftermath` | The current authored story is complete; town exploration remains |

Transitions inspect engine state, never model prose or elapsed turn counts.
Clearing the cellar sets `cellar_safe`; completing the quest sets
`alderheart_lit`. Consequences are recorded once. Directed traversal is bounded,
and invalid targets/cycles fail instead of silently replacing the story.

To extend the story:

1. Add a stable stage ID, title, objective, and deterministic exit predicate.
2. Append its transition to the preceding stage; add ordered alternatives for
   a branch. Persist any new predicate inputs in versioned adventure state.
3. Resolve new mechanics in a system/node, emit facts and typed events, and let
   the finalizer commit them together.
4. Cover resume, unmet goals, replay, and one-time consequences. Update the
   story schema/migration explicitly when changing stored meanings.

Pacing (`pacing.py`) still computes act/chapter/tension metadata. It cannot
complete these stages or award quest rewards. This is a small authored
framework, not an unlimited generated campaign or a full D&D rules engine.

## Gameplay and event vocabulary

The keyword router selects dialogue, exploration, combat, inventory, quest,
character, check, dice-result, or general narration. Systems resolve state;
the model describes those locked facts and cannot commit changes itself.
Character details are quoted fictional context. A dilemma is explicitly
hypothetical, including when recalled later.

[D&D's free rules](https://www.dndbeyond.com/sources/dnd/br-2024/playing-the-game)
identify social interaction, exploration, and combat as the pillars of play,
and ability checks, saving throws, and attacks as the three D20 Test kinds.
Those categories inform our extensible event vocabulary:

| Category | Event kinds | Current slice |
| --- | --- | --- |
| Story / identity | `stage`, `character`, `choice`, `consequence` | Stage changes, exact interview details, persistent consequence flags |
| Social | `dialogue` | NPC interaction; risky persuasion uses a check |
| Exploration | `scene`, `discovery` | Connected-location travel and quest-item recovery |
| Objectives | `quest` | Offer, explicit acceptance, progress, completion |
| Uncertainty / conflict | `check`, `combat` | Requested/resolved d20 checks; engine-resolved attacks with persistent enemy HP |
| Resources | `damage`, `healing`, `inventory`, `reward`, `level` | Events from authoritative state changes; one-time quest rewards |
| Future mechanics | `condition`, `rest` | Reserved vocabulary, not implemented systems |

`choice`/`discovery` are also extension points rather than independent mechanics.
Initiative, saving throws, death saves, conditions, rest, spell systems, and
full turn-based enemy combat are not supplied by adding an event label.
Existing check critical-success/XP rules are app rules, not a claim of exact
D&D rules compliance.

Each event has `version`, stable `id`, `kind`, `title`, `detail`, and optional
structured `data`. IDs derive from conversation/message identity and event
order. Events are never extracted from narration.

## Persistence, retries, and publication

| Record | Responsibility |
| --- | --- |
| `GameMasterAdventure.storyState` | Stage, intro answers/skips, flags, encounter HP, memory acknowledgments, bounded replay receipts |
| `GameMasterAdventure.storyVersion` | Optimistic turn version |
| `GameMasterCharacter` | Authoritative level, XP, HP, armor, inventory, gold |
| `PlayerState` | Pending check and bounded dice log |
| `Message.gmProcessed` | Internal durable marker preventing a committed message from applying rules twice |
| `BrainResponse.gameEvents` / `.story` | Public event and state snapshots for SSE reconciliation and history |

New adventure IDs are `gm:{conversationId}`. The store strongly reads the
campaign version before character state; indexes locate legacy rows, followed
by consistent reads. Creation checks that the conversation still exists.
One DynamoDB transaction commits campaign, changed player/dice data, and the
message receipt with conversation-existence and story-version conditions.
Inference or commit failure publishes no successful completion/event cards.

Recent receipts retain up to 20 replies, additionally bounded by story size.
A repeated message returns its original reply/events without consuming another
answer or paying another reward. Reusing that ID with different text is
rejected. Once a receipt expires, the durable message marker still prevents
reapplication, but does not reconstruct the expired reply. Internal receipt
stream updates are ignored; a later transport fallback may replay for delivery.

Gameplay narration can stream before commit; `TEXT_MESSAGE_END` is not commit
confirmation. `response_complete` unlocks the reply and carries events, notes,
and the public story snapshot. The snapshot includes character progression,
location, quest, profile, memory status, and the pending check. `RUN_ERROR`
surfaces a visible failure; a truncated stream can use the existing AppSync
fallback. Reconciliation targets the persisted message ID, not the last bubble.

Direct DynamoDB writes do **not** publish AppSync subscriptions. Response
metadata therefore supplies current context and pending dice on streaming,
fallback, and history paths. Legacy `ActiveQuest`/`PlayerState` UI projections
remain fallbacks; the new story snapshot takes precedence.

### Dice

A risky action produces a pending d20 check with request ID, ability, DC,
description, reward rule, and expiration. It is committed before notification.
The UI adds one inline prompt after the response completes and never rolls
automatically. Explicit activation submits `DICE_RESULT`; retries keep the
selected number. The backend validates request identity, integer range, and
expiration, then atomically records/clears the check with any awarded XP.

The shared renderer supports d4/d6/d8/d10/d12/d20/d100 requests; the current
backend issues d20 ability checks. See the
[dice renderer](../src/components/dice/README.md) for presentation contracts.

## AgentCore character memory

**Semantic memory fits durable character facts.** AWS describes
[semantic memory](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/semantic-memory-strategy.html)
as facts/context about entities, while
[episodic memory](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/episodic-memory-strategy.html)
captures significant interactions and outcomes. A hypothetical interview answer
is a character value, not a completed episode or a real-user preference.

Adventure state remains authoritative. After its commit, `sync_character`
directly ingests exact, attributable facts using
[`BatchCreateMemoryRecords`](https://docs.aws.amazon.com/bedrock-agentcore/latest/APIReference/API_BatchCreateMemoryRecords.html),
bypassing extraction. Stable client tokens and timestamps support retries.
The actor is `gm-<sha256(conversationId)>`, not the account owner. Records and
retrieval use `/strategy/{strategyId}/actor/{actorId}/`; other adventures and
Brain's personal state are never searched. The payload labels fiction and
marks dilemma answers hypothetical.

The UI distinguishes:

- **Saved to adventure:** durable source state; optional semantic memory disabled.
- **Memory sync pending:** source saved, secondary copy not acknowledged.
- **AgentCore memory synced:** every answered field acknowledged by the API.
  This confirms ingestion, not a live retrieval benchmark.

Unsynced answers are retried on the next turn or replay. Acknowledgments are
bound to the memory/strategy target; changing targets requires resync. There
is no background retry worker or automatic migration/purge of a previous target.

### Configuration and rollout boundary

Set both `GM_AGENTCORE_MEMORY_ID` and
`GM_AGENTCORE_MEMORY_SEMANTIC_STRATEGY_ID` through deployment environment or
the existing ignored `.env.agentcore` input. Partial configuration fails
synthesis; absent configuration keeps the durable interview functional.

The implementation wires Lambda environment and memory-scoped IAM for batch
create, retrieve, list, and delete. It does **not** provision a memory resource
or strategy. Use a separate GM memory in **us-east-1**, and use the configured
actor namespace above (AWS's semantic default uses `actors`, plural).
Provisioning, strategy verification, release, and live inference require the
[authorized AWS workflow](AWS_ACCESS.md).

The optional episodic adapter reads `GM_AGENTCORE_MEMORY_EPISODIC_STRATEGY_ID`,
but this change does not wire/provision it. It excludes the introduction.
Enabling it later requires actor-scoped episode/reflection configuration and
short-/long-term deletion handling. Old generic `AGENTCORE_MEMORY_*` settings
and owner-scoped records are not silently reused for fictional characters.

### Deletion and remaining transport limits

Conversation removal triggers a filtered DynamoDB stream consumer. For GM it
purges the configured semantic namespace and deletes adventure/character/dice
rows plus message/response copies via paginated conversation indexes.
Failures propagate for stream retry. Commit checks fence deleted conversations;
semantic writes check existence before and after ingestion and purge if deleted.
Brain clear-chat has no effect on a GM adventure.

This is asynchronous cleanup. Index visibility, crash recovery, concurrent
AppSync publication, and stream delivery still need deployed validation.
The existing reply publication is separate from the turn transaction; these
changes do not establish global exactly-once delivery or fix the public HTTP
transport's authentication limitation described in
[architecture](BACKEND_ARCHITECTURE.md).

## Local verification

Use [development](DEVELOPMENT.md) for isolated mocked tests and the interactive
intro fixture. Python covers intro/resume/skip, complete stage traversal,
replay/reward bounds, transaction fences, dice, memory retries, and deletion.
Frontend tests exercise shared extensions, history, response matching, fallback,
context, and terminal errors. The fixture is UI-only; cloud configuration,
deployed persistence, and live inference are separate evidence.
