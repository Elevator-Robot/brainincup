"""
State Sync — pure Python module with no external I/O.

Provides PlayerState and WorldState dataclasses, area transition handling,
level-up area unlock computation, and full game event application.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone, timedelta
from typing import Optional

from area_gating import validate_area_transition, compute_level_gap

MAX_LEVEL = 10


@dataclass
class PlayerState:
    current_level: int
    current_xp: int
    xp_to_next_level: int
    current_area_id: str
    last_known_location: str
    current_act_id: str
    current_chapter_id: str
    current_scene_id: str
    current_hp: int
    max_hp: int
    version: int
    active_quest_ids: list = field(default_factory=list)
    completed_quest_ids: list = field(default_factory=list)
    failed_quest_ids: list = field(default_factory=list)
    dice_roll_log: list = field(default_factory=list)
    pacing_metrics: dict = field(default_factory=dict)
    ui_hints: list = field(default_factory=list)
    pending_dice_roll: Optional[dict] = None
    gold: int = 0


@dataclass
class WorldState:
    campaign_id: str
    version: int
    flags: dict = field(default_factory=dict)


def compute_level_threshold(level: int) -> int:
    """
    Returns the XP threshold required to reach the given level.
    Formula: 100 * level * (level + 1) // 2
    Produces: 100, 300, 600, 1000, 1500 for levels 1–5.
    """
    return 100 * level * (level + 1) // 2


def compute_newly_unlocked_areas(new_level: int, area_registry: list) -> list:
    """
    Returns display names of areas whose minCharacterLevel equals new_level.
    Called after a level-up event to find newly accessible areas.
    """
    return [
        area.get("displayName", area.get("title", area.get("id", "")))
        for area in area_registry
        if area.get("minCharacterLevel") == new_level
    ]


def handle_area_transition(
    player_state: PlayerState,
    target_area_id: str,
    area_registry: list,
) -> dict:
    """
    Validates and applies an area transition for the player.

    Looks up target_area_id in area_registry, checks the level gate,
    and either updates player_state.current_area_id or returns a blocked
    response with details.
    """
    area = next((a for a in area_registry if a.get("id") == target_area_id), None)
    if area is None:
        player_state.current_area_id = target_area_id
        return {"blocked": False}

    min_level = area.get("minCharacterLevel", 1)
    allowed = validate_area_transition(player_state.current_level, min_level)

    if allowed:
        player_state.current_area_id = target_area_id
        return {"blocked": False}

    level_gap = compute_level_gap(player_state.current_level, min_level)

    if level_gap > 3:
        hint = (
            f"Area '{area.get('title', target_area_id)}' requires level {min_level}. "
            f"You are {level_gap} levels away."
        )
        player_state.ui_hints.append(hint)

    return {
        "blocked": True,
        "targetArea": area.get("title", target_area_id),
        "requiredLevel": min_level,
        "characterLevel": player_state.current_level,
        "levelGap": level_gap,
    }


def apply_xp(
    player_state: PlayerState,
    xp_amount: int,
    area_registry: Optional[list] = None,
) -> dict:
    """
    Standalone helper: award XP and process level-ups.
    Returns {"levelUpEvents": [...]}.
    """
    if area_registry is None:
        area_registry = []

    level_up_events: list = []
    player_state.current_xp += xp_amount

    while (
        player_state.current_level < MAX_LEVEL
        and player_state.current_xp >= compute_level_threshold(player_state.current_level)
    ):
        player_state.current_level += 1
        new_level = player_state.current_level
        player_state.xp_to_next_level = compute_level_threshold(new_level)
        newly_unlocked = compute_newly_unlocked_areas(new_level, area_registry)
        level_up_events.append({
            "event": "LEVEL_UP",
            "newLevel": new_level,
            "newlyUnlockedAreas": newly_unlocked,
            "xpToNextLevel": player_state.xp_to_next_level,
        })

    return {"levelUpEvents": level_up_events}


def apply_state_changes(
    player_state: PlayerState,
    world_state: WorldState,
    game_events,
    area_registry: Optional[list] = None,
) -> dict:
    """
    Apply all game event changes to player_state and world_state.
    Returns {"levelUpEvents": [...], "levelGateBlocked": None | dict}.
    """
    if area_registry is None:
        area_registry = []

    level_up_events: list = []
    level_gate_blocked = None

    # 1. Award XP
    xp_award = game_events.xp_award
    if xp_award > 0:
        if player_state.current_level == MAX_LEVEL:
            player_state.gold += xp_award
        else:
            xp_result = apply_xp(player_state, xp_award, area_registry)
            level_up_events.extend(xp_result["levelUpEvents"])

    # 2. HP change
    if game_events.hp_change != 0:
        player_state.current_hp = max(
            0,
            min(player_state.max_hp, player_state.current_hp + game_events.hp_change),
        )

    # 3. Quest step advance
    if game_events.quest_step_advance:
        quest_id = game_events.quest_step_advance
        if quest_id in player_state.active_quest_ids:
            step_indices: dict = player_state.pacing_metrics.setdefault("questStepIndices", {})
            step_indices[quest_id] = step_indices.get(quest_id, 0) + 1

    # 4. Quest complete
    if game_events.quest_complete:
        quest_id = game_events.quest_complete
        if quest_id in player_state.active_quest_ids:
            player_state.active_quest_ids.remove(quest_id)
            player_state.completed_quest_ids.append(quest_id)
            
            # Auto-assign next quest in sequence if available and under limit
            if area_registry and len(player_state.active_quest_ids) < 3:
                quest_registry = [a for a in area_registry if a.get("docType") == "QUEST"]
                next_quest = _find_next_quest(
                    completed_quest_id=quest_id,
                    quest_registry=quest_registry,
                    completed_quest_ids=player_state.completed_quest_ids,
                    active_quest_ids=player_state.active_quest_ids,
                    player_level=player_state.current_level,
                )
                if next_quest:
                    player_state.active_quest_ids.append(next_quest["id"])

    # 5. Quest fail
    if game_events.quest_fail:
        quest_id = game_events.quest_fail
        if quest_id in player_state.active_quest_ids:
            player_state.active_quest_ids.remove(quest_id)
            player_state.failed_quest_ids.append(quest_id)

    # 6. World flags
    if game_events.world_flags_set:
        world_state.flags.update(game_events.world_flags_set)

    # 7. Pacing metrics
    pm = player_state.pacing_metrics
    for key in ("turnsSinceLastXPAward", "turnsSinceLastLevelUp",
                "turnsSinceLastQuestStepCompletion", "turnsSinceLastSurpriseEvent"):
        pm[key] = pm.get(key, 0) + 1

    if xp_award > 0:
        pm["turnsSinceLastXPAward"] = 0
    if level_up_events:
        pm["turnsSinceLastLevelUp"] = 0
    if game_events.quest_step_advance or game_events.quest_complete:
        pm["turnsSinceLastQuestStepCompletion"] = 0
    if game_events.tension_level is not None:
        pm["currentTensionLevel"] = game_events.tension_level

    # 8. Area transition
    if game_events.area_transition and area_registry:
        result = handle_area_transition(player_state, game_events.area_transition, area_registry)
        if result.get("blocked"):
            level_gate_blocked = result

    # 9. Dice roll request — write with 5-minute expiry timestamp
    if game_events.dice_roll_request:
        request = dict(game_events.dice_roll_request)
        if "requestId" not in request:
            request["requestId"] = str(uuid.uuid4())
        expires_at = (
            datetime.now(timezone.utc) + timedelta(minutes=5)
        ).isoformat()
        request["expiresAt"] = expires_at
        player_state.dice_roll_log.append({
            "status": "pending",
            "request": request,
        })
        player_state.pending_dice_roll = request

    return {
        "levelUpEvents": level_up_events,
        "levelGateBlocked": level_gate_blocked,
    }


def check_expired_dice_roll(player_state: PlayerState) -> bool:
    """
    Check if the pending dice roll has expired (TTL > 5 minutes).
    If expired, clears pendingDiceRoll and returns True.
    Returns False if no pending roll or roll is still valid.
    """
    pending = player_state.pending_dice_roll
    if not pending:
        return False

    expires_at_str = pending.get("expiresAt")
    if not expires_at_str:
        return False

    try:
        expires_at = datetime.fromisoformat(expires_at_str)
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        if datetime.now(timezone.utc) > expires_at:
            player_state.pending_dice_roll = None
            return True
    except (ValueError, TypeError):
        pass

    return False


def sync_location_from_quest(
    player_state: PlayerState,
    quest_registry: list,
    area_registry: list,
) -> None:
    """
    Synchronize player location from their active quest's areaId.
    This ensures location is always derived from the quest, not stored separately.
    
    If the player has an active quest with an areaId, update currentAreaId to match.
    Also updates lastKnownLocation to the area's displayName.
    """
    if not player_state.active_quest_ids:
        return
    
    # Get the first active quest
    first_quest_id = player_state.active_quest_ids[0]
    quest = next(
        (q for q in quest_registry if q.get("id") == first_quest_id),
        None,
    )
    
    if not quest or not quest.get("areaId"):
        return
    
    # Update currentAreaId from quest
    quest_area_id = quest["areaId"]
    player_state.current_area_id = quest_area_id
    
    # Update lastKnownLocation from area displayName
    area = next(
        (a for a in area_registry if a.get("id") == quest_area_id),
        None,
    )
    if area:
        player_state.last_known_location = area.get("displayName", quest_area_id)


def _find_next_quest(
    completed_quest_id: str,
    quest_registry: list,
    completed_quest_ids: list,
    active_quest_ids: list,
    player_level: int,
) -> Optional[dict]:
    """
    Find the next quest to auto-assign after completing a quest.
    
    Returns the first quest that:
    1. Has the completed quest as a prerequisite
    2. Is not already completed or active
    3. Player meets the minimum level requirement
    """
    for quest in quest_registry:
        # Check if this quest requires the completed quest
        prerequisites = quest.get("prerequisiteQuestIds", [])
        if completed_quest_id not in prerequisites:
            continue
        
        # Check if already completed or active
        quest_id = quest.get("id")
        if quest_id in completed_quest_ids or quest_id in active_quest_ids:
            continue
        
        # Check level requirement
        min_level = quest.get("minCharacterLevel", 1)
        if player_level < min_level:
            continue
        
        # Check all prerequisites are met
        all_prereqs_met = all(
            prereq in completed_quest_ids for prereq in prerequisites
        )
        if not all_prereqs_met:
            continue
        
        return quest
    
    return None
