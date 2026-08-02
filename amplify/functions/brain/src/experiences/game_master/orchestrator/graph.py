"""LangGraph orchestrator for the Game Master.

Flow (per the initial spec):

    bootstrap → (opening_narrative | intent) → <game mode> → finalize

The first turn routes through `opening_narrative` to set the scene; every later
turn goes through intent classification and then a single gameplay mode.
Modes share no tool-loop; each resolves deterministic state first, then narrates.
"""

from __future__ import annotations

import logging

from langgraph.graph import END, StateGraph

from experiences.game_master.orchestrator.intent import (  # noqa: F401
    CHARACTER_MODE,
    COMBAT_MODE,
    DIALOGUE_MODE,
    EXPLORATION_MODE,
    INVENTORY_MODE,
    NARRATION_MODE,
    QUEST_MODE,
    classify_intent,
)
from experiences.game_master.orchestrator.nodes import (
    ORCHESTRATOR_SYSTEM_PROMPT,
    bootstrap_node,
    character_node,
    combat_node,
    dialogue_node,
    exploration_node,
    finalize_node,
    intent_node,
    inventory_node,
    narration_node,
    opening_narrative_node,
    quest_node,
)
from experiences.game_master.orchestrator.state import OrchestratorState

logger = logging.getLogger(__name__)


def _route_after_bootstrap(state: OrchestratorState) -> str:
    campaign = state.get("campaign", {})
    return "opening_narrative" if not campaign.get("started") else "intent"


def _route_after_intent(state: OrchestratorState) -> str:
    return state.get("intent", NARRATION_MODE)


def build_agent() -> object:
    builder = StateGraph(OrchestratorState)

    builder.add_node("bootstrap", bootstrap_node)
    builder.add_node("opening_narrative", opening_narrative_node)
    builder.add_node("intent", intent_node)
    builder.add_node(DIALOGUE_MODE, dialogue_node)
    builder.add_node(EXPLORATION_MODE, exploration_node)
    builder.add_node(COMBAT_MODE, combat_node)
    builder.add_node(INVENTORY_MODE, inventory_node)
    builder.add_node(QUEST_MODE, quest_node)
    builder.add_node(CHARACTER_MODE, character_node)
    builder.add_node(NARRATION_MODE, narration_node)
    builder.add_node("finalize", finalize_node)

    builder.set_entry_point("bootstrap")
    builder.add_conditional_edges(
        "bootstrap",
        _route_after_bootstrap,
        {"opening_narrative": "opening_narrative", "intent": "intent"},
    )
    builder.add_edge("opening_narrative", "finalize")
    builder.add_conditional_edges(
        "intent",
        _route_after_intent,
        {
            DIALOGUE_MODE: DIALOGUE_MODE,
            EXPLORATION_MODE: EXPLORATION_MODE,
            COMBAT_MODE: COMBAT_MODE,
            INVENTORY_MODE: INVENTORY_MODE,
            QUEST_MODE: QUEST_MODE,
            CHARACTER_MODE: CHARACTER_MODE,
            NARRATION_MODE: NARRATION_MODE,
        },
    )
    for mode in (DIALOGUE_MODE, EXPLORATION_MODE, COMBAT_MODE, INVENTORY_MODE,
                 QUEST_MODE, CHARACTER_MODE, NARRATION_MODE):
        builder.add_edge(mode, "finalize")
    builder.add_edge("finalize", END)

    compiled = builder.compile()
    logger.info("Game Master orchestrator graph compiled")
    return compiled


def classify_and_prepare(
    user_input: str,
    conversation_id: str,
    message_id: str | None,
    owner: str | None,
    store: object,
    model_id: str,
    region: str,
) -> dict:
    """Build the seed state for one turn. Callers then `agent.invoke`/`.stream`."""
    intent = classify_intent(user_input)
    return {
        "conversation_id": conversation_id,
        "player_id": "",
        "owner": owner,
        "user_input": user_input or "",
        "system_prompt": ORCHESTRATOR_SYSTEM_PROMPT,
        "model_id": model_id,
        "region": region,
        "store": store,
        "player": {},
        "campaign": {},
        "intent": intent,
        "facts": [],
        "final_message": "",
    }