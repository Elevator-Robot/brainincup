"""Deterministic pacing for the Game Master orchestrator.

The GM drives the story through the classic act structure — exposition →
rising action → climax → falling action → resolution — and keeps an eye on a
1–10 tension dial that it uses to decide *when* to advance. Everything here is
pure: it reads the current campaign pacing, a resolved game mode (the facts the
engine produced this turn), and returns the updated pacing fields.

Unlike the legacy `NarrativeExtractor` (which regex-scanned LLM prose), pacing
here is derived from *deterministic* signals — the routed game mode and the
outcome facts — so the math is stable and testable. The LLM never "decides" to
advance the act or bump tension; the engine does, from observable events.
"""

from __future__ import annotations

from typing import Optional

ACTS = ("EXPOSITION", "RISING_ACTION", "CLIMAX", "FALLING_ACTION", "RESOLUTION")

# How each resolved game mode moves the tension dial (1–10).
TENSION_DELTA = {
    "combat": +1,
    "check": 0,
    "dice": 0,
    "dialogue": -1,
    "exploration": 0,
    "inventory": -1,
    "quest": 0,
    "character": -1,
    "narration": 0,
}

# Conflict-ish modes that reset the "turns since a beat" counter.
BEAT_MODES = {"combat", "exploration", "check", "dice", "quest"}


def default_pacing() -> dict:
    return {
        "currentAct": "EXPOSITION",
        "currentChapter": 1,
        "tensionLevel": 3,
        "turnsInChapter": 0,
        "turnsSinceBeat": 0,
        "timeline": [],
    }


def apply_pacing(campaign: dict, game_mode: str, landmark: Optional[str] = None) -> dict:
    """Advance pacing for one resolved turn. Returns the updated pacing dict.

    Args:
        campaign: the loaded campaign dict (may carry existing pacing).
        game_mode: the resolved orchestrator mode for this turn.
        landmark: optional "story landmark" (e.g. a milestone id) that the
            engine observed this turn. Non-None counts as a story beat.
    """
    # Precedence: existing nested pacing > legacy flat columns > defaults.
    pacing = dict(campaign.get("pacing") or {})
    for key, fallback in (
        ("currentAct", "EXPOSITION"),
        ("currentChapter", 1),
        ("tensionLevel", 3),
        ("timeline", []),
    ):
        if key not in pacing:
            value = campaign.get(key, fallback)
            pacing[key] = value if value is not None else fallback
    pacing.setdefault("turnsInChapter", 0)
    pacing.setdefault("turnsSinceBeat", 0)

    turns = int(pacing.get("turnsInChapter", 0)) + 1
    beats = int(pacing.get("turnsSinceBeat", 0)) + 1

    delta = TENSION_DELTA.get(game_mode, 0)
    if landmark:
        delta += 1  # a milestone resolves into palpable momentum
    tension = max(1, min(10, int(pacing["tensionLevel"]) + delta))

    act = pacing["currentAct"]
    chapter = int(pacing["currentChapter"])

    # Beat counter drives act/chapter breaks.
    if game_mode in BEAT_MODES or landmark:
        beats = 0

    act, chapter, turns = _advance(act, chapter, tension, turns, beats)

    timeline = list(pacing.get("timeline") or [])
    if landmark:
        timeline = (timeline + [landmark])[-20:]

    pacing.update({
        "currentAct": act,
        "currentChapter": chapter,
        "tensionLevel": tension,
        "turnsInChapter": turns,
        "turnsSinceBeat": beats,
        "timeline": timeline,
    })
    return pacing


def _advance(act: str, chapter: int, tension: int, turns: int, beats: int) -> tuple[str, int, int]:
    """Actily move through the act chart; return (act, chapter, turnsInChapter)."""
    # Chapter break: scale with activity.
    if beats >= 6 or turns >= 12:
        chapter += 1
        turns = 0

    if act == "EXPOSITION" and (turns >= 4 or tension >= 5):
        return "RISING_ACTION", chapter, turns
    if act == "RISING_ACTION" and tension >= 8:
        return "CLIMAX", chapter, turns
    if act == "CLIMAX" and tension <= 5:
        return "FALLING_ACTION", chapter + 1, 0
    if act == "FALLING_ACTION" and (turns >= 6 or tension <= 3):
        return "RESOLUTION", chapter, turns
    return act, chapter, turns


def pacing_snapshot(pacing: dict) -> dict:
    """Shaped view for the frontend banner / sidebar."""
    return {
        "act": pacing.get("currentAct"),
        "chapter": pacing.get("currentChapter"),
        "tension": pacing.get("tensionLevel"),
        "landmarks": list(pacing.get("timeline") or [])[-5:],
    }