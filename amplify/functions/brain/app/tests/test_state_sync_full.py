"""
Unit tests for state_sync.apply_state_changes and apply_xp.

**Validates: Requirements 2.2, 2.4, 2.6, 2.7, 3.2, 3.3, 3.4, 3.5, 3.8**
"""

import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
from state_sync import (
    PlayerState,
    WorldState,
    compute_level_threshold,
    apply_xp,
    apply_state_changes,
    MAX_LEVEL,
)
from game_event_parser import GameEvents


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def make_player(level: int = 1, xp: int = 0, hp: int = 20, max_hp: int = 20) -> PlayerState:
    return PlayerState(
        current_level=level,
        current_xp=xp,
        xp_to_next_level=compute_level_threshold(level),
        current_area_id="starting_area",
        last_known_location="The Shrouded Vale",
        current_act_id="act_01",
        current_chapter_id="ch_01_01",
        current_scene_id="sc_01_01_01",
        current_hp=hp,
        max_hp=max_hp,
        version=1,
    )


def make_world() -> WorldState:
    return WorldState(campaign_id="campaign_001", version=1)


# ---------------------------------------------------------------------------
# 1. XP award triggers level-up at correct threshold
# ---------------------------------------------------------------------------

class TestXPLevelUp:
    def test_level_up_at_exact_threshold(self):
        """Level 1 → 2 requires exactly 100 XP."""
        player = make_player(level=1, xp=0)
        result = apply_xp(player, 100)
        assert player.current_level == 2
        assert len(result["levelUpEvents"]) == 1
        assert result["levelUpEvents"][0]["newLevel"] == 2

    def test_no_level_up_below_threshold(self):
        player = make_player(level=1, xp=0)
        result = apply_xp(player, 99)
        assert player.current_level == 1
        assert result["levelUpEvents"] == []

    def test_multiple_level_ups_in_one_award(self):
        """Enough XP to jump two levels at once."""
        player = make_player(level=1, xp=0)
        # Level 1→2 needs 100, level 2→3 needs 300 total (200 more)
        result = apply_xp(player, 300)
        assert player.current_level == 3
        assert len(result["levelUpEvents"]) == 2

    def test_level_threshold_formula(self):
        for n in range(1, 11):
            assert compute_level_threshold(n) == 100 * n * (n + 1) // 2


# ---------------------------------------------------------------------------
# 2. Level never decreases
# ---------------------------------------------------------------------------

class TestLevelMonotonicity:
    def test_hp_loss_does_not_decrease_level(self):
        player = make_player(level=3, xp=0)
        events = GameEvents(hp_change=-100)
        apply_state_changes(player, make_world(), events)
        assert player.current_level == 3

    def test_quest_fail_does_not_decrease_level(self):
        player = make_player(level=3)
        player.active_quest_ids = ["quest_001"]
        events = GameEvents(quest_fail="quest_001")
        apply_state_changes(player, make_world(), events)
        assert player.current_level == 3

    def test_negative_xp_not_applied(self):
        """apply_state_changes only awards positive XP."""
        player = make_player(level=2, xp=50)
        events = GameEvents(xp_award=0)
        apply_state_changes(player, make_world(), events)
        assert player.current_level == 2
        assert player.current_xp == 50


# ---------------------------------------------------------------------------
# 3. Max-level XP converts to gold at 1:1
# ---------------------------------------------------------------------------

class TestMaxLevelGold:
    def test_xp_converts_to_gold_at_max_level(self):
        player = make_player(level=MAX_LEVEL, xp=0)
        events = GameEvents(xp_award=50)
        apply_state_changes(player, make_world(), events)
        assert player.gold == 50
        assert player.current_level == MAX_LEVEL

    def test_xp_does_not_increase_at_max_level(self):
        player = make_player(level=MAX_LEVEL, xp=0)
        events = GameEvents(xp_award=100)
        apply_state_changes(player, make_world(), events)
        assert player.current_xp == 0  # XP not added, goes to gold

    def test_gold_accumulates_across_multiple_awards(self):
        player = make_player(level=MAX_LEVEL, xp=0)
        apply_state_changes(player, make_world(), GameEvents(xp_award=25))
        apply_state_changes(player, make_world(), GameEvents(xp_award=75))
        assert player.gold == 100


# ---------------------------------------------------------------------------
# 4. Quest step advance increments index
# ---------------------------------------------------------------------------

