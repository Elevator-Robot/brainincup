import logging
import os
import re
import uuid
from decimal import Decimal, InvalidOperation
from typing import Any

logger = logging.getLogger(__name__)


class BaseModeHandler:
    def __init__(
        self,
        *,
        conversation_id: str,
        personality_mode: str,
        agentcore_client: Any,
        character_data: dict | None = None,
    ) -> None:
        self.conversation_id = conversation_id
        self.personality_mode = personality_mode or "default"
        self.agentcore_client = agentcore_client
        self.character_data = character_data

    def enrich_context(
        self,
        *,
        context: str,
        user_input: str,
        owner: str | None = None,
        message_id: str | None = None,
    ) -> str:
        return context

    def apply_depth(self, *, depth_agent: Any, emotional_response: dict) -> dict:
        return depth_agent.enhance_response(emotional_response)

    def postprocess_response(self, *, user_input: str, response: dict | str) -> dict | str:
        return response

    def sync_memory(
        self,
        *,
        user_input: str,
        final_response: dict | str,
        message_id: str | None = None,
        owner: str | None = None,
    ) -> None:
        return None


class GameMasterModeHandler(BaseModeHandler):
    def __init__(
        self,
        *,
        conversation_id: str,
        personality_mode: str,
        agentcore_client: Any,
        character_data: dict | None = None,
    ) -> None:
        super().__init__(
            conversation_id=conversation_id,
            personality_mode=personality_mode,
            agentcore_client=agentcore_client,
            character_data=character_data,
        )
        self.semantic_memory_strategy_id = (
            os.getenv("AGENTCORE_MEMORY_SEMANTIC_STRATEGY_ID", "").strip()
            or os.getenv("AGENTCORE_MEMORY_STRATEGY_ID", "").strip()
            or None
        )
        self.character_memory_strategy_id = (
            os.getenv("AGENTCORE_MEMORY_CHARACTER_STRATEGY_ID", "").strip()
            or self.semantic_memory_strategy_id
        )

    def enrich_context(
        self,
        *,
        context: str,
        user_input: str,
        owner: str | None = None,
        message_id: str | None = None,
    ) -> str:
        actor_id = self._resolve_actor_id(owner)
        semantic_namespace = self._semantic_namespace(actor_id)
        character_namespace = self._character_namespace(actor_id)
        memory_context = self._retrieve_agentcore_memory(
            user_input=user_input,
            semantic_namespace=semantic_namespace,
            character_namespace=character_namespace,
        )

        enriched_context = context
        if memory_context:
            enriched_context = (
                f"{memory_context}\n\n{enriched_context}" if enriched_context else memory_context
            )
        if self.character_data:
            character_context = self._format_character_context(self.character_data)
            enriched_context = (
                f"{character_context}\n\n{enriched_context}" if enriched_context else character_context
            )
        return enriched_context

    def apply_depth(self, *, depth_agent: Any, emotional_response: dict) -> dict:
        # Keep Game Master tone focused on the adventure; avoid Brain-style philosophical add-ons.
        return emotional_response

    def postprocess_response(self, *, user_input: str, response: dict | str) -> dict | str:
        if not isinstance(response, dict):
            return response
        response["response"] = self._enforce_character_recall(
            user_input=user_input,
            response_text=str(response.get("response", "")),
        )
        return response

    def sync_memory(
        self,
        *,
        user_input: str,
        final_response: dict | str,
        message_id: str | None = None,
        owner: str | None = None,
    ) -> None:
        actor_id = self._resolve_actor_id(owner)
        semantic_namespace = self._semantic_namespace(actor_id)
        character_namespace = self._character_namespace(actor_id)

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

    def _resolve_actor_id(self, owner: str | None) -> str:
        return self.agentcore_client.sanitize_namespace(owner or self.conversation_id)

    def _semantic_namespace(self, actor_id: str) -> str:
        strategy = self.agentcore_client.sanitize_namespace(
            self.semantic_memory_strategy_id or "semantic-default"
        )
        return f"/strategy/{strategy}/actor/{actor_id}/"

    def _character_namespace(self, actor_id: str) -> str:
        strategy = self.agentcore_client.sanitize_namespace(
            self.character_memory_strategy_id
            or self.semantic_memory_strategy_id
            or "semantic-default"
        )
        return f"/strategy/{strategy}/actor/{actor_id}/character/"

    def _retrieve_agentcore_memory(
        self,
        *,
        user_input: str,
        semantic_namespace: str,
        character_namespace: str,
    ) -> str:
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

    def _format_character_context(self, character: dict) -> str:
        stats = character.get("stats", {})
        hp = character.get("hp", {})
        inventory_items = self._inventory_descriptions(character.get("inventory", []))

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
        inventory_items = self._inventory_descriptions(character.get("inventory", []))
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

    @staticmethod
    def _format_quantity(quantity: object) -> str:
        if quantity is None:
            return "1"
        if isinstance(quantity, bool):
            return "1" if quantity else "0"
        try:
            decimal_value = quantity if isinstance(quantity, Decimal) else Decimal(str(quantity))
            normalized = decimal_value.normalize()
            if normalized == normalized.to_integral():
                return str(int(normalized))
            return format(normalized, "f").rstrip("0").rstrip(".") or "0"
        except (InvalidOperation, ValueError, TypeError):
            return str(quantity)

    @staticmethod
    def _inventory_descriptions(inventory: object) -> list[str]:
        raw_items = inventory if isinstance(inventory, list) else [inventory]
        formatted: list[str] = []
        for item in raw_items:
            if item is None:
                continue
            if isinstance(item, dict):
                name = str(item.get("name") or item.get("id") or "Unknown item")
                quantity = GameMasterModeHandler._format_quantity(item.get("quantity", 1))
                formatted.append(name if quantity in {"", "1"} else f"{name} x{quantity}")
                continue
            text = str(item).strip()
            if text:
                formatted.append(text)
        return formatted

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
            or bool(
                re.search(
                    r"\b(what|who|tell|remind|show|list|do you know|can you)\b",
                    normalized,
                )
            )
        )
        if not is_character_query:
            return set()
        fields: set[str] = set()

        if re.search(
            r"\b(who am i|what(?:'s| is) my name|tell me my name|remind me(?: of)? my name)\b",
            normalized,
        ):
            fields.add("name")
        if re.search(
            r"\b(what(?:'s| is) my race|tell me my race|remind me(?: of)? my race)\b",
            normalized,
        ):
            fields.add("race")
        if re.search(
            r"\b(what(?:'s| is) my class|tell me my class|remind me(?: of)? my class)\b",
            normalized,
        ):
            fields.add("class")
        if re.search(
            r"\b(what(?:'s| is) my level|tell me my level|remind me(?: of)? my level)\b",
            normalized,
        ):
            fields.add("level")

        if re.search(
            r"\b(my stats?|my attributes?|strength|dexterity|constitution|intelligence|wisdom|charisma)\b",
            normalized,
        ):
            fields.add("stats")
        if re.search(r"\b(my hp|my health|hit points)\b", normalized):
            fields.add("hp")
        if re.search(r"\b(my armor class|my ac|armor class|ac)\b", normalized):
            fields.add("armorClass")
        if re.search(r"\b(my inventory|inventory)\b", normalized):
            fields.add("inventory")

        if re.search(r"\b(character sheet|my character)\b", normalized):
            fields.update(
                {"name", "race", "class", "level", "stats", "hp", "armorClass", "inventory"}
            )

        return fields

    def _build_character_fact_response(self, requested_fields: set[str]) -> str:
        character = self.character_data or {}
        stats = character.get("stats", {})
        hp = character.get("hp", {})
        inventory_items = self._inventory_descriptions(character.get("inventory", []))

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
            parts.append(
                f"Your inventory is {', '.join(inventory_items) if inventory_items else 'Empty'}."
            )

        if not parts:
            parts.append(
                f"Your character is {character.get('name', 'Unknown')}, a level {character.get('level', 1)} "
                f"{character.get('race', 'Unknown')} {character.get('class', 'Unknown')}."
            )

        return " ".join(parts) + " What do you do next?"


def create_mode_handler(
    *,
    conversation_id: str,
    personality_mode: str,
    agentcore_client: Any,
    character_data: dict | None = None,
) -> BaseModeHandler:
    if personality_mode == "game_master":
        return GameMasterModeHandler(
            conversation_id=conversation_id,
            personality_mode=personality_mode,
            agentcore_client=agentcore_client,
            character_data=character_data,
        )
    return BaseModeHandler(
        conversation_id=conversation_id,
        personality_mode=personality_mode,
        agentcore_client=agentcore_client,
        character_data=character_data,
    )
