"""Bedrock narration for the orchestrator.

The LLM is used exclusively for narration / roleplay / world description. It
never resolves combat, never mutates stats, and never writes persistence. The
caller assembles a prompt that states the deterministic facts the GM should
describe, then this helper streams the reply as AG-UI TEXT_MESSAGE events.
"""

from __future__ import annotations

import json
import logging
import uuid
from typing import Any, Generator

import boto3
from langgraph.config import get_stream_writer

from experiences.agui import (
    text_message_content,
    text_message_end,
    text_message_start,
)

logger = logging.getLogger(__name__)

DEFAULT_MODEL = "us.anthropic.claude-haiku-4-5-20251001-v1:0"


def _emit(event: dict) -> None:
    try:
        get_stream_writer()(event)
    except Exception:  # not inside a stream context — swallow
        pass


class Narration:
    """Holds a streamed Bedrock narration and its accumulated text."""

    def __init__(self, message_id: str):
        self.message_id = message_id
        self.text = ""


def generate_narration(
    system_prompt: str,
    user_text: str,
    *,
    model_id: str = DEFAULT_MODEL,
    region: str = "us-east-1",
    max_tokens: int = 1600,
    temperature: float = 0.9,
    message_id: str | None = None,
) -> str:
    """Call Bedrock (streaming), emit AG-UI text events, return the text."""
    mid = message_id or str(uuid.uuid4())
    client = boto3.client("bedrock-runtime", region_name=region)

    request = {
        "anthropic_version": "bedrock-2023-05-31",
        "max_tokens": max_tokens,
        "system": system_prompt,
        "messages": [{"role": "user", "content": user_text}],
        "temperature": temperature,
    }

    _emit(text_message_start(mid, "assistant"))

    parts: list[str] = []
    try:
        response = client.invoke_model_with_response_stream(
            modelId=model_id,
            body=json.dumps(request),
        )
        for chunk in response["body"]:
            data = json.loads(chunk["chunk"]["bytes"])
            if data.get("type") != "content_block_delta":
                continue
            delta = data.get("delta", {})
            if delta.get("type") != "text_delta":
                continue
            text = delta.get("text", "")
            if text:
                parts.append(text)
                _emit(text_message_content(mid, text))
    except Exception as exc:  # noqa: BLE001 - keep the stream alive on failure
        logger.error("Bedrock narration failed: %s", exc, exc_info=True)
        _emit(text_message_content(mid, "\n(The GM's voice falters and dies, though the world remains.)"))
        parts.append("\n(The GM's voice falters and dies, and the world waits.)")
    finally:
        _emit(text_message_end(mid))

    return "".join(parts).strip()