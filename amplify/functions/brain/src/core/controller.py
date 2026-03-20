import logging
import json
import re
import uuid

from agents import (
    PerceptionAgent,
    MemoryAgent,
    ReasoningAgent,
    EmotionalAgent,
    LanguageAgent,
    SelfAgent,
    DepthAgent,
)
from core.config import setup_agentcore_client, setup_prompt_template, setup_parser
from core.mode_handlers import create_mode_handler

# Set up logging
logging.basicConfig(level=logging.ERROR)
logger = logging.getLogger(__name__)


class Controller:
    def __init__(
        self,
        conversation_id,
        personality_mode: str = "default",
        character_data: dict | None = None,
    ):
        self.personality_mode = personality_mode or "default"
        prompt_template, persona_config = setup_prompt_template(self.personality_mode)
        parser = setup_parser()
        agentcore_client = setup_agentcore_client()

        # Initialize agents
        self.perception_agent = PerceptionAgent(
            prompt_template=prompt_template,
            persona_config=persona_config,
        )
        self.conversation_id = conversation_id
        self.memory_agent = MemoryAgent(self.conversation_id)
        self.reasoning_agent = ReasoningAgent(parser)
        self.emotional_agent = EmotionalAgent()
        self.language_agent = LanguageAgent(agentcore_client, persona_config)
        self.depth_agent = DepthAgent()
        self.self_agent = SelfAgent()
        self.mode_handler = create_mode_handler(
            conversation_id=self.conversation_id,
            personality_mode=self.personality_mode,
            agentcore_client=agentcore_client,
            character_data=character_data,
        )

        # Load initial conversation history
        self.conversation_history = self.memory_agent.load_conversation_history()

    def generate_conversation_title(
        self,
        *,
        user_input: str,
        final_response: dict | str,
    ) -> str | None:
        response_text = (
            final_response.get("response", "")
            if isinstance(final_response, dict)
            else str(final_response)
        )
        response_excerpt = response_text.strip()[:900]
        user_excerpt = user_input.strip()[:500]

        prompt = (
            "You create concise conversation titles.\n"
            "Based on the first interaction, produce one title that summarizes the topic.\n"
            "Rules:\n"
            "- 3 to 7 words\n"
            "- Plain text title case\n"
            "- No emojis\n"
            "- No surrounding quotes\n"
            "Return valid JSON only: {\"title\": \"...\"}\n\n"
            f"User message: {user_excerpt}\n"
            f"Assistant response: {response_excerpt}"
        )

        payload = {
            "prompt": prompt,
            "persona": {
                "name": "Title Generator",
                "mode": "conversation_title",
                "temperature": 0.2,
                "top_p": 0.8,
            },
            "context": "",
            "message": {
                "id": "title-generator",
                "owner": "system",
            },
        }

        try:
            generated = self.language_agent.agent_client.invoke(
                session_id=f"{self.conversation_id}-title",
                payload=payload,
                trace_metadata=str(uuid.uuid4()),
            )
        except Exception as error:
            logger.warning("Failed to generate conversation title", exc_info=error)
            return None

        raw_title = ""
        if isinstance(generated, dict):
            title_candidate = generated.get("title")
            if isinstance(title_candidate, str) and title_candidate.strip():
                raw_title = title_candidate
            else:
                raw_title = str(generated.get("response", "")).strip()
        else:
            raw_title = str(generated).strip()

        sanitized = self._sanitize_generated_title(raw_title)
        return sanitized or None

    @staticmethod
    def _sanitize_generated_title(raw_title: str) -> str:
        candidate = (raw_title or "").strip()
        if not candidate:
            return ""

        if candidate.startswith("{") and candidate.endswith("}"):
            try:
                parsed = json.loads(candidate)
            except json.JSONDecodeError:
                parsed = None
            if isinstance(parsed, dict):
                candidate = str(parsed.get("title") or parsed.get("response") or "").strip()

        label_match = re.search(r"(?i)\btitle\b\s*[:\-]\s*(.+)", candidate)
        if label_match:
            candidate = label_match.group(1).strip()

        candidate = candidate.splitlines()[0]
        candidate = re.sub(r"\s+", " ", candidate).strip()
        candidate = candidate.strip("`\"' ")
        candidate = candidate.strip(".,:;!?- ")
        if len(candidate) > 80:
            candidate = candidate[:80].rstrip()
        return candidate

    def process_input(self, user_input, message_id=None, owner=None):
        context = self.memory_agent.retrieve_context(self.conversation_history, n=100)
        context = self.mode_handler.enrich_context(
            context=context,
            user_input=user_input,
            owner=owner,
            message_id=message_id,
        )

        # Perception Agent formats the prompt
        formatted_prompt = self.perception_agent.process_input(user_input, context)
        # Language Agent invokes AgentCore runtime
        raw_response = self.language_agent.generate_response(
            formatted_prompt,
            session_id=self.conversation_id,
            metadata={
                "context": context,
                "message_id": message_id,
                "owner": owner,
                "personality_mode": self.personality_mode,
                "trace_id": str(uuid.uuid4()),
            },
        )

        # Reasoning Agent parses the response
        parsed_response = self.reasoning_agent.analyze_input(raw_response, context)

        # Emotional Agent modifies the response
        emotional_response = self.emotional_agent.apply_emotions(parsed_response)
        enhanced_response = self.mode_handler.apply_depth(
            depth_agent=self.depth_agent,
            emotional_response=emotional_response,
        )

        # Self Agent reviews final response
        final_response = self.self_agent.review_response(enhanced_response)
        final_response = self.mode_handler.postprocess_response(
            user_input=user_input,
            response=final_response,
        )

        # Save the AI response to the response table
        self.memory_agent.save_response(
            response=final_response,
            message_id=message_id,
            owner=owner,
        )
        self.mode_handler.sync_memory(
            user_input=user_input,
            final_response=final_response,
            message_id=message_id,
            owner=owner,
        )

        # Update conversation history locally
        self.conversation_history.append(
            {"user_input": user_input, "response": final_response}
        )

        logger.info(f"User input: {user_input}")
        logger.info(f"AI Response: {final_response}")

        print(final_response)
        return final_response
