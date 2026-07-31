from __future__ import annotations

from typing import Annotated, TypedDict


def _merge_messages(left: list, right: list) -> list:
    return left + right


def _accumulate_tool_calls(left: int, right: int) -> int:
    return left + right


MAX_TOOL_CALLS = 10


class GMAgentState(TypedDict):
    conversation_id: str
    user_input: str
    message_id: str | None
    owner: str | None
    player_state: dict
    game_context: dict
    system_prompt: str
    messages: Annotated[list, _merge_messages]
    final_response: str
    response_metadata: dict
    model_id: str
    region: str
    tool_call_count: Annotated[int, _accumulate_tool_calls]
