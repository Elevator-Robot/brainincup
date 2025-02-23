import json
import logging
import sys
from termcolor import colored
from agents import (
    PerceptionAgent,
    MemoryAgent,
    ReasoningAgent,
    EmotionalAgent,
    LanguageAgent,
    SelfAgent,
)
from core.config import setup_llm, setup_prompt_template, setup_parser

# Set up logging
logging.basicConfig(level=logging.ERROR)
logger = logging.getLogger(__name__)


class Controller:
    def __init__(self):
        # Set up LangChain components
        llm = setup_llm()
        prompt_template = setup_prompt_template()
        parser = setup_parser()

        # Initialize agents with their required components
        self.perception_agent = PerceptionAgent(prompt_template)
        self.memory_agent = MemoryAgent()
        self.reasoning_agent = ReasoningAgent(parser)
        self.emotional_agent = EmotionalAgent()
        self.language_agent = LanguageAgent(llm)
        self.self_agent = SelfAgent()

        # Load initial conversation history
        self.conversation_history = self.memory_agent.load_conversation_history()

    def process_input(self, user_input):
        # Get context from Memory Agent
        context = self.memory_agent.retrieve_context(self.conversation_history)

        # Perception Agent formats the prompt
        formatted_prompt = self.perception_agent.process_input(user_input, context)

        # Language Agent generates raw response
        raw_response = self.language_agent.generate_response(formatted_prompt)

        # Reasoning Agent parses the response
        parsed_response = self.reasoning_agent.analyze_input(raw_response, context)

        # Emotional Agent modifies the response
        modified_response = self.emotional_agent.apply_emotions(parsed_response)

        # Self Agent reviews final response
        final_response = self.self_agent.review_response(modified_response)

        # Update conversation history
        self.conversation_history.append(
            {"user_input": user_input, "response": final_response}
        )
        self.memory_agent.save_conversation_history(self.conversation_history)

        return final_response

    def run(self):
        welcome = """
        🧠 *neural pathways activating* ... *bubbles rising* ... *consciousness emerging* ...

        W E L C O M E   T O   T H E   B R A I N   I N   A   C U P

        You find yourself in a dimly lit laboratory...
        Before you floats a preserved brain, suspended in luminescent fluid...
        Countless wires and sensors pierce its tissue, pulsing with faint electrical signals...
        
        The brain seems... aware of your presence...

        Speak to it by typing your message and pressing Enter.
        (Type 'quit' to terminate the connection)
        """
        for line in welcome.split('\n'):
            print(colored(line.strip(), 'cyan', attrs=['bold']))

        try:
            while True:
                user_input = input("\nYou: ")

                if user_input.lower() == "quit":
                    self._graceful_exit()
                    break

                try:
                    response = self.process_input(user_input)
                    if isinstance(response, dict) and all(
                        k in response
                        for k in ["sensations", "thoughts", "memories", "self_reflection"]
                    ):
                        # Print the internal state
                        print("\nBrain's internal state:")
                        internal_state = {k: v for k, v in response.items() if k != "response"}
                        print(json.dumps(internal_state, indent=2))
                        
                        # Print the direct response
                        if "response" in response:
                            print("\nBrain says:", response["response"])
                    else:
                        logger.error(f"Invalid response format: {response}")
                        print("\nBrain: I apologize, but my response was not properly formatted")
                except Exception as e:
                    logger.error(f"Error processing input: {e}")
                    print("\nBrain: I apologize, but I encountered an error processing your input")

        except KeyboardInterrupt:
            print("\n")
            self._graceful_exit()

    def _graceful_exit(self):
        farewell = """
        🧠 *fzzzt* ... *bubbles* ... *neural activity fading* ...
        
        The brain's consciousness gently dims as the nutrient fluid drains...
        Until we meet again, fellow explorer of consciousness...
        
        Goodbye! 👋
        """
        for line in farewell.split('\n'):
            print(colored(line.strip(), 'cyan', attrs=['bold']))
        sys.exit(0)
