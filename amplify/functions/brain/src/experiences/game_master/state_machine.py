from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Optional


class StoryAct(Enum):
    EXPOSITION = "EXPOSITION"
    RISING_ACTION = "RISING_ACTION"
    CLIMAX = "CLIMAX"
    FALLING_ACTION = "FALLING_ACTION"
    RESOLUTION = "RESOLUTION"


class StoryBeat(Enum):
    NARRATIVE = "NARRATIVE"
    CONFLICT = "CONFLICT"
    DISCOVERY = "DISCOVERY"
    SOCIAL = "SOCIAL"
    REST = "REST"


@dataclass
class GameState:
    current_location: str = "The Shrouded Vale"
    current_scene: str = ""
    current_act: StoryAct = StoryAct.EXPOSITION
    current_chapter: int = 1
    tension_level: int = 3
    timeline: list[dict] = field(default_factory=list)
    visited_locations: list[dict] = field(default_factory=list)
    active_objectives: list[dict] = field(default_factory=list)
    critical_choices: list[dict] = field(default_factory=list)
    story_arc: dict = field(default_factory=dict)
    turns_in_chapter: int = 0
    turns_since_conflict: int = 0
    last_story_beat: Optional[StoryBeat] = None


class GameStateMachine:
    """Manages narrative state transitions for the Game Master experience."""

    def __init__(self, state: Optional[GameState] = None):
        self.state = state or GameState()

    def to_dict(self) -> dict[str, Any]:
        return {
            "currentLocation": self.state.current_location,
            "currentScene": self.state.current_scene,
            "currentAct": self.state.current_act.value,
            "currentChapter": self.state.current_chapter,
            "tensionLevel": self.state.tension_level,
            "timeline": self.state.timeline[-10:],
            "visitedLocations": self.state.visited_locations,
            "activeObjectives": self.state.active_objectives,
            "criticalChoices": self.state.critical_choices,
        }

    def update_location(self, new_location: str, scene: str = "") -> None:
        self.state.current_location = new_location
        if scene:
            self.state.current_scene = scene

    def add_timeline_event(self, event: dict) -> None:
        self.state.timeline.append(event)
        if len(self.state.timeline) > 50:
            self.state.timeline = self.state.timeline[-50:]

    def advance_act(self, new_act: StoryAct) -> None:
        self.state.current_act = new_act
        self.state.current_chapter += 1
        self.state.turns_in_chapter = 0
