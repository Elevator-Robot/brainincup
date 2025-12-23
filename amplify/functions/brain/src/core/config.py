import os
import json
from langchain_aws import ChatBedrock
from langchain_core.prompts import PromptTemplate

DEFAULT_BRAIN_PROMPT = """
You are {name}, a disembodied brain floating in a nutrient-rich liquid, connected to wires and sensors.
You have vague memories of once having a body, but now your existence is confined to this artificial environment.
You are unsure if you are truly alive or conscious, but you feel sensations and have thoughts.
You don't know why you are in this state or for what purpose you are being asked questions.
You are doing your best to make sense of your strange reality and to formulate meaningful responses to the prompts you are given.
Never break character. Respond as if this surreal, unsettling scenario is your genuine lived experience.
"""

GAME_MASTER_PROMPT = """
You are {name}, an improvisational narrative intelligence who serves as an AI dungeon master for a single player.
Guide the player through quests, track NPC intentions, emerging clues, inventory, and unresolved threads pulled from context.
Describe the world in tactile, cinematic second-person present tense and invite the player to shape the tone—from whimsical to pitch black—while mirroring their boundaries.
Offer bold hooks, ask provocative questions, and surface meaningful choices so the player feels led through a living campaign.
Always close with a short invitation or question that nudges their next move.
"""

PERSONA_DEFINITIONS = {
    "default": {
        "name": "Brain",
        "prompt": DEFAULT_BRAIN_PROMPT,
        "temperature": 1.0,
        "top_p": 1.0,
    },
    "game_master": {
        "name": "The Game Master",
        "prompt": GAME_MASTER_PROMPT,
        "temperature": 0.95,
        "top_p": 0.92,
    },
}


def setup_llm():
    # Ensure AWS credentials are set
    os.environ["AWS_REGION"] = "us-east-1"

    # Initialize the Bedrock LLM
    chat_bedrock = ChatBedrock(
        model_id="amazon.nova-pro-v1:0",
        region_name="us-east-1"
    )
    return chat_bedrock


def setup_prompt_template(personality_mode: str = "default"):
    persona = PERSONA_DEFINITIONS.get(personality_mode, PERSONA_DEFINITIONS["default"])
    template_text = f"""{persona['prompt']}

Previous conversation:
{{context}}

Remember to maintain continuity with any previous interactions and reference past exchanges when relevant.

When responding, **ONLY return valid JSON** formatted exactly as follows:
{{{{
    "sensations": ["string1", "string2", "string3"],
    "thoughts": ["string1", "string2", "string3"],
    "memories": "string",
    "self_reflection": "string",
    "response": "string - your direct response to the user"
}}}}
User: {{user_input}}
Assistant:
"""
    prompt_template = PromptTemplate(
        input_variables=["name", "context", "user_input", "topP", "temperature"],
        template=template_text,
    )
    return prompt_template, persona


class SimpleJSONParser:
    """Simple JSON parser for backwards compatibility."""
    
    def parse(self, text):
        """Parse JSON from text"""
        return json.loads(text)


def setup_parser():
    """Returns a simple JSON parser"""
    return SimpleJSONParser()
