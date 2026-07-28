from __future__ import annotations

from typing import Any


def get_tool_policy() -> dict[str, Any]:
    return {
        "tools": [
            "dice",
            "inventory",
            "quests",
            "npc_generation",
            "combat",
            "world_state",
        ],
        "permissions": {
            "dice": {"read": True, "write": False},
            "inventory": {"read": True, "write": True},
            "quests": {"read": True, "write": True},
            "npc_generation": {"read": True, "write": False},
            "combat": {"read": True, "write": True},
            "world_state": {"read": True, "write": True},
        },
    }
