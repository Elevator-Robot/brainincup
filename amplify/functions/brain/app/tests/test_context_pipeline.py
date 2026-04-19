"""
Unit tests for ContextEnrichmentPipeline.assemble_game_context.

Verifies that the assembled context dict contains all required top-level keys
and that values are correctly mapped from player_state, world_state, pacing
signals, and registry data.

No real AWS calls are made — DynamoDB clients are injected as mocks.

**Validates: Requirements 6.1, 6.2**
"""

import sys
import os
import unittest
from unittest.mock import MagicMock, patch

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from context_pipeline import ContextEnrichmentPipeline
from pacing_engine import PacingSignal


# ---------------------------------------------------------------------------
# Sample data helpers
# ---------------------------------------------------------------------------

REQUIRED_KEYS = {
    "character",
    "location",
    "campaign",
    "activeQuests",
    "worldStateFlags",
    "activeScenario",
    "pacingDirectives",
    "pendingDiceRoll",
    "levelGateBlocked",
}


def _make_player_state(**overrides) -> dict:
    base = {
        "currentLevel": 3,
        "currentXP": 450,
        "xpToNextLevel": 600,
        "currentAreaId": "area_shrouded_vale",
        "lastKnownLocation": "The Shrouded Vale",
        "currentActId": "act_01",
        "currentChapterId": "ch_01_01",
        "currentSceneId": "sc_01_01_01",
        "currentHP": 18,
        "maxHP": 24,
        "activeQuestIds": ["quest_001"],
        "completedQuestIds": [],
        "failedQuestIds": [],
        "diceRollLog": [],
        "pacingMetrics": {},
        "uiHints": [],
        "pendingDiceRoll": None,
        "campaignId": "campaign_001",
        "owner": "user_123",
        "version": 1,
    }
    base.update(overrides)
    return base


def _make_world_state(**overrides) -> dict:
    base = {
        "campaignId": "campaign_001",
        "flags": {"spoke_to_innkeeper": True, "merchant_found": False},
        "version": 1,
    }
    base.update(overrides)
    return base


def _make_registry() -> dict:
    return {
        "SCENARIO": [
            {
                "body": {
                    "id": "scenario_001",
                    "title": "Ambush on the Road",
                    "type": "COMBAT",
                    "recommendedLevelMin": 1,
                    "recommendedLevelMax": 5,
                    "baseDifficultyClassMin": 10,
                    "baseDifficultyClassMax": 15,
                    "objectives": ["Survive the ambush"],
                    "requiredWorldFlags": [],
                }
            }
        ],
        "QUEST": [
            {
                "body": {
                    "id": "quest_001",
                    "title": "The Missing Merchant",
                    "steps": [
                        {"index": 0, "description": "Speak to the innkeeper."},
                        {"index": 1, "description": "Search the route."},
                    ],
                }
            }
        ],
        "AREA": [
            {
                "body": {
                    "id": "area_shrouded_vale",
                    "displayName": "The Shrouded Vale",
                    "minCharacterLevel": 1,
                    "connectedAreaIds": ["area_darkwood"],
                }
            },
            {
                "body": {
                    "id": "area_darkwood",
                    "displayName": "The Darkwood",
                    "minCharacterLevel": 4,
                    "connectedAreaIds": [],
                }
            },
        ],
        "SURPRISE_EVENT": [],
    }


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

