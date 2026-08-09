# Location Flow — Orchestrator (current)

How the player's location is decided, persisted, and rendered in the
LangGraph Game Master orchestrator. This supersedes the legacy quest→area flow
described in `LOCATION_UPDATE_FLOW.md` / `LOCATION_CONSISTENCY_FIX.md`.

## Architecture at a glance

```
player message
   ↓
GameMasterExperience.stream_message
   ↓
build_agent (LangGraph) ─ seed node → classify_and_prepare → route
   ↓
bootstrap_node / exploration_node
   ├─ resolve_location_transition(current, text)   ← the only place location changes
   ├─ campaign["currentLocation"] = new content key (e.g. "whispering_tankard")
   └─ _persist_campaign → save_campaign → GameMasterAdventure.currentLocation
   ↓
STATE_SNAPSHOT AG-UI event → { location: { id, name, currentObjectives } }
   ↓
frontend: commitLocation() → authoritativeLocation (placeholder-proof) → memo
```

## Source of truth

- **Location is a content KEY**, not a free-text string. The keys and their
  display names are defined once in `orchestrator/content.py`:
  `alderheart_square`, `whispering_tankard`, `town_gate`, `market_tavern_cellar`.
  The campaign starts at `content.STARTING_LOCATION` ("alderheart_square").
- `resolve_location_transition(current, text)` (content.py:277) is the **only**
  place the game master decides to move the player. The GM does **not** invent
  locations via LLM output — it matches the player's message text against the
  current location's `connections` aliases. No match → the player stays put.
- The frontend maps key → display name in `src/utils/gmLocations.ts`
  (`GM_LOCATION_NAMES`). Unknown/free-text values pass through unchanged so
  legacy rows degrade gracefully.

## When the game master updates location

`exploration_node` (nodes.py:405) runs each exploratory turn:

1. `resolve_location_transition(campaign.currentLocation, state.user_input)`
2. If the message names a connected location (by display name or id) →
   `campaign["currentLocation"]` is set to the destination key, the scene
   description and `visitedLocations` are updated, and the narration facts
   announce the move.
3. Otherwise the facts restate the current location, connections, and present
   NPCs — no location change.

Special case: entering `market_tavern_cellar` with the rats cleared advances
the quest to `recover_lantern`.

## Persistence (backend)

- `persistence.py:save_campaign` writes `currentLocation` back to the
  `GameMasterAdventure` row on every turn, bumping `updatedAt` with a
  millisecond `Z`-suffixed timestamp (`_now()`) so orchestrator rows sort
  correctly against AppSync rows.
- `load_campaign` (persistence.py:185) filters rows to those whose
  `currentLocation` resolves via `content.get_location`, so placeholder/legacy
  rows never resurrect a bad location on reload.

## Snapshot emission

- `nodes.py:_snapshot` / `_minimal_snapshot` emit AG-UI `STATE_SNAPSHOT` events
  with `location: { name, id, currentObjectives }`. `_loc_name` resolves the
  content key to its display name.
- `bootstrap_node` streams a snapshot immediately with the starting location so
  the UI has location before the first narration arrives.

## Frontend hydration (refresh-safe)

The location must render with the page, not wait for a live stream.

- `src/App.tsx` keeps a placeholder-proof `authoritativeLocation` state
  (`commitLocation`). It can **only** be set to a resolved, non-placeholder
  name — the stub/legacy `The Shrouded Vale` default can never be displayed.
- Seeds come from every authoritative source:
  - `STATE_SNAPSHOT` handler (streamed)
  - legacy JSON fast-path (`current_location` / `area_transition` / `location`)
  - `ensureAdventureState` initial async load
  - `observeQuery` subscription (seeded + merge-preserving, never overwrites a
    good location with a placeholder row)
- **Refresh**: `authoritativeLocation` hydrates synchronously from
  `localStorage` key `gmAuthoritativeLocation:<conversationId>` (written by
  `commitLocation`), so the badge, HUD, context panels, and conversation
  previews show the location immediately on page load.
- `currentLocation` memo (App.tsx) returns `authoritativeLocation` first, then
  falls back to `adventureState.currentLocation` / `.lastLocation`, rejecting
  placeholder strings.
- The explore/context components (`ConversationList`, `ConversationSidebarIcons`)
  use the shared `pickLatestAdventure` + `resolveLocationName` helpers for
  consistent previews.

## Troubleshooting

- **Badge flashes then disappears** — an `observeQuery` publish delivered only
  stub/legacy placeholder rows and overwrote the real location. Fixed by the
  merge-preserving observeQuery handler; don't revert it to a blind
  `setAdventureState(latest)`.
- **Location missing after refresh** — `authoritativeLocation` had no persisted
  value. It is now hydrated from `localStorage`; if a conversation still shows
  nothing, no real location was ever committed for it (e.g. a fresh stub).
- **Wrong/nonexistent location shown** — check the row's `currentLocation` is a
  valid `content.LOCATIONS` key; free-text legacy values are skipped by
  `load_campaign`.