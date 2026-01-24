import json
import logging
import os

from core.agentcore_client import AgentCoreClient

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


class PersonaPromptTemplate:
    """Minimal formatter replacement for LangChain PromptTemplate."""

    def __init__(self, template: str):
        self.template = template

    def format(self, **kwargs):
        return self.template.format(**kwargs)


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
    prompt_template = PersonaPromptTemplate(template=template_text)
    return prompt_template, persona


def setup_agentcore_client():
    runtime_arn = os.getenv("AGENTCORE_RUNTIME_ARN", "").strip()
    if not runtime_arn:
        raise ValueError("AGENTCORE_RUNTIME_ARN environment variable must be set")

    region_name = os.getenv("AWS_REGION_NAME") or os.getenv("AWS_REGION") or "us-east-1"
    trace_enabled = os.getenv("AGENTCORE_TRACE_ENABLED", "false").lower() == "true"
    try:
        trace_sample_rate = float(os.getenv("AGENTCORE_TRACE_SAMPLE_RATE", "0"))
    except ValueError:
        trace_sample_rate = 0.0

    logging.info(f"Initializing AgentCore client with runtime: {runtime_arn[:50]}...")
    return AgentCoreClient(
        runtime_arn=runtime_arn,
        region_name=region_name,
        trace_enabled=trace_enabled,
        trace_sample_rate=trace_sample_rate,
    )


class SimpleJSONParser:
    """Simple JSON parser for backwards compatibility."""

    def parse(self, text):
        """Parse JSON from text"""
        return json.loads(text)


def setup_parser():
    """Returns a simple JSON parser"""
    return SimpleJSONParser()
