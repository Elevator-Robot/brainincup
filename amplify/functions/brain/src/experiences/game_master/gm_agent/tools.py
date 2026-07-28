from __future__ import annotations

import math
import random
from typing import Any

TOOL_SPECS: list[dict] = [
    {
        "toolSpec": {
            "name": "roll_dice",
            "description": "Roll a d20 stat check against a difficulty class (DC). Use when the player attempts an action with uncertain outcome — sneaking, persuading, climbing, searching, etc.",
            "inputSchema": {
                "json": {
                    "type": "object",
                    "properties": {
                        "stat": {
                            "type": "string",
                            "enum": [
                                "strength", "dexterity", "constitution",
                                "intelligence", "wisdom", "charisma",
                            ],
                            "description": "The ability score being tested",
                        },
                        "difficulty_class": {
                            "type": "integer",
                            "description": "DC to beat — 5 trivial, 10 easy, 15 medium, 20 hard, 25 very hard, 30 nearly impossible",
                        },
                        "modifier": {
                            "type": "integer",
                            "description": "Situational modifier added to the roll (default 0)",
                        },
                    },
                    "required": ["stat", "difficulty_class"],
                }
            },
        }
    },
    {
        "toolSpec": {
            "name": "award_xp",
            "description": "Award experience points to the player character.",
            "inputSchema": {
                "json": {
                    "type": "object",
                    "properties": {
                        "amount": {
                            "type": "integer",
                            "description": "Amount of XP to award",
                        },
                        "reason": {
                            "type": "string",
                            "description": "Brief reason for the XP award",
                        },
                    },
                    "required": ["amount", "reason"],
                }
            },
        }
    },
    {
        "toolSpec": {
            "name": "modify_hp",
            "description": "Modify the player's current HP. Use a negative value for damage, positive for healing.",
            "inputSchema": {
                "json": {
                    "type": "object",
                    "properties": {
                        "amount": {
                            "type": "integer",
                            "description": "HP change — negative for damage, positive for healing",
                        },
                        "reason": {
                            "type": "string",
                            "description": "Reason for the HP change",
                        },
                    },
                    "required": ["amount", "reason"],
                }
            },
        }
    },
    {
        "toolSpec": {
            "name": "update_quest",
            "description": "Advance, complete, or fail a quest.",
            "inputSchema": {
                "json": {
                    "type": "object",
                    "properties": {
                        "quest_id": {
                            "type": "string",
                            "description": "The quest identifier",
                        },
                        "status": {
                            "type": "string",
                            "enum": ["in_progress", "completed", "failed"],
                            "description": "New quest status",
                        },
                    },
                    "required": ["quest_id", "status"],
                }
            },
        }
    },
    {
        "toolSpec": {
            "name": "set_world_flag",
            "description": "Set a persistent world state flag that affects future narrative (e.g. 'village_saved', 'bridge_destroyed', 'king_trusts_player').",
            "inputSchema": {
                "json": {
                    "type": "object",
                    "properties": {
                        "flag": {
                            "type": "string",
                            "description": "The flag key (snake_case)",
                        },
                        "value": {
                            "type": "string",
                            "description": "The flag value",
                        },
                    },
                    "required": ["flag", "value"],
                }
            },
        }
    },
    {
        "toolSpec": {
            "name": "grant_item",
            "description": "Grant an item to the player's inventory.",
            "inputSchema": {
                "json": {
                    "type": "object",
                    "properties": {
                        "item_name": {
                            "type": "string",
                            "description": "Name of the item",
                        },
                        "quantity": {
                            "type": "integer",
                            "description": "How many (default 1)",
                        },
                    },
                    "required": ["item_name"],
                }
            },
        }
    },
    {
        "toolSpec": {
            "name": "transfer_area",
            "description": "Move the player to a new area/location.",
            "inputSchema": {
                "json": {
                    "type": "object",
                    "properties": {
                        "area_id": {
                            "type": "string",
                            "description": "The new area identifier",
                        },
                        "area_name": {
                            "type": "string",
                            "description": "Display name of the new area",
                        },
                    },
                    "required": ["area_id", "area_name"],
                }
            },
        }
    },
    {
        "toolSpec": {
            "name": "set_tension",
            "description": "Set the current narrative tension level (1-10). Higher values signal danger and urgency.",
            "inputSchema": {
                "json": {
                    "type": "object",
                    "properties": {
                        "level": {
                            "type": "integer",
                            "minimum": 1,
                            "maximum": 10,
                            "description": "Tension level 1-10",
                        },
                    },
                    "required": ["level"],
                }
            },
        }
    },
]

