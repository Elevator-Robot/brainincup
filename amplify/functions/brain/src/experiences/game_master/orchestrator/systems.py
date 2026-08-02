"""Deterministic game systems for the Game Master orchestrator.

Every function here is pure and side-effect free: it takes state in and returns
new state plus a short report. It never calls the LLM and never talks to
DynamoDB. The graph nodes decide when to persist (via the persistence adapter),
and narration only ever *describes* what these systems already resolved.

Rules that already exist upstream (stat checks, derived stats) are reused so
the slice does not reinvent its own copy of the game math.
"""

from __future__ import annotations

import math
import random
from typing import Any, Optional

from experiences.game_master.character_creation import CharacterStats, calculate_derived_stats

# Dice -----------------------------------------------------------------------


def roll_d20(rng: random.Random | None = None) -> int:
    return (rng or random).randint(1, 20)


def roll_dice(count: int, sides: int, rng: random.Random | None = None) -> int:
    return sum((rng or random).randint(1, sides) for _ in range(count))


def dice_notation(notation: str, rng: random.Random | None = None) -> int:
    """Roll a compact notation like '1d4', '2d6', or an additive sum."""
    total = 0
    for part in notation.split("+"):
        part = part.strip()
        if "d" in part:
            count, sides = part.split("d", 1)
            total += roll_dice(int(count or 1), int(sides), rng)
        elif part.isdigit():
            total += int(part)
    return total


# ---------------------------------------------------------------------------
# Experience & leveling
# ---------------------------------------------------------------------------

# XP thresholds indexed by level (xp needed to reach each level).
XP_THRESHOLDS: list[int] = [0, 100, 250, 500, 900, 1500]


def xp_for_next_level(level: int) -> int:
    idx = max(1, min(int(level), len(XP_THRESHOLDS) - 1))
    return XP_THRESHOLDS[idx]


def _derived(stats: CharacterStats, character_class: str, level: int) -> dict:
    return calculate_derived_stats(stats, character_class, level)


def apply_xp(player: dict, amount: int) -> dict:
    """Add XP and level up via derived stats. Returns an updated player copy."""
    player = dict(player)
    player["xp"] = max(0, int(player.get("xp", 0)) + int(amount or 0))
    while player["xp"] >= xp_for_next_level(int(player.get("level", 1))):
        player["level"] = int(player.get("level", 1)) + 1
        stats = CharacterStats(
            strength=int(player.get("stats", {}).get("strength", 10)),
            dexterity=int(player.get("stats", {}).get("dexterity", 10)),
            constitution=int(player.get("stats", {}).get("constitution", 10)),
            intelligence=int(player.get("stats", {}).get("intelligence", 10)),
            wisdom=int(player.get("stats", {}).get("wisdom", 10)),
            charisma=int(player.get("stats", {}).get("charisma", 10)),
        )
        derived = _derived(stats, player.get("class", "wanderer"), player["level"])
        player["max_hp"] = derived["maxHP"]
        player["ac"] = max(int(player.get("ac", 10)), derived["armorClass"])
        player["current_hp"] = min(int(player.get("current_hp", player["max_hp"])), player["max_hp"])
    return player


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------

def apply_damage(player: dict, amount: int) -> dict:
    player = dict(player)
    player["current_hp"] = max(0, int(player.get("current_hp", 0)) - int(amount or 0))
    return player


def heal_character(player: dict, amount: int) -> dict:
    player = dict(player)
    player["current_hp"] = min(
        int(player.get("max_hp", player.get("current_hp", 0))),
        int(player.get("current_hp", 0)) + int(amount or 0),
    )
    return player


# ---------------------------------------------------------------------------
# Combat
# ---------------------------------------------------------------------------

def player_attack(player: dict, enemy: dict, rng: random.Random | None = None) -> dict:
    """Resolve one player attack vs an enemy; returns facts for narration."""
    stats = player.get("stats", {})
    mod = math.floor((int(stats.get("strength", 10)) - 10) / 2)
    roll = roll_d20(rng)
    hit = (roll != 1) and (roll == 20 or roll + mod >= int(enemy.get("armor_class", 10)))
    damage = dice_notation(enemy.get("damage", "1d4"), rng) if hit else 0
    remaining = max(0, int(enemy.get("hit_points", 0)) - damage)
    return {
        "roll": roll,
        "hit": hit,
        "damage": damage,
        "nat20": roll == 20,
        "nat1": roll == 1,
        "enemy_hp": remaining,
        "enemy_defeated": remaining <= 0,
    }


def _enemy_damage(enemy: dict) -> int:
    base = dice_notation(enemy.get("damage", "1d4"))
    return max(1, base + int(enemy.get("attack_modifier", 0))) if base else 0


# ---------------------------------------------------------------------------
# Inventory & economy
# ---------------------------------------------------------------------------

def add_item(player: dict, item_id: str, quantity: int = 1) -> dict:
    player = dict(player)
    inventory = [dict(i) for i in player.get("inventory", [])]
    for entry in inventory:
        if entry.get("id") == item_id:
            entry["quantity"] = int(entry.get("quantity", 1)) + quantity
            player["inventory"] = inventory
            return player
    inventory.append({"id": item_id, "name": item_id, "type": "misc", "quantity": quantity})
    player["inventory"] = inventory
    return player


def has_item(player: dict, item_id: str) -> int:
    for entry in player.get("inventory", []):
        if entry.get("id") == item_id:
            return int(entry.get("quantity", 1))
    if (item_id or "").lower() in ("gold", "coin"):
        return int(player.get("gold", 0))
    return 0


def remove_item(player: dict, item_id: str, quantity: int = 1) -> dict:
    player = dict(player)
    inventory = [dict(i) for i in player.get("inventory", [])]
    for entry in inventory:
        if entry.get("id") == item_id:
            entry["quantity"] = int(entry.get("quantity", 1)) - quantity
            if entry["quantity"] <= 0:
                inventory = [x for x in inventory if x.get("id") != item_id]
            break
    player["inventory"] = inventory
    return player


def spend_gold(player: dict, amount: int) -> dict:
    player = dict(player)
    player["gold"] = max(0, int(player.get("gold", 0)) - int(amount or 0))
    return player


def grant_gold(player: dict, amount: int) -> dict:
    player = dict(player)
    player["gold"] = int(player.get("gold", 0)) + int(amount or 0)
    return player


def purchase(player: dict, item_id: str, price: int) -> "tuple[dict, Optional[str]]":
    if int(player.get("gold", 0)) < price:
        return player, "not enough gold"
    player = spend_gold(player, price)
    player = add_item(player, item_id, 1)
    return player, None