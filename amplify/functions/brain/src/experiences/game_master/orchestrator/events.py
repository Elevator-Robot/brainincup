"""Versioned, player-visible facts. Never parse events out of model prose."""

from __future__ import annotations

import hashlib

# A vocabulary for future systems, not a claim that every mechanic exists.
EVENT_KINDS = frozenset({
    "scene", "stage", "character", "choice", "dialogue", "discovery",
    "quest", "check", "combat", "damage", "healing", "condition",
    "inventory", "reward", "level", "rest", "consequence",
})


def event(kind: str, title: str, detail: str, **data) -> dict:
    if kind not in EVENT_KINDS:
        raise ValueError(f"Unknown RPG event kind: {kind}")
    return {"version": 1, "kind": kind, "title": title, "detail": detail, "data": data}


def identify(events: list[dict], conversation_id: str, message_id: str) -> list[dict]:
    """Stable IDs reconcile replay, SSE, persistence and history hydration."""
    prefix = hashlib.sha256(f"{conversation_id}:{message_id}".encode()).hexdigest()[:24]
    return [{**item, "id": f"{prefix}:{index}"} for index, item in enumerate(events)]


def changes(before_player: dict, player: dict, before_campaign: dict, campaign: dict) -> list[dict]:
    result = []
    if campaign.get("currentLocation") != before_campaign.get("currentLocation"):
        from .content import resolve_location
        location = resolve_location(campaign.get("currentLocation"))
        result.append(event("scene", location["name"], "You arrive at a new location.", locationId=location["id"]))
    quest = campaign.get("activeObjectives") or {}
    if quest != (before_campaign.get("activeObjectives") or {}):
        from .content import QUESTS, QUEST_ID
        definition = QUESTS[QUEST_ID]
        step = next((s for s in definition["steps"] if s["id"] == quest.get("step")), None)
        result.append(event("quest", definition["name"],
                            "Completed" if quest.get("status") == "COMPLETED" else
                            step["objective"] if step else "A lead is available at the Whispering Tankard.",
                            status=quest.get("status"), stepId=quest.get("step")))
    for field, kind, label in (("xp", "reward", "Experience"), ("gold", "reward", "Gold"),
                               ("level", "level", "Level"), ("current_hp", "damage", "Health")):
        old, new = int(before_player.get(field, 0)), int(player.get(field, 0))
        if old != new:
            if field == "current_hp" and new > old:
                kind = "healing"
            result.append(event(kind, label, f"{old} → {new} ({new - old:+d})", before=old, after=new))
    if player.get("inventory", []) != before_player.get("inventory", []):
        result.append(event("inventory", "Pack updated", "Your carried items have changed."))
    return result
