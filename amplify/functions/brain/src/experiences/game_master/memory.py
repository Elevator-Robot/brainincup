from __future__ import annotations

import logging
import os
from typing import Any

logger = logging.getLogger(__name__)


def get_campaign_memory_namespace(user_id: str, campaign_id: str) -> str:
    return f"/user/{user_id}/campaigns/{campaign_id}/"


def get_world_state_namespace(campaign_id: str) -> str:
    return f"/campaigns/{campaign_id}/world/"


def get_character_namespace(user_id: str, campaign_id: str) -> str:
    return f"/user/{user_id}/campaigns/{campaign_id}/character/"


def load_player_state(dynamodb_client: Any, conversation_id: str) -> dict:
    table = os.environ.get("PLAYER_STATE_TABLE", "PlayerState")
    if not table or not dynamodb_client:
        return _default_player_state()
    try:
        response = dynamodb_client.query(
            TableName=table,
            IndexName="conversationId-index",
            KeyConditionExpression="conversationId = :val",
            ExpressionAttributeValues={":val": {"S": conversation_id}},
            Limit=1,
        )
        items = response.get("Items", [])
        if items:
            try:
                from boto3.dynamodb.types import TypeDeserializer
                d = TypeDeserializer()
                return {k: d.deserialize(v) for k, v in items[0].items()}
            except ImportError:
                return items[0]
    except Exception as exc:
        logger.warning("load_player_state failed for %s: %s", conversation_id, exc)
    return _default_player_state()


def _default_player_state() -> dict:
    return {
        "currentLevel": 1,
        "currentXP": 0,
        "xpToNextLevel": 100,
        "currentAreaId": "area_shrouded_vale",
        "lastKnownLocation": "The Shrouded Vale",
        "currentHP": 20,
        "maxHP": 20,
        "activeQuestIds": ["quest_001"],
        "completedQuestIds": [],
        "failedQuestIds": [],
        "diceRollLog": [],
        "pacingMetrics": {},
        "uiHints": [],
        "pendingDiceRoll": None,
        "campaignId": "",
        "owner": "",
        "version": 1,
    }
