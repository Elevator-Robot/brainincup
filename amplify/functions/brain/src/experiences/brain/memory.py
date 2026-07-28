from __future__ import annotations

import json
import logging
import os
from typing import Any

logger = logging.getLogger(__name__)


def get_memory_namespace(user_id: str) -> str:
    return f"/user/{user_id}/brain/long_term/"


def get_episodic_namespace(user_id: str) -> str:
    return f"/user/{user_id}/brain/episodic/"


def save_conversation_memory(
    dynamodb_resource: Any,
    conversation_id: str,
    user_input: str,
    response_text: str,
    owner: str | None = None,
) -> None:
    memory_table_name = os.getenv("MEMORY_TABLE_NAME")
    if not memory_table_name or not dynamodb_resource:
        logger.warning("Memory table not configured; skipping memory save")
        return
    try:
        table = dynamodb_resource.Table(memory_table_name)
        table.put_item(
            Item={
                "conversationId": conversation_id,
                "timestamp": __import__("datetime").datetime.utcnow().isoformat(),
                "userInput": user_input,
                "response": response_text,
                "owner": owner or "anonymous",
                "experience": "brain",
            }
        )
    except Exception as error:
        logger.warning("Failed to save brain conversation memory: %s", error)
