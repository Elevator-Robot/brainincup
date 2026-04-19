"""
Property-based tests for stat_check.resolve_stat_check using Hypothesis.

Properties verified for all (dice_value in [1,20], stat_value in [1,20],
dc in [5,25], base_xp in [5,25]):
  - stat_modifier == floor((stat_value - 10) / 2)
  - roll_result == dice_value + stat_modifier
  - dice_value == 20 → CRITICAL_SUCCESS, xp_awarded == base_xp * 2
  - dice_value == 1  → CRITICAL_FAILURE, xp_awarded == 0
  - dice_value in [2,19] and roll_result >= dc → SUCCESS, xp_awarded > 0
  - dice_value in [2,19] and roll_result < dc  → FAILURE, xp_awarded == 0

**Validates: Requirements 6.3, 6.4, 6.5, 6.6, 6.7**
"""

import math
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from hypothesis import given, settings
from hypothesis import strategies as st

from stat_check import StatCheckRequest, resolve_stat_check


# ---------------------------------------------------------------------------
# Shared strategy for all valid inputs
# ---------------------------------------------------------------------------

valid_inputs = {
    "dice_value": st.integers(min_value=1, max_value=20),
    "stat_value": st.integers(min_value=1, max_value=20),
    "dc": st.integers(min_value=5, max_value=25),
    "base_xp": st.integers(min_value=5, max_value=25),
}


# ---------------------------------------------------------------------------
# Property 1: stat_modifier == floor((stat_value - 10) / 2)
# **Validates: Requirements 6.3**
# ---------------------------------------------------------------------------

@settings(max_examples=500)
@given(
    dice_value=st.integers(min_value=1, max_value=20),
    stat_value=st.integers(min_value=1, max_value=20),
    dc=st.integers(min_value=5, max_value=25),
    base_xp=st.integers(min_value=5, max_value=25),
)
def test_stat_modifier_formula(dice_value, stat_value, dc, base_xp):
    """stat_modifier is always floor((stat_value - 10) / 2)."""
    req = StatCheckRequest(
        stat_name="strength",
        stat_value=stat_value,
        difficulty_class=dc,
        dice_value=dice_value,
        base_xp=base_xp,
    )
    result = resolve_stat_check(req)
    expected_modifier = math.floor((stat_value - 10) / 2)
    assert result.stat_modifier == expected_modifier, (
        f"stat_modifier={result.stat_modifier} != {expected_modifier} "
        f"for stat_value={stat_value}"
    )


# ---------------------------------------------------------------------------
# Property 2: roll_result == dice_value + stat_modifier
# **Validates: Requirements 6.3**
# ---------------------------------------------------------------------------

@settings(max_examples=500)
@given(
    dice_value=st.integers(min_value=1, max_value=20),
    stat_value=st.integers(min_value=1, max_value=20),
    dc=st.integers(min_value=5, max_value=25),
    base_xp=st.integers(min_value=5, max_value=25),
)
def test_roll_result_formula(dice_value, stat_value, dc, base_xp):
    """roll_result is always dice_value + stat_modifier."""
    req = StatCheckRequest(
        stat_name="dexterity",
        stat_value=stat_value,
        difficulty_class=dc,
        dice_value=dice_value,
        base_xp=base_xp,
    )
    result = resolve_stat_check(req)
    assert result.roll_result == dice_value + result.stat_modifier, (
        f"roll_result={result.roll_result} != {dice_value} + {result.stat_modifier}"
    )


# ---------------------------------------------------------------------------
# Property 3: natural 20 → CRITICAL_SUCCESS, xp_awarded == base_xp * 2
# **Validates: Requirements 6.6**
# ---------------------------------------------------------------------------

@settings(max_examples=500)
@given(
    stat_value=st.integers(min_value=1, max_value=20),
    dc=st.integers(min_value=5, max_value=25),
    base_xp=st.integers(min_value=5, max_value=25),
)
def test_natural_20_is_critical_success(stat_value, dc, base_xp):
    """A natural 20 always produces CRITICAL_SUCCESS with double XP."""
    req = StatCheckRequest(
        stat_name="strength",
        stat_value=stat_value,
        difficulty_class=dc,
        dice_value=20,
        base_xp=base_xp,
    )
    result = resolve_stat_check(req)
    assert result.outcome == "CRITICAL_SUCCESS", (
        f"Expected CRITICAL_SUCCESS on natural 20, got {result.outcome}"
    )
    assert result.xp_awarded == base_xp * 2, (
        f"Expected xp_awarded={base_xp * 2} on CRITICAL_SUCCESS, got {result.xp_awarded}"
    )


