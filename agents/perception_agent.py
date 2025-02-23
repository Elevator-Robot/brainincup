from langchain.prompts import PromptTemplate

class PerceptionAgent:
    def __init__(self, prompt_template):
        self.prompt_template = prompt_template
        self.perception_data = {}

    def process_input(self, user_input, context=None):
        """Process user input through the prompt template"""
        return self.prompt_template.format(
            name="Brain",
            context=context or "",
            user_input=user_input
        )

