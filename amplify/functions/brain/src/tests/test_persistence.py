"""Unit tests for OrchestrationStore PlayerState (dice) persistence.

These use a fake DynamoDB client/resource so no AWS calls are made.
Run from the lambda src root:
    cd amplify/functions/brain/src && python3 -m unittest tests.test_persistence -v
"""

from __future__ import annotations

import os
import unittest
from unittest.mock import MagicMock

from experiences.game_master.orchestrator.persistence import (
    OrchestrationStore,
    PLAYER_STATE_TABLE_KEY,
    CHARACTER_TABLE_KEY,
    ADVENTURE_TABLE_KEY,
    ACTIVE_QUEST_TABLE_KEY,
)


class _FakeClient:
    """Minimal fake `dynamodb` client: query + describe_table + no-op updates."""

    def __init__(self, rows=None):
        self.rows = rows or []  # list of raw DDB items (dict of {key: {"S"/"L"/...}})
        self.described = {}
        self.last_query_index = None

    def describe_table(self, TableName=None):
        if TableName in self.described:
            return self.described[TableName]
        # Default: no GSI -> falls back to "-index" name.
        return {"Table": {"GlobalSecondaryIndexes": []}}

    def query(self, TableName=None, IndexName=None, **kwargs):
        self.last_query_index = IndexName
        return {"Items": self.rows}

    def update_item(self, **kwargs):
        self.last_update = kwargs


class _FakeResource:
    def __init__(self, tables):
        self.tables = tables

    def Table(self, name):
        return self.tables.get(name) or MagicMock(id=name)


def _store(rows=None):
    client = _FakeClient(rows=rows)
    os.environ[PLAYER_STATE_TABLE_KEY] = "PlayerStateTable"
    os.environ[CHARACTER_TABLE_KEY] = "GMCharacterTable"
    os.environ[ADVENTURE_TABLE_KEY] = "GMAdventureTable"
    os.environ[ACTIVE_QUEST_TABLE_KEY] = "ActiveQuestTable"
    # Give PlayerState its campaignId GSI.
    client.described["PlayerStateTable"] = {
        "Table": {
            "GlobalSecondaryIndexes": [
                {
                    "IndexName": "playerStateByCampaignId",
                    "KeySchema": [{"AttributeName": "campaignId", "KeyType": "HASH"}],
                }
            ]
        }
    }
    store = OrchestrationStore(resource=_FakeResource({}), client=client)
    store.player_state_table = MagicMock(name="PlayerStateTable")
    store.player_state_table.name = "PlayerStateTable"
    return store, client


def _row(campaign_id, pending=None, log=None):
    return {
        "id": {"S": f"row-{campaign_id}"},
        "campaignId": {"S": campaign_id},
        "version": {"N": "3"},
        "pendingDiceRoll": {"S": __import__("json").dumps(pending)} if pending else {"NULL": True},
        "diceRollLog": {"L": log or []},
    }


class PlayerStateQueryTest(unittest.TestCase):
    def test_load_player_state_uses_campaign_index(self):
        store, client = _store(rows=[_row("conv-1", pending={"requestId": "r1"})])
        state = store.load_player_state("conv-1")
        self.assertIsNotNone(state)
        self.assertEqual(state["pendingDiceRoll"]["requestId"], "r1")
        self.assertEqual(state["version"], 3)
        self.assertEqual(client.last_query_index, "playerStateByCampaignId")

    def test_load_player_state_returns_none_when_absent(self):
        store, _ = _store(rows=[])
        self.assertIsNone(store.load_player_state("conv-1"))


class DiceLogTest(unittest.TestCase):
    def test_append_dice_roll_log_persists_and_clears_pending(self):
        store, client = _store(rows=[_row("conv-1", pending={"requestId": "r1"})])
        store.append_dice_roll_log("conv-1", {"outcome": "SUCCESS"}, clear_pending=True)
        store.player_state_table.update_item.assert_called_once()
        kwargs = store.player_state_table.update_item.call_args.kwargs
        self.assertEqual(kwargs["Key"], {"id": "row-conv-1"})
        self.assertIn("diceRollLog=:log", kwargs["UpdateExpression"])
        self.assertIn("pendingDiceRoll=:none", kwargs["UpdateExpression"])
        self.assertEqual(kwargs["ExpressionAttributeValues"][":none"], None)

    def test_append_dice_roll_log_noop_when_no_row(self):
        store, _ = _store(rows=[])
        store.append_dice_roll_log("conv-1", {"outcome": "SUCCESS"})
        store.player_state_table.update_item.assert_not_called()

    def test_write_pending_dice_roll_upserts(self):
        store, _ = _store(rows=[])
        store.write_pending_dice_roll("conv-1", {"requestId": "r1", "statName": "dex"})
        store.player_state_table.update_item.assert_called_once()
        kwargs = store.player_state_table.update_item.call_args.kwargs
        self.assertEqual(kwargs["Key"]["id"], "conv-1")
        self.assertEqual(kwargs["ExpressionAttributeValues"][":roll"]["requestId"], "r1")


if __name__ == "__main__":
    unittest.main()