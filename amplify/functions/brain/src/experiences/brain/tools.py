from __future__ import annotations

from typing import Any


def get_tool_policy() -> dict[str, Any]:
    return {
        "tools": [
            "search",
            "philosophy",
            "journals",
            "memory",
            "reflection",
        ],
        "permissions": {
            "search": {"read": True, "write": False},
            "philosophy": {"read": True, "write": False},
            "journals": {"read": True, "write": True},
            "memory": {"read": True, "write": True},
            "reflection": {"read": True, "write": True},
        },
    }
