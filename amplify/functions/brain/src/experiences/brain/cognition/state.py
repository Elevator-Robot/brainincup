"""JSON-safe character state, with explicit provenance and bounded growth.

These values model a fictional character, not consciousness or user psychology.
"""
from __future__ import annotations

import copy
import math
import re
from typing import Any, TypedDict

MOODS = {"curious", "settled", "reflective", "concerned", "playful"}
MAX_MEMORIES = 16
MAX_EPISODES = 8
MAX_RECEIPTS = 4


class BrainModelError(ValueError):
    """Inference/format failure, distinct from ownership and revision failures."""


def text(value: Any, limit: int) -> str:
    return value.strip()[:limit] if isinstance(value, str) else ""


def number(value: Any, default: float) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        return default
    return max(0.0, min(1.0, float(value)))


def normalized(value: str) -> str:
    return " ".join(value.casefold().split())


def initial_persona() -> dict:
    return {
        "schema_version": 1, "mood": "curious", "arousal": .25,
        "curiosity": .65, "turn_count": 0, "last_intention": "respond",
        "user_memories": [], "episodes": [], "unresolved_questions": [],
    }


def normalize_persona(raw: Any) -> dict:
    result = initial_persona()
    if not isinstance(raw, dict) or raw.get("schema_version") != 1:
        return result
    if isinstance(raw.get("mood"), str) and raw["mood"] in MOODS:
        result["mood"] = raw["mood"]
    for key in ("arousal", "curiosity"):
        result[key] = number(raw.get(key), result[key])
    count = raw.get("turn_count")
    if isinstance(count, int) and not isinstance(count, bool):
        result["turn_count"] = max(0, min(10_000_000, count))
    result["last_intention"] = text(raw.get("last_intention"), 20) or "respond"
    memories = raw.get("user_memories", [])
    if isinstance(memories, list):
        for item in memories[-MAX_MEMORIES:]:
            if isinstance(item, dict) and item.get("source") == "user_reported":
                quote = text(item.get("quote"), 280)
                if quote:
                    result["user_memories"].append({"quote": quote, "source": "user_reported", "message_id": text(item.get("message_id"), 160)})
    episodes = raw.get("episodes", [])
    if isinstance(episodes, list):
        for item in episodes[-MAX_EPISODES:]:
            if isinstance(item, dict):
                result["episodes"].append({
                    "user_input": text(item.get("user_input"), 400),
                    "response": text(item.get("response"), 600),
                    "message_id": text(item.get("message_id"), 160),
                    "source": "shared_conversation",
                })
    questions = raw.get("unresolved_questions", [])
    if isinstance(questions, list):
        result["unresolved_questions"] = list(dict.fromkeys(text(q, 180) for q in questions if text(q, 180)))[-4:]
    return result


def choose_intention(user_input: str) -> str:
    value = normalized(user_input)
    if value in {"", "?", "??", "huh", "huh?", "what do you mean", "what do you mean?", "can you clarify?"}:
        return "clarify"
    if re.search(r"\b(remember|recall|last time|we talked|we discussed|you mentioned|i told you|my name|my preferences)\b", value):
        return "recollect"
    if re.search(r"\b(conscious|consciousness|your existence|who are you|are you alive|how do you feel|your memories)\b", value):
        return "reflect"
    return "respond"


def appraise(persona: dict, user_input: str, intention: str) -> dict:
    """Gentle deterministic drift; a greeting does not trigger a dramatic mood."""
    return {
        "mood": "reflective" if intention == "reflect" else persona["mood"],
        "arousal": persona["arousal"] + (.25 - persona["arousal"]) * .1,
        "curiosity": persona["curiosity"] + (.03 if "?" in user_input else (.65 - persona["curiosity"]) * .1),
    }


def integrate(persona: dict, proposed: Any, appraisal: dict, *, user_input: str, response: str, message_id: str, intention: str) -> dict:
    updated = copy.deepcopy(persona)
    patch = proposed if isinstance(proposed, dict) else {}
    mood = patch.get("mood", appraisal["mood"])
    updated["mood"] = mood if isinstance(mood, str) and mood in MOODS else persona["mood"]
    for key in ("arousal", "curiosity"):
        target = number(patch.get(key), number(appraisal[key], persona[key]))
        updated[key] = round(max(0, min(1, persona[key] + max(-.08, min(.08, target - persona[key])))), 4)
    updated["turn_count"] += 1
    updated["last_intention"] = intention
    # Store only verbatim user evidence, never model-written biographies or
    # the character's imagined recollections of having a body.
    candidates = patch.get("remember_quotes", [])
    if isinstance(candidates, list):
        for candidate in candidates[:4]:
            if not isinstance(candidate, str) or len(candidate.strip()) > 280:
                continue
            quote = text(candidate, 280)
            if len(quote) < 8 or normalized(quote) not in normalized(user_input):
                continue
            updated["user_memories"] = [m for m in updated["user_memories"] if normalized(m["quote"]) != normalized(quote)]
            updated["user_memories"].append({"quote": quote, "source": "user_reported", "message_id": message_id})
    updated["user_memories"] = updated["user_memories"][-MAX_MEMORIES:]
    existing = updated["unresolved_questions"]
    resolved = patch.get("resolved_questions", [])
    if isinstance(resolved, list):
        existing = [q for q in existing if not any(isinstance(r, str) and normalized(q) == normalized(r) for r in resolved[:4])]
    questions = patch.get("unresolved_questions", [])
    if isinstance(questions, list):
        for candidate in questions[:4]:
            question = text(candidate, 180)
            if question.endswith("?") and len(question) >= 8 and normalized(question) in normalized(user_input) and question not in existing:
                existing.append(question)
    updated["unresolved_questions"] = existing[-4:]
    updated["episodes"].append({"user_input": text(user_input, 400), "response": text(response, 600), "message_id": message_id, "source": "shared_conversation"})
    updated["episodes"] = updated["episodes"][-MAX_EPISODES:]
    return updated


def public_state(persona: dict, intention: str) -> dict:
    return {key: persona[key] for key in ("mood", "arousal", "curiosity", "turn_count")} | {"intention": intention}


class BrainTurn(TypedDict, total=False):
    ctx: Any
    store: Any
    history_service: Any
    language: Any
    system_prompt: str
    streaming: bool
    snapshot: Any
    prior: dict
    appraisal: dict
    intention: str
    context: str
    recalled: dict
    prompt: str
    raw_response: Any
    reply: dict
    metadata: dict
    replayed: bool