class TestAssembleGameContextRequiredKeys(unittest.TestCase):
    """Verify all required top-level keys are present in the assembled context."""

    def setUp(self):
        self.pipeline = ContextEnrichmentPipeline(
            dynamodb_client=MagicMock(),
            appsync_client=MagicMock(),
        )
        self.player_state = _make_player_state()
        self.world_state = _make_world_state()
        self.registry = _make_registry()

    def _assemble(self, **kwargs) -> dict:
        return self.pipeline.assemble_game_context(
            player_state=self.player_state,
            world_state=self.world_state,
            pacing_signals=kwargs.get("pacing_signals", []),
            active_scenario=kwargs.get("active_scenario", None),
            eligible_surprises=kwargs.get("eligible_surprises", []),
            registry=self.registry,
            character=kwargs.get("character", None),
        )

    def test_all_required_keys_present(self):
        ctx = self._assemble()
        for key in REQUIRED_KEYS:
            self.assertIn(key, ctx, f"Missing required key: {key}")

    def test_character_sub_keys(self):
        ctx = self._assemble()
        char = ctx["character"]
        for key in ("name", "level", "currentHP", "maxHP", "xp", "xpToNextLevel", "stats"):
            self.assertIn(key, char, f"character missing sub-key: {key}")

    def test_location_sub_keys(self):
        ctx = self._assemble()
        loc = ctx["location"]
        for key in ("currentAreaId", "displayName", "connectedAreas"):
            self.assertIn(key, loc, f"location missing sub-key: {key}")

    def test_campaign_sub_keys(self):
        ctx = self._assemble()
        camp = ctx["campaign"]
        for key in ("currentAct", "currentChapter", "currentScene"):
            self.assertIn(key, camp, f"campaign missing sub-key: {key}")

    def test_level_gate_blocked_is_none_by_default(self):
        ctx = self._assemble()
        self.assertIsNone(ctx["levelGateBlocked"])

    def test_pending_dice_roll_is_none_when_not_set(self):
        ctx = self._assemble()
        self.assertIsNone(ctx["pendingDiceRoll"])

    def test_pending_dice_roll_propagated_from_player_state(self):
        roll = {"requestId": "abc", "statName": "strength", "difficultyClass": 14}
        self.player_state["pendingDiceRoll"] = roll
        ctx = self._assemble()
        self.assertEqual(ctx["pendingDiceRoll"], roll)

    def test_active_scenario_none_when_not_provided(self):
        ctx = self._assemble(active_scenario=None)
        self.assertIsNone(ctx["activeScenario"])

    def test_active_scenario_propagated_when_provided(self):
        scenario = {"id": "scenario_001", "title": "Ambush on the Road"}
        ctx = self._assemble(active_scenario=scenario)
        self.assertEqual(ctx["activeScenario"], scenario)

    def test_world_state_flags_propagated(self):
        ctx = self._assemble()
        self.assertEqual(ctx["worldStateFlags"], {"spoke_to_innkeeper": True, "merchant_found": False})

    def test_empty_world_flags(self):
        self.world_state["flags"] = {}
        ctx = self._assemble()
        self.assertEqual(ctx["worldStateFlags"], {})

    def test_active_quests_list(self):
        ctx = self._assemble()
        self.assertIsInstance(ctx["activeQuests"], list)
        self.assertEqual(len(ctx["activeQuests"]), 1)
        self.assertEqual(ctx["activeQuests"][0]["id"], "quest_001")
        self.assertEqual(ctx["activeQuests"][0]["title"], "The Missing Merchant")

    def test_active_quests_empty_when_no_quest_ids(self):
        self.player_state["activeQuestIds"] = []
        ctx = self._assemble()
        self.assertEqual(ctx["activeQuests"], [])

    def test_pacing_directives_empty_when_no_signals(self):
        ctx = self._assemble(pacing_signals=[])
        self.assertEqual(ctx["pacingDirectives"], [])

    def test_pacing_directives_populated_from_signals(self):
        signals = [PacingSignal.REWARD_NUDGE, PacingSignal.QUEST_NUDGE]
        ctx = self._assemble(pacing_signals=signals)
        self.assertEqual(len(ctx["pacingDirectives"]), 2)
        directive_signals = {d["signal"] for d in ctx["pacingDirectives"]}
        self.assertIn("REWARD_NUDGE", directive_signals)
        self.assertIn("QUEST_NUDGE", directive_signals)

    def test_pacing_directive_has_instruction(self):
        ctx = self._assemble(pacing_signals=[PacingSignal.REWARD_NUDGE])
        directive = ctx["pacingDirectives"][0]
        self.assertIn("instruction", directive)
        self.assertIn("reward", directive["instruction"].lower())

    def test_location_display_name_from_area_registry(self):
        ctx = self._assemble()
        self.assertEqual(ctx["location"]["displayName"], "The Shrouded Vale")

    def test_location_connected_areas_populated(self):
        ctx = self._assemble()
        connected = ctx["location"]["connectedAreas"]
        self.assertEqual(len(connected), 1)
        self.assertEqual(connected[0]["id"], "area_darkwood")
        self.assertEqual(connected[0]["displayName"], "The Darkwood")
        # Player is level 3, area requires level 4 → locked
        self.assertTrue(connected[0]["locked"])

    def test_location_connected_area_unlocked_when_level_met(self):
        self.player_state["currentLevel"] = 4
        ctx = self._assemble()
        connected = ctx["location"]["connectedAreas"]
        self.assertFalse(connected[0]["locked"])

    def test_campaign_fields_from_player_state(self):
        ctx = self._assemble()
        self.assertEqual(ctx["campaign"]["currentAct"], "act_01")
        self.assertEqual(ctx["campaign"]["currentChapter"], "ch_01_01")
        self.assertEqual(ctx["campaign"]["currentScene"], "sc_01_01_01")

    def test_character_level_from_player_state(self):
        ctx = self._assemble()
        self.assertEqual(ctx["character"]["level"], 3)

    def test_character_overridden_by_character_arg(self):
        char = {
            "name": "Aldric",
            "level": 5,
            "currentHP": 30,
            "maxHP": 30,
            "xp": 1000,
            "xpToNextLevel": 1500,
            "stats": {"strength": 14},
        }
        ctx = self._assemble(character=char)
        self.assertEqual(ctx["character"]["name"], "Aldric")
        self.assertEqual(ctx["character"]["level"], 5)

    def test_all_pacing_signal_instructions_present(self):
        """Every PacingSignal value should map to a non-empty instruction."""
        for signal in PacingSignal:
            ctx = self._assemble(pacing_signals=[signal])
            self.assertEqual(len(ctx["pacingDirectives"]), 1)
            self.assertTrue(ctx["pacingDirectives"][0]["instruction"])


