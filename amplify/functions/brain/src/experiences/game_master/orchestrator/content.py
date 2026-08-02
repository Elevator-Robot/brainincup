"""Greenfield campaign content for the first-playable vertical slice.

The LLM narrates; these static definitions are the source of truth for the
world. All immutable-ish content (locations, NPCs, quests, merchant stock,
enemies) lives here so deterministic systems can resolve rules against it
without the model inventing state.
"""

from __future__ import annotations

from typing import Any, Optional

GREENFIELD_CAMPAIGN_ID = "campaign_greenfield_alderheart"
GREENFIELD_CAMPAIGN_NAME = "Alderheart: The Missing Lantern"
STARTING_LOCATION = "alderheart_square"
QUEST_ID = "missing_lantern"

# ---------------------------------------------------------------------------
# Locations
# ---------------------------------------------------------------------------

LOCATIONS: dict[str, dict] = {
    "alderheart_square": {
        "id": "alderheart_square",
        "name": "Alderheart Market Square",
        "kind": "town",
        "description": (
            "The heart of Alderheart catches the low amber sun. Stalls crowd a "
            "cobbled square, smoke drifts from chimneys, and the high street climbs "
            "toward the stockade gate."
        ),
        "connections": ["whispering_tankard", "town_gate"],
        "npcs": ["delia", "serge"],
        "featured": "delia",
    },
    "whispering_tankard": {
        "id": "whispering_tankard",
        "name": "The Whispering Tankard",
        "kind": "tavern",
        "description": (
            "A low, warm tavern where firelight dances across oak. Benches have been "
            "worn smooth by a century of travellers and the air is thick with pipe "
            "smoke and low talk."
        ),
        "connections": ["alderheart_square"],
        "npcs": ["bram", "maren"],
        "featured": "bram",
    },
    "town_gate": {
        "id": "town_gate",
        "name": "The Market Stalls at the Gate",
        "kind": "market",
        "description": (
            "Hooded stalls hug the inner wall of the town gate. A merchant with "
            "sharp eyes and a treadle-driven cart calls out prices over the crowd."
        ),
        "connections": ["alderheart_square"],
        "npcs": ["toni"],
        "featured": "toni",
    },
    "market_tavern_cellar": {
        "id": "market_tavern_cellar",
        "name": "The Tankard Cellar",
        "kind": "dungeon",
        "description": (
            "Below the tavern, stone steps end in blackness broken only by the "
            "rustle of disturbed straw and the dim hunched shine of rat eyes. "
            "Somewhere among the barrels a faint lantern gutters."
        ),
        "connections": ["whispering_tankard"],
        "npcs": [],
        "enemies": ["cellar_rat"],
        "featured": None,
    },
}

# ---------------------------------------------------------------------------
# NPCs
# ---------------------------------------------------------------------------

NPCS: dict[str, dict] = {
    "elara": {
        "id": "elara",
        "name": "Elara Kindwater",
        "role": "tavernkeeper",
        "at": "whispering_tankard",
        "greeting": "Welcome back, friend. Find a chair by the fire.",
        "description": "A seasoned tavernkeeper with flour-whitened hands and an easy, knowing smile.",
    },
    "bram": {
        "id": "bram",
        "name": "Bram Hightower",
        "role": "watch-captain",
        "at": "whispering_tankard",
        "greeting": "You're the one folks told me to seek. Good. We have work.",
        "description": "Square-shouldered watch-captain, untidied uniform, a worried set to his brow.",
        "quest": "missing_lantern",
    },
    "toni": {
        "id": "toni",
        "name": "Toni Fairwater",
        "role": "merchant",
        "at": "market_tavern_cellar",
        "greeting": "Take your time. Every coin spends, and I've wares for all of them.",
        "description": "A quick-eyed merchant with a scale on the counter and coins in her sleeve.",
        "merchant": True,
        "stock": ["healing_potion", "torch"],
    },
    "elst": {
        "id": "elst",
        "name": "Old Elst",
        "role": "regular",
        "at": "whispering_tankard",
        "greeting": "Aye, heard about the lantern. The rats took to it, I'd wager.",
        "description": "A gnarled regular who nurses a single mug for an hour at a time.",
    },
    "serge": {
        "id": "serge",
        "name": "Serge the Stonemason",
        "role": "townsfolk",
        "at": "alderheart_square",
        "greeting": "Watch yourself trekking down. The stockade's gone slowly brittle.",
        "description": "A stocky stonemason dusted in white who squints at passing folks.",
    },
}