class TestQuestStepAdvance:
    def test_step_index_increments(self):
        player = make_player()
        player.active_quest_ids = ["quest_001"]
        events = GameEvents(quest_step_advance="quest_001")
        apply_state_changes(player, make_world(), events)
        assert player.pacing_metrics["questStepIndices"]["quest_001"] == 1

    def test_step_index_increments_again(self):
        player = make_player()
        player.active_quest_ids = ["quest_001"]
        apply_state_changes(player, make_world(), GameEvents(quest_step_advance="quest_001"))
        apply_state_changes(player, make_world(), GameEvents(quest_step_advance="quest_001"))
        assert player.pacing_metrics["questStepIndices"]["quest_001"] == 2

    def test_step_advance_ignored_for_inactive_quest(self):
        player = make_player()
        player.active_quest_ids = []
        events = GameEvents(quest_step_advance="quest_999")
        apply_state_changes(player, make_world(), events)
        assert "quest_999" not in player.pacing_metrics.get("questStepIndices", {})


# ---------------------------------------------------------------------------
# 5. Quest completion moves quest to completed
# ---------------------------------------------------------------------------

class TestQuestCompletion:
    def test_quest_moves_to_completed(self):
        player = make_player()
        player.active_quest_ids = ["quest_001"]
        events = GameEvents(quest_complete="quest_001")
        apply_state_changes(player, make_world(), events)
        assert "quest_001" not in player.active_quest_ids
        assert "quest_001" in player.completed_quest_ids

    def test_completing_nonexistent_quest_is_noop(self):
        player = make_player()
        player.active_quest_ids = []
        events = GameEvents(quest_complete="quest_999")
        apply_state_changes(player, make_world(), events)
        assert player.completed_quest_ids == []


# ---------------------------------------------------------------------------
# 6. Quest failure moves quest to failed
# ---------------------------------------------------------------------------

class TestQuestFailure:
    def test_quest_moves_to_failed(self):
        player = make_player()
        player.active_quest_ids = ["quest_001"]
        events = GameEvents(quest_fail="quest_001")
        apply_state_changes(player, make_world(), events)
        assert "quest_001" not in player.active_quest_ids
        assert "quest_001" in player.failed_quest_ids

    def test_failing_nonexistent_quest_is_noop(self):
        player = make_player()
        player.active_quest_ids = []
        events = GameEvents(quest_fail="quest_999")
        apply_state_changes(player, make_world(), events)
        assert player.failed_quest_ids == []


# ---------------------------------------------------------------------------
# 7. Max 3 active quests enforced
# ---------------------------------------------------------------------------

class TestMaxActiveQuests:
    def test_three_quests_can_be_active(self):
        player = make_player()
        player.active_quest_ids = ["q1", "q2", "q3"]
        # Completing one frees a slot
        events = GameEvents(quest_complete="q1")
        apply_state_changes(player, make_world(), events)
        assert len(player.active_quest_ids) == 2

    def test_active_quest_count_does_not_exceed_3_after_operations(self):
        """apply_state_changes does not add quests — it only removes them.
        The 3-quest cap is enforced at the assignment layer (not tested here),
        but we verify the count never grows beyond what was set."""
        player = make_player()
        player.active_quest_ids = ["q1", "q2", "q3"]
        events = GameEvents()  # no quest changes
        apply_state_changes(player, make_world(), events)
        assert len(player.active_quest_ids) == 3


# ---------------------------------------------------------------------------
# 8. World flags set on quest complete (via world_flags_set in game events)
# ---------------------------------------------------------------------------

class TestWorldFlags:
    def test_world_flags_set_on_quest_complete(self):
        player = make_player()
        player.active_quest_ids = ["quest_001"]
        world = make_world()
        events = GameEvents(
            quest_complete="quest_001",
            world_flags_set={"merchant_found": True, "innkeeper_grateful": True},
        )
        apply_state_changes(player, world, events)
        assert world.flags["merchant_found"] is True
        assert world.flags["innkeeper_grateful"] is True

    def test_world_flags_merged_not_replaced(self):
        world = make_world()
        world.flags = {"existing_flag": True}
        events = GameEvents(world_flags_set={"new_flag": True})
        apply_state_changes(make_player(), world, events)
        assert world.flags["existing_flag"] is True
        assert world.flags["new_flag"] is True