# ---------------------------------------------------------------------------
# Property 4: natural 1 → CRITICAL_FAILURE, xp_awarded == 0
# **Validates: Requirements 6.7**
# ---------------------------------------------------------------------------

@settings(max_examples=500)
@given(
    stat_value=st.integers(min_value=1, max_value=20),
    dc=st.integers(min_value=5, max_value=25),
    base_xp=st.integers(min_value=5, max_value=25),
)
def test_natural_1_is_critical_failure(stat_value, dc, base_xp):
    """A natural 1 always produces CRITICAL_FAILURE with 0 XP."""
    req = StatCheckRequest(
        stat_name="wisdom",
        stat_value=stat_value,
        difficulty_class=dc,
        dice_value=1,
        base_xp=base_xp,
    )
    result = resolve_stat_check(req)
    assert result.outcome == "CRITICAL_FAILURE", (
        f"Expected CRITICAL_FAILURE on natural 1, got {result.outcome}"
    )
    assert result.xp_awarded == 0, (
        f"Expected xp_awarded=0 on CRITICAL_FAILURE, got {result.xp_awarded}"
    )


# ---------------------------------------------------------------------------
# Property 5: dice_value in [2,19] and roll_result >= dc → SUCCESS, xp > 0
# **Validates: Requirements 6.4**
# ---------------------------------------------------------------------------

@settings(max_examples=500)
@given(
    dice_value=st.integers(min_value=2, max_value=19),
    stat_value=st.integers(min_value=1, max_value=20),
    dc=st.integers(min_value=5, max_value=25),
    base_xp=st.integers(min_value=5, max_value=25),
)
def test_success_when_roll_meets_dc(dice_value, stat_value, dc, base_xp):
    """When dice in [2,19] and roll_result >= dc, outcome is SUCCESS with xp > 0."""
    stat_modifier = math.floor((stat_value - 10) / 2)
    roll_result = dice_value + stat_modifier
    if roll_result < dc:
        return  # skip — this case is covered by the failure property

    req = StatCheckRequest(
        stat_name="intelligence",
        stat_value=stat_value,
        difficulty_class=dc,
        dice_value=dice_value,
        base_xp=base_xp,
    )
    result = resolve_stat_check(req)
    assert result.outcome == "SUCCESS", (
        f"Expected SUCCESS when roll_result={roll_result} >= dc={dc}, got {result.outcome}"
    )
    assert result.xp_awarded > 0, (
        f"Expected xp_awarded > 0 on SUCCESS, got {result.xp_awarded}"
    )


# ---------------------------------------------------------------------------
# Property 6: dice_value in [2,19] and roll_result < dc → FAILURE, xp == 0
# **Validates: Requirements 6.5**
# ---------------------------------------------------------------------------

@settings(max_examples=500)
@given(
    dice_value=st.integers(min_value=2, max_value=19),
    stat_value=st.integers(min_value=1, max_value=20),
    dc=st.integers(min_value=5, max_value=25),
    base_xp=st.integers(min_value=5, max_value=25),
)
def test_failure_when_roll_misses_dc(dice_value, stat_value, dc, base_xp):
    """When dice in [2,19] and roll_result < dc, outcome is FAILURE with xp == 0."""
    stat_modifier = math.floor((stat_value - 10) / 2)
    roll_result = dice_value + stat_modifier
    if roll_result >= dc:
        return  # skip — this case is covered by the success property

    req = StatCheckRequest(
        stat_name="charisma",
        stat_value=stat_value,
        difficulty_class=dc,
        dice_value=dice_value,
        base_xp=base_xp,
    )
    result = resolve_stat_check(req)
    assert result.outcome == "FAILURE", (
        f"Expected FAILURE when roll_result={roll_result} < dc={dc}, got {result.outcome}"
    )
    assert result.xp_awarded == 0, (
        f"Expected xp_awarded=0 on FAILURE, got {result.xp_awarded}"
    )
