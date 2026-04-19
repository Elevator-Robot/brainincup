"""
Property-based tests for pacing_engine.evaluate_pacing using Hypothesis.

Each property verifies a single signal's emission condition (iff semantics):
  - signal IS emitted when threshold is met
  - signal is NOT emitted when threshold is not met

All other metrics are held at neutral values so only the tested dimension
can trigger the signal under test.

**Validates: Requirements 5.2, 5.3, 5.4, 5.5, 5.6**
"""

import sys
import os

# Allow importing from the parent app directory
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from hypothesis import given, settings
from hypothesis import strategies as st

from pacing_engine import PacingMetrics, PacingSignal, evaluate_pacing


# ---------------------------------------------------------------------------
# Composite strategy — generates valid PacingMetrics objects
# ---------------------------------------------------------------------------

@st.composite
def pacing_metrics_strategy(draw):
    """Generate a valid PacingMetrics with all fields in their legal ranges."""
    stat_outcomes = st.sampled_from(
        ["SUCCESS", "CRITICAL_SUCCESS", "FAILURE", "CRITICAL_FAILURE"]
    )
    history_len = draw(st.integers(min_value=0, max_value=10))
    history = draw(st.lists(stat_outcomes, min_size=history_len, max_size=history_len))

    return PacingMetrics(
        turns_since_last_xp_award=draw(st.integers(min_value=0, max_value=50)),
        turns_since_last_level_up=draw(st.integers(min_value=0, max_value=50)),
        turns_since_last_quest_step=draw(st.integers(min_value=0, max_value=50)),
        turns_since_last_surprise_event=draw(st.integers(min_value=0, max_value=50)),
        current_tension_level=draw(st.integers(min_value=1, max_value=10)),
        consecutive_turns_at_high_tension=draw(st.integers(min_value=0, max_value=20)),
        consecutive_turns_at_low_tension=draw(st.integers(min_value=0, max_value=20)),
        current_act=draw(st.sampled_from(["EXPOSITION", "RISING_ACTION", "CLIMAX", ""])),
        stat_check_history=history,
        difficulty_modifier=draw(st.floats(min_value=-0.5, max_value=0.5, allow_nan=False)),
        difficulty_modifier_turns_remaining=draw(st.integers(min_value=0, max_value=10)),
        last_surprise_event_ids={},
        total_turns=draw(st.integers(min_value=0, max_value=1000)),
        all_chapter_scenarios_over_leveled=draw(st.booleans()),
    )


# ---------------------------------------------------------------------------
# Helper: build a neutral PacingMetrics that triggers NO signals
# ---------------------------------------------------------------------------

def neutral_metrics(**overrides) -> PacingMetrics:
    """
    Returns a PacingMetrics where no signal threshold is met.
    Individual fields can be overridden via kwargs.
    """
    base = PacingMetrics(
        turns_since_last_xp_award=0,
        turns_since_last_level_up=0,
        turns_since_last_quest_step=0,
        turns_since_last_surprise_event=0,
        current_tension_level=5,
        consecutive_turns_at_high_tension=0,
        consecutive_turns_at_low_tension=0,
        current_act="EXPOSITION",
        stat_check_history=[],
        difficulty_modifier=0.0,
        difficulty_modifier_turns_remaining=0,
        last_surprise_event_ids={},
        total_turns=0,
        all_chapter_scenarios_over_leveled=False,
    )
    for k, v in overrides.items():
        object.__setattr__(base, k, v)
    return base


# ---------------------------------------------------------------------------
# Property 1: REWARD_NUDGE iff turns_since_last_xp_award > 5
# **Validates: Requirements 5.2**
# ---------------------------------------------------------------------------

@settings(max_examples=300)
@given(turns=st.integers(min_value=0, max_value=100))
def test_reward_nudge_iff_turns_gt_5(turns):
    """REWARD_NUDGE is emitted iff turns_since_last_xp_award > 5."""
    m = neutral_metrics(turns_since_last_xp_award=turns)
    signals = evaluate_pacing(m)
    if turns > 5:
        assert PacingSignal.REWARD_NUDGE in signals, (
            f"Expected REWARD_NUDGE when turns_since_last_xp_award={turns}"
        )
    else:
        assert PacingSignal.REWARD_NUDGE not in signals, (
            f"Did not expect REWARD_NUDGE when turns_since_last_xp_award={turns}"
        )


