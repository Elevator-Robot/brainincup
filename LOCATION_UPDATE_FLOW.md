# Location Update Flow - Complete Guide

## Overview

Player location in Brain in Cup is **always derived from their active quest**. When a quest is completed, the next quest is automatically assigned, which may change the player's location.

## The Complete Flow

### 1. New Character Creation
```
Player Created
    ↓
Default PlayerState includes quest_001
    ↓
quest_001.areaId = "area_shrouded_vale"
    ↓
Location = "The Shrouded Vale"
```

**Files:**
- `amplify/functions/brain/app/context_pipeline.py` - Sets default `activeQuestIds: ["quest_001"]`

### 2. Every Turn (Location Sync)
```
Message arrives
    ↓
Load PlayerState from database
    ↓
sync_location_from_quest()
    ├─ Get first active quest
    ├─ Look up quest's areaId
    ├─ Update currentAreaId
    └─ Update lastKnownLocation from area displayName
    ↓
Location displayed in UI
```

**Files:**
- `amplify/functions/brain/app/main.py` - Calls `sync_location_from_quest()` before processing
- `amplify/functions/brain/app/state_sync.py` - `sync_location_from_quest()` function

### 3. Quest Completion (Automatic Progression)
```
Game Master returns quest_complete="quest_001"
    ↓
apply_state_changes()
    ├─ Remove quest_001 from activeQuestIds
    ├─ Add quest_001 to completedQuestIds
    └─ Auto-assign next quest:
        ├─ Find quest with prerequisiteQuestIds=["quest_001"]
        ├─ Check player level >= minCharacterLevel
        ├─ Check not already active/completed
        └─ Add quest_002 to activeQuestIds
    ↓
Next turn: sync_location_from_quest()
    ├─ quest_002.areaId = "area_shrouded_vale" (same location)
    └─ Location stays "The Shrouded Vale"
    ↓
Complete quest_002
    ↓
Auto-assign quest_003
    ├─ quest_003.areaId = "area_darkwood"
    └─ Location changes to "The Darkwood"
```

**Files:**
- `amplify/functions/brain/app/state_sync.py` - `apply_state_changes()` and `_find_next_quest()`
- `amplify/functions/brain/app/game_event_parser.py` - Parses `quest_complete` from AI response

### 4. Quest Progression Chain

| Quest | Area | Prerequisites | Min Level |
|-------|------|---------------|-----------|
| quest_001 | area_shrouded_vale | None | 1 |
| quest_002 | area_shrouded_vale | quest_001 | 1 |
| quest_003 | area_darkwood | quest_002 | 3 |
| quest_004 | area_ruined_keep | quest_003 | 4 |
| quest_005 | area_cursed_marshes | quest_004 | 7 |
| quest_006 | area_shadow_citadel | quest_005 | 9 |

**Location Changes:**
- quest_001 → quest_002: Stay in "The Shrouded Vale"
- quest_002 → quest_003: Move to "The Darkwood" (if level 3+)
- quest_003 → quest_004: Move to "The Ruined Keep" (if level 4+)
- quest_004 → quest_005: Move to "The Cursed Marshes" (if level 7+)
- quest_005 → quest_006: Move to "The Shadow Citadel" (if level 9+)

## How the Game Master Triggers Quest Completion

The Game Master AI is instructed to return structured JSON with game events:

```json
{
  "response": "You've found the survivor camp! Mira greets you warmly...",
  "quest_step_advance": "quest_001",
  "xp_award": 25,
  "current_location": "The Shrouded Vale"
}
```

When all quest steps are complete:

```json
{
  "response": "With Mira's help, you've found shelter. Quest complete!",
  "quest_complete": "quest_001",
  "xp_award": 200,
  "current_location": "The Shrouded Vale"
}
```

**System Prompt:**
```
Always respond in valid JSON with the following fields:
quest_step_advance, quest_complete, quest_fail, xp_award, hp_change,
world_flags_set, dice_roll_request, tension_level, area_transition,
current_location, item_grant.
```

## Automatic Quest Assignment Rules

When a quest is completed, the system automatically looks for the next quest:

1. **Find dependent quest**: Quest with completed quest in `prerequisiteQuestIds`
2. **Check level**: Player level >= quest's `minCharacterLevel`
3. **Check not duplicate**: Quest not already in `activeQuestIds` or `completedQuestIds`
4. **Check all prerequisites**: All quests in `prerequisiteQuestIds` are completed
5. **Check limit**: Player has < 3 active quests

If all conditions pass, the quest is automatically added to `activeQuestIds`.

## Location Sync Guarantees

✅ **Single Source of Truth**: Location always comes from quest → area relationship  
✅ **Database-driven**: Location retrieved from database on every turn  
✅ **Automatic**: No manual location updates needed  
✅ **Consistent**: No possibility of location being out of sync  
✅ **Testable**: Comprehensive test coverage ensures correctness  

## Edge Cases

### No Active Quests
If a player somehow has no active quests, location remains at last known value.

### Quest Missing areaId
If a quest doesn't have an `areaId` field, location remains unchanged.

### Level Too Low for Next Quest
If player completes quest_002 at level 1, quest_003 (requires level 3) won't be assigned until they level up.

### Multiple Active Quests
Location is always derived from the **first** active quest in the list.

### Manual Area Transition
The Game Master can still trigger `area_transition` events for temporary location changes (e.g., visiting a dungeon), but the base location is always the quest's area.

## Testing

Comprehensive test coverage in:
- `tests/test_sync_location_from_quest.py` - Location sync from quest
- `tests/test_quest_progression.py` - Automatic quest assignment
- `tests/test_context_pipeline.py` - Location resolution in game context
- `tests/test_state_sync_full.py` - Quest completion state changes

Run all tests:
```bash
cd amplify/functions/brain/app
python -m pytest tests/ -v
```

## Summary

**Location updates dynamically through quest progression:**

1. Player completes quest → Game Master returns `quest_complete` event
2. System removes completed quest from `activeQuestIds`
3. System automatically finds and assigns next quest
4. Next quest has different `areaId` → Location changes
5. On next turn, `sync_location_from_quest()` updates location
6. UI displays new location

**No manual intervention needed** - the entire flow is automatic and database-driven!
