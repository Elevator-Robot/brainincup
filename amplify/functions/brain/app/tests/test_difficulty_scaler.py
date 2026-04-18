"""
Property-based tests for difficulty_scaler.scale_difficulty_class using Hypothesis.

Properties verified for all valid input combinations:
  - base_dc in [5, 25]
  - char_level in [1, 10]
  - recommended_min_level in [1, 10]
  - pacing_modifier in [-0.15, 0.15]
  - max_dc = min(base_dc + 10, 25)

Properties:
  1. scaled DC is always in [5, 25]
  2. scaled DC never exceeds max_dc

**Validates: Requirements 10.2, 10.5**
"""

import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from hypothesis import given, settings
from hypothesis import strategies as st

from difficulty_scaler import scale_difficulty_class


# ---------------------------------------------------------------------------
# Shared strategy for valid inputs
# ---------------------------------------------------------------------------

valid_dc_inputs = dict(
    base_dc=st.integers(min_value=5, max_value=25),
    char_level=st.integers(min_value=1, max_value=10),
    recommended_min_level=st.integers(min_value=1, max_value=10),
    pacing_modifier=st.floats(min_value=-0.15, max_value=0.15, allow_nan=False),
)


# ---------------------------------------------------------------------------
# Property 1: scaled DC is always in [5, 25]
# **Validates: Requirements 10.5**
# ---------------------------------------------------------------------------

@settings(max_examples=300)
@given(**valid_dc_inputs)
def test_scaled_dc_always_in_range(base_dc, char_level, recommended_min_level, pacing_modifier):
    """Scaled DC is always clamped to [5, 25] regardless of inputs."""
    max_dc = min(base_dc + 10, 25)
    result = scale_difficulty_class(
        base_dc=base_dc,
        char_level=char_level,
        recommended_min_level=recommended_min_level,
        max_dc=max_dc,
        pacing_modifier=pacing_modifier,
    )
    assert 5 <= result <= 25, (
        f"scaled DC={result} is outside [5, 25] for "
        f"base_dc={base_dc}, char_level={char_level}, "
        f"recommended_min_level={recommended_min_level}, "
        f"pacing_modifier={pacing_modifier}, max_dc={max_dc}"
    )


# ---------------------------------------------------------------------------
# Property 2: scaled DC never exceeds max_dc
# **Validates: Requirements 10.2**
# ---------------------------------------------------------------------------

@settings(max_examples=300)
@given(**valid_dc_inputs)
def test_scaled_dc_never_exceeds_max_dc(base_dc, char_level, recommended_min_level, pacing_modifier):
    """Scaled DC never exceeds the provided max_dc."""
    max_dc = min(base_dc + 10, 25)
    result = scale_difficulty_class(
        base_dc=base_dc,
        char_level=char_level,
        recommended_min_level=recommended_min_level,
        max_dc=max_dc,
        pacing_modifier=pacing_modifier,
    )
    assert result <= max_dc, (
        f"scaled DC={result} exceeds max_dc={max_dc} for "
        f"base_dc={base_dc}, char_level={char_level}, "
        f"recommended_min_level={recommended_min_level}, "
        f"pacing_modifier={pacing_modifier}"
    )
