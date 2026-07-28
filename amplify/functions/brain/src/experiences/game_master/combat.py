from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Literal


@dataclass
class StatCheckRequest:
    stat_name: str
    stat_value: int
    difficulty_class: int
    dice_value: int
    base_xp: int = 10


@dataclass
class StatCheckResult:
    outcome: Literal["CRITICAL_SUCCESS", "SUCCESS", "FAILURE", "CRITICAL_FAILURE"]
    roll_result: int
    stat_modifier: int
    xp_awarded: int
    narrative_hint: str


def resolve_stat_check(req: StatCheckRequest) -> StatCheckResult:
    """Resolve a stat check: pure function with no I/O."""
    stat_modifier = math.floor((req.stat_value - 10) / 2)
    roll_result = req.dice_value + stat_modifier

    if req.dice_value == 20:
        return StatCheckResult(
            outcome="CRITICAL_SUCCESS", roll_result=roll_result,
            stat_modifier=stat_modifier, xp_awarded=req.base_xp * 2,
            narrative_hint="critical",
        )
    if req.dice_value == 1:
        return StatCheckResult(
            outcome="CRITICAL_FAILURE", roll_result=roll_result,
            stat_modifier=stat_modifier, xp_awarded=0,
            narrative_hint="critical_failure",
        )
    if roll_result >= req.difficulty_class:
        return StatCheckResult(
            outcome="SUCCESS", roll_result=roll_result,
            stat_modifier=stat_modifier, xp_awarded=req.base_xp,
            narrative_hint="solid_success",
        )
    margin = req.difficulty_class - roll_result
    hint = "near_miss" if margin <= 2 else "solid_failure" if margin <= 5 else "critical_failure"
    return StatCheckResult(
        outcome="FAILURE", roll_result=roll_result,
        stat_modifier=stat_modifier, xp_awarded=0, narrative_hint=hint,
    )
