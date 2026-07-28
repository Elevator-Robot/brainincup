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
    conversation_history: list[dict] = field(default_factory=list)


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