class TestAssembleGameContextEmptyRegistry(unittest.TestCase):
    """Verify graceful handling when registry is empty."""

    def setUp(self):
        self.pipeline = ContextEnrichmentPipeline(
            dynamodb_client=MagicMock(),
            appsync_client=MagicMock(),
        )

    def test_all_required_keys_present_with_empty_registry(self):
        ctx = self.pipeline.assemble_game_context(
            player_state=_make_player_state(),
            world_state=_make_world_state(),
            pacing_signals=[],
            active_scenario=None,
            eligible_surprises=[],
            registry={},
        )
        for key in REQUIRED_KEYS:
            self.assertIn(key, ctx, f"Missing required key with empty registry: {key}")

    def test_active_quests_empty_when_registry_has_no_quests(self):
        ctx = self.pipeline.assemble_game_context(
            player_state=_make_player_state(activeQuestIds=["quest_001"]),
            world_state=_make_world_state(),
            pacing_signals=[],
            active_scenario=None,
            eligible_surprises=[],
            registry={},
        )
        # Quest ID present but no registry doc — falls back to id-only entry
        self.assertEqual(len(ctx["activeQuests"]), 1)
        self.assertEqual(ctx["activeQuests"][0]["id"], "quest_001")

    def test_location_falls_back_to_last_known_location(self):
        ctx = self.pipeline.assemble_game_context(
            player_state=_make_player_state(lastKnownLocation="The Shrouded Vale"),
            world_state=_make_world_state(),
            pacing_signals=[],
            active_scenario=None,
            eligible_surprises=[],
            registry={},
        )
        self.assertEqual(ctx["location"]["displayName"], "The Shrouded Vale")


if __name__ == "__main__":
    unittest.main()
