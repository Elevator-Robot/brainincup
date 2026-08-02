from __future__ import annotations

import logging
import os
import uuid
from collections.abc import Generator
from typing import Any

from experiences.agui import run_error, run_finished, run_started
from experiences.base import BaseExperience, ExperienceContext, ExperienceResponse
from experiences.game_master.orchestrator import classify_and_prepare
from experiences.game_master.orchestrator.persistence import OrchestrationStore

logger = logging.getLogger(__name__)

_AGENT = None


def _get_agent():
    global _AGENT
    if _AGENT is None:
        from experiences.game_master.orchestrator import build_agent
        _AGENT = build_agent()
    return _AGENT


class GameMasterExperience(BaseExperience):
    """Game Master experience — an immersive RPG narrator.

    The GM is orchestrated by a LangGraph that routes each player message to a
    deterministic gameplay system (combat, inventory, quests, exploration) and
    uses the LLM *only* to narrate and roleplay. Rules and persistence belong to
    the deterministic systems; the LLM never invents or mutates persisted state.
    """

    def __init__(self, experience_id: str = "game_master", **kwargs: Any):
        super().__init__(experience_id)
        self._prompt: str | None = None
        self._tool_policy: dict | None = None
        self._dynamodb_resource = kwargs.get("dynamodb_resource")
        self._dynamodb_client = kwargs.get("dynamodb_client")

    @property
    def display_name(self) -> str:
        return "Game Master"

    def get_system_prompt(self) -> str:
        from experiences.game_master.orchestrator.nodes import ORCHESTRATOR_SYSTEM_PROMPT
        if not self._prompt:
            self._prompt = ORCHESTRATOR_SYSTEM_PROMPT
        return self._prompt

    def get_tool_policy(self) -> dict[str, Any]:
        return {"tools": [], "permissions": {}}  # deterministic systems, not LLM tools

    def process_message(self, ctx: ExperienceContext) -> ExperienceResponse:
        try:
            result = self._run_turn(ctx)
            return ExperienceResponse(
                response=result.get("final_message") or "The world waits for you.",
                raw=result,
                metadata={"intent": result.get("intent", "narration")},
            )
        except Exception as exc:
            logger.error("Game Master turn failed: %s", exc, exc_info=True)
            return ExperienceResponse(
                response="The Game Master is momentarily unavailable. The world holds its breath...",
                metadata={"error": str(exc)},
            )

    def _store(self) -> OrchestrationStore:
        return OrchestrationStore(
            resource=self._dynamodb_resource,
            client=self._dynamodb_client,
        )

    def _run_turn(self, ctx: ExperienceContext) -> dict:
        agent = _get_agent()
        state = classify_and_prepare(
            user_input=ctx.user_input or "",
            conversation_id=ctx.conversation_id,
            message_id=ctx.message_id,
            owner=ctx.owner,
            store=self._store(),
            model_id=os.environ.get(
                "BEDROCK_MODEL_ID",
                "us.anthropic.claude-haiku-4-5-20251001-v1:0",
            ),
            region=os.environ.get("AWS_REGION", "us-east-1"),
        )
        result = agent.invoke(state)
        return result

    def stream_message(self, ctx: ExperienceContext) -> Generator[dict, None, None]:
        """Run the orchestrator and yield AG-UI events in real time.

        Deterministic systems run synchronously; each mode node streams its
        narration as TEXT_MESSAGE tokens before finalize emits `response_complete`.
        """
        run_id = str(uuid.uuid4())
        yield run_started(ctx.conversation_id, run_id=run_id, input_data={"messageId": ctx.message_id})

        try:
            agent = _get_agent()
            state = classify_and_prepare(
                user_input=ctx.user_input or "",
                conversation_id=ctx.conversation_id,
                message_id=ctx.message_id,
                owner=ctx.owner,
                store=self._store(),
                model_id=os.environ.get(
                    "BEDROCK_MODEL_ID",
                    "us.anthropic.claude-haiku-4-5-20251001-v1:0",
                ),
                region=os.environ.get("AWS_REGION", "us-east-1"),
            )
            for event in agent.stream(state, stream_mode="custom"):
                yield event
            yield run_finished(ctx.conversation_id, run_id)
        except Exception as exc:
            logger.error("GM orchestrator stream failed: %s", exc, exc_info=True)
            yield run_error(str(exc), code="GM_STREAM_ERROR")