"""Deterministic intent classification for the Game Master orchestrator.

The router maps a player message to one gameplay mode WITHOUT invoking an LLM.
This keeps routing fast, deterministic, and testable; the LLM is reserved for
narration and roleplay, never for deciding which system to change.

Mode list mirrors the initial graph: dialogue, exploration, combat, inventory,
quest, character. A default "narration" mode absorbs open-ended social / world
banter that keeps the NPC-driven story moving.
"""

from __future__ import annotations

import json
from typing import Any, Optional

DIALOGUE_MODE = "dialogue"
EXPLORATION_MODE = "exploration"
COMBAT_MODE = "combat"
INVENTORY_MODE = "inventory"
QUEST_MODE = "quest"
CHARACTER_MODE = "character"
NARRATION_MODE = "narration"
CHECK_MODE = "check"
DICE_MODE = "dice"

ALL_MODES = [
    DIALOGUE_MODE,
    EXPLORATION_MODE,
    COMBAT_MODE,
    INVENTORY_MODE,
    QUEST_MODE,
    CHARACTER_MODE,
    CHECK_MODE,
    DICE_MODE,
    NARRATION_MODE,
]

_LABELS: dict[tuple[str, ...], str] = {
    ("fighting", "attack", "hit", "hit the", "kill", "strike", "slash", "swing",
     "stab", "punch", "kick", "shove", "grapple", "assault", "brawl", "slug",
     "club", "smash", "smack", "shoot", "draw", "fire", "charge", "engage",
     "defend", "guard", "block", "rat", "foe", "enemy"): COMBAT_MODE,
    ("talk", "speak", "say", "ask", "greet", "converse", "hello", "hi ",
     "who", "tell", "chat", "relate", "npc"): DIALOGUE_MODE,
    ("look", "examine", "inspect", "search", "explore", "go ", "go to",
      "go north", "go south", "go east", "go west", "travel", "walk", "enter",
      "leave", "proceed", "head", "move", "venture", "wander", " around",
      "see", "check", "enter ", "north", "south", "east", "west",
      "toward", "towards", "into the", "out of", "exit", "return to",
      "tavern", "gate", "cellar", "square", "market", "mountains",
      "mountain"): EXPLORATION_MODE,
    ("inventory", "equip", "use ", "use the", "consume", "drink", "drink potion",
     "item", "items", "gold", "buy", "sell", "purchase", "pick up", "craft"):
        INVENTORY_MODE,
    ("quest", "task", "mission", "objective", "accept", "take the job", "the job",
     "bounty", "errand", "help", "look"): QUEST_MODE,
    ("stats", "stat", "character", "level", "exp", "xp", "skills", "sheet",
     "abilities", "hp", "health", "status"): CHARACTER_MODE,
}


def parse_dice_result(user_input: str) -> dict | None:
    """Parse a DICE_RESULT payload posted by the frontend dice UI.

    The frontend writes the dice roll outcome as a JSON-string Message; this
    returns the parsed object or None when the input isn't a dice result.
    """
    text = (user_input or "").strip()
    if not text:
        return None
    if text.startswith("[DICE_RESULT]"):
        import re
        match = re.search(r"\[DICE_RESULT\](.*?)\[/DICE_RESULT\]", text, re.DOTALL)
        wrapped = match.group(1) if match else text[len("[DICE_RESULT]"):-len("[/DICE_RESULT]")]
        text = wrapped.strip()
    try:
        payload = json.loads(text)
    except (TypeError, ValueError):
        return None
    if not isinstance(payload, dict) or payload.get("type") != "DICE_RESULT":
        return None
    return payload


def classify_intent(user_input: str) -> str:
    """Return the game mode for the given player message.

    Priority matters: dice-result payloads and explicit risky actions first,
    then combat/explicit instructions, then roleplay modes.
    """
    if parse_dice_result(user_input):
        return DICE_MODE
    text = " " + (user_input or "").lower()

    if _risky_check_request(text):
        return CHECK_MODE

    for terms, mode in _LABELS.items():
        for term in terms:
            if term in text:
                return mode
    return NARRATION_MODE


def _risky_check_request(text: str) -> bool:
    """Whether the player attempts an action that needs a stat check.

    Deterministic keyword router: actions like sneaking, climbing, bluffing,
    picking locks, or forcing doors resolve via a dice roll rather than free
    narration. Combat is handled by its own mode.
    """
    risky = (
        "sneak", "creep", "climb", "swim", "jump", "leap", "balance",
        "pick the lock", "picklock", "jimmy", "force the door", "shoulder the door",
        "bluff", "intimidate", "persuade", "bargain", "haggle", "seduce",
        "convince", "fast talk", "lie to", "spot", "listen", "investigate",
        "disguise", "hide", "track", "survival", "delicate", "stealth",
    )
    return any(term in text for term in risky)


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
        CHECK_MODE: "the player attempts a risky action that needs a stat check",
        DICE_MODE: "the player submitted a dice roll result",
        NARRATION_MODE: "the player is roleplaying or bantering",
    }.get(mode, "the player is acting")