import os
import json
import pickle
from perception_agent import PerceptionAgent
from memory_agent import MemoryAgent
from reasoning_agent import ReasoningAgent
from emotional_agent import EmotionalAgent
from language_agent import LanguageAgent
from self_agent import SelfAgent

CONVERSATION_HISTORY_FILE = "conversation_history.pkl"

class Controller:
    def __init__(self):
        self.perception_agent = PerceptionAgent()
        self.memory_agent = MemoryAgent()
        self.reasoning_agent = ReasoningAgent()
        self.emotional_agent = EmotionalAgent()
        self.language_agent = LanguageAgent()
        self.self_agent = SelfAgent()
        self.conversation_history = self.load_conversation_history()
        
    def load_conversation_history(self):
        if os.path.exists(CONVERSATION_HISTORY_FILE):
            with open(CONVERSATION_HISTORY_FILE, "rb") as f:
                conversation_history = pickle.load(f)
        else:
            conversation_history = []
        return conversation_history
    
    def save_conversation_history(self):
        with open(CONVERSATION_HISTORY_FILE, "wb") as f:
            pickle.dump(self.conversation_history, f)
            
    def process_input(self, user_input):
        # Perception Agent
        processed_input = self.perception_agent.process_input(user_input)
        
        # Memory Agent
        context = self.memory_agent.retrieve_context(self.conversation_history)
        
        # Reasoning Agent
        decision = self.reasoning_agent.analyze_input(processed_input, context)
        
        # Emotional Agent
        modified_decision = self.emotional_agent.apply_emotions(decision)
        
        # Language Agent
        response = self.language_agent.generate_response(modified_decision)
        
        # Self Agent
        final_response = self.self_agent.review_response(response)
        
        # Update conversation history
        self.conversation_history.append({"user_input": user_input, "response": final_response})
        self.save_conversation_history()
        
        return final_response
        
    def run(self):
        print("Welcome to the Brain in a Cup interactive shell!")
        print("Chat with the brain by typing your message and pressing Enter.")
        print("Type 'quit' to exit the shell.")

        while True:
            user_input = input("\nYou: ")
            
            if user_input.lower() == 'quit':
                break
            
            response = self.process_input(user_input)
            print("\nBrain:", json.dumps(response, indent=2))
