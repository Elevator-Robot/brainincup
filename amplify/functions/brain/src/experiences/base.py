from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any


@dataclass
class ExperienceContext:
    conversation_id: str
    user_input: str
    message_id: str | None = None
    owner: str | None = None
    experience: str = "brain"
    run_id: str | None = None
    conversation_history: list[dict] = field(default_factory=list)


def normalize_request(payload: dict) -> dict:
    """Map either the AG-UI `RunAgentInput` shape or the app's legacy shape
    onto a common set of request fields.

    AG-UI clients send `{threadId, runId, messages, ...}`; the app's own client
    sends `{conversationId, messageId, owner, content}`. Returns a dict with
    `conversation_id`, `message_id`, `owner`, `user_input`, and `run_id`.
    """
    messages = payload.get("messages")
    if isinstance(messages, list) and payload.get("threadId"):
        user_input = ""
        for message in reversed(messages):
            if not isinstance(message, dict) or message.get("role") != "user":
                continue
            content = message.get("content", "")
            if isinstance(content, str):
                user_input = content
                break
            if isinstance(content, list):
                text_parts = [
                    part.get("text", "")
                    for part in content
                    if isinstance(part, dict) and part.get("type") == "text"
                ]
                if text_parts:
                    user_input = "".join(text_parts)
                    break
        return {
            "conversation_id": payload.get("threadId"),
            "message_id": payload.get("messageId"),
            "owner": payload.get("owner"),
            "user_input": user_input,
            "run_id": payload.get("runId"),
        }
    return {
        "conversation_id": payload.get("conversationId"),
        "message_id": payload.get("messageId"),
        "owner": payload.get("owner"),
        "user_input": payload.get("content"),
        "run_id": None,
    }


@dataclass
class ExperienceResponse:
    response: str
    raw: dict[str, Any] | None = None
    metadata: dict[str, Any] = field(default_factory=dict)


class BaseExperience(ABC):
    """Abstract base class that every experience must implement."""

    def __init__(self, experience_id: str):
        self.experience_id = experience_id

    @property
    @abstractmethod
    def display_name(self) -> str: ...

    @abstractmethod
    def get_system_prompt(self) -> str: ...

    @abstractmethod
    def process_message(self, ctx: ExperienceContext) -> ExperienceResponse: ...

    def enrich_context(self, ctx: ExperienceContext, base_context: str) -> str:
        return base_context

    def postprocess_response(
        self, ctx: ExperienceContext, response: ExperienceResponse
    ) -> ExperienceResponse:
        return response

    def get_tool_policy(self) -> dict[str, Any]:
        return {"tools": [], "permissions": {}}

    def sync_memory(
        self, ctx: ExperienceContext, response: ExperienceResponse
    ) -> None:
        pass
