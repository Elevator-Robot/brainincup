from __future__ import annotations

import json
import logging
import os
from typing import Any

from experiences.base import BaseExperience, ExperienceContext, ExperienceResponse
from experiences.game_master.tools import get_tool_policy
from experiences.game_master.memory import load_player_state

logger = logging.getLogger(__name__)


def _try_parse_json_response(raw_text: str) -> dict | None:
    text = raw_text.strip()
    if text.startswith("```"):
        end = text.find("```", 3)
        if end != -1:
            text = text[3:end].strip()
        else:
            text = text[3:].strip()
    if text.startswith("json"):
        text = text[4:].strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return None


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
        """Process a message through the Game Master pipeline.

        Assembles enriched game context (PlayerState, WorldState, pacing,
        active scenario, eligible surprises), appends a [GAME_CONTEXT] block
        to the user message, invokes Bedrock directly, parses the structured
        JSON response, applies game events, and persists the response.
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
        """Execute the full GM pipeline: context assembly, LLM invoke, event processing."""
        player_state = load_player_state(self._dynamodb_client, ctx.conversation_id)

        game_context = self._assemble_game_context(player_state)

        game_context_block = (
            "\n\n[GAME_CONTEXT]\n"
            + json.dumps({"gameContext": game_context}, indent=2)
            + "\n[/GAME_CONTEXT]"
        )
        prompt = (ctx.user_input or "") + game_context_block

        agent_response = self._invoke_bedrock(prompt, ctx.conversation_id)

        return ExperienceResponse(
            response=agent_response.get("response", "The world shifts around you, but the vision fades before it fully forms..."),
            raw=agent_response,
            metadata={
                "sensations": agent_response.get("sensations", []),
                "thoughts": agent_response.get("thoughts", []),
                "memories": agent_response.get("memories", ""),
                "self_reflection": agent_response.get("self_reflection", ""),
                "xp_award": agent_response.get("xp_award", 0),
                "hp_change": agent_response.get("hp_change", 0),
                "quest_step_advance": agent_response.get("quest_step_advance"),
                "quest_complete": agent_response.get("quest_complete"),
                "quest_fail": agent_response.get("quest_fail"),
                "world_flags_set": agent_response.get("world_flags_set", {}),
                "dice_roll_request": agent_response.get("dice_roll_request"),
                "tension_level": agent_response.get("tension_level"),
                "area_transition": agent_response.get("area_transition"),
                "current_location": agent_response.get("current_location"),
                "item_grant": agent_response.get("item_grant", []),
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

    def _invoke_bedrock(self, prompt: str, conversation_id: str) -> dict:
        """Invoke Bedrock directly with the enriched prompt."""
        from core.bedrock_direct_client import BedrockDirectClient

        model_id = os.environ.get(
            "BEDROCK_MODEL_ID",
            "us.anthropic.claude-haiku-4-5-20251001-v1:0",
        )
        region = os.environ.get("AWS_REGION", "us-east-1")
        client = BedrockDirectClient(model_id=model_id, region_name=region)

        payload = {
            "prompt": prompt,
            "persona": {
                "name": self.get_system_prompt(),
                "temperature": 0.95,
                "top_p": 0.92,
            },
        }

        try:
            result = client.invoke(
                session_id=conversation_id,
                payload=payload,
            )
            raw_text = result.get("response", "")

            parsed = _try_parse_json_response(raw_text)
            if parsed is not None:
                return {
                    "response": parsed.get("response", raw_text),
                    "sensations": parsed.get("sensations", []),
                    "thoughts": parsed.get("thoughts", []),
                    "memories": parsed.get("memories", ""),
                    "self_reflection": parsed.get("self_reflection", ""),
                    "xp_award": parsed.get("xp_award", 0),
                    "hp_change": parsed.get("hp_change", 0),
                    "quest_step_advance": parsed.get("quest_step_advance"),
                    "quest_complete": parsed.get("quest_complete"),
                    "quest_fail": parsed.get("quest_fail"),
                    "world_flags_set": parsed.get("world_flags_set", {}),
                    "dice_roll_request": parsed.get("dice_roll_request"),
                    "tension_level": parsed.get("tension_level"),
                    "area_transition": parsed.get("area_transition"),
                    "current_location": parsed.get("current_location"),
                    "item_grant": parsed.get("item_grant", []),
                }

            response_text = result.get("response", "")
            if not response_text:
                response_text = "The world shifts around you, but the vision fades before it fully forms..."
            return {
                "response": response_text,
                "sensations": result.get("sensations", []),
                "thoughts": result.get("thoughts", []),
                "memories": result.get("memories", ""),
                "self_reflection": result.get("self_reflection", ""),
                "xp_award": result.get("xp_award", 0),
                "hp_change": result.get("hp_change", 0),
                "quest_step_advance": result.get("quest_step_advance"),
                "quest_complete": result.get("quest_complete"),
                "quest_fail": result.get("quest_fail"),
                "world_flags_set": result.get("world_flags_set", {}),
                "dice_roll_request": result.get("dice_roll_request"),
                "tension_level": result.get("tension_level"),
                "area_transition": result.get("area_transition"),
                "current_location": result.get("current_location"),
                "item_grant": result.get("item_grant", []),
            }
        except Exception as exc:
            logger.error("Bedrock invocation failed: %s", exc, exc_info=True)
            return {
                "response": f"The Game Master is momentarily unavailable. (Error: {type(exc).__name__})",
                "sensations": [],
                "thoughts": [],
                "memories": "",
                "self_reflection": "",
                "xp_award": 0,
                "hp_change": 0,
                "quest_step_advance": None,
                "quest_complete": None,
                "quest_fail": None,
                "world_flags_set": {},
                "dice_roll_request": None,
                "tension_level": None,
                "area_transition": None,
                "current_location": None,
                "item_grant": [],
            }
