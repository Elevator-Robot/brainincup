import logging
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
        self.depth_agent = DepthAgent()
        self.self_agent = SelfAgent()

        # Load initial conversation history
        self.conversation_history = self.memory_agent.load_conversation_history()

    def process_input(self, user_input, message_id=None, owner=None):
        context = self.memory_agent.retrieve_context(self.conversation_history, n=100)
        
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

        # Save the AI response to the response table
        self.memory_agent.save_response(
            response=final_response,
            message_id=message_id,
            owner=owner
        )

        # Update conversation history locally
        self.conversation_history.append(
            {"user_input": user_input, "response": final_response}
        )

        logger.info(f"User input: {user_input}")
        logger.info(f"AI Response: {final_response}")

        print(final_response)
        return final_response
    
    def _format_character_context(self, character: dict) -> str:
        """Format character data into a readable context string for the AI."""
        stats = character.get("stats", {})
        hp = character.get("hp", {})
        inventory = character.get("inventory", [])
        
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
            f"INVENTORY: {', '.join(inventory) if inventory else 'Empty'}",
            "========================",
        ]
        
        return "\n".join(context_lines)