# ---------------------------------------------------------------------------
# Property 2: QUEST_NUDGE iff turns_since_last_quest_step > 8
# **Validates: Requirements 5.3**
# ---------------------------------------------------------------------------

@settings(max_examples=300)
@given(turns=st.integers(min_value=0, max_value=100))
def test_quest_nudge_iff_turns_gt_8(turns):
    """QUEST_NUDGE is emitted iff turns_since_last_quest_step > 8."""
    m = neutral_metrics(turns_since_last_quest_step=turns)
    signals = evaluate_pacing(m)
    if turns > 8:
        assert PacingSignal.QUEST_NUDGE in signals, (
            f"Expected QUEST_NUDGE when turns_since_last_quest_step={turns}"
        )
    else:
        assert PacingSignal.QUEST_NUDGE not in signals, (
            f"Did not expect QUEST_NUDGE when turns_since_last_quest_step={turns}"
        )


# ---------------------------------------------------------------------------
# Property 3: SURPRISE_EVENT_INJECT iff turns_since_last_surprise_event > 12
# **Validates: Requirements 5.4**
# ---------------------------------------------------------------------------

@settings(max_examples=300)
@given(turns=st.integers(min_value=0, max_value=100))
def test_surprise_event_inject_iff_turns_gt_12(turns):
    """SURPRISE_EVENT_INJECT is emitted iff turns_since_last_surprise_event > 12."""
    m = neutral_metrics(turns_since_last_surprise_event=turns)
    signals = evaluate_pacing(m)
    if turns > 12:
        assert PacingSignal.SURPRISE_EVENT_INJECT in signals, (
            f"Expected SURPRISE_EVENT_INJECT when turns_since_last_surprise_event={turns}"
        )
    else:
        assert PacingSignal.SURPRISE_EVENT_INJECT not in signals, (
            f"Did not expect SURPRISE_EVENT_INJECT when turns_since_last_surprise_event={turns}"
        )


# ---------------------------------------------------------------------------
# Property 4: RESOLUTION_BEAT iff consecutive_turns_at_high_tension >= 3
# **Validates: Requirements 5.5**
# ---------------------------------------------------------------------------

@settings(max_examples=300)
@given(consecutive=st.integers(min_value=0, max_value=20))
def test_resolution_beat_iff_consecutive_high_tension_gte_3(consecutive):
    """RESOLUTION_BEAT is emitted iff consecutive_turns_at_high_tension >= 3."""
    m = neutral_metrics(consecutive_turns_at_high_tension=consecutive)
    signals = evaluate_pacing(m)
    if consecutive >= 3:
        assert PacingSignal.RESOLUTION_BEAT in signals, (
            f"Expected RESOLUTION_BEAT when consecutive_turns_at_high_tension={consecutive}"
        )
    else:
        assert PacingSignal.RESOLUTION_BEAT not in signals, (
            f"Did not expect RESOLUTION_BEAT when consecutive_turns_at_high_tension={consecutive}"
        )


# ---------------------------------------------------------------------------
# Property 5: COMPLICATION_INJECT iff consecutive_turns_at_low_tension >= 4
# **Validates: Requirements 5.6**
# ---------------------------------------------------------------------------

@settings(max_examples=300)
@given(consecutive=st.integers(min_value=0, max_value=20))
def test_complication_inject_iff_consecutive_low_tension_gte_4(consecutive):
    """COMPLICATION_INJECT is emitted iff consecutive_turns_at_low_tension >= 4."""
    m = neutral_metrics(consecutive_turns_at_low_tension=consecutive)
    signals = evaluate_pacing(m)
    if consecutive >= 4:
        assert PacingSignal.COMPLICATION_INJECT in signals, (
            f"Expected COMPLICATION_INJECT when consecutive_turns_at_low_tension={consecutive}"
        )
    else:
        assert PacingSignal.COMPLICATION_INJECT not in signals, (
            f"Did not expect COMPLICATION_INJECT when consecutive_turns_at_low_tension={consecutive}"
        )
