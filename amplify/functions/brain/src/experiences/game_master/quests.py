from __future__ import annotations

from typing import Any, Optional


def validate_quest_transition(
    current_quest_id: Optional[str],
    target_quest_id: str,
    completed_quest_ids: list[str],
    player_level: int,
    quest_registry: list[dict],
) -> tuple[bool, str]:
    """Validate whether a player can advance to or start a new quest.

    Returns (is_allowed, reason).
    """
    quest = next(
        (q for q in quest_registry if q.get("id") == target_quest_id),
        None,
    )
    if not quest:
        return True, ""

    min_level = quest.get("minCharacterLevel", 1)
    if player_level < min_level:
        return False, f"Quest requires level {min_level} (you are level {player_level})"

    prerequisites = quest.get("prerequisiteQuestIds", [])
    for prereq in prerequisites:
        if prereq not in completed_quest_ids:
            return False, f"Prerequisite quest not completed"

    return True, ""


def find_next_quest(
    completed_quest_id: str,
    quest_registry: list[dict],
    completed_quest_ids: list[str],
    active_quest_ids: list[str],
    player_level: int,
) -> Optional[dict]:
    """Find the next quest to auto-assign after completing one."""
    for quest in quest_registry:
        prerequisites = quest.get("prerequisiteQuestIds", [])
        if completed_quest_id not in prerequisites:
            continue
        qid = quest.get("id")
        if qid in completed_quest_ids or qid in active_quest_ids:
            continue
        min_level = quest.get("minCharacterLevel", 1)
        if player_level < min_level:
            continue
        if not all(p in completed_quest_ids for p in prerequisites):
            continue
        return quest
    return None
