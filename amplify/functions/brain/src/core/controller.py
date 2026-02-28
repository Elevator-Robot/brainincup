import logging
import os
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

# Set up logging
logging.basicConfig(level=logging.ERROR)
logger = logging.getLogger(__name__)


class Controller:
    def __init__(self, conversation_id, personality_mode: str = "default", character_data: dict | None = None):
        self.personality_mode = personality_mode or "default"
        self.character_data = character_data
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
        self.agentcore_client = agentcore_client
        self.semantic_memory_strategy_id = (
            os.getenv("AGENTCORE_MEMORY_SEMANTIC_STRATEGY_ID", "").strip()
            or os.getenv("AGENTCORE_MEMORY_STRATEGY_ID", "").strip()
            or None
        )
        self.character_memory_strategy_id = (
            os.getenv("AGENTCORE_MEMORY_CHARACTER_STRATEGY_ID", "").strip()
            or self.semantic_memory_strategy_id
        )
        self.depth_agent = DepthAgent()
        self.self_agent = SelfAgent()

        # Load initial conversation history
        self.conversation_history = self.memory_agent.load_conversation_history()

    def process_input(self, user_input, message_id=None, owner=None):
        context = self.memory_agent.retrieve_context(self.conversation_history, n=100)
        actor_id = self._resolve_actor_id(owner)
        semantic_namespace = self._semantic_namespace(actor_id)
        character_namespace = self._character_namespace(actor_id)
        memory_context = self._retrieve_agentcore_memory(
            user_input=user_input,
            semantic_namespace=semantic_namespace,
            character_namespace=character_namespace,
        )
        if memory_context:
            context = f"{memory_context}\n\n{context}" if context else memory_context
        
        # Add character data to context for Game Master mode
        if self.character_data:
            character_context = self._format_character_context(self.character_data)
            context = f"{character_context}\n\n{context}"

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
                "character_data": self.character_data,
                "trace_id": str(uuid.uuid4()),
            },
        )

        # Reasoning Agent parses the response
        parsed_response = self.reasoning_agent.analyze_input(raw_response, context)

        # Emotional Agent modifies the response
        emotional_response = self.emotional_agent.apply_emotions(parsed_response)

        # Depth Agent enhances the response with deeper content
        enhanced_response = self.depth_agent.enhance_response(emotional_response)

        # Self Agent reviews final response
        final_response = self.self_agent.review_response(enhanced_response)
        if isinstance(final_response, dict):
            final_response["response"] = self._enforce_character_recall(
                user_input=user_input,
                response_text=str(final_response.get("response", "")),
            )

        # Save the AI response to the response table
        self.memory_agent.save_response(
            response=final_response,
            message_id=message_id,
            owner=owner
        )
        self._sync_agentcore_memory(
            actor_id=actor_id,
            user_input=user_input,
            final_response=final_response,
            message_id=message_id,
            semantic_namespace=semantic_namespace,
            character_namespace=character_namespace,
        )

        # Update conversation history locally
        self.conversation_history.append(
            {"user_input": user_input, "response": final_response}
        )

        logger.info(f"User input: {user_input}")
        logger.info(f"AI Response: {final_response}")

        print(final_response)
        return final_response

    def _resolve_actor_id(self, owner: str | None) -> str:
        return self.agentcore_client.sanitize_namespace(owner or self.conversation_id)

    def _semantic_namespace(self, actor_id: str) -> str:
        strategy = self.agentcore_client.sanitize_namespace(
            self.semantic_memory_strategy_id or "semantic-default"
        )
        return f"/strategy/{strategy}/actor/{actor_id}/"

    def _character_namespace(self, actor_id: str) -> str:
        strategy = self.agentcore_client.sanitize_namespace(
            self.character_memory_strategy_id or self.semantic_memory_strategy_id or "semantic-default"
        )
        return f"/strategy/{strategy}/actor/{actor_id}/character/"

    def _retrieve_agentcore_memory(
        self,
        *,
        user_input: str,
        semantic_namespace: str,
        character_namespace: str,
    ) -> str:
        if self.personality_mode != "game_master":
            return ""

        records: list[str] = []
        try:
            records.extend(
                self.agentcore_client.retrieve_memory_records(
                    namespace=semantic_namespace,
                    search_query=user_input,
                    top_k=5,
                    memory_strategy_id=self.semantic_memory_strategy_id,
                )
            )
        except Exception as error:
            logger.warning("Failed to retrieve semantic AgentCore memory", exc_info=error)

        try:
            records.extend(
                self.agentcore_client.retrieve_memory_records(
                    namespace=character_namespace,
                    search_query="player character name race class stats inventory hp armor class",
                    top_k=3,
                    memory_strategy_id=self.character_memory_strategy_id,
                )
            )
        except Exception as error:
            logger.warning("Failed to retrieve character AgentCore memory", exc_info=error)

        if not records:
            return ""

        unique_records = []
        seen = set()
        for record in records:
            normalized = record.strip()
            if not normalized or normalized in seen:
                continue
            seen.add(normalized)
            unique_records.append(normalized)

        if not unique_records:
            return ""

        memory_lines = ["=== AGENTCORE MEMORY ==="]
        memory_lines.extend(f"- {record}" for record in unique_records)
        memory_lines.append("=======================")
        return "\n".join(memory_lines)

    def _sync_agentcore_memory(
        self,
        *,
        actor_id: str,
        user_input: str,
        final_response: dict | str,
        message_id: str | None,
        semantic_namespace: str,
        character_namespace: str,
    ) -> None:
        if self.personality_mode != "game_master":
            return

        response_text = (
            final_response.get("response", "")
            if isinstance(final_response, dict)
            else str(final_response)
        )

        metadata = {
            "conversationId": self.conversation_id,
            "personalityMode": self.personality_mode,
        }
        if message_id:
            metadata["messageId"] = message_id

        try:
            self.agentcore_client.create_short_term_event(
                actor_id=actor_id,
                session_id=self.conversation_id,
                role="USER",
                text=user_input,
                metadata=metadata,
            )
            if response_text:
                self.agentcore_client.create_short_term_event(
                    actor_id=actor_id,
                    session_id=self.conversation_id,
                    role="ASSISTANT",
                    text=response_text,
                    metadata=metadata,
                )
        except Exception as error:
            logger.warning("Failed to persist short-term AgentCore memory events", exc_info=error)

        if not self.character_data:
            return

        try:
            character_text = self._format_character_memory(self.character_data)
            request_id = message_id or str(uuid.uuid4())
            self.agentcore_client.save_memory_record(
                request_identifier=f"character-profile-{request_id}",
                namespaces=[semantic_namespace, character_namespace],
                content_text=character_text,
                memory_strategy_id=self.character_memory_strategy_id,
            )
        except Exception as error:
            logger.warning("Failed to persist character semantic memory record", exc_info=error)
    
    def _format_character_context(self, character: dict) -> str:
        """Format character data into a readable context string for the AI."""
        stats = character.get("stats", {})
        hp = character.get("hp", {})
        inventory = character.get("inventory", [])
        inventory_items = [str(item) for item in inventory] if isinstance(inventory, list) else [str(inventory)]
        
        context_lines = [
            "=== PLAYER CHARACTER ===",
            f"Name: {character.get('name', 'Unknown')}",
            f"Race: {character.get('race', 'Unknown')}",
            f"Class: {character.get('class', 'Unknown')}",
            f"Level: {character.get('level', 1)}",
            "",
            "STATS:",
            f"  Strength: {stats.get('strength', 10)}",
            f"  Dexterity: {stats.get('dexterity', 10)}",
            f"  Constitution: {stats.get('constitution', 10)}",
            f"  Intelligence: {stats.get('intelligence', 10)}",
            f"  Wisdom: {stats.get('wisdom', 10)}",
            f"  Charisma: {stats.get('charisma', 10)}",
            "",
            f"HP: {hp.get('current', 10)}/{hp.get('max', 10)}",
            f"Armor Class: {character.get('armorClass', 10)}",
            "",
            f"INVENTORY: {', '.join(inventory_items) if inventory_items else 'Empty'}",
            "========================",
        ]
        
        return "\n".join(context_lines)

    def _format_character_memory(self, character: dict) -> str:
        stats = character.get("stats", {})
        hp = character.get("hp", {})
        inventory = character.get("inventory", [])
        inventory_items = [str(item) for item in inventory] if isinstance(inventory, list) else [str(inventory)]
        return (
            f"Character profile: Name={character.get('name', 'Unknown')}; "
            f"Race={character.get('race', 'Unknown')}; "
            f"Class={character.get('class', 'Unknown')}; "
            f"Level={character.get('level', 1)}; "
            f"STR={stats.get('strength', 10)} DEX={stats.get('dexterity', 10)} "
            f"CON={stats.get('constitution', 10)} INT={stats.get('intelligence', 10)} "
            f"WIS={stats.get('wisdom', 10)} CHA={stats.get('charisma', 10)}; "
            f"HP={hp.get('current', 10)}/{hp.get('max', 10)}; "
            f"ArmorClass={character.get('armorClass', 10)}; "
            f"Inventory={', '.join(inventory_items) or 'Empty'}"
        )

    def _enforce_character_recall(self, *, user_input: str, response_text: str) -> str:
        if not self.character_data:
            return response_text
        requested_fields = self._requested_character_fields(user_input)
        if not requested_fields:
            return response_text
        return self._build_character_fact_response(requested_fields)

    @staticmethod
    def _requested_character_fields(user_input: str) -> set[str]:
        normalized = (user_input or "").lower()
        is_character_query = (
            "?" in normalized
            or bool(re.search(r"\b(what|who|tell|remind|show|list|do you know|can you)\b", normalized))
        )
        if not is_character_query:
            return set()
        fields: set[str] = set()

        if re.search(r"\b(who am i|what(?:'s| is) my name|tell me my name|remind me(?: of)? my name)\b", normalized):
            fields.add("name")
        if re.search(r"\b(what(?:'s| is) my race|tell me my race|remind me(?: of)? my race)\b", normalized):
            fields.add("race")
        if re.search(r"\b(what(?:'s| is) my class|tell me my class|remind me(?: of)? my class)\b", normalized):
            fields.add("class")
        if re.search(r"\b(what(?:'s| is) my level|tell me my level|remind me(?: of)? my level)\b", normalized):
            fields.add("level")

        if re.search(r"\b(my stats?|my attributes?|strength|dexterity|constitution|intelligence|wisdom|charisma)\b", normalized):
            fields.add("stats")
        if re.search(r"\b(my hp|my health|hit points)\b", normalized):
            fields.add("hp")
        if re.search(r"\b(my armor class|my ac|armor class|ac)\b", normalized):
            fields.add("armorClass")
        if re.search(r"\b(my inventory|inventory)\b", normalized):
            fields.add("inventory")

        if re.search(r"\b(character sheet|my character)\b", normalized):
            fields.update({"name", "race", "class", "level", "stats", "hp", "armorClass", "inventory"})

        return fields

    def _build_character_fact_response(self, requested_fields: set[str]) -> str:
        character = self.character_data or {}
        stats = character.get("stats", {})
        hp = character.get("hp", {})
        inventory = character.get("inventory", [])
        inventory_items = [str(item) for item in inventory] if isinstance(inventory, list) else [str(inventory)]

        parts: list[str] = []
        if "name" in requested_fields:
            parts.append(f"Your name is {character.get('name', 'Unknown')}.")
        if "race" in requested_fields:
            parts.append(f"You are {character.get('race', 'Unknown')}.")
        if "class" in requested_fields:
            parts.append(f"Your class is {character.get('class', 'Unknown')}.")
        if "level" in requested_fields:
            parts.append(f"You are level {character.get('level', 1)}.")
        if "stats" in requested_fields:
            parts.append(
                "Your stats are "
                f"STR {stats.get('strength', 10)}, DEX {stats.get('dexterity', 10)}, CON {stats.get('constitution', 10)}, "
                f"INT {stats.get('intelligence', 10)}, WIS {stats.get('wisdom', 10)}, CHA {stats.get('charisma', 10)}."
            )
        if "hp" in requested_fields:
            parts.append(f"Your HP is {hp.get('current', 10)}/{hp.get('max', 10)}.")
        if "armorClass" in requested_fields:
            parts.append(f"Your armor class is {character.get('armorClass', 10)}.")
        if "inventory" in requested_fields:
            parts.append(f"Your inventory is {', '.join(inventory_items) if inventory_items else 'Empty'}.")

        if not parts:
            parts.append(
                f"Your character is {character.get('name', 'Unknown')}, a level {character.get('level', 1)} "
                f"{character.get('race', 'Unknown')} {character.get('class', 'Unknown')}."
            )

        return " ".join(parts) + " What do you do next?"
