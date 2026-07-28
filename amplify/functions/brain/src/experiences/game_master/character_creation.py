from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Any


@dataclass
class CharacterStats:
    strength: int = 10
    dexterity: int = 10
    constitution: int = 10
    intelligence: int = 10
    wisdom: int = 10
    charisma: int = 10


@dataclass
class Character:
    name: str = "Adventurer"
    race: str = "Human"
    character_class: str = "Wanderer"
    level: int = 1
    experience: int = 0
    stats: CharacterStats = field(default_factory=CharacterStats)
    max_hp: int = 12
    current_hp: int = 12
    armor_class: int = 10
    inventory: list[dict] = field(default_factory=list)
    skills: dict = field(default_factory=dict)
    status_effects: list[str] = field(default_factory=list)


def calculate_derived_stats(stats: CharacterStats, character_class: str, level: int = 1) -> dict:
    """Calculate derived stats (max HP, armor class) from base stats,
    character class, and level."""
    hp_per_level = {
        "fighter": 10, "wizard": 6, "rogue": 8, "cleric": 8,
        "wanderer": 8, "paladin": 10, "ranger": 10,
    }
    base_hp = hp_per_level.get(character_class.lower(), 8)
    con_modifier = math.floor((stats.constitution - 10) / 2)
    max_hp = base_hp + con_modifier + (level - 1) * (base_hp // 2 + con_modifier)
    ac = 10 + math.floor((stats.dexterity - 10) / 2)
    return {"maxHP": max(max_hp, 1), "armorClass": max(ac, 10)}


def create_default_inventory(character_class: str) -> list[dict]:
    """Return starting equipment for a given class."""
    equipment = {
        "fighter": ["Longsword", "Chain Mail", "5 Gold"],
        "wizard": ["Wand of Sparks", "Spellbook", "5 Gold"],
        "rogue": ["Twin Daggers", "Leather Armor", "5 Gold"],
        "cleric": ["Warhammer", "Scale Mail", "Holy Symbol", "5 Gold"],
        "wanderer": ["Rusty Sword", "Leather Armor", "5 Gold"],
        "paladin": ["Greatsword", "Plate Armor", "Holy Amulet", "5 Gold"],
        "ranger": ["Longbow", "Studded Leather", "5 Gold"],
    }
    items = equipment.get(character_class.lower(), ["Rusty Sword", "5 Gold"])
    return [
        {"id": __import__("uuid").uuid4().hex[:8], "name": item, "type": "consumable", "quantity": 1}
        for item in items
    ]
