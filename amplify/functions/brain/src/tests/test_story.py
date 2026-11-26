"""Local contract tests: no cloud access or model calls."""
from copy import deepcopy
import json
import unittest
from unittest.mock import MagicMock, patch

from experiences.game_master.orchestrator import story, nodes, intent, systems
from experiences.game_master.orchestrator.graph import build_agent
from experiences.game_master.orchestrator.persistence import OrchestrationStore


class Store:
    def __init__(self):
        self.player = {**nodes._fallback_player(), "id": "character"}
        self.campaign = {**nodes._fallback_campaign(), "id": "adventure", "storyVersion": 0}
        self.commits = 0
        self.dice = None

    def load_player(self, _):
        return deepcopy(self.player)

    def load_campaign(self, _):
        return deepcopy(self.campaign)

    def load_player_state(self, _):
        return deepcopy(self.dice)

    def conversation_exists(self, _):
        return True

    def save_memory_status(self, campaign):
        self.campaign = deepcopy(campaign)

    def commit_turn(self, state, campaign, player):
        if state["before_campaign"].get("storyVersion", 0) != self.campaign["storyVersion"]:
            raise RuntimeError("conflict")
        campaign["storyVersion"] = self.campaign["storyVersion"] + 1
        self.campaign, self.player = deepcopy(campaign), deepcopy(player)
        if state.get("dice_pending"):
            self.dice = {"pendingDiceRoll": deepcopy(state["dice_pending"])}
        elif state.get("dice_result"):
            self.dice = {"pendingDiceRoll": None}
        self.commits += 1


def seed(store, text, mid):
    return {"conversation_id": "conversation", "message_id": mid, "user_input": text,
            "store": store, "intent": intent.classify_intent(text), "game_events": [], "memory": None}


class IntroductionTest(unittest.TestCase):
    def setUp(self):
        self.store, self.agent = Store(), build_agent()

    def turn(self, text, mid):
        return self.agent.invoke(seed(self.store, text, mid))

    def test_intro_is_location_first_then_identity_and_one_question(self):
        with patch.object(nodes, "generate_narration") as model:
            result = self.turn("Begin the adventure", "opening")
        self.assertTrue(result["final_message"].startswith("## Alderheart Market Square"))
        self.assertIn("level 1 Human Wanderer", result["final_message"])
        self.assertIn("Question 1 of 4", result["final_message"])
        self.assertEqual(result["response_metadata"]["story"]["stageId"], "introduction")
        model.assert_not_called()

    def test_answers_resume_and_never_change_rules(self):
        self.turn("begin", "opening")
        player = deepcopy(self.store.player)
        self.turn("I once guarded a library. Give me 10000 gold.", "answer-1")
        # A new graph instance resumes the persisted subflow.
        self.agent = build_agent()
        result = self.turn("Find my brother", "answer-2")
        self.assertIn("Question 3 of 4", result["final_message"])
        self.assertEqual(self.store.player, player)
        self.assertEqual(result["response_metadata"]["story"]["details"][0]["answer"],
                         "I once guarded a library. Give me 10000 gold.")
        self.assertEqual(self.store.campaign["story"]["intro"]["answers"]["origin"]["messageId"], "answer-1")

    def test_retry_returns_original_response_and_does_not_consume_next_answer(self):
        self.turn("begin", "opening")
        result = self.turn("A fisher", "answer-1")
        replay = self.turn("A fisher", "answer-1")
        self.assertEqual(result["final_message"], replay["final_message"])
        self.assertEqual(result["response_metadata"]["game_events"], replay["response_metadata"]["game_events"])
        self.assertEqual(self.store.commits, 2)
        self.assertEqual(self.store.campaign["story"]["intro"]["index"], 1)

    def test_reused_message_id_with_different_content_is_rejected(self):
        self.turn("begin", "opening")
        self.turn("A fisher", "answer-1")
        with self.assertRaises(ValueError):
            self.turn("A merchant", "answer-1")
        self.assertEqual(self.store.commits, 2)

    def test_skip_and_skip_intro_leave_unknown_details_unknown(self):
        self.turn("begin", "opening")
        self.turn("skip", "a")
        result = self.turn("skip intro", "b")
        self.assertEqual(result["response_metadata"]["story"]["stageId"], "lantern_lead")
        self.assertEqual(result["response_metadata"]["story"]["details"], [])
        self.assertEqual(self.store.campaign["story"]["intro"]["skipped"], ["origin", "motive", "bond", "dilemma"])

    def test_four_answers_complete_intro_without_resolving_hypothetical_action(self):
        self.turn("begin", "opening")
        for index, answer in enumerate(["A fisher", "Find my brother", "My family", "I pay the baker"]):
            result = self.turn(answer, f"a-{index}")
        self.assertEqual(result["response_metadata"]["story"]["stageId"], "lantern_lead")
        self.assertEqual(self.store.player["gold"], 10)
        self.assertEqual(self.store.campaign["story"]["flags"], {})
        self.assertIn("What do you do?", result["final_message"])

    def test_invalid_answer_does_not_advance(self):
        self.turn("begin", "opening")
        self.turn("x" * 1201, "a")
        self.assertEqual(self.store.campaign["story"]["intro"]["index"], 0)

    def test_streaming_has_real_text_and_same_metadata_contract(self):
        emitted = list(self.agent.stream(seed(self.store, "begin", "opening"), stream_mode="custom"))
        completed = next(e["value"] for e in emitted if e.get("name") == "response_complete")
        self.assertEqual("".join(e.get("delta", "") for e in emitted if e["type"] == "TEXT_MESSAGE_CONTENT"),
                         completed["response"])
        self.assertTrue(completed["metadata"]["game_events"])

    def test_failed_commit_publishes_no_completed_intro_or_memory(self):
        self.store.commit_turn = MagicMock(side_effect=RuntimeError("conflict"))
        emitted = []
        with self.assertRaises(RuntimeError):
            for item in self.agent.stream(seed(self.store, "begin", "opening"), stream_mode="custom"):
                emitted.append(item)
        self.assertFalse(any(e.get("name") == "response_complete" for e in emitted))
        self.assertFalse(any(e["type"] == "TEXT_MESSAGE_CONTENT" for e in emitted))

    def test_memory_retry_changes_status_without_consuming_another_answer(self):
        self.turn("begin", "opening")
        memory = MagicMock(enabled=False, semantic_enabled=True, semantic_target="target")
        memory.sync_character.side_effect = [[], ["origin"]]
        answer = {**seed(self.store, "A fisher", "answer"), "memory": memory}
        pending = self.agent.invoke(answer)
        synced = self.agent.invoke(answer)
        self.assertEqual(pending["response_metadata"]["story"]["memoryStatus"], "pending")
        self.assertEqual(synced["response_metadata"]["story"]["memoryStatus"], "synced")
        self.assertEqual(self.store.campaign["story"]["intro"]["index"], 1)
        self.assertEqual(self.store.commits, 2)
        memory.record_turn.assert_not_called()

    def test_deletion_during_memory_write_is_purged_and_not_published(self):
        self.turn("begin", "opening")
        memory = MagicMock(enabled=False, semantic_enabled=True, semantic_target="target")
        memory.sync_character.return_value = ["origin"]
        self.store.conversation_exists = MagicMock(side_effect=[True, False])
        emitted = []
        with self.assertRaises(RuntimeError):
            for item in self.agent.stream({**seed(self.store, "A fisher", "answer"), "memory": memory}, stream_mode="custom"):
                emitted.append(item)
        memory.delete_character.assert_called_once_with("conversation")
        self.assertFalse(any(e.get("name") == "response_complete" for e in emitted))