# ---------------------------------------------------------------------------
# Enemies
# ---------------------------------------------------------------------------

ENEMIES: dict[str, dict] = {
    "cellar_rat": {
        "id": "cellar_rat",
        "name": "Cellar Rat",
        "armor_class": 10,
        "hit_points": 7,
        "attack_modifier": 2,
        "damage": "1d4",
        "xp_value": 12,
        "is_hostile": True,
    },
}

# ---------------------------------------------------------------------------
# Items
# ---------------------------------------------------------------------------

ITEMS: dict[str, dict] = {
    "healing_potion": {
        "id": "healing_potion",
        "name": "Healing Potion",
        "type": "consumable",
        "effect": {"kind": "heal", "amount": 8},
        "value": 15,
    },
    "torch": {
        "id": "torch",
        "name": "Torch",
        "type": "consumable",
        "effect": {"kind": "light", "lumens": 1},
        "value": 5,
    },
    "missing_lantern": {
        "id": "missing_lantern",
        "name": "The Glassbird Lantern",
        "type": "quest",
        "value": 0,
    },
}

MERCHANT_STOCK: list[str] = ["healing_potion", "torch"]

# ---------------------------------------------------------------------------
# Quest
# ---------------------------------------------------------------------------

QUEST_COMPLETE_REWARD_XP = 60
QUEST_COMPLETE_REWARD_GOLD = 20

QUESTS: dict[str, dict] = {
    "missing_lantern": {
        "id": "missing_lantern",
        "name": "The Missing Lantern",
        "giver": "bram",
        "summary": "The town has gone dark each night — the Glassbird Lantern that "
                   "anchors the cellar light is missing. Bram believes the cellar "
                   "rats dragged it off.",
        "steps": [
            {
                "id": "meet_bram",
                "title": "Speak with Bram",
                "objective": "Accept the task from the watch-captain.",
                "location": "whispering_tankard",
            },
            {
                "id": "clear_cellar",
                "title": "Clear the Cellar",
                "objective": "Enter the tavern cellar and deal the cellar rats.",
                "location": "market_tavern_cellar",
            },
            {
                "id": "recover_lantern",
                "title": "Recover the Lantern",
                "objective": "Lift the Glassbackground Lantern from the rat nest.",
                "location": "market_tavern_cellar",
            },
            {
                "id": "return_lantern",
                "title": "Return the Lantern",
                "objective": "Bring the lantern back to Bram at the Whispering Tankard.",
                "location": "whispering_tankard",
            },
        ],
        "reward": {"xp": QUEST_COMPLETE_REWARD_XP, "gold": QUEST_COMPLETE_REWARD_GOLD},
        "min_character_level": 1,
        "prerequisite_quest_ids": [],
    },
}

# ---------------------------------------------------------------------------
# Starting player equipment
# ---------------------------------------------------------------------------

STARTING_INVENTORY: list[dict] = [
    {"id": "torch", "name": "Torch", "type": "consumable", "quantity": 1},
    {"id": "pouch", "name": "Coin Pouch", "type": "quest", "quantity": 1},
]

DEFAULT_LEVEL_XP = 100

# ---------------------------------------------------------------------------
# Lookups
# ---------------------------------------------------------------------------


def get_location(location_id: Optional[str]) -> Optional[dict]:
    return LOCATIONS.get(location_id or "")


def get_npc(npc_id: Optional[str]) -> Optional[dict]:
    return NPCS.get(npc_id or "")


def get_npc_by_name_fragment(text: str) -> Optional[dict]:
    """Match an NPC by a loose name fragment in the player's message."""
    if not text:
        return None
    lowered = text.lower()
    # prefer explicit name matches
    for npc in NPCS.values():
        name = npc["name"].lower()
        first = name.split()[0]
        if first and first in lowered or name in lowered:
            return npc
    return None


def get_enemy(enemy_id: Optional[str]) -> Optional[dict]:
    return ENEMIES.get(enemy_id or "")


def resolve_location_transition(current: str, text: str) -> Optional[dict]:
    """Travel via the connections of the current location."""
    loc = LOCATIONS.get(current or "")
    if not loc:
        return None
    lowered = (text or "").lower()
    for conn_id in loc.get("connections", []):
        dest = LOCATIONS.get(conn_id)
        if not dest:
            continue
        aliases = [dest["name"].lower(), conn_id.replace("_", " ").lower()]
        if any(alias in lowered for alias in aliases):
            return dest
    return None