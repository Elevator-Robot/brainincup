from typing import Any, Dict


class PerceptionAgent:
    def __init__(self, prompt_template, persona_config: Dict[str, Any]):
        self.prompt_template = prompt_template
        self.persona_config = persona_config or {}
        self.perception_data = {}

    def process_input(self, user_input, context=None):
        """Process user input through the prompt template"""
        return self.prompt_template.format(
            name=self.persona_config.get("name", "Brain"),
            context=context or "",
            user_input=user_input,
            topP=self.persona_config.get("top_p", 1.0),
            temperature=self.persona_config.get("temperature", 1.0),
        )