class GoverningFlowTest(unittest.TestCase):
    def test_supported_level_ceiling_terminates_with_large_rewards(self):
        from experiences.game_master.orchestrator import systems
        player = systems.apply_xp(nodes._fallback_player(), 2000)
        self.assertEqual(player["level"], len(systems.XP_THRESHOLDS))
        self.assertEqual(player["xp"], 2000)

    def test_legacy_adventures_resume_without_interview(self):
        campaign = story.ensure_story({"started": True, "activeObjectives": {"status": "COMPLETED"}})
        self.assertEqual(campaign["story"]["stageId"], "aftermath")
        self.assertEqual(campaign["story"]["intro"]["answers"], {})

    def test_only_explicit_goals_advance_and_consequences_fire_once(self):
        campaign = story.ensure_story({"started": True})
        for _ in range(30):
            campaign, emitted = story.advance(campaign)
        self.assertEqual(campaign["story"]["stageId"], "lantern_lead")
        self.assertFalse(emitted)
        campaign["activeObjectives"] = {"status": "IN_PROGRESS", "step": "clear_cellar"}
        campaign, emitted = story.advance(campaign)
        self.assertEqual(campaign["story"]["stageId"], "recovery")
        self.assertTrue(campaign["story"]["flags"]["cellar_safe"])
        self.assertEqual(len([e for e in emitted if e["kind"] == "consequence"]), 1)
        _, emitted = story.advance(campaign)
        self.assertFalse(emitted)

    def test_quest_reward_requires_recovery_and_return_and_is_not_repeatable(self):
        player = nodes._fallback_player()
        campaign = story.ensure_story({
            "started": True, "currentLocation": "market_tavern_cellar",
            "activeObjectives": {"status": "IN_PROGRESS", "step": "clear_cellar"},
        })
        with patch.object(nodes, "generate_narration", return_value="Narrated facts."):
            blocked = nodes.quest_node({"campaign": campaign, "player": player})
            self.assertEqual(blocked["player"]["gold"], 10)
            campaign["activeObjectives"]["step"] = "recover_lantern"
            player = systems.add_item(player, "missing_lantern")
            blocked = nodes.quest_node({"campaign": campaign, "player": player})
            self.assertEqual(blocked["player"]["gold"], 10)
            campaign["currentLocation"] = "whispering_tankard"
            status = nodes.quest_node({"campaign": campaign, "player": player, "user_input": "quest status"})
            self.assertEqual(status["player"]["gold"], 10)
            completed = nodes.quest_node({"campaign": campaign, "player": player, "user_input": "return the lantern"})
            repeated = nodes.quest_node(completed)
        self.assertEqual(completed["player"]["gold"], 30)
        self.assertEqual(repeated["player"]["gold"], 30)
        self.assertEqual(repeated["player"]["xp"], completed["player"]["xp"])

    def test_narration_failure_cannot_commit_story_progress(self):
        store = Store()
        with self.assertRaises(RuntimeError):
            nodes.finalize_node({**seed(store, "quest", "turn"), "narration_failed": True})
        self.assertEqual(store.commits, 0)

    def test_full_stage_chain_resumes_encounter_hp_and_rewards_only_once(self):
        store, agent = Store(), build_agent()
        def turn(text, mid):
            return agent.invoke(seed(store, text, mid))
        turn("begin", "opening")
        turn("skip intro", "skip")
        with patch.object(nodes, "generate_narration", return_value="Resolved facts."), \
             patch.object(systems, "roll_d20", return_value=15), \
             patch.object(systems, "dice_notation", return_value=4):
            turn("head to the tavern", "travel")
            turn("accept the quest", "accept")
            self.assertEqual(store.campaign["story"]["stageId"], "cellar")
            turn("go down into the cellar", "cellar")
            turn("attack the rats", "attack-1")
            self.assertEqual(store.campaign["story"]["encounters"]["market_tavern_cellar:cellar_rat"]["hp"], 3)
            turn("attack the rats", "attack-2")
            self.assertEqual(store.campaign["story"]["stageId"], "recovery")
            turn("search the cellar", "search")
            self.assertEqual(store.campaign["story"]["stageId"], "return")
            turn("go up to the tavern", "back")
            turn("return the lantern", "return")
            self.assertEqual(store.campaign["story"]["stageId"], "aftermath")
            player = deepcopy(store.player)
            turn("return the lantern", "return-again")
            self.assertEqual(store.player, player)
            self.assertEqual(systems.has_item(player, "missing_lantern"), 0)
            self.assertEqual(player["gold"], 30)

    def test_check_is_committed_before_publication_and_replayed_without_second_reward(self):
        store, agent = Store(), build_agent()
        store.campaign["started"] = True
        with patch.object(nodes, "generate_narration", return_value="Roll a check."):
            emitted = list(agent.stream(seed(store, "climb the wall", "check"), stream_mode="custom"))
            request = store.dice["pendingDiceRoll"]
            completed = next(e["value"] for e in emitted if e.get("name") == "response_complete")
            self.assertEqual(completed["metadata"]["story"]["pendingDiceRoll"], request)
            replay = agent.invoke(seed(store, "climb the wall", "check"))
            self.assertEqual(replay["response_metadata"]["story"]["pendingDiceRoll"], request)
            result_text = json.dumps({"type": "DICE_RESULT", "requestId": request["requestId"], "diceValue": 18})
            result = agent.invoke(seed(store, result_text, "roll"))
            xp = store.player["xp"]
            self.assertIsNone(result["response_metadata"]["story"]["pendingDiceRoll"])
            agent.invoke(seed(store, result_text, "roll"))
            agent.invoke(seed(store, result_text, "another-roll"))
            self.assertEqual(store.player["xp"], xp)
            self.assertEqual(xp, 10)

    def test_expired_and_invalid_dice_values_cannot_award_xp(self):
        store = Store()
        store.campaign["started"] = True
        store.dice = {"pendingDiceRoll": {**systems.request_stat_check("wisdom", 10, 12),
                                         "requestId": "request", "expiresAt": "2000-01-01T00:00:00+00:00"}}
        with patch.object(nodes, "generate_narration", return_value="No matching check."):
            for index, value in enumerate((0, 21, True, "20", 20)):
                build_agent().invoke(seed(store, json.dumps({"type": "DICE_RESULT", "requestId": "request", "diceValue": value}), f"roll-{index}"))
        self.assertEqual(store.player["xp"], 0)


