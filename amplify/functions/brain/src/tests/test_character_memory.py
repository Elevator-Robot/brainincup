import unittest
from unittest.mock import MagicMock

import boto3
from botocore.stub import Stubber, ANY

from experiences.game_master.orchestrator.memory import MemoryService


class CharacterMemoryTest(unittest.TestCase):
    def setUp(self):
        self.client = MagicMock()
        self.memory = MemoryService(memory_id="CharacterMemory-1234567890",
                                    semantic_strategy_id="semantic", client=self.client)
        self.story = {"intro": {"answers": {"dilemma": {
            "answer": "I would pay the baker", "messageId": "m1",
            "recordedAt": "2026-11-26T10:00:00+00:00", "source": "player_authored_fiction",
        }}}, "memorySynced": []}

    def sync(self):
        return self.memory.sync_character(conversation_id="adventure", player={"name": "Sera"}, story=self.story)

    def test_acknowledged_facts_use_semantic_strategy_and_real_api_shape(self):
        client = boto3.client("bedrock-agentcore", region_name="us-east-1")
        self.memory._client = client
        with Stubber(client) as stub:
            stub.add_response("batch_create_memory_records", {"failedRecords": [], "successfulRecords": [
                {"requestIdentifier": "ignored-by-stub-test", "memoryRecordId": "r" * 40, "status": "SUCCEEDED"}
            ]}, {"memoryId": self.memory.memory_id, "clientToken": ANY, "records": ANY})
            # The intentionally unmatched acknowledgment must not claim success.
            self.assertEqual(self.sync(), [])

    def test_failure_and_partial_failure_remain_retryable_with_identical_token(self):
        self.client.batch_create_memory_records.side_effect = RuntimeError("offline")
        self.assertEqual(self.sync(), [])
        original = self.client.batch_create_memory_records.call_args
        self.client.batch_create_memory_records.side_effect = None
        self.client.batch_create_memory_records.return_value = {"failedRecords": [{"requestIdentifier": "bad"}]}
        self.assertEqual(self.sync(), [])
        self.assertEqual(original, self.client.batch_create_memory_records.call_args)

    def test_sync_is_exact_fiction_and_skips_acknowledged_facts(self):
        def acknowledge(**kwargs):
            return {"successfulRecords": [{"requestIdentifier": kwargs["records"][0]["requestIdentifier"]}]}
        self.client.batch_create_memory_records.side_effect = acknowledge
        self.assertEqual(self.sync(), ["dilemma"])
        sent = self.client.batch_create_memory_records.call_args.kwargs
        self.assertEqual(sent["records"][0]["memoryStrategyId"], "semantic")
        self.assertIn('"hypothetical": true', sent["records"][0]["content"]["text"])
        self.assertIn('"entity": "fictional_character"', sent["records"][0]["content"]["text"])
        self.story["memorySynced"] = ["dilemma"]
        self.story["memoryTarget"] = self.memory.semantic_target
        self.sync()
        self.client.batch_create_memory_records.assert_called_once()
        self.client.create_event.assert_not_called()

    def test_old_memory_target_acknowledgments_do_not_hide_unsynced_facts(self):
        self.story.update(memorySynced=["dilemma"], memoryTarget="previous-resource")
        self.client.batch_create_memory_records.return_value = {"failedRecords": [{"requestIdentifier": "failed"}]}
        self.assertEqual(self.sync(), [])
        self.client.batch_create_memory_records.assert_called_once()

    def test_deletion_is_paginated_and_scoped_and_failures_propagate(self):
        self.client.list_memory_records.side_effect = [
            {"memoryRecordSummaries": [{"memoryRecordId": "one"}], "nextToken": "page-2"},
            {"memoryRecordSummaries": [{"memoryRecordId": "two"}]},
        ]
        self.memory.delete_character("adventure")
        self.assertEqual(self.client.delete_memory_record.call_count, 2)
        for call in self.client.list_memory_records.call_args_list:
            self.assertEqual(call.kwargs["namespace"], self.memory.semantic_namespace("adventure"))
        self.client.list_memory_records.side_effect = RuntimeError("retry me")
        with self.assertRaises(RuntimeError):
            self.memory.delete_character("adventure")

    def test_regional_guard(self):
        with self.assertRaises(ValueError):
            MemoryService(memory_id="memory", semantic_strategy_id="semantic", region_name="us-west-2")
