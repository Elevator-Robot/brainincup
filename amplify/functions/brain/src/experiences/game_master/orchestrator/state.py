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
    memory: Any  # MemoryService (AgentCore-backed episodic memory)

    # authoritative session objects (loaded in bootstrap)
    player: dict
    campaign: dict

    # routing
    intent: str
    game_mode: str
    target_npc_id: str | None

    # episodic memory (AgentCore), injected into the narration prompt
    memory_context: str

    # per-turn facts the narration should describe (deterministic outputs)
    facts: list[str]

    # streaming / output
    opened: bool
    final_message: str
    response_metadata: dict[str, Any]