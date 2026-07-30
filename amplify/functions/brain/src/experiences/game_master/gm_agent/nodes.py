from __future__ import annotations

import json
import logging

import boto3

from experiences.game_master.gm_agent.state import GMAgentState
from experiences.game_master.gm_agent.tools import get_tool_specs, execute_tool

logger = logging.getLogger(__name__)


def assemble_context_node(state: GMAgentState) -> dict:
    """Build the game context block and create the initial user message."""
    game_context_block = (
        "\n\n[GAME_CONTEXT]\n"
        + json.dumps({"gameContext": state.get("game_context", {})}, indent=2)
        + "\n[/GAME_CONTEXT]"
    )

    user_message = {
        "role": "user",
        "content": [
            {
                "type": "text",
                "text": (state.get("user_input") or "") + game_context_block,
            }
        ],
    }

    return {"messages": [user_message]}


def agent_node(state: GMAgentState) -> dict:
    """Call Bedrock Claude with the conversation history and tool definitions."""

    system_prompt = state.get("system_prompt", "You are the Game Master.")
    messages = state.get("messages", [])
    model_id = state.get("model_id", "us.anthropic.claude-haiku-4-5-20251001-v1:0")
    region = state.get("region", "us-east-1")

    client = boto3.client("bedrock-runtime", region_name=region)

    request = {
        "anthropic_version": "bedrock-2023-05-31",
        "max_tokens": 4096,
        "system": system_prompt,
        "messages": messages,
        "temperature": 0.95,
        "tools": get_tool_specs(),
    }

    response = client.invoke_model(
        modelId=model_id,
        body=json.dumps(request),
    )
    model_response = json.loads(response["body"].read())

    content_blocks = model_response.get("content", [])
    assistant_message = {
        "role": "assistant",
        "content": content_blocks,
    }

    return {"messages": [assistant_message]}


def execute_tools_node(state: GMAgentState) -> dict:
    """Execute any tool calls from the last assistant message."""
    messages = state.get("messages", [])
    player_state = state.get("player_state", {})
    last_msg = messages[-1] if messages else {}

    content_blocks = last_msg.get("content", [])
    if isinstance(content_blocks, str):
        return {"messages": [], "tool_call_count": 0}

    tool_results = []
    tool_count = 0
    for block in content_blocks:
        if isinstance(block, dict) and block.get("type") == "tool_use":
            tool_name = block.get("name", "")
            tool_input = block.get("input", {})
            tool_id = block.get("id", "")

            logger.info("Executing tool: %s with input: %s", tool_name, tool_input)
            tool_count += 1

            try:
                result_text = execute_tool(tool_name, tool_input, player_state)
            except Exception as exc:
                logger.error("Tool %s failed: %s", tool_name, exc, exc_info=True)
                result_text = f"Error executing {tool_name}: {exc}"

            tool_results.append(
                {
                    "type": "tool_result",
                    "tool_use_id": tool_id,
                    "content": result_text,
                }
            )

    if not tool_results:
        return {"messages": [], "tool_call_count": 0}

    user_message = {
        "role": "user",
        "content": tool_results,
    }
    return {"messages": [user_message], "tool_call_count": tool_count}


def extract_response_node(state: GMAgentState) -> dict:
    """Extract the final GM narrative and metadata from the conversation."""
    messages = state.get("messages", [])
    last_msg = messages[-1] if messages else {}

    content_blocks = last_msg.get("content", [])
    if isinstance(content_blocks, str):
        return {
            "final_response": content_blocks,
            "response_metadata": {},
        }

    response_text_parts = []
    for block in content_blocks:
        if isinstance(block, dict) and block.get("type") == "text":
            response_text_parts.append(block.get("text", ""))

    response_text = "\n".join(response_text_parts).strip()
    if not response_text:
        response_text = "The world shifts around you, but the vision fades before it fully forms..."

    return {
        "final_response": response_text,
        "response_metadata": {},
    }
