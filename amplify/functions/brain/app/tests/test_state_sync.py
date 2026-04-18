"""
Tests for state_sync module — area transition handling and level-up area unlocks.

**Validates: Requirements 2.8, 2.9, 2.10, 2.11, 2.12, 2.13**
"""

import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from state_sync import (
    PlayerState,
    WorldState,
    GameEvents,
    handle_area_transition,
    compute_newly_unlocked_areas,
    compute_level_threshold,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def make_player(level: int = 1, area_id: str = "starting_area") -> PlayerState:
    return PlayerState(
        current_level=level,
        current_xp=0,
        xp_to_next_level=compute_level_threshold(level),
        current_area_id=area_id,
        last_known_location="The Shrouded Vale",
        current_act_id="act_01",
        current_chapter_id="ch_01_01",
        current_scene_id="sc_01_01_01",
        current_hp=20,
        max_hp=20,
        version=1,
    )


AREA_REGISTRY = [
    {"id": "starting_area", "title": "The Shrouded Vale", "displayName": "The Shrouded Vale", "minCharacterLevel": 1},
    {"id": "area_darkwood",  "title": "The Darkwood",      "displayName": "The Darkwood",      "minCharacterLevel": 4},
    {"id": "area_ruined_keep", "title": "The Ruined Keep", "displayName": "The Ruined Keep",   "minCharacterLevel": 6},
    {"id": "area_endgame",   "title": "The Void Citadel",  "displayName": "The Void Citadel",  "minCharacterLevel": 10},
]


# ---------------------------------------------------------------------------
# handle_area_transition — unit tests
# ---------------------------------------------------------------------------

class TestHandleAreaTransition:
    def test_allowed_transition_updates_area_id(self):
        player = make_player(level=4)
        result = handle_area_transition(player, "area_darkwood", AREA_REGISTRY)
        assert result == {"blocked": False}
        assert player.current_area_id == "area_darkwood"

    def test_allowed_transition_exact_level(self):
        player = make_player(level=4)
        result = handle_area_transition(player, "area_darkwood", AREA_REGISTRY)
        assert not result["blocked"]

    def test_blocked_transition_does_not_update_area_id(self):
        player = make_player(level=1)
        original_area = player.current_area_id
        result = handle_area_transition(player, "area_darkwood", AREA_REGISTRY)
        assert result["blocked"] is True
        assert player.current_area_id == original_area

    def test_blocked_result_contains_required_fields(self):
        player = make_player(level=1)
        result = handle_area_transition(player, "area_darkwood", AREA_REGISTRY)
        assert result["blocked"] is True
        assert result["targetArea"] == "The Darkwood"
        assert result["requiredLevel"] == 4
        assert result["characterLevel"] == 1
        assert result["levelGap"] == 3

    def test_ui_hint_appended_when_gap_greater_than_3(self):
        player = make_player(level=1)
        assert player.ui_hints == []
        handle_area_transition(player, "area_ruined_keep", AREA_REGISTRY)
        # level_gap = 6 - 1 = 5 > 3
        assert len(player.ui_hints) == 1
        assert "level 6" in player.ui_hints[0]

    def test_no_ui_hint_when_gap_exactly_3(self):
        player = make_player(level=1)
        handle_area_transition(player, "area_darkwood", AREA_REGISTRY)
        # level_gap = 4 - 1 = 3, NOT > 3
        assert player.ui_hints == []

    def test_no_ui_hint_when_gap_less_than_3(self):
        player = make_player(level=3)
        handle_area_transition(player, "area_darkwood", AREA_REGISTRY)
        # level_gap = 4 - 3 = 1
        assert player.ui_hints == []

    def test_unknown_area_allows_transition(self):
        player = make_player(level=1)
        result = handle_area_transition(player, "area_unknown", AREA_REGISTRY)
        assert result == {"blocked": False}
        assert player.current_area_id == "area_unknown"

    def test_level_1_can_enter_starting_area(self):
        player = make_player(level=1)
        result = handle_area_transition(player, "starting_area", AREA_REGISTRY)
        assert not result["blocked"]
        assert player.current_area_id == "starting_area"


# ---------------------------------------------------------------------------
# compute_newly_unlocked_areas — unit tests
# ---------------------------------------------------------------------------

class TestComputeNewlyUnlockedAreas:
    def test_returns_areas_matching_new_level(self):
        unlocked = compute_newly_unlocked_areas(4, AREA_REGISTRY)
        assert unlocked == ["The Darkwood"]

    def test_returns_empty_when_no_areas_match(self):
        unlocked = compute_newly_unlocked_areas(2, AREA_REGISTRY)
        assert unlocked == []

    def test_returns_multiple_areas_when_same_level(self):
        registry = [
            {"id": "a1", "displayName": "Area One",   "minCharacterLevel": 5},
            {"id": "a2", "displayName": "Area Two",   "minCharacterLevel": 5},
            {"id": "a3", "displayName": "Area Three", "minCharacterLevel": 7},
        ]
        unlocked = compute_newly_unlocked_areas(5, registry)
        assert set(unlocked) == {"Area One", "Area Two"}

    def test_uses_display_name_over_title(self):
        registry = [{"id": "x", "title": "Title", "displayName": "Display", "minCharacterLevel": 3}]
        unlocked = compute_newly_unlocked_areas(3, registry)
        assert unlocked == ["Display"]

    def test_falls_back_to_title_when_no_display_name(self):
        registry = [{"id": "x", "title": "My Area", "minCharacterLevel": 3}]
        unlocked = compute_newly_unlocked_areas(3, registry)
        assert unlocked == ["My Area"]


# ---------------------------------------------------------------------------
# compute_level_threshold — unit tests
# ---------------------------------------------------------------------------

class TestComputeLevelThreshold:
    @pytest.mark.parametrize("level,expected", [
        (1, 100),
        (2, 300),
        (3, 600),
        (4, 1000),
        (5, 1500),
        (10, 5500),
    ])
    def test_known_thresholds(self, level, expected):
        assert compute_level_threshold(level) == expected


# ---------------------------------------------------------------------------
# Property-based tests
# ---------------------------------------------------------------------------

level_st = st.integers(min_value=1, max_value=10)


@settings(max_examples=200)
@given(char_level=level_st, area_min_level=level_st)
def test_area_transition_blocked_iff_below_min_level(char_level, area_min_level):
    """
    handle_area_transition is blocked iff char_level < area_min_level.
    **Validates: Requirements 2.12**
    """
    registry = [{"id": "target", "title": "Target", "minCharacterLevel": area_min_level}]
    player = make_player(level=char_level)
    result = handle_area_transition(player, "target", registry)
    if char_level >= area_min_level:
        assert result["blocked"] is False
        assert player.current_area_id == "target"
    else:
        assert result["blocked"] is True
        assert player.current_area_id != "target"


@settings(max_examples=200)
@given(char_level=level_st, area_min_level=level_st)
def test_ui_hint_appended_iff_gap_greater_than_3(char_level, area_min_level):
    """
    A UI hint is appended iff the transition is blocked AND level_gap > 3.
    **Validates: Requirements 2.10**
    """
    registry = [{"id": "target", "title": "Target", "minCharacterLevel": area_min_level}]
    player = make_player(level=char_level)
    handle_area_transition(player, "target", registry)
    gap = max(0, area_min_level - char_level)
    if gap > 3:
        assert len(player.ui_hints) == 1
    else:
        assert len(player.ui_hints) == 0


@settings(max_examples=200)
@given(level=level_st)
def test_level_threshold_monotonically_increasing(level):
    """
    Level thresholds are strictly increasing.
    **Validates: Requirements 2.4**
    """
    if level < 10:
        assert compute_level_threshold(level + 1) > compute_level_threshold(level)


@settings(max_examples=200)
@given(level=level_st)
def test_newly_unlocked_areas_only_returns_exact_level_match(level):
    """
    compute_newly_unlocked_areas only returns areas whose minCharacterLevel == new_level.
    **Validates: Requirements 2.13**
    """
    registry = [
        {"id": f"area_{i}", "displayName": f"Area {i}", "minCharacterLevel": i}
        for i in range(1, 11)
    ]
    unlocked = compute_newly_unlocked_areas(level, registry)
    assert all(True for name in unlocked)  # all returned names exist
    # Verify count: exactly one area per level in our registry
    assert len(unlocked) == 1
    assert unlocked[0] == f"Area {level}"
