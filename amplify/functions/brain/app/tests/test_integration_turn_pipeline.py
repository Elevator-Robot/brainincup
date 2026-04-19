"""
Integration test for the full turn pipeline (unit-level, no live AWS).

Verifies the wiring:
  createMessage → DynamoDB stream event → Lambda handler →
  context enrichment → AgentCore invocation → BrainResponse written →
  PlayerState updated

All external dependencies are mocked.

**Validates: Requirements 1.3, 5.8, 6.2**
"""

import sys
import os
import json
import unittest
from unittest.mock import patch, MagicMock, call

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_stream_event(conversation_id: str = "conv_001", message_id: str = "msg_001") -> dict:
    """Build a minimal DynamoDB stream INSERT event for the Message table."""
    return {
        "Records": [
            {
                "eventName": "INSERT",
                "dynamodb": {
                    "NewImage": {
                        "conversationId": {"S": conversation_id},
                        "id": {"S": message_id},
                        "content": {"S": "I want to explore the forest."},
                    }
                },
            }
        ]
    }


def _make_player_state(campaign_id: str = "campaign_001", current_xp: int = 0) -> dict:
    return {
        "id": "ps_001",
        "campaignId": campaign_id,
        "owner": "user_123",
        "currentLevel": 1,
        "currentXP": current_xp,
        "xpToNextLevel": 100,
        "currentAreaId": "starting_area",
        "lastKnownLocation": "The Shrouded Vale",
        "currentActId": "act_01",
        "currentChapterId": "ch_01_01",
        "currentSceneId": "sc_01_01_01",
        "currentHP": 20,
        "maxHP": 20,
        "activeQuestIds": [],
        "completedQuestIds": [],
        "failedQuestIds": [],
        "diceRollLog": [],
        "pacingMetrics": {
            "turns_since_last_xp_award": 0,
            "turns_since_last_level_up": 0,
            "turns_since_last_quest_step": 0,
            "turns_since_last_surprise_event": 0,
            "current_tension_level": 5,
            "consecutive_turns_at_high_tension": 0,
            "consecutive_turns_at_low_tension": 0,
            "current_act": "EXPOSITION",
            "stat_check_history": [],
            "difficulty_modifier": 0.0,
            "difficulty_modifier_turns_remaining": 0,
            "last_surprise_event_ids": {},
            "total_turns": 0,
            "all_chapter_scenarios_over_leveled": False,
        },
        "uiHints": [],
        "pendingDiceRoll": None,
        "version": 1,
    }


def _make_world_state() -> dict:
    return {
        "id": "ws_001",
        "campaignId": "campaign_001",
        "flags": {},
        "version": 1,
    }


def _make_agent_response(xp_award: int = 50) -> dict:
    """Fake structured JSON response from AgentCore."""
    return {
        "response": "You step into the forest, leaves crunching underfoot.",
        "sensations": ["The smell of pine fills the air."],
        "thoughts": ["This place feels ancient."],
        "memories": "",
        "self_reflection": "",
        "xp_award": xp_award,
        "hp_change": 0,
        "quest_step_advance": None,
        "quest_complete": None,
        "quest_fail": None,
        "world_flags_set": {},
        "dice_roll_request": None,
        "tension_level": 4,
        "area_transition": None,
        "item_grant": None,
    }


# ---------------------------------------------------------------------------
# Integration test
# ---------------------------------------------------------------------------

