from __future__ import annotations

import json
import logging
import uuid

import boto3
from langgraph.config import get_stream_writer

from experiences.agui import (
    custom_event,
    reasoning_message_content,
    reasoning_message_end,
    state_delta,
    state_snapshot,
    step_finished,
    step_started,
    text_message_content,
    text_message_end,
    text_message_start,
    tool_call_args,
    tool_call_end,
    tool_call_result,
    tool_call_start,
)
from experiences.game_master.gm_agent.state import GMAgentState
from experiences.game_master.gm_agent.tools import execute_tool, get_tool_specs

logger = logging.getLogger(__name__)


def _emit(state: GMAgentState, event: dict) -> None:
    writer = get_stream_writer()
    writer(event)


def _gm_message_id(state: GMAgentState) -> str:
    return state.get("message_id") or str(uuid.uuid4())


def _state_snapshot(state: GMAgentState) -> dict:
    player_state = state.get("player_state", {})
    return {
        "character": {
            "level": player_state.get("currentLevel", 1),
            "currentHP": player_state.get("currentHP", 20),
            "maxHP": player_state.get("maxHP", 20),
            "xp": player_state.get("currentXP", 0),
            "xpToNextLevel": player_state.get("xpToNextLevel", 100),
        },
        "location": {
            "currentAreaId": player_state.get("currentAreaId", "area_shrouded_vale"),
            "displayName": player_state.get("lastKnownLocation", "The Shrouded Vale"),
        },
        "tension": state.get("game_context", {}).get("tension", 3),
    }


def assemble_context_node(state: GMAgentState) -> dict:
    """Build the game context block and create the initial user message."""
    _emit(state, step_started("assemble_context"))

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

    _emit(state, state_snapshot(_state_snapshot(state)))
    _emit(state, step_finished("assemble_context"))

    return {"messages": [user_message]}


def _stream_claude_block(
    block: dict,
    *,
    state: GMAgentState,
    message_id: str,
    text_parts: list[str],
    thinking_parts: list[str],
) -> dict | None:
    """Translate a single Bedrock streaming chunk block into AG-UI events.

    Returns the complete tool_use block when the model finishes emitting one.
    """
    block_type = block.get("type")

    if block_type in ("text", "text_delta"):
        text = block.get("text", "")
        if text:
            text_parts.append(text)
            _emit(state, text_message_content(message_id, text))
        return None

    if block_type in ("thinking", "thinking_delta"):
        thinking = block.get("thinking") or block.get("delta") or ""
        if thinking:
            thinking_parts.append(thinking)
            _emit(state, reasoning_message_content(f"{message_id}:thinking", thinking))
        return None

    if block_type == "tool_use":
        tool_use = {
            "type": "tool_use",
            "id": block.get("id", str(uuid.uuid4())),
            "name": block.get("name", ""),
            "input": block.get("input", {}),
        }
        _emit(state, tool_call_start(tool_use["id"], tool_use["name"], parent_message_id=message_id))
        try:
            _emit(state, tool_call_args(tool_use["id"], json.dumps(tool_use["input"])))
        except TypeError:
            _emit(state, tool_call_args(tool_use["id"], str(tool_use["input"])))
        _emit(state, tool_call_end(tool_use["id"]))
        return tool_use

    return None


