"""Deterministic intent classification for the Game Master orchestrator.

The router maps a player message to one gameplay mode WITHOUT invoking an LLM.
This keeps routing fast, deterministic, and testable; the LLM is reserved for
narration and roleplay, never for deciding which system to change.

Mode list mirrors the initial graph: dialogue, exploration, combat, inventory,
quest, character. A default "narration" mode absorbs open-ended social / world
banter that keeps the NPC-driven story moving.
"""

from __future__ import annotations

from typing import Any, Optional

DIALOGUE_MODE = "dialogue"
EXPLORATION_MODE = "exploration"
COMBAT_MODE = "combat"
INVENTORY_MODE = "inventory"
QUEST_MODE = "quest"
CHARACTER_MODE = "character"
NARRATION_MODE = "narration"

ALL_MODES = [
    DIALOGUE_MODE,
    EXPLORATION_MODE,
    COMBAT_MODE,
    INVENTORY_MODE,
    QUEST_MODE,
    CHARACTER_MODE,
    NARRATION_MODE,
]

_LABELS: dict[tuple[str, ...], str] = {
    ("fighting", "attack", "hit", "kill", "strike", "slash", "swing", "stab",
     "shoot", "draw", "fire", "charge", "engage", "defend", "guard", "block",
     "rat", "foe", "enemy"): COMBAT_MODE,
    ("talk", "speak", "say", "ask", "greet", "converse", "hello", "hi ",
     "who", "tell", "chat", "relate", "npc"): DIALOGUE_MODE,
    ("look", "examine", "inspect", "search", "explore", "go ", "travel",
     "walk", "enter", "leave", "proceed", "head", "move", "venture", "wander",
     " around", "see", "check", "enter "): EXPLORATION_MODE,
    ("inventory", "equip", "use ", "use the", "consume", "drink", "drink potion",
     "item", "items", "gold", "buy", "sell", "purchase", "pick up", "craft"):
        INVENTORY_MODE,
    ("quest", "task", "mission", "objective", "accept", "take the job", "the job",
     "bounty", "errand", "help", "look"): QUEST_MODE,
    ("stats", "stat", "character", "level", "exp", "xp", "skills", "sheet",
     "abilities", "hp", "health", "status"): CHARACTER_MODE,
}


def classify_intent(user_input: str) -> str:
    """Return the game mode for the given player message.

    Priority matters: combat/explicit instructions first, then roleplay modes.
    """
    text = " " + (user_input or "").lower()

    for terms, mode in _LABELS.items():
        for term in terms:
            if term in text:
                return mode
    return NARRATION_MODE


def intent_for_narrative(text: str) -> str:
    """A light touch: whether the GM should lean into a player-initiated action."""
    lowered = (text or "").lower()
    if any(w in lowered for w in ("i attack", "i hit", "i swing", "i fight",
                                  "attack the", "stab", "kill the", "charge the")):
        return COMBAT_MODE
    if any(w in lowered for w in ("i buy", "buy the", "purchase", "sell the",
                           "drink the potion", "use my potion", "equip")):
        return INVENTORY_MODE
    return NARRATION_MODE


def describe_mode(mode: str) -> str:
    return {
        DIALOGUE_MODE: "the player is speaking with an NPC",
        EXPLORATION_MODE: "the player is moving or inspecting the environment",
        COMBAT_MODE: "the player is fighting an enemy",
        INVENTORY_MODE: "the player is managing items, gear, or coin",
        QUEST_MODE: "the player is advancing or reporting a quest",
        CHARACTER_MODE: "the player is inspecting their character",
        NARRATION_MODE: "the player is roleplaying or bantering",
    }.get(mode, "the player is acting")