class TestFullTurnPipeline(unittest.TestCase):
    """
    Verifies the full turn pipeline wires together correctly without live AWS.
    """

    def _run_handler_with_mocks(self, xp_award: int = 50):
        """
        Patch all external dependencies and invoke the Lambda handler.
        Returns a dict of the mocks so assertions can be made.
        """
        player_state = _make_player_state(current_xp=0)
        world_state = _make_world_state()
        agent_response = _make_agent_response(xp_award=xp_award)

        # We patch at the module level where main.py imports them
        with patch("main.ContextEnrichmentPipeline") as MockPipeline, \
             patch("main.get_cached_registry") as mock_get_cached, \
             patch("main.load_campaign_registry") as mock_load_registry, \
             patch("main.invoke_agentcore") as mock_invoke, \
             patch("main.write_brain_response") as mock_write_brain, \
             patch("main.write_with_retry") as mock_write_retry:

            # Configure pipeline instance
            pipeline_instance = MagicMock()
            MockPipeline.return_value = pipeline_instance
            pipeline_instance.load_player_state.return_value = player_state
            pipeline_instance.load_world_state.return_value = world_state
            pipeline_instance.evaluate_pacing_engine.return_value = []
            pipeline_instance.resolve_active_scenario.return_value = None
            pipeline_instance.resolve_eligible_surprises.return_value = []
            pipeline_instance.assemble_game_context.return_value = {
                "character": {"name": "Hero", "level": 1, "currentHP": 20, "maxHP": 20,
                              "xp": 0, "xpToNextLevel": 100, "stats": {}},
                "location": {"currentAreaId": "starting_area", "displayName": "The Shrouded Vale",
                             "connectedAreas": []},
                "campaign": {"currentAct": "act_01", "currentChapter": "ch_01_01",
                             "currentScene": "sc_01_01_01"},
                "activeQuests": [],
                "worldStateFlags": {},
                "activeScenario": None,
                "pacingDirectives": [],
                "pendingDiceRoll": None,
                "levelGateBlocked": None,
            }

            # Content registry returns empty (no campaign content needed for pipeline test)
            mock_get_cached.return_value = {}
            mock_load_registry.return_value = {}

            # AgentCore returns fake structured response
            mock_invoke.return_value = agent_response

            # Import and call handler
            import main
            event = _make_stream_event()
            result = main.handler(event, None)

            return {
                "result": result,
                "mock_invoke": mock_invoke,
                "mock_write_brain": mock_write_brain,
                "pipeline_instance": pipeline_instance,
                "player_state": player_state,
                "agent_response": agent_response,
            }

    def test_handler_returns_200(self):
        mocks = self._run_handler_with_mocks()
        self.assertEqual(mocks["result"]["statusCode"], 200)

    def test_agentcore_invoked_once(self):
        """AgentCore must be called exactly once per stream record."""
        mocks = self._run_handler_with_mocks()
        mocks["mock_invoke"].assert_called_once()

    def test_agentcore_invoked_with_conversation_id(self):
        """AgentCore invocation must include the conversation_id."""
        mocks = self._run_handler_with_mocks()
        call_args = mocks["mock_invoke"].call_args
        # Second positional arg is conversation_id
        _, conversation_id = call_args[0]
        self.assertEqual(conversation_id, "conv_001")

    def test_agentcore_prompt_contains_game_context_block(self):
        """The prompt passed to AgentCore must contain a [GAME_CONTEXT] block."""
        mocks = self._run_handler_with_mocks()
        call_args = mocks["mock_invoke"].call_args
        prompt = call_args[0][0]
        self.assertIn("[GAME_CONTEXT]", prompt)
        self.assertIn("[/GAME_CONTEXT]", prompt)

    def test_brain_response_write_called(self):
        """write_brain_response must be called after AgentCore responds."""
        mocks = self._run_handler_with_mocks()
        mocks["mock_write_brain"].assert_called_once()

    def test_brain_response_write_called_with_correct_ids(self):
        """write_brain_response must receive the correct conversation_id and message_id."""
        mocks = self._run_handler_with_mocks()
        call_args = mocks["mock_write_brain"].call_args[0]
        conversation_id, message_id, _ = call_args
        self.assertEqual(conversation_id, "conv_001")
        self.assertEqual(message_id, "msg_001")

    def test_brain_response_write_called_with_agent_response(self):
        """write_brain_response must receive the agent response dict."""
        mocks = self._run_handler_with_mocks()
        call_args = mocks["mock_write_brain"].call_args[0]
        _, _, agent_resp = call_args
        self.assertEqual(agent_resp["xp_award"], 50)
        self.assertIn("response", agent_resp)

    def test_player_state_loaded_from_pipeline(self):
        """load_player_state must be called with the conversation_id from the stream event."""
        mocks = self._run_handler_with_mocks()
        mocks["pipeline_instance"].load_player_state.assert_called_once_with("conv_001")

    def test_world_state_loaded_from_pipeline(self):
        """load_world_state must be called after player_state is loaded."""
        mocks = self._run_handler_with_mocks()
        mocks["pipeline_instance"].load_world_state.assert_called_once()

    def test_pacing_engine_evaluated(self):
        """evaluate_pacing_engine must be called as part of the pipeline."""
        mocks = self._run_handler_with_mocks()
        mocks["pipeline_instance"].evaluate_pacing_engine.assert_called_once()

    def test_game_context_assembled(self):
        """assemble_game_context must be called with player_state and world_state."""
        mocks = self._run_handler_with_mocks()
        mocks["pipeline_instance"].assemble_game_context.assert_called_once()
        kwargs = mocks["pipeline_instance"].assemble_game_context.call_args[1]
        self.assertIn("player_state", kwargs)
        self.assertIn("world_state", kwargs)

    def test_non_insert_events_are_skipped(self):
        """MODIFY and REMOVE events must not trigger the pipeline."""
        with patch("main.ContextEnrichmentPipeline") as MockPipeline, \
             patch("main.get_cached_registry", return_value={}), \
             patch("main.load_campaign_registry", return_value={}), \
             patch("main.invoke_agentcore") as mock_invoke, \
             patch("main.write_brain_response"):

            pipeline_instance = MagicMock()
            MockPipeline.return_value = pipeline_instance

            import main
            event = {
                "Records": [
                    {"eventName": "MODIFY", "dynamodb": {"NewImage": {}}},
                    {"eventName": "REMOVE", "dynamodb": {"OldImage": {}}},
                ]
            }
            main.handler(event, None)
            mock_invoke.assert_not_called()

    def test_multiple_records_processed_independently(self):
        """Each INSERT record in a batch must trigger one AgentCore invocation."""
        player_state = _make_player_state()
        world_state = _make_world_state()

        with patch("main.ContextEnrichmentPipeline") as MockPipeline, \
             patch("main.get_cached_registry", return_value={}), \
             patch("main.load_campaign_registry", return_value={}), \
             patch("main.invoke_agentcore") as mock_invoke, \
             patch("main.write_brain_response"):

            pipeline_instance = MagicMock()
            MockPipeline.return_value = pipeline_instance
            pipeline_instance.load_player_state.return_value = player_state
            pipeline_instance.load_world_state.return_value = world_state
            pipeline_instance.evaluate_pacing_engine.return_value = []
            pipeline_instance.resolve_active_scenario.return_value = None
            pipeline_instance.resolve_eligible_surprises.return_value = []
            pipeline_instance.assemble_game_context.return_value = {
                "character": {"name": "Hero", "level": 1, "currentHP": 20, "maxHP": 20,
                              "xp": 0, "xpToNextLevel": 100, "stats": {}},
                "location": {"currentAreaId": "starting_area", "displayName": "The Shrouded Vale",
                             "connectedAreas": []},
                "campaign": {"currentAct": "act_01", "currentChapter": "ch_01_01",
                             "currentScene": "sc_01_01_01"},
                "activeQuests": [],
                "worldStateFlags": {},
                "activeScenario": None,
                "pacingDirectives": [],
                "pendingDiceRoll": None,
                "levelGateBlocked": None,
            }
            mock_invoke.return_value = _make_agent_response()

            import main
            event = {
                "Records": [
                    {
                        "eventName": "INSERT",
                        "dynamodb": {
                            "NewImage": {
                                "conversationId": {"S": "conv_001"},
                                "id": {"S": "msg_001"},
                                "content": {"S": "First message"},
                            }
                        },
                    },
                    {
                        "eventName": "INSERT",
                        "dynamodb": {
                            "NewImage": {
                                "conversationId": {"S": "conv_002"},
                                "id": {"S": "msg_002"},
                                "content": {"S": "Second message"},
                            }
                        },
                    },
                ]
            }
            main.handler(event, None)
            self.assertEqual(mock_invoke.call_count, 2)

    def test_missing_conversation_id_skips_record(self):
        """A stream record with no conversationId must be skipped gracefully."""
        with patch("main.ContextEnrichmentPipeline") as MockPipeline, \
             patch("main.get_cached_registry", return_value={}), \
             patch("main.invoke_agentcore") as mock_invoke, \
             patch("main.write_brain_response"):

            import main
            event = {
                "Records": [
                    {
                        "eventName": "INSERT",
                        "dynamodb": {
                            "NewImage": {
                                "id": {"S": "msg_001"},
                                # no conversationId
                            }
                        },
                    }
                ]
            }
            main.handler(event, None)
            mock_invoke.assert_not_called()


if __name__ == "__main__":
    unittest.main()