TOOL_EXECUTORS: dict[str, callable] = {}


def _register(name: str):
    def wrapper(fn: callable) -> callable:
        TOOL_EXECUTORS[name] = fn
        return fn
    return wrapper


@_register("roll_dice")
def _exec_roll_dice(input_data: dict, player_state: dict, **kwargs) -> str:
    stat = input_data.get("stat", "strength")
    dc = input_data.get("difficulty_class", 10)
    modifier = input_data.get("modifier", 0)

    stat_key = f"{stat}_score"
    stat_value = player_state.get(stat_key, 10)
    stat_mod = math.floor((stat_value - 10) / 2)

    roll = random.randint(1, 20)
    total = roll + stat_mod + modifier

    if roll == 20:
        outcome = "CRITICAL SUCCESS"
    elif roll == 1:
        outcome = "CRITICAL FAILURE"
    elif total >= dc:
        outcome = "SUCCESS"
    else:
        outcome = "FAILURE"

    return (
        f"d20 roll: {roll} + {stat_mod} ({stat}) + {modifier} (bonus) = "
        f"{total} vs DC {dc} → {outcome}"
    )


@_register("award_xp")
def _exec_award_xp(input_data: dict, **kwargs) -> str:
    amount = input_data.get("amount", 0)
    reason = input_data.get("reason", "")
    return f"Awarded {amount} XP. Reason: {reason}"


@_register("modify_hp")
def _exec_modify_hp(input_data: dict, **kwargs) -> str:
    amount = input_data.get("amount", 0)
    reason = input_data.get("reason", "")
    direction = "healed" if amount > 0 else "damaged"
    return f"Player {direction} by {abs(amount)} HP. Reason: {reason}"


@_register("update_quest")
def _exec_update_quest(input_data: dict, **kwargs) -> str:
    qid = input_data.get("quest_id", "")
    status = input_data.get("status", "in_progress")
    return f"Quest {qid} set to status: {status}"


@_register("set_world_flag")
def _exec_set_world_flag(input_data: dict, **kwargs) -> str:
    flag = input_data.get("flag", "")
    value = input_data.get("value", "")
    return f"World flag set: {flag} = {value}"


@_register("grant_item")
def _exec_grant_item(input_data: dict, **kwargs) -> str:
    item = input_data.get("item_name", "")
    qty = input_data.get("quantity", 1)
    return f"Granted {qty}x {item} to player inventory"


@_register("transfer_area")
def _exec_transfer_area(input_data: dict, **kwargs) -> str:
    aid = input_data.get("area_id", "")
    name = input_data.get("area_name", "")
    return f"Player transferred to area {aid}: {name}"


@_register("set_tension")
def _exec_set_tension(input_data: dict, **kwargs) -> str:
    level = input_data.get("level", 5)
    return f"Tension level set to {level}/10"


def get_tool_specs() -> list[dict]:
    return TOOL_SPECS


def execute_tool(name: str, input_data: dict, player_state: dict | None = None) -> str:
    fn = TOOL_EXECUTORS.get(name)
    if fn is None:
        return f"Unknown tool: {name}"
    return fn(input_data=input_data, player_state=player_state or {})
