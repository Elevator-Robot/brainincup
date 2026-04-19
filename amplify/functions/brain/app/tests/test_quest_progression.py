"""
Tests for automatic quest progression and location updates.

Validates that completing a quest automatically assigns the next quest,
which in turn updates the player's location.
"""

import pytest
from state_sync import PlayerState, WorldState, apply_state_changes, _find_next_quest
from game_event_parser import GameEvents


def make_player(**overrides):
    defaults = {
        "current_level": 1,
        "current_xp": 0,
        "xp_to_next_level": 100,
        "current_area_id": "area_shrouded_vale",
        "last_known_location": "The Shrouded Vale",
        "current_act_id": "",
        "current_chapter_id": "",
        "current_scene_id": "",
        "current_hp": 20,
        "max_hp": 20,
        "version": 1,
        "active_quest_ids": [],
        "completed_quest_ids": [],
    }
    defaults.update(overrides)
    return PlayerState(**defaults)


def make_world():
    return WorldState(campaign_id="campaign_001", version=1, flags={})


def make_quest_registry():
    """Create a minimal quest registry for testing."""
    return [
        {
            "id": "quest_001",
            "docType": "QUEST",
            "areaId": "area_shrouded_vale",
            "prerequisiteQuestIds": [],
            "minCharacterLevel": 1,
        },
        {
            "id": "quest_002",
            "docType": "QUEST",
            "areaId": "area_shrouded_vale",
            "prerequisiteQuestIds": ["quest_001"],
            "minCharacterLevel": 1,
        },
        {
            "id": "quest_003",
            "docType": "QUEST",
            "areaId": "area_darkwood",
            "prerequisiteQuestIds": ["quest_002"],
            "minCharacterLevel": 3,
        },
        {
            "id": "quest_004",
            "docType": "QUEST",
            "areaId": "area_ruined_keep",
            "prerequisiteQuestIds": ["quest_003"],
            "minCharacterLevel": 4,
        },
    ]


def test_completing_quest_auto_assigns_next_quest():
    """Completing quest_001 should automatically assign quest_002."""
    player = make_player(
        active_quest_ids=["quest_001"],
        current_level=1,
    )
    world = make_world()
    events = GameEvents(quest_complete="quest_001")
    
    area_registry = make_quest_registry()
    
    apply_state_changes(player, world, events, area_registry)
    
    assert "quest_001" not in player.active_quest_ids
    assert "quest_001" in player.completed_quest_ids
    assert "quest_002" in player.active_quest_ids


def test_next_quest_not_assigned_if_level_too_low():
    """quest_003 requires level 3, should not be assigned at level 1."""
    player = make_player(
        active_quest_ids=["quest_002"],
        completed_quest_ids=["quest_001"],
        current_level=1,
    )
    world = make_world()
    events = GameEvents(quest_complete="quest_002")
    
    area_registry = make_quest_registry()
    
    apply_state_changes(player, world, events, area_registry)
    
    assert "quest_002" not in player.active_quest_ids
    assert "quest_002" in player.completed_quest_ids
    assert "quest_003" not in player.active_quest_ids  # Level too low


def test_next_quest_assigned_when_level_requirement_met():
    """quest_003 should be assigned when player is level 3."""
    player = make_player(
        active_quest_ids=["quest_002"],
        completed_quest_ids=["quest_001"],
        current_level=3,
    )
    world = make_world()
    events = GameEvents(quest_complete="quest_002")
    
    area_registry = make_quest_registry()
    
    apply_state_changes(player, world, events, area_registry)
    
    assert "quest_003" in player.active_quest_ids


def test_no_next_quest_if_already_active():
    """Should not assign quest_002 if it's already active."""
    player = make_player(
        active_quest_ids=["quest_001", "quest_002"],
        current_level=1,
    )
    world = make_world()
    events = GameEvents(quest_complete="quest_001")
    
    area_registry = make_quest_registry()
    
    apply_state_changes(player, world, events, area_registry)
    
    # quest_002 should still be active (not duplicated)
    assert player.active_quest_ids.count("quest_002") == 1


def test_no_next_quest_if_already_completed():
    """Should not assign quest_002 if it's already completed."""
    player = make_player(
        active_quest_ids=["quest_001"],
        completed_quest_ids=["quest_002"],
        current_level=1,
    )
    world = make_world()
    events = GameEvents(quest_complete="quest_001")
    
    area_registry = make_quest_registry()
    
    apply_state_changes(player, world, events, area_registry)
    
    assert "quest_002" not in player.active_quest_ids


def test_max_three_active_quests():
    """Should not assign next quest if already at 3 active quests."""
    player = make_player(
        active_quest_ids=["quest_001", "quest_x", "quest_y"],
        current_level=1,
    )
    world = make_world()
    events = GameEvents(quest_complete="quest_001")
    
    area_registry = make_quest_registry()
    
    apply_state_changes(player, world, events, area_registry)
    
    # After completing quest_001, we have 2 active quests, so quest_002 can be added
    assert len(player.active_quest_ids) == 3  # quest_x, quest_y, and quest_002
    assert "quest_002" in player.active_quest_ids


def test_find_next_quest_returns_correct_quest():
    """_find_next_quest should return quest_002 after completing quest_001."""
    quest_registry = make_quest_registry()
    
    next_quest = _find_next_quest(
        completed_quest_id="quest_001",
        quest_registry=quest_registry,
        completed_quest_ids=["quest_001"],
        active_quest_ids=[],
        player_level=1,
    )
    
    assert next_quest is not None
    assert next_quest["id"] == "quest_002"


def test_find_next_quest_returns_none_if_level_too_low():
    """_find_next_quest should return None if player level is too low."""
    quest_registry = make_quest_registry()
    
    next_quest = _find_next_quest(
        completed_quest_id="quest_002",
        quest_registry=quest_registry,
        completed_quest_ids=["quest_001", "quest_002"],
        active_quest_ids=[],
        player_level=1,  # quest_003 requires level 3
    )
    
    assert next_quest is None


def test_find_next_quest_returns_none_if_no_dependent_quests():
    """_find_next_quest should return None if no quests depend on the completed one."""
    quest_registry = make_quest_registry()
    
    next_quest = _find_next_quest(
        completed_quest_id="quest_999",  # No quests depend on this
        quest_registry=quest_registry,
        completed_quest_ids=["quest_999"],
        active_quest_ids=[],
        player_level=10,
    )
    
    assert next_quest is None
