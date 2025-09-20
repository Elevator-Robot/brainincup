import logging
import logging
from agents import (
    PerceptionAgent,
    MemoryAgent,
    ReasoningAgent,
    EmotionalAgent,
    LanguageAgent,
    SelfAgent,
    DepthAgent,
)
from core.config import setup_llm, setup_prompt_template, setup_parser

# Set up logging
logging.basicConfig(level=logging.ERROR)
logger = logging.getLogger(__name__)


class Controller:
    def __init__(self, conversation_id):
        llm = setup_llm()
        prompt_template = setup_prompt_template()
        parser = setup_parser()

        # Initialize agents
        self.perception_agent = PerceptionAgent(prompt_template=prompt_template)
        self.conversation_id = conversation_id
        self.memory_agent = MemoryAgent(self.conversation_id)
        self.reasoning_agent = ReasoningAgent(parser)
        self.emotional_agent = EmotionalAgent()
        self.language_agent = LanguageAgent(llm)
        self.depth_agent = DepthAgent()
        self.self_agent = SelfAgent()

        # Load initial conversation history
        self.conversation_history = self.memory_agent.load_conversation_history()

    def process_input(self, user_input, message_id=None, owner=None):
        context = self.memory_agent.retrieve_context(self.conversation_history, n=100)

        # Perception Agent formats the prompt
        formatted_prompt = self.perception_agent.process_input(user_input, context)
        # Language Agent generates raw response
        raw_response = self.language_agent.generate_response(formatted_prompt)

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
