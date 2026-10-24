"""Persistence contract tests using an in-memory stand-in, never an AWS account."""
import copy
import json
import unittest
from botocore.exceptions import ClientError

from experiences.base import ExperienceContext
from experiences.brain.cognition.persistence import BrainStateStore, BrainStateAccessError, BrainStateConflict


class Table:
    def __init__(self, rows):
        self.rows = rows
        self.updates = []

    def get_item(self, **kwargs):
        assert kwargs["ConsistentRead"] is True
        return {"Item": copy.deepcopy(self.rows.get(kwargs["Key"]["id"], {}))}

    def update_item(self, **kwargs):
        self.updates.append(kwargs)
        row = self.rows.get(kwargs["Key"]["id"])
        values = kwargs["ExpressionAttributeValues"]
        revision_matches = row is not None and (row.get("brainStateVersion") == values[":expected"] if ":expected" in values else "brainStateVersion" not in row)
        if not row or row["owner"] != values[":owner"] or not revision_matches or any(row.get(key, "brain") not in (None, "brain", "default") for key in ("experience", "personalityMode")):
            raise ClientError({"Error": {"Code": "ConditionalCheckFailedException"}}, "UpdateItem")
        row.update(brainState=values[":state"], brainStateVersion=values[":next"])


class Resource:
    def __init__(self):
        self.tables = {
            "conversations": Table({"c": {"id": "c", "owner": "alice::login", "experience": "brain", "personalityMode": "brain"}}),
            "messages": Table({"m": {"id": "m", "owner": "alice::login", "conversationId": "c", "content": "Hello Brain"}}),
        }

    def Table(self, name):
        return self.tables[name]


class BrainStateStoreTest(unittest.TestCase):
    def setUp(self):
        self.resource = Resource()
        self.store = BrainStateStore(self.resource, conversation_table="conversations", message_table="messages")
        self.ctx = ExperienceContext("c", "Hello Brain", message_id="m", owner="alice")
        self.row = self.resource.tables["conversations"].rows["c"]

    def test_legacy_conversation_initializes_and_round_trips_aws_json(self):
        before = self.store.load(self.ctx)
        self.assertIsNone(before.revision)
        persona = before.persona | {"turn_count": 1}
        self.store.commit(self.ctx, before, persona, {"reply": {"response": "Hello."}, "metadata": {}})
        self.assertIsInstance(self.row["brainState"], str)
        self.assertEqual(json.loads(self.row["brainState"])["persona"]["turn_count"], 1)
        after = self.store.load(self.ctx)
        self.assertEqual(after.persona["turn_count"], 1)
        self.assertTrue(after.revision)
        self.assertEqual(after.receipts[0]["message_id"], "m")

    def test_other_owner_cannot_load_state(self):
        self.ctx.owner = "bob"
        with self.assertRaises(BrainStateAccessError):
            self.store.load(self.ctx)

    def test_missing_or_unowned_message_cannot_load_state(self):
        for change in [{"owner": "bob"}, {"conversationId": "other"}, {"content": "different"}]:
            with self.subTest(change=change):
                original = dict(self.resource.tables["messages"].rows["m"])
                self.resource.tables["messages"].rows["m"].update(change)
                with self.assertRaises(BrainStateAccessError):
                    self.store.load(self.ctx)
                self.resource.tables["messages"].rows["m"] = original
        self.resource.tables["messages"].rows.clear()
        with self.assertRaises(BrainStateAccessError):
            self.store.load(self.ctx)

    def test_game_master_record_cannot_be_used(self):
        self.row["personalityMode"] = "game_master"
        with self.assertRaises(BrainStateAccessError):
            self.store.load(self.ctx)

    def test_nullable_legacy_brain_modes_can_initialize_state(self):
        self.row.update(experience=None, personalityMode=None)
        snapshot = self.store.load(self.ctx)
        self.store.commit(self.ctx, snapshot, snapshot.persona, {"reply": {"response": "hello"}})
        self.assertTrue(self.store.load(self.ctx).revision)

    def test_concurrent_turns_do_not_overwrite(self):
        first = self.store.load(self.ctx)
        second = self.store.load(self.ctx)
        self.store.commit(self.ctx, first, first.persona, {"reply": {"response": "hi"}})
        with self.assertRaises(BrainStateConflict):
            self.store.commit(self.ctx, second, second.persona, {"reply": {"response": "late"}})

    def test_clear_fences_a_turn_even_before_the_first_state_was_written(self):
        before = self.store.load(self.ctx)
        self.row.update(brainState=None, brainStateVersion="fresh-clear-revision")
        with self.assertRaises(BrainStateConflict):
            self.store.commit(self.ctx, before, before.persona, {})
        self.assertIsNone(self.row["brainState"])

    def test_owner_or_mode_change_during_inference_fences_commit(self):
        before = self.store.load(self.ctx)
        self.row["owner"] = "bob"
        with self.assertRaises(BrainStateConflict):
            self.store.commit(self.ctx, before, before.persona, {})
        self.row.update(owner="alice::login", experience="game_master")
        with self.assertRaises(BrainStateConflict):
            self.store.commit(self.ctx, before, before.persona, {})

    def test_unknown_saved_schema_is_not_silently_replaced(self):
        self.row["brainState"] = json.dumps({"schema_version": 99})
        with self.assertRaises(BrainStateConflict):
            self.store.load(self.ctx)

    def test_no_configuration_fails_closed_without_creating_clients(self):
        with self.assertRaises(RuntimeError):
            BrainStateStore().load(self.ctx)


if __name__ == "__main__":
    unittest.main()
