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
        # Free-text travel cues players actually type (not only full display names).
        "aliases": [
            "market square", "the square", "square", "market", "alderheart",
            "town center", "town centre",
        ],
        "directions": {
            "north": "town_gate",
            "n": "town_gate",
            "up": "town_gate",
            "uphill": "town_gate",
            "toward the gate": "town_gate",
            "to the gate": "town_gate",
            "high street": "town_gate",
            "stockade": "town_gate",
            "west": "whispering_tankard",
            "w": "whispering_tankard",
            "tavern": "whispering_tankard",
            "the tavern": "whispering_tankard",
            "inn": "whispering_tankard",
            "pub": "whispering_tankard",
            "tankard": "whispering_tankard",
        },
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
        "connections": ["alderheart_square", "market_tavern_cellar"],
        "aliases": [
            "whispering tankard", "the tankard", "tankard", "tavern", "the tavern",
            "inn", "the inn", "pub", "the pub",
        ],
        "directions": {
            "east": "alderheart_square",
            "e": "alderheart_square",
            "out": "alderheart_square",
            "outside": "alderheart_square",
            "leave": "alderheart_square",
            "back": "alderheart_square",
            "square": "alderheart_square",
            "market": "alderheart_square",
            "down": "market_tavern_cellar",
            "downstairs": "market_tavern_cellar",
            "cellar": "market_tavern_cellar",
            "basement": "market_tavern_cellar",
            "below": "market_tavern_cellar",
        },
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
        "aliases": [
            "town gate", "the gate", "gate", "stockade", "stockade gate",
            "market stalls at the gate", "high street", "north gate",
        ],
        "directions": {
            "south": "alderheart_square",
            "s": "alderheart_square",
            "back": "alderheart_square",
            "return": "alderheart_square",
            "square": "alderheart_square",
            "market": "alderheart_square",
            "down": "alderheart_square",
            "downhill": "alderheart_square",
        },
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
        "aliases": [
            "tankard cellar", "the cellar", "cellar", "basement", "below",
            "under the tavern", "under the tankard",
        ],
        "directions": {
            "up": "whispering_tankard",
            "upstairs": "whispering_tankard",
            "out": "whispering_tankard",
            "back": "whispering_tankard",
            "tavern": "whispering_tankard",
            "leave": "whispering_tankard",
        },
        "npcs": [],
        "enemies": ["cellar_rat"],
        "featured": None,
    },
}

# Destinations players may name that exist in the fiction but are NOT playable
# locations yet. Matching these must NOT invent a successful move — the
# exploration node narrates a block instead of teleporting the player.
BLOCKED_DESTINATIONS: dict[str, str] = {
    "mountain": (
        "The northern mountains rise beyond Alderheart's stockade, but the road "
        "out is sealed at the gate and the wilderness is not open to you yet. "
        "Stay within the town's connected places for now."
    ),
    "mountains": (
        "The northern mountains rise beyond Alderheart's stockade, but the road "
        "out is sealed at the gate and the wilderness is not open to you yet. "
        "Stay within the town's connected places for now."
    ),
    "snowy mountain": (
        "Snow-capped peaks glitter far beyond the walls. There is no path open "
        "to them from here — the stockade bars the way north of town."
    ),
    "snowy mountains": (
        "Snow-capped peaks glitter far beyond the walls. There is no path open "
        "to them from here — the stockade bars the way north of town."
    ),
    "wilderness": (
        "The wilds beyond Alderheart are not open to you yet. The stockade and "
        "the known streets of town are your world for now."
    ),
    "forest": (
        "The woods beyond the walls are not a reachable place yet. Stay within "
        "Alderheart's connected streets and doors."
    ),
    "woods": (
        "The woods beyond the walls are not a reachable place yet. Stay within "
        "Alderheart's connected streets and doors."
    ),
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
    "bar_brawler": {
        "id": "bar_brawler",
        "name": "Brawling Patron",
        "armor_class": 12,
        "hit_points": 10,
        "attack_modifier": 3,
        "damage": "1d4+1",
        "xp_value": 25,
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


def resolve_location(location_id: Optional[str]) -> dict:
    """Like get_location but never returns None — unknown ids fall back to STARTING_LOCATION."""
    return LOCATIONS.get(location_id or "") or LOCATIONS[STARTING_LOCATION]


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


def location_aliases(loc: dict) -> list[str]:
    """All free-text strings that should match a location."""
    aliases = [loc["name"].lower(), loc["id"].replace("_", " ").lower()]
    aliases.extend(a.lower() for a in (loc.get("aliases") or []) if a)
    # Deduplicate while preserving order (longer phrases checked first below).
    seen: set[str] = set()
    ordered: list[str] = []
    for alias in sorted(set(aliases), key=len, reverse=True):
        if alias and alias not in seen:
            seen.add(alias)
            ordered.append(alias)
    return ordered


def resolve_blocked_destination(text: str) -> Optional[str]:
    """If the player names an out-of-scope place, return the block reason."""
    lowered = (text or "").lower()
    # Longer keys first so "snowy mountains" beats "mountains".
    for key in sorted(BLOCKED_DESTINATIONS.keys(), key=len, reverse=True):
        if key in lowered:
            return BLOCKED_DESTINATIONS[key]
    return None


def _text_mentions(haystack: str, needle: str) -> bool:
    """True if needle appears as a whole token/phrase in haystack."""
    if not needle:
        return False
    padded = f" {haystack} "
    return f" {needle} " in padded


def resolve_location_transition(current: str, text: str) -> Optional[dict]:
    """Travel via directions + connection aliases of the current location.

    Matching order:
      1. Explicit direction / travel cue map on the current location
         (e.g. "north", "to the gate", "tavern").
      2. Free-text alias of a connected location (display name, id, aliases).
    Returns the destination location dict, or None if no move resolves.
    Does NOT invent destinations outside the content graph.
    """
    loc = LOCATIONS.get(current or "")
    if not loc:
        return None
    # Normalize punctuation so "north." / "gate!" still match.
    import re
    lowered = re.sub(r"[^\w\s]", " ", (text or "").lower())
    lowered = re.sub(r"\s+", " ", lowered).strip()

    # 1) Direction / short travel cues on the current node (longest first).
    directions = loc.get("directions") or {}
    for cue in sorted(directions.keys(), key=len, reverse=True):
        if _text_mentions(lowered, cue) or lowered == cue:
            dest = LOCATIONS.get(directions[cue])
            if dest:
                return dest

    # 2) Connected location aliases (name / id / aliases list).
    for conn_id in loc.get("connections", []):
        dest = LOCATIONS.get(conn_id)
        if not dest:
            continue
        for alias in location_aliases(dest):
            if _text_mentions(lowered, alias) or lowered == alias:
                return dest
    return None