def agent_node(state: GMAgentState) -> dict:
    """Call Bedrock Claude with the conversation history and tool definitions.

    Uses response streaming so tokens are emitted as AG-UI TEXT_MESSAGE events
    in real time. Tool uses are accumulated into the returned assistant message.
    """
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

    message_id = _gm_message_id(state)
    _emit(state, step_started("agent"))
    _emit(state, text_message_start(message_id, "assistant"))

    content_blocks: list[dict] = []
    text_parts: list[str] = []
    thinking_parts: list[str] = []

    try:
        response = client.invoke_model_with_response_stream(
            modelId=model_id,
            body=json.dumps(request),
        )
        stream = response["body"]

        for chunk in stream:
            chunk_data = json.loads(chunk["chunk"]["bytes"])
            chunk_type = chunk_data.get("type")

            if chunk_type == "message_start":
                continue

            if chunk_type == "content_block_start":
                block = chunk_data.get("content_block", {})
                tool_use = _stream_claude_block(
                    block, state=state, message_id=message_id,
                    text_parts=text_parts, thinking_parts=thinking_parts,
                )
                if tool_use:
                    content_blocks.append(tool_use)
                continue

            if chunk_type == "content_block_delta":
                delta = chunk_data.get("delta", {})
                _stream_claude_block(
                    delta, state=state, message_id=message_id,
                    text_parts=text_parts, thinking_parts=thinking_parts,
                )
                continue

            if chunk_type == "content_block_stop":
                continue

            if chunk_type == "message_delta":
                stop_reason = chunk_data.get("delta", {}).get("stop_reason")
                if stop_reason:
                    logger.debug("Stop reason: %s", stop_reason)
                continue

            if chunk_type == "message_stop":
                break
    except Exception as exc:
        logger.error("Bedrock streaming invocation failed: %s", exc, exc_info=True)
        _emit(state, text_message_content(message_id, "\n\nThe Game Master's words falter, lost in the void..."))
        content_blocks.append({"type": "text", "text": "".join(text_parts)})
        raise

    if thinking_parts:
        _emit(state, reasoning_message_end(f"{message_id}:thinking"))

    full_text = "".join(text_parts)
    if full_text:
        content_blocks.insert(0, {"type": "text", "text": full_text})

    _emit(state, text_message_end(message_id))
    _emit(state, step_finished("agent"))

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
    state_patches: list[dict] = []

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

            _emit(state, tool_call_result(tool_id, result_text, message_id=state.get("message_id")))
            state_patches.extend(_tool_state_patches(tool_name, tool_input, player_state))

            tool_results.append(
                {
                    "type": "tool_result",
                    "tool_use_id": tool_id,
                    "content": result_text,
                }
            )

    if not tool_results:
        return {"messages": [], "tool_call_count": 0}

    if state_patches:
        _emit(state, state_delta(state_patches))

    user_message = {
        "role": "user",
        "content": tool_results,
    }
    return {"messages": [user_message], "tool_call_count": tool_count}


def _tool_state_patches(tool_name: str, tool_input: dict, player_state: dict) -> list[dict]:
    """Build RFC 6902 JSON Patch ops reflecting a tool's effect on player state.

    These are optimistic/visual deltas for the frontend. Authoritative state is
    reconciled by the PlayerState AppSync subscription.
    """
    patches = []
    xp = player_state.get("currentXP")
    hp = player_state.get("currentHP")
    area = player_state.get("lastKnownLocation")
    tension = player_state.get("pacingMetrics", {}).get("tension")

    if tool_name == "award_xp" and isinstance(xp, (int, float)):
        patches.append({"op": "replace", "path": "/character/xp", "value": int(xp) + int(tool_input.get("amount", 0))})
    elif tool_name == "modify_hp" and isinstance(hp, (int, float)):
        new_hp = max(0, int(hp) + int(tool_input.get("amount", 0)))
        patches.append({"op": "replace", "path": "/character/currentHP", "value": new_hp})
    elif tool_name == "transfer_area":
        patches.append({"op": "replace", "path": "/location/currentAreaId", "value": tool_input.get("area_id", "")})
        patches.append({"op": "replace", "path": "/location/displayName", "value": tool_input.get("area_name", area or "")})
    elif tool_name == "set_tension":
        patches.append({"op": "replace", "path": "/tension", "value": int(tool_input.get("level", 5))})

    return patches


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

    _emit(state, custom_event("response_complete", {"response": response_text, "metadata": {}}))

    return {
        "final_response": response_text,
        "response_metadata": {},
    }
