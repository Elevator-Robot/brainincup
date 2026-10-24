from __future__ import annotations

import logging
from pathlib import Path
from typing import Any
import uuid

from core.errors import TECHNICAL_DIFFICULTIES_MESSAGE
from experiences.agui import custom_event, run_error, run_finished, run_started, text_message_start, text_message_content, text_message_end
from experiences.base import BaseExperience, ExperienceContext, ExperienceResponse
from experiences.brain.cognition.persistence import BrainStateStore
from experiences.brain.cognition.state import BrainModelError

logger = logging.getLogger(__name__)
_AGENT = None


def _get_agent():
    global _AGENT
    if _AGENT is None:
        from experiences.brain.cognition.graph import build_agent
        _AGENT = build_agent()
    return _AGENT


class BrainExperience(BaseExperience):
    """A single character voice, with stateful recall and bounded intentions."""

    def __init__(self, experience_id: str = "brain", **kwargs: Any):
        super().__init__(experience_id)
        self._prompt = None
        self._resource = kwargs.get("dynamodb_resource")
        # Explicit injection keeps unit tests and local simulations cloud-free.
        self._language = kwargs.get("language_agent")
        self._history = kwargs.get("history_service")
        self._state_store = kwargs.get("state_store")

    @property
    def display_name(self) -> str:
        return "Brain"

    def get_system_prompt(self) -> str:
        if self._prompt is None:
            self._prompt = Path(__file__).with_name("system_prompt.md").read_text().strip()
        return self._prompt

    def get_tool_policy(self) -> dict[str, Any]:
        # Recall/state services are internal graph nodes, not LLM-callable tools.
        return {"tools": [], "permissions": {}}

    def _prepare(self, ctx: ExperienceContext, *, streaming: bool) -> dict:
        language = self._language
        if language is None:
            from agents.language_agent import LanguageAgent
            from core.config import PERSONA_DEFINITIONS, setup_client
            language = LanguageAgent(setup_client(), PERSONA_DEFINITIONS["default"])
        history = self._history
        if history is None:
            from agents.memory_agent import MemoryAgent
            history = MemoryAgent(ctx.conversation_id)
        return {
            "ctx": ctx, "language": language, "history_service": history,
            "store": self._state_store if self._state_store is not None else BrainStateStore(self._resource),
            "system_prompt": self.get_system_prompt(), "streaming": streaming,
        }

    def process_message(self, ctx: ExperienceContext) -> ExperienceResponse:
        try:
            result = _get_agent().invoke(self._prepare(ctx, streaming=False), {"recursion_limit": 16})
            return ExperienceResponse(response=result["reply"]["response"], raw=result["reply"], metadata=result["metadata"])
        except Exception:
            logger.exception("Brain graph turn failed")
            return ExperienceResponse(response=TECHNICAL_DIFFICULTIES_MESSAGE, metadata={
                "sensations": [], "thoughts": [], "memories": "", "self_reflection": "", "error": True,
            })

    def stream_message(self, ctx: ExperienceContext):
        run_id = ctx.run_id or str(uuid.uuid4())
        yield run_started(ctx.conversation_id, run_id=run_id, input_data={"messageId": ctx.message_id})
        try:
            for event in _get_agent().stream(self._prepare(ctx, streaming=True), {"recursion_limit": 16}, stream_mode="custom"):
                yield event
            yield run_finished(ctx.conversation_id, run_id)
        except Exception as error:
            logger.exception("Brain graph stream failed")
            mid = str(uuid.uuid4())
            yield text_message_start(mid)
            yield text_message_content(mid, TECHNICAL_DIFFICULTIES_MESSAGE)
            yield text_message_end(mid)
            if isinstance(error, BrainModelError):
                # Preserve a terminal transport response so reloading does not
                # leave the user's message awaiting an answer forever. This is
                # not a cognitive-memory commit. Access/reset conflicts must
                # never produce a persistence event.
                yield custom_event("response_complete", {"response": TECHNICAL_DIFFICULTIES_MESSAGE, "metadata": {
                    "sensations": [], "thoughts": [], "memories": "", "self_reflection": "",
                    "error": True, "brain_state_persisted": False,
                }})
            yield run_error(TECHNICAL_DIFFICULTIES_MESSAGE, code="BRAIN_GRAPH_ERROR")
