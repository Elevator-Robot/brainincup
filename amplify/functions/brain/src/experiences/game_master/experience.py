from __future__ import annotations

import logging
import os
from typing import Any

from experiences.base import BaseExperience, ExperienceContext, ExperienceResponse
from experiences.game_master.gm_agent import build_gm_agent, GMAgentState
from experiences.game_master.memory import load_player_state
from experiences.game_master.tools import get_tool_policy

logger = logging.getLogger(__name__)

_GM_AGENT = None


def _get_gm_agent():
    global _GM_AGENT
    if _GM_AGENT is None:
        _GM_AGENT = build_gm_agent()
    return _GM_AGENT


class GameMasterExperience(BaseExperience):
    """Game Master experience — an immersive RPG narrator and
    world simulator with persistent campaigns, character progression,
    quest tracking, dice-based stat checks, and pacing-driven narrative.
    """

    def __init__(self, experience_id: str = "game_master", **kwargs: Any):
        super().__init__(experience_id)
        self._prompt: str | None = None
        self._tool_policy: dict | None = None
        self._dynamodb_resource = kwargs.get("dynamodb_resource")
        self._dynamodb_client = kwargs.get("dynamodb_client")
        self._appsync_client = kwargs.get("appsync_client")

    @property
    def display_name(self) -> str:
        return "Game Master"

    def get_system_prompt(self) -> str:
        if not self._prompt:
            prompt_path = os.path.join(
                os.path.dirname(__file__), "system_prompt.md"
            )
            try:
                with open(prompt_path) as f:
                    self._prompt = f.read().strip()
            except FileNotFoundError:
                self._prompt = "You are the Game Master, narrating an immersive RPG adventure."
        return self._prompt

    def get_tool_policy(self) -> dict[str, Any]:
        if not self._tool_policy:
            self._tool_policy = get_tool_policy()
        return self._tool_policy

    def process_message(self, ctx: ExperienceContext) -> ExperienceResponse:
        """Process a message through the LangGraph Game Master agent.

        Assembles enriched game context, invokes the agent graph (which
        may call tools like roll_dice, update_quest, etc. in a loop),
        then returns the final narrative response.
        """
        logger.info(
            "Game Master experience processing message",
            extra={"conversation_id": ctx.conversation_id},
        )

        try:
            return self._run_gm_pipeline(ctx)
        except Exception as exc:
            logger.error(
                "Game Master pipeline failed: %s", exc, exc_info=True
            )
            return ExperienceResponse(
                response="The Game Master is momentarily unavailable. The world holds its breath...",
                metadata={"error": str(exc)},
            )

    def _run_gm_pipeline(self, ctx: ExperienceContext) -> ExperienceResponse:
        """Execute the GM agent graph: context assembly → agent loop → response."""
        player_state = load_player_state(self._dynamodb_client, ctx.conversation_id)
        game_context = self._assemble_game_context(player_state)

        model_id = os.environ.get(
            "BEDROCK_MODEL_ID",
            "us.anthropic.claude-haiku-4-5-20251001-v1:0",
        )
        region = os.environ.get("AWS_REGION", "us-east-1")

        agent = _get_gm_agent()

        initial_state: GMAgentState = {
            "conversation_id": ctx.conversation_id,
            "user_input": ctx.user_input or "",
            "player_state": player_state,
            "game_context": game_context,
            "system_prompt": self.get_system_prompt(),
            "messages": [],
            "final_response": "",
            "response_metadata": {},
            "model_id": model_id,
            "region": region,
            "tool_call_count": 0,
        }

        result = agent.invoke(initial_state)

        response_text = result.get("final_response", "")
        if not response_text:
            response_text = "The world shifts around you, but the vision fades before it fully forms..."

        return ExperienceResponse(
            response=response_text,
            raw=result,
            metadata={
                "model_id": model_id,
                "tool_calls": sum(
                    1 for m in result.get("messages", [])
                    if isinstance(m.get("content"), list)
                    and any(
                        isinstance(b, dict) and b.get("type") == "tool_use"
                        for b in m["content"]
                    )
                ),
            },
        )

    def _assemble_game_context(self, player_state: dict) -> dict:
        """Assemble the game context dict from player state."""
        return {
            "character": {
                "level": player_state.get("currentLevel", 1),
                "currentHP": player_state.get("currentHP", 20),
                "maxHP": player_state.get("maxHP", 20),
                "xp": player_state.get("currentXP", 0),
                "xpToNextLevel": player_state.get("xpToNextLevel", 100),
            },
            "location": {
                "currentAreaId": player_state.get("currentAreaId", "area_shrouded_vale"),
                "displayName": player_state.get("lastKnownLocation", "The Shrouded Vale"),
            },
            "activeQuests": [
                {"id": qid}
                for qid in (player_state.get("activeQuestIds") or [])
            ],
            "pendingDiceRoll": player_state.get("pendingDiceRoll"),
        }
