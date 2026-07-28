from __future__ import annotations

from typing import Any

from experiences.base import BaseExperience


class ExperienceRegistry:
    _experiences: dict[str, type[BaseExperience]] = {}

    @classmethod
    def register(cls, experience_id: str, experience_cls: type[BaseExperience]) -> None:
        cls._experiences[experience_id] = experience_cls

    @classmethod
    def get(cls, experience_id: str) -> type[BaseExperience]:
        cls_ = cls._experiences.get(experience_id)
        if not cls_:
            msg = f"Unknown experience: {experience_id}. Available: {list(cls._experiences.keys())}"
            raise ValueError(msg)
        return cls_

    @classmethod
    def get_or_none(cls, experience_id: str) -> type[BaseExperience] | None:
        return cls._experiences.get(experience_id)

    @classmethod
    def list_experiences(cls) -> list[str]:
        return list(cls._experiences.keys())

    @classmethod
    def create_instance(cls, experience_id: str, **kwargs: Any) -> BaseExperience:
        cls_ = cls.get(experience_id)
        return cls_(experience_id=experience_id, **kwargs)


def normalize_experience_id(raw: str | None) -> str:
    if not raw:
        return "brain"
    normalized = raw.strip().lower()
    if normalized in ("rpg_dm", "game_master"):
        return "game_master"
    if normalized in ("default", "brain"):
        return "brain"
    return "brain"


# Auto-register built-in experiences
from experiences.brain.experience import BrainExperience  # noqa: E402
from experiences.game_master.experience import GameMasterExperience  # noqa: E402

ExperienceRegistry.register("brain", BrainExperience)
ExperienceRegistry.register("game_master", GameMasterExperience)
