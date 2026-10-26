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

from langgraph.config import get_stream_writer
from core.errors import TECHNICAL_DIFFICULTIES_MESSAGE
from core.regional_bedrock import DEFAULT_MODEL_ID, RegionalBedrockClient
from experiences.game_master.orchestrator.narrator_notes import NarratorStream, NOTES_INSTRUCTIONS

from experiences.agui import (
    text_message_content,
    text_message_end,
    text_message_start,
)

logger = logging.getLogger(__name__)

DEFAULT_MODEL = DEFAULT_MODEL_ID


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
        self.notes: dict = {}


def generate_narration(
    system_prompt: str,
    user_text: str,
    *,
    model_id: str = DEFAULT_MODEL,
    region: str = "us-east-1",
    max_tokens: int = 1600,
    temperature: float = 0.9,
    message_id: str | None = None,
) -> Narration:
    """One call: stream public prose, collect bounded authored annotations."""
    mid = message_id or str(uuid.uuid4())
    client = RegionalBedrockClient(region_name=region)

    request = {
        "anthropic_version": "bedrock-2023-05-31",
        "max_tokens": max_tokens,
        "system": system_prompt + "\n\n" + NOTES_INSTRUCTIONS,
        "messages": [{"role": "user", "content": user_text}],
        "temperature": temperature,
    }

    _emit(text_message_start(mid, "assistant"))

    parts: list[str] = []
    parser = NarratorStream()
    result = Narration(mid)
    failed = False
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
                public = parser.feed(text)
                if public:
                    parts.append(public)
                    _emit(text_message_content(mid, public))
    except Exception as exc:  # noqa: BLE001 - keep the stream alive on failure
        logger.error("Bedrock narration failed: %s", exc, exc_info=True)
        failed = True
        pending = parser.finish_public()
        if pending:
            parts.append(pending)
            _emit(text_message_content(mid, pending))
        failure_text = ("\n" if parts else "") + TECHNICAL_DIFFICULTIES_MESSAGE
        _emit(text_message_content(mid, failure_text))
        parts.append(failure_text)
    finally:
        pending = parser.finish_public()
        if pending:
            parts.append(pending)
            _emit(text_message_content(mid, pending))
        _emit(text_message_end(mid))

    result.text = "".join(parts).strip()
    result.notes = {} if failed else parser.notes()
    return result


def narration_update(narration: Narration | str) -> dict:
    """Explicit JSON-safe graph output; tolerate plain-text test/legacy clients."""
    if isinstance(narration, Narration):
        return {"final_message": narration.text, "narrator_notes": narration.notes}
    return {"final_message": str(narration), "narrator_notes": {}}
