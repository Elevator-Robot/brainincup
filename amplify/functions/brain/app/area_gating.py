"""
Area Level-Gating — pure Python module with no external I/O.

Validates whether a character can transition to a target area based on
their current level vs the area's minimum level requirement.
"""


def validate_area_transition(char_level: int, area_min_level: int) -> bool:
    """
    Returns True if the character meets the area's minimum level requirement.
    Pure function. No I/O.
    Validates: Requirements 2.12
    """
    return char_level >= area_min_level


def compute_level_gap(char_level: int, area_min_level: int) -> int:
    """
    Returns the number of levels the character is below the area's minimum.
    Returns 0 if the character meets or exceeds the requirement.
    Pure function. No I/O.
    """
    return max(0, area_min_level - char_level)
