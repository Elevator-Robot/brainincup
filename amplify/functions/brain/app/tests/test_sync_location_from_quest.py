"""
Tests for sync_location_from_quest function.

Validates that player location is always derived from their active quest's areaId.
"""

import pytest
from state_sync import PlayerState, sync_location_from_quest


def make_player(**overrides):
    defaults = {
        "current_level": 1,
        "current_xp": 0,
        "xp_to_next_level": 100,
        "current_area_id": "area_unknown",
        "last_known_location": "Unknown",
        "current_act_id": "",
        "current_chapter_id": "",
        "current_scene_id": "",
        "current_hp": 20,
        "max_hp": 20,
        "version": 1,
        "active_quest_ids": [],
    }
    defaults.update(overrides)
    return PlayerState(**defaults)


def test_sync_location_from_quest_updates_area_id():
    """Location should be updated from quest's areaId."""
    player = make_player(
        current_area_id="area_unknown",
        active_quest_ids=["quest_001"],
    )
    
    quest_registry = [
        {"id": "quest_001", "areaId": "area_shrouded_vale"},
    ]
    area_registry = [
        {"id": "area_shrouded_vale", "displayName": "The Shrouded Vale"},
    ]
    
    sync_location_from_quest(player, quest_registry, area_registry)
    
    assert player.current_area_id == "area_shrouded_vale"
    assert player.last_known_location == "The Shrouded Vale"


def test_sync_location_no_active_quests():
    """Location should not change if no active quests."""
    player = make_player(
        current_area_id="area_unknown",
        active_quest_ids=[],
    )
    
    sync_location_from_quest(player, [], [])
    
    assert player.current_area_id == "area_unknown"


def test_sync_location_quest_not_in_registry():
    """Location should not change if quest not found in registry."""
    player = make_player(
        current_area_id="area_unknown",
        active_quest_ids=["quest_999"],
    )
    
    quest_registry = [
        {"id": "quest_001", "areaId": "area_shrouded_vale"},
    ]
    area_registry = []
    
    sync_location_from_quest(player, quest_registry, area_registry)
    
    assert player.current_area_id == "area_unknown"


def test_sync_location_quest_has_no_area_id():
    """Location should not change if quest has no areaId field."""
    player = make_player(
        current_area_id="area_unknown",
        active_quest_ids=["quest_001"],
    )
    
    quest_registry = [
        {"id": "quest_001"},  # No areaId
    ]
    area_registry = []
    
    sync_location_from_quest(player, quest_registry, area_registry)
    
    assert player.current_area_id == "area_unknown"


def test_sync_location_area_not_in_registry():
    """Location should update area_id but not lastKnownLocation if area not found."""
    player = make_player(
        current_area_id="area_unknown",
        last_known_location="Unknown",
        active_quest_ids=["quest_001"],
    )
    
    quest_registry = [
        {"id": "quest_001", "areaId": "area_shrouded_vale"},
    ]
    area_registry = []  # Area not in registry
    
    sync_location_from_quest(player, quest_registry, area_registry)
    
    assert player.current_area_id == "area_shrouded_vale"
    assert player.last_known_location == "Unknown"  # Not updated


def test_sync_location_uses_first_active_quest():
    """Should use the first active quest when multiple quests are active."""
    player = make_player(
        current_area_id="area_unknown",
        active_quest_ids=["quest_001", "quest_002"],
    )
    
    quest_registry = [
        {"id": "quest_001", "areaId": "area_shrouded_vale"},
        {"id": "quest_002", "areaId": "area_darkwood"},
    ]
    area_registry = [
        {"id": "area_shrouded_vale", "displayName": "The Shrouded Vale"},
        {"id": "area_darkwood", "displayName": "The Darkwood"},
    ]
    
    sync_location_from_quest(player, quest_registry, area_registry)
    
    assert player.current_area_id == "area_shrouded_vale"
    assert player.last_known_location == "The Shrouded Vale"


def test_sync_location_new_character_with_quest_001():
    """New character with quest_001 should be in The Shrouded Vale."""
    player = make_player(
        current_area_id="area_shrouded_vale",
        active_quest_ids=["quest_001"],
    )
    
    quest_registry = [
        {"id": "quest_001", "areaId": "area_shrouded_vale"},
    ]
    area_registry = [
        {"id": "area_shrouded_vale", "displayName": "The Shrouded Vale"},
    ]
    
    sync_location_from_quest(player, quest_registry, area_registry)
    
    assert player.current_area_id == "area_shrouded_vale"
    assert player.last_known_location == "The Shrouded Vale"
