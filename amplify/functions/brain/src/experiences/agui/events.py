"""AG-UI (Agent-User Interaction Protocol) event builders and SSE serialization.

AG-UI is an open, event-based protocol that standardizes how agents
communicate with user-facing applications. The backend emits these events
as Server-Sent Events (SSE) over the Lambda Function URL stream.

Event type strings follow the AG-UI specification:
https://docs.ag-ui.com/concepts/events
"""

from __future__ import annotations

import json
import uuid
from typing import Any


def _new_run_id() -> str:
    return str(uuid.uuid4())


def run_started(thread_id: str, run_id: str | None = None, input_data: Any = None) -> dict:
    event = {"type": "RUN_STARTED", "threadId": thread_id, "runId": run_id or _new_run_id()}
    if input_data is not None:
        event["input"] = input_data
    return event


def run_finished(thread_id: str, run_id: str, result: Any = None) -> dict:
    event = {
        "type": "RUN_FINISHED",
        "threadId": thread_id,
        "runId": run_id,
        "outcome": {"type": "success"},
    }
    if result is not None:
        event["result"] = result
    return event


def run_error(message: str, code: str | None = None) -> dict:
    event = {"type": "RUN_ERROR", "message": message}
    if code:
        event["code"] = code
    return event


def step_started(step_name: str) -> dict:
    return {"type": "STEP_STARTED", "stepName": step_name}


def step_finished(step_name: str) -> dict:
    return {"type": "STEP_FINISHED", "stepName": step_name}


def text_message_start(message_id: str, role: str = "assistant") -> dict:
    return {"type": "TEXT_MESSAGE_START", "messageId": message_id, "role": role}


def text_message_content(message_id: str, delta: str) -> dict:
    return {"type": "TEXT_MESSAGE_CONTENT", "messageId": message_id, "delta": delta}


def text_message_end(message_id: str) -> dict:
    return {"type": "TEXT_MESSAGE_END", "messageId": message_id}


def tool_call_start(tool_call_id: str, tool_call_name: str, parent_message_id: str | None = None) -> dict:
    event = {"type": "TOOL_CALL_START", "toolCallId": tool_call_id, "toolCallName": tool_call_name}
    if parent_message_id:
        event["parentMessageId"] = parent_message_id
    return event


def tool_call_args(tool_call_id: str, delta: str) -> dict:
    return {"type": "TOOL_CALL_ARGS", "toolCallId": tool_call_id, "delta": delta}


def tool_call_end(tool_call_id: str) -> dict:
    return {"type": "TOOL_CALL_END", "toolCallId": tool_call_id}


def tool_call_result(tool_call_id: str, content: Any, message_id: str | None = None) -> dict:
    event = {
        "type": "TOOL_CALL_RESULT",
        "toolCallId": tool_call_id,
        "content": content,
        "role": "tool",
    }
    if message_id:
        event["messageId"] = message_id
    return event


def state_snapshot(snapshot: Any) -> dict:
    return {"type": "STATE_SNAPSHOT", "snapshot": snapshot}


def state_delta(patches: list[dict]) -> dict:
    return {"type": "STATE_DELTA", "delta": patches}


def custom_event(name: str, value: Any = None) -> dict:
    event = {"type": "CUSTOM", "name": name}
    if value is not None:
        event["value"] = value
    return event


def reasoning_message_start(message_id: str, role: str = "assistant") -> dict:
    return {"type": "REASONING_MESSAGE_START", "messageId": message_id, "role": role}


def reasoning_message_content(message_id: str, delta: str) -> dict:
    return {"type": "REASONING_MESSAGE_CONTENT", "messageId": message_id, "delta": delta}


def reasoning_message_end(message_id: str) -> dict:
    return {"type": "REASONING_MESSAGE_END", "messageId": message_id}


def serialize_sse(events: list[dict]) -> str:
    """Serialize AG-UI events into an SSE payload."""
    chunks = []
    for event in events:
        chunks.append("event: agui\ndata: " + json.dumps(event) + "\n\n")
    return "".join(chunks)


def sse_event(event: dict) -> str:
    """Serialize a single AG-UI event into an SSE frame."""
    return "event: agui\ndata: " + json.dumps(event) + "\n\n"
