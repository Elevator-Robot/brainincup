"""Typed state flowing through the Game Master orchestrator graph."""

from __future__ import annotations

from typing import Any, TypedDict


class OrchestratorState(TypedDict, total=False):
    # identity
    conversation_id: str
    player_id: str
    owner: str | None
    user_input: str

    # context / wiring
    system_prompt: str
    model_id: str
    region: str
    store: Any

    # authoritative session objects (loaded in bootstrap)
    player: dict
    campaign: dict

    # routing
    intent: str
    target_npc_id: str | None

    # per-turn facts the narration should describe (deterministic outputs)
    facts: list[str]

    # streaming / output
    opened: bool
    final_message: str
    response_metadata: dict[str, Any]