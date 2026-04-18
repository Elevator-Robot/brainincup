"""
Property-based tests for area_gating using Hypothesis.

Properties verified:
  1. validate_area_transition returns True iff char_level >= area_min_level
  2. compute_level_gap returns max(0, area_min_level - char_level)

All inputs are drawn from [1, 10] × [1, 10] as specified.

**Validates: Requirements 2.12**
"""

import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from hypothesis import given, settings
from hypothesis import strategies as st

from area_gating import validate_area_transition, compute_level_gap


level_st = st.integers(min_value=1, max_value=10)


@settings(max_examples=200)
@given(char_level=level_st, area_min_level=level_st)
def test_validate_area_transition_iff_char_level_gte_min(char_level, area_min_level):
    """
    validate_area_transition(char_level, area_min_level) is True iff
    char_level >= area_min_level.
    **Validates: Requirements 2.12**
    """
    result = validate_area_transition(char_level, area_min_level)
    expected = char_level >= area_min_level
    assert result == expected, (
        f"validate_area_transition({char_level}, {area_min_level}) = {result}, "
        f"expected {expected}"
    )


@settings(max_examples=200)
@given(char_level=level_st, area_min_level=level_st)
def test_compute_level_gap_equals_max_zero_diff(char_level, area_min_level):
    """
    compute_level_gap(char_level, area_min_level) == max(0, area_min_level - char_level).
    **Validates: Requirements 2.12**
    """
    result = compute_level_gap(char_level, area_min_level)
    expected = max(0, area_min_level - char_level)
    assert result == expected, (
        f"compute_level_gap({char_level}, {area_min_level}) = {result}, "
        f"expected {expected}"
    )
