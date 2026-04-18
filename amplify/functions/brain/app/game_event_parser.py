"""
Game Event Parser — extracts structured game event fields from the
Game_Master JSON response.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional


@dataclass
class GameEvents:
    xp_award: int = 0
    hp_change: int = 0
    quest_step_advance: Optional[str] = None
    quest_complete: Optional[str] = None
    quest_fail: Optional[str] = None
    world_flags_set: dict = field(default_factory=dict)
    dice_roll_request: Optional[dict] = None
    tension_level: Optional[int] = None
    area_transition: Optional[str] = None
    item_grant: list = field(default_factory=list)


GAME_EVENT_FIELDS = [
    "xp_award",
    "hp_change",
    "quest_step_advance",
    "quest_complete",
    "quest_fail",
    "world_flags_set",
    "dice_roll_request",
    "tension_level",
    "area_transition",
    "item_grant",
]


def parse_game_events(response: dict) -> GameEvents:
    """Extract game event fields from the Game_Master JSON response dict."""
    return GameEvents(
        xp_award=int(response.get("xp_award", 0) or 0),
        hp_change=int(response.get("hp_change", 0) or 0),
        quest_step_advance=response.get("quest_step_advance"),
        quest_complete=response.get("quest_complete"),
        quest_fail=response.get("quest_fail"),
        world_flags_set=response.get("world_flags_set") or {},
        dice_roll_request=response.get("dice_roll_request"),
        tension_level=response.get("tension_level"),
        area_transition=response.get("area_transition"),
        item_grant=response.get("item_grant") or [],
    )
