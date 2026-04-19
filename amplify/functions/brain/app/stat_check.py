from __future__ import annotations
import math
from dataclasses import dataclass
from typing import Literal

@dataclass
class StatCheckRequest:
    stat_name: str        # e.g. "strength"
    stat_value: int       # raw stat value (1–20)
    difficulty_class: int # 5–25
    dice_value: int       # 1–20 (from TroubleDice3D)
    base_xp: int = 10     # XP for a normal success

@dataclass
class StatCheckResult:
    outcome: Literal["CRITICAL_SUCCESS", "SUCCESS", "FAILURE", "CRITICAL_FAILURE"]
    roll_result: int      # dice_value + stat_modifier
    stat_modifier: int    # floor((stat_value - 10) / 2)
    xp_awarded: int
    narrative_hint: str   # "near_miss" | "solid_success" | "critical" | "solid_failure" | "critical_failure"

def resolve_stat_check(req: StatCheckRequest) -> StatCheckResult:
    """Pure function. No I/O."""
    stat_modifier = math.floor((req.stat_value - 10) / 2)
    roll_result = req.dice_value + stat_modifier

    if req.dice_value == 20:
        return StatCheckResult(
            outcome="CRITICAL_SUCCESS",
            roll_result=roll_result,
            stat_modifier=stat_modifier,
            xp_awarded=req.base_xp * 2,
            narrative_hint="critical",
        )
    if req.dice_value == 1:
        return StatCheckResult(
            outcome="CRITICAL_FAILURE",
            roll_result=roll_result,
            stat_modifier=stat_modifier,
            xp_awarded=0,
            narrative_hint="critical_failure",
        )
    if roll_result >= req.difficulty_class:
        return StatCheckResult(
            outcome="SUCCESS",
            roll_result=roll_result,
            stat_modifier=stat_modifier,
            xp_awarded=req.base_xp,
            narrative_hint="solid_success",
        )
    # FAILURE
    margin = req.difficulty_class - roll_result
    if margin <= 2:
        hint = "near_miss"
    elif margin <= 5:
        hint = "solid_failure"
    else:
        hint = "critical_failure"
    return StatCheckResult(
        outcome="FAILURE",
        roll_result=roll_result,
        stat_modifier=stat_modifier,
        xp_awarded=0,
        narrative_hint=hint,
    )
