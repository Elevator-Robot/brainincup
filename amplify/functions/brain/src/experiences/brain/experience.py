from __future__ import annotations

import logging
import os
import uuid
from collections.abc import Generator
from typing import Any

from experiences.agui import (
    custom_event,
    reasoning_message_content,
    reasoning_message_end,
    reasoning_message_start,
    run_error,
    run_finished,
    run_started,
    state_snapshot,
    step_finished,
    step_started,
    text_message_content,
    text_message_end,
    text_message_start,
)
from experiences.base import BaseExperience, ExperienceContext, ExperienceResponse
from experiences.brain.tools import get_tool_policy
from experiences.brain.memory import save_conversation_memory

logger = logging.getLogger(__name__)


class BrainExperience(BaseExperience):
    """Brain experience — a reflective, philosophical AI companion."""

    def __init__(self, experience_id: str = "brain", **kwargs: Any):
        super().__init__(experience_id)
        self._prompt: str | None = None
        self._tool_policy: dict | None = None
        self._dynamodb_resource = kwargs.get("dynamodb_resource")

    @property
    def display_name(self) -> str:
        return "Brain"

    def get_system_prompt(self) -> str:
        if not self._prompt:
            prompt_path = os.path.join(
                os.path.dirname(__file__), "system_prompt.md"
            )
            try:
                with open(prompt_path) as f:
                    self._prompt = f.read().strip()
            except FileNotFoundError:
                self._prompt = "You are a helpful AI assistant."
        return self._prompt

    def get_tool_policy(self) -> dict[str, Any]:
        if not self._tool_policy:
            self._tool_policy = get_tool_policy()
        return self._tool_policy

    def process_message(self, ctx: ExperienceContext) -> ExperienceResponse:
        """Process a message through the Brain pipeline.

        Uses the 7-agent pipeline (perception → memory → reasoning →
        emotional → language → depth → self) to generate a response
        with sensations, thoughts, memories, and self-reflection.
        """
        logger.info(
            "Brain experience processing message",
            extra={"conversation_id": ctx.conversation_id},
        )

        try:
            from core.config import (
                setup_client,
                setup_prompt_template,
                setup_parser,
            )
            from agents import (
                PerceptionAgent,
                MemoryAgent,
                ReasoningAgent,
                EmotionalAgent,
                LanguageAgent,
                DepthAgent,
                SelfAgent,
            )
        except ImportError:
            return self._fallback_response(ctx)

        return self._run_agent_pipeline(
            ctx,
            setup_client,
            setup_prompt_template,
            setup_parser,
            PerceptionAgent,
            MemoryAgent,
            ReasoningAgent,
            EmotionalAgent,
            LanguageAgent,
            DepthAgent,
            SelfAgent,
        )

    def stream_message(self, ctx: ExperienceContext) -> Generator[dict, None, None]:
        """Run the Brain pipeline and yield AG-UI events in real time.

        The language stage streams the model's raw output token-by-token as
        REASONING_MESSAGE_* events (the Brain's stream of consciousness), then
        the parsed final response is emitted as TEXT_MESSAGE_*. A CUSTOM
        `response_complete` event carries the payload for persistence.
        """
        run_id = str(uuid.uuid4())
        yield run_started(ctx.conversation_id, run_id=run_id, input_data={"messageId": ctx.message_id})

        try:
            from core.config import (
                setup_client,
                setup_prompt_template,
                setup_parser,
            )
            from agents import (
                PerceptionAgent,
                MemoryAgent,
                ReasoningAgent,
                EmotionalAgent,
                LanguageAgent,
                DepthAgent,
                SelfAgent,
            )
        except ImportError:
            yield run_error("Cognitive modules unavailable", code="BRAIN_IMPORT_ERROR")
            yield run_finished(ctx.conversation_id, run_id, result={"response": ""})
            return

        try:
            prompt_template, persona_config = setup_prompt_template("default")
            parser = setup_parser()
            agentcore_client = setup_client()

            perception_agent = PerceptionAgent(
                prompt_template=prompt_template,
                persona_config=persona_config,
            )
            memory_agent = MemoryAgent(ctx.conversation_id)
            reasoning_agent = ReasoningAgent(parser)
            emotional_agent = EmotionalAgent()
            language_agent = LanguageAgent(agentcore_client, persona_config)
            depth_agent = DepthAgent()
            self_agent = SelfAgent()

            yield step_started("perception")
            context_turn_limit = self._read_int_env(
                "BRAIN_CONTEXT_MAX_TURNS", default=20, minimum=1, maximum=100
            )
            context_char_limit = self._read_int_env(
                "BRAIN_CONTEXT_MAX_CHARS", default=6000, minimum=500, maximum=30000
            )
            conversation_history = memory_agent.load_conversation_history()
            context = memory_agent.retrieve_context(
                conversation_history,
                n=context_turn_limit,
                max_chars=context_char_limit,
            )
            formatted_prompt = perception_agent.process_input(ctx.user_input, context)
            yield custom_event("context_loaded", {"contextChars": len(context or "")})
            yield step_finished("perception")

            yield step_started("memory")
            yield custom_event("memory", {"turns": len(conversation_history), "contextChars": len(context or "")})
            yield step_finished("memory")

            reasoning_id = str(uuid.uuid4())
            final_response: dict[str, Any] | None = None

            yield step_started("language")
            yield reasoning_message_start(reasoning_id)
            complete = None
            for chunk in language_agent.generate_response_stream(
                formatted_prompt,
                session_id=ctx.conversation_id,
                metadata={
                    "context": context,
                    "message_id": ctx.message_id,
                    "owner": ctx.owner,
                    "personality_mode": "brain",
                    "trace_id": str(uuid.uuid4()),
                },
            ):
                if chunk.get("type") == "delta":
                    yield reasoning_message_content(reasoning_id, chunk.get("text", ""))
                elif chunk.get("type") == "complete":
                    complete = chunk.get("response")
            yield reasoning_message_end(reasoning_id)

            parsed_response = reasoning_agent.analyze_input(complete or {}, context)
            emotional_response = emotional_agent.apply_emotions(parsed_response)
            enhanced_response = depth_agent.enhance_response(emotional_response)
            final_response = self_agent.review_response(enhanced_response)
            yield step_finished("language")

            response_text = (
                final_response.get("response", "")
                if isinstance(final_response, dict)
                else str(final_response)
            )

            text_id = str(uuid.uuid4())
            yield text_message_start(text_id)
            yield text_message_content(text_id, response_text)
            yield text_message_end(text_id)

            if isinstance(final_response, dict):
                yield state_snapshot(
                    {
                        "sensations": final_response.get("sensations", []),
                        "thoughts": final_response.get("thoughts", []),
                        "memories": final_response.get("memories", ""),
                        "self_reflection": final_response.get("self_reflection", ""),
                    }
                )
                yield custom_event(
                    "response_complete",
                    {
                        "response": response_text,
                        "metadata": {
                            "sensations": final_response.get("sensations", []),
                            "thoughts": final_response.get("thoughts", []),
                            "memories": final_response.get("memories", ""),
                            "self_reflection": final_response.get("self_reflection", ""),
                        },
                    },
                )
            else:
                yield custom_event(
                    "response_complete",
                    {"response": response_text, "metadata": {}},
                )

            yield run_finished(ctx.conversation_id, run_id, result={"response": response_text})
        except Exception as exc:
            logger.error("Brain streaming pipeline failed: %s", exc, exc_info=True)
            yield run_error(str(exc), code="BRAIN_STREAM_ERROR")
            yield run_finished(ctx.conversation_id, run_id)

    def _run_agent_pipeline(
        self,
        ctx: ExperienceContext,
        setup_client,
        setup_prompt_template,
        setup_parser,
        PerceptionAgent,
        MemoryAgent,
        ReasoningAgent,
        EmotionalAgent,
        LanguageAgent,
        DepthAgent,
        SelfAgent,
    ) -> ExperienceResponse:
        prompt_template, persona_config = setup_prompt_template("default")
        parser = setup_parser()
        agentcore_client = setup_client()

        perception_agent = PerceptionAgent(
            prompt_template=prompt_template,
            persona_config=persona_config,
        )
        memory_agent = MemoryAgent(ctx.conversation_id)
        reasoning_agent = ReasoningAgent(parser)
        emotional_agent = EmotionalAgent()
        language_agent = LanguageAgent(agentcore_client, persona_config)
        depth_agent = DepthAgent()
        self_agent = SelfAgent()

        conversation_history = memory_agent.load_conversation_history()

        context_turn_limit = self._read_int_env(
            "BRAIN_CONTEXT_MAX_TURNS", default=20, minimum=1, maximum=100
        )
        context_char_limit = self._read_int_env(
            "BRAIN_CONTEXT_MAX_CHARS", default=6000, minimum=500, maximum=30000
        )

        context = memory_agent.retrieve_context(
            conversation_history,
            n=context_turn_limit,
            max_chars=context_char_limit,
        )

        formatted_prompt = perception_agent.process_input(
            ctx.user_input, context
        )

        raw_response = language_agent.generate_response(
            formatted_prompt,
            session_id=ctx.conversation_id,
            metadata={
                "context": context,
                "message_id": ctx.message_id,
                "owner": ctx.owner,
                "personality_mode": "brain",
                "trace_id": str(uuid.uuid4()),
            },
        )

        parsed_response = reasoning_agent.analyze_input(
            raw_response, context
        )
        emotional_response = emotional_agent.apply_emotions(parsed_response)
        enhanced_response = depth_agent.enhance_response(emotional_response)
        final_response = self_agent.review_response(enhanced_response)

        response_text = (
            final_response.get("response", "")
            if isinstance(final_response, dict)
            else str(final_response)
        )

        save_conversation_memory(
            self._dynamodb_resource,
            ctx.conversation_id,
            ctx.user_input,
            response_text,
            ctx.owner,
        )

        logger.info("Brain response generated", extra={"conversation_id": ctx.conversation_id})
        return ExperienceResponse(
            response=response_text,
            raw=final_response if isinstance(final_response, dict) else None,
            metadata={
                "sensations": final_response.get("sensations", []) if isinstance(final_response, dict) else [],
                "thoughts": final_response.get("thoughts", []) if isinstance(final_response, dict) else [],
                "memories": final_response.get("memories", "") if isinstance(final_response, dict) else "",
                "self_reflection": final_response.get("self_reflection", "") if isinstance(final_response, dict) else "",
            },
        )

    def _fallback_response(self, ctx: ExperienceContext) -> ExperienceResponse:
        return ExperienceResponse(
            response="I'm processing your message, but my cognitive modules are currently operating in fallback mode.",
            metadata={"sensations": [], "thoughts": [], "memories": "", "self_reflection": ""},
        )

    @staticmethod
    def _read_int_env(name: str, *, default: int, minimum: int, maximum: int) -> int:
        raw_value = os.getenv(name)
        if not raw_value:
            return default
        try:
            parsed = int(raw_value)
        except ValueError:
            return default
        return max(minimum, min(maximum, parsed))

    def sync_memory(self, ctx: ExperienceContext, response: ExperienceResponse) -> None:
        save_conversation_memory(
            self._dynamodb_resource,
            ctx.conversation_id,
            ctx.user_input,
            response.response,
            ctx.owner,
        )
