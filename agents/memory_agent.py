import os
import pickle

class MemoryAgent:
    def __init__(self, history_file="data/conversation_history.pkl"):
        self.memory = []
        self.history_file = history_file

    def load_conversation_history(self):
        if os.path.exists(self.history_file):
            with open(self.history_file, "rb") as f:
                return pickle.load(f)
        return []

    def save_conversation_history(self, history):
        os.makedirs(os.path.dirname(self.history_file), exist_ok=True)
        with open(self.history_file, "wb") as f:
            pickle.dump(history, f)

    def retrieve_context(self, conversation_history, n=5):
        """Get the last n interactions from history"""
        recent = conversation_history[-n:] if conversation_history else []
        context = ""
        for interaction in recent:
            if isinstance(interaction, dict):
                user_input = interaction.get("user_input", "")
                response = interaction.get("response", {})
                if isinstance(user_input, dict):
                    user_input = user_input.get("user_input", "")
                context += f"User: {user_input}\n"
                if isinstance(response, dict) and "response" in response:
                    context += f"Brain: {response['response']}\n"
                context += "\n"
        return context
