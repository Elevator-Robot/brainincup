"""
Pacing Engine — pure Python module with no external I/O.

Takes a PacingMetrics snapshot and returns a list of PacingSignal values
based on threshold logic defined in the RPG Gameplay Systems design.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum


class PacingSignal(Enum):
    REWARD_NUDGE = "reward_nudge"
    QUEST_NUDGE = "quest_nudge"
    SURPRISE_EVENT_INJECT = "surprise_event_inject"
    RESOLUTION_BEAT = "resolution_beat"
    COMPLICATION_INJECT = "complication_inject"
    CHAPTER_ADVANCE = "chapter_advance"
    DIFFICULTY_INCREASE = "difficulty_increase"
    DIFFICULTY_DECREASE = "difficulty_decrease"


@dataclass
class PacingMetrics:
    turns_since_last_xp_award: int = 0
    turns_since_last_level_up: int = 0
    turns_since_last_quest_step: int = 0
    turns_since_last_surprise_event: int = 0
    current_tension_level: int = 5          # 1–10
    consecutive_turns_at_high_tension: int = 0
    consecutive_turns_at_low_tension: int = 0
    current_act: str = ""
    stat_check_history: list[str] = field(default_factory=list)  # last 10 outcomes
    difficulty_modifier: float = 0.0
    difficulty_modifier_turns_remaining: int = 0
    last_surprise_event_ids: dict[str, int] = field(default_factory=dict)
    total_turns: int = 0
    all_chapter_scenarios_over_leveled: bool = False


def evaluate_pacing(metrics: PacingMetrics) -> list[PacingSignal]:
    """Pure function. No I/O. Returns signals based on metric thresholds."""
    signals: list[PacingSignal] = []

    # Reward nudge: no XP in more than 5 turns
    if metrics.turns_since_last_xp_award > 5:
        signals.append(PacingSignal.REWARD_NUDGE)

    # Quest nudge: no quest step in more than 8 turns
    if metrics.turns_since_last_quest_step > 8:
        signals.append(PacingSignal.QUEST_NUDGE)

    # Surprise event: no surprise in more than 12 turns
    if metrics.turns_since_last_surprise_event > 12:
        signals.append(PacingSignal.SURPRISE_EVENT_INJECT)

    # Tension fatigue: high tension (>=8) for 3+ consecutive turns
    if metrics.consecutive_turns_at_high_tension >= 3:
        signals.append(PacingSignal.RESOLUTION_BEAT)

    # Low engagement: low tension (<=2) for 4+ consecutive turns
    if metrics.consecutive_turns_at_low_tension >= 4:
        signals.append(PacingSignal.COMPLICATION_INJECT)

    # Difficulty adaptation based on last 10 stat checks
    history = metrics.stat_check_history[-10:]
    if len(history) >= 10:
        success_rate = sum(
            1 for o in history if o in ("SUCCESS", "CRITICAL_SUCCESS")
        ) / 10
        if success_rate > 0.8 and metrics.difficulty_modifier_turns_remaining == 0:
            signals.append(PacingSignal.DIFFICULTY_INCREASE)
        elif success_rate < 0.3 and metrics.difficulty_modifier_turns_remaining == 0:
            signals.append(PacingSignal.DIFFICULTY_DECREASE)

    # Chapter advance: all available scenarios are over-leveled
    if metrics.all_chapter_scenarios_over_leveled:
        signals.append(PacingSignal.CHAPTER_ADVANCE)

    return signals