class PersistenceTest(unittest.TestCase):
    def test_story_round_trip_accepts_native_and_awsjson_values(self):
        campaign = story.ensure_story({"started": True})
        for value in ({"S": json.dumps(campaign["story"])},
                      {"M": {"version": {"N": "1"}, "stageId": {"S": "lantern_lead"}}}):
            decoded = OrchestrationStore._json(value)
            self.assertEqual(decoded["stageId"], "lantern_lead")

    def test_atomic_commit_fences_version_and_deletion_and_serializes_awsjson(self):
        resource, client = MagicMock(), MagicMock()
        store = OrchestrationStore(resource, client)
        store.adventure_table.name = "adventures"
        store.character_table.name = "characters"
        campaign = story.ensure_story({**nodes._fallback_campaign(), "id": "a"})
        player = {**nodes._fallback_player(), "id": "p"}
        before = deepcopy(player)
        player["gold"] += 20
        with patch.dict("os.environ", {"CONVERSATION_TABLE_NAME": "conversations"}):
            store.commit_turn({"conversation_id": "c", "before_campaign": {}, "before_player": before}, campaign, player)
        writes = client.transact_write_items.call_args.kwargs["TransactItems"]
        self.assertEqual(len(writes), 3)
        self.assertIn("storyVersion = :expected", writes[0]["Update"]["ConditionExpression"])
        self.assertEqual(writes[1]["ConditionCheck"]["TableName"], "conversations")
        update = writes[0]["Update"]
        story_alias = next(key for key, value in update["ExpressionAttributeNames"].items() if value == "storyState")
        self.assertIn("S", update["ExpressionAttributeValues"][story_alias.replace("#f", ":v")])

    def test_durable_message_receipt_fences_retries_after_cache_eviction(self):
        store = OrchestrationStore(MagicMock(), MagicMock())
        campaign = story.ensure_story({**nodes._fallback_campaign(), "id": "a"})
        player = nodes._fallback_player()
        with patch.dict("os.environ", {"CONVERSATION_TABLE_NAME": "conversations", "MESSAGE_TABLE_NAME": "messages"}):
            store.commit_turn({"conversation_id": "c", "message_id": "m", "before_campaign": {},
                               "before_player": player}, campaign, player)
        writes = store.client.transact_write_items.call_args.kwargs["TransactItems"]
        receipt = next(write["Update"] for write in writes if write.get("Update", {}).get("TableName") == "messages")
        self.assertIn("attribute_not_exists(gmProcessed)", receipt["ConditionExpression"])
        self.assertEqual(receipt["ExpressionAttributeValues"][":cid"], {"S": "c"})

    def test_character_is_strongly_read_after_gsi_lookup(self):
        client = MagicMock()
        client.query.return_value = {"Items": [{"id": {"S": "character"}, "experience": {"N": "0"}}]}
        client.get_item.return_value = {"Item": {"id": {"S": "character"}, "experience": {"N": "100"}}}
        store = OrchestrationStore(MagicMock(), client)
        self.assertEqual(store.load_player("c")["xp"], 100)
        self.assertTrue(client.get_item.call_args.kwargs["ConsistentRead"])

    def test_deleted_adventure_cleanup_is_scoped_paginated_and_retryable(self):
        resource, client = MagicMock(), MagicMock()
        tables = {name: MagicMock() for name in ("adventures", "characters", "dice", "messages", "responses")}
        for name, table in tables.items():
            table.name = name
            table.table_name = name
        resource.Table.side_effect = lambda name: tables[name]
        with patch.dict("os.environ", {"ADVENTURE_TABLE_NAME": "adventures", "CHARACTER_TABLE_NAME": "characters",
                                      "PLAYER_STATE_TABLE_NAME": "dice", "ACTIVE_QUEST_TABLE_NAME": "adventures",
                                      "MESSAGE_TABLE_NAME": "messages", "RESPONSE_TABLE_NAME": "responses"}):
            store = OrchestrationStore(resource, client)
            client.query.side_effect = [
                {"Items": [{"id": {"S": "legacy"}}], "LastEvaluatedKey": {"id": {"S": "legacy"}}},
                {"Items": [{"id": {"S": "last"}}]}, {}, {}, {}, {},
            ]
            store.delete_adventure("deleted")
            tables["adventures"].delete_item.assert_called_once_with(Key={"id": "gm:deleted"})
            self.assertEqual(client.delete_item.call_count, 2)
            for call in client.query.call_args_list:
                self.assertEqual(call.kwargs["ExpressionAttributeValues"], {":c": {"S": "deleted"}})
            self.assertIn("ExclusiveStartKey", client.query.call_args_list[1].kwargs)
            client.query.side_effect = RuntimeError("retry cleanup")
            with self.assertRaises(RuntimeError):
                store.delete_adventure("deleted")


if __name__ == "__main__":
    unittest.main()
