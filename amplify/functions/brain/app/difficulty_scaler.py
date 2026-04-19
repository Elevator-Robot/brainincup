def scale_difficulty_class(
    base_dc: int,
    char_level: int,
    recommended_min_level: int,
    max_dc: int,
    pacing_modifier: float,
) -> int:
    """Scale DC by character level delta and pacing modifier, clamped to [5, 25] and max_dc."""
    level_delta = max(0, char_level - recommended_min_level)
    scaled = base_dc * (1 + level_delta * 0.1 + pacing_modifier)
    return max(5, min(int(scaled), min(max_dc, 25)))
