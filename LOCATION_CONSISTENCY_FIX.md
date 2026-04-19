# Location Consistency Fix

## Problem
Player location was stored in multiple places and could become inconsistent:
- `PlayerState.currentAreaId` - primary game state location
- `PlayerState.lastKnownLocation` - display name fallback
- `GameMasterAdventure.currentLocation` - narrative location (updated separately)
- Local caches in mode_handlers

When a new character was created, location could be set inconsistently or not retrieved from the database properly. Additionally, the database schema and frontend had "Unknown Location" as defaults.

## Solution
**Single Source of Truth: Quest → Area → Location**

Every player has an active quest, and every quest now has an `areaId` field that defines where that quest takes place. The player's location is always derived from their active quest's area.

### Changes Made

#### 1. Added `areaId` to All Quests
**File:** `amplify/functions/brain/app/seed/quests_001.json`

Each quest now has an explicit `areaId` field:
- `quest_001` → `area_shrouded_vale` (The Shrouded Vale)
- `quest_002` → `area_shrouded_vale` (The Shrouded Vale)
- `quest_003` → `area_darkwood` (The Darkwood)
- `quest_004` → `area_ruined_keep` (The Ruined Keep)
- `quest_005` → `area_cursed_marshes` (The Cursed Marshes)
- `quest_006` → `area_shadow_citadel` (The Shadow Citadel)

#### 2. New Characters Start with quest_001
**File:** `amplify/functions/brain/app/context_pipeline.py`

Changed default PlayerState to include `quest_001` in `activeQuestIds`:
```python
"activeQuestIds": ["quest_001"],
"currentAreaId": "area_shrouded_vale",
```

This ensures every new character starts in The Shrouded Vale with the first quest active.

#### 3. Location Derived from Active Quest
**File:** `amplify/functions/brain/app/context_pipeline.py`

Updated `assemble_game_context()` to derive location from the first active quest's `areaId`:
```python
# Get current area from the first active quest
if active_quest_ids:
    first_quest_doc = next(...)
    if first_quest_doc and first_quest_doc.get("areaId"):
        current_area_id = first_quest_doc["areaId"]
```

#### 4. Added Location Sync Function
**File:** `amplify/functions/brain/app/state_sync.py`

New function `sync_location_from_quest()` ensures PlayerState location is always synchronized with the active quest:
```python
def sync_location_from_quest(
    player_state: PlayerState,
    quest_registry: list,
    area_registry: list,
) -> None:
    """
    Synchronize player location from their active quest's areaId.
    This ensures location is always derived from the quest, not stored separately.
    """
```

#### 5. Sync Location on Every Turn
**File:** `amplify/functions/brain/app/main.py`

Added location sync before processing each turn:
```python
# Sync location from active quest (single source of truth)
sync_location_from_quest(_ps_obj, quest_registry, area_registry)
# Write back synced location to player_state dict
player_state["currentAreaId"] = _ps_obj.current_area_id
player_state["lastKnownLocation"] = _ps_obj.last_known_location
```

#### 6. Updated Database Schema Defaults
**File:** `amplify/data/resource.ts`

Changed default location from "Unknown Location" to "The Shrouded Vale":
```typescript
lastLocation: a.string().default('The Shrouded Vale'),
currentLocation: a.string().default('The Shrouded Vale'),
```

#### 7. Updated Frontend Fallbacks
**Files:** `src/App.tsx`, `src/components/ConversationList.tsx`, `src/components/context/WorldMapPanel.tsx`

Changed all fallback locations from "Unknown Location" to "The Shrouded Vale":
```typescript
return 'The Shrouded Vale';  // Instead of 'Unknown Location'
```

#### 8. Updated Backend Defaults
**Files:** `amplify/functions/brain/src/core/mode_handlers.py`, `amplify/functions/brain/src/core/narrative_extractor.py`

Changed all default locations from "Unknown Location" to "The Shrouded Vale":
```python
'currentLocation': 'The Shrouded Vale',
```

#### 9. Comprehensive Tests
**File:** `amplify/functions/brain/app/tests/test_sync_location_from_quest.py`

Added 7 tests covering:
- Location updates from quest areaId
- No active quests scenario
- Quest not in registry
- Quest missing areaId field
- Area not in registry
- Multiple active quests (uses first)
- New character initialization

## Benefits

1. **Single Source of Truth**: Location always comes from the database via quest → area relationship
2. **Consistency**: No possibility of location being out of sync between different storage locations
3. **Automatic**: Location is synchronized on every turn without manual intervention
4. **Testable**: Comprehensive test coverage ensures correctness
5. **Clear Flow**: New character → quest_001 → area_shrouded_vale → "The Shrouded Vale"
6. **No More "Unknown Location"**: All defaults now point to the starting location

## Migration Notes

Existing players with no active quests will keep their current location. Once they have an active quest, their location will be derived from that quest's area.

All new characters automatically start with quest_001 in The Shrouded Vale.

Existing GameMasterAdventure records with "Unknown Location" will be updated to "The Shrouded Vale" on the next turn.
