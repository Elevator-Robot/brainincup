import json
import logging

logger = logging.getLogger(__name__)


class LanguageAgent:
    def __init__(self, llm):
        self.llm = llm
        self.memory = []

    def generate_response(self, formatted_prompt):
        """Generate response using the LLM"""
        try:
            response = self.llm.invoke(formatted_prompt)

            # Extract content from response
            if hasattr(response, "content"):
                content = response.content
            elif hasattr(response, "text"):
                content = response.text
            elif isinstance(response, (dict, list)):
                content = json.dumps(response)
            else:
                content = str(response)

            # Clean up any extra escaping
            content = content.strip()
            return content
        except Exception as e:
            logger.error(f"LLM error: {e}")
            return """
            {
                "sensations": ["Error processing input"],
                "thoughts": ["System malfunction"],
                "memories": "Unable to access memory banks",
                "self_reflection": "Experiencing technical difficulties"
            }"""
