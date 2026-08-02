"""Persistence adapter between the orchestrator and the existing DynamoDB tables.

Authoritative player stats / inventory / HP live on the GameMasterCharacter
row. Quest + campaign narrative mirrors onto the GameMasterAdventure and
ActiveQuest rows. The orchestrator reads these once per turn, runs the
deterministic systems, then writes the diffs back. It never recreates state
that already exists in the tables.
"""

from __future__ import annotations

import json
import logging
import os
from typing import Any, Optional

import boto3

from experiences.game_master.orchestrator import content

logger = logging.getLogger(__name__)

CHARACTER_TABLE_KEY = "CHARACTER_TABLE_NAME"
ADVENTURE_TABLE_KEY = "ADVENTURE_TABLE_NAME"
PLAYER_STATE_TABLE_KEY = "PLAYER_STATE_TABLE_NAME"
ACTIVE_QUEST_TABLE_KEY = "ACTIVE_QUEST_TABLE_NAME"

STAT_FIELDS = ("strength", "dexterity", "constitution", "intelligence",
               "wisdom", "charisma")


def _env(key: str) -> Optional[str]:
    return os.environ.get(key)


class OrchestrationStore:
    """Thin wrapper over boto3 DynamoDB tables used by the GM orchestrator."""

    def __init__(self, resource: Any = None, client: Any = None):
        self.resource = resource or boto3.resource("dynamodb")
        self.client = client or boto3.client("dynamodb")
        self.character_table = self.resource.Table(_env(CHARACTER_TABLE_KEY) or "")
        self.adventure_table = self.resource.Table(_env(ADVENTURE_TABLE_KEY) or "")
        self.active_quest_table = self.resource.Table(_env(ACTIVE_QUEST_TABLE_KEY) or "")
        self._gsi_cache: dict[str, Optional[str]] = {}

    def _conversation_index(self, table: Any) -> str:
        """Resolve the GSI keyed on `conversationId` for a table by describing it.

        Amplify names query-by-conversation indexes `gameMasterCharactersByConversationId`
        style (not `conversationId-index`), so we discover the real index name instead
        of hard-coding an assumption. Falls back to the legacy name if none is found.
        """
        name = table.table_name or ""
        if name in self._gsi_cache:
            return self._gsi_cache[name] or "conversationId-index"
        try:
            info = self.client.describe_table(TableName=table.name).get("Table", {})
            resolved = None
            for gsi in info.get("GlobalSecondaryIndexes", []):
                keys = [k["AttributeName"] for k in gsi.get("KeySchema", [])]
                if "conversationId" in keys:
                    resolved = gsi["IndexName"]
                    break
            self._gsi_cache[name] = resolved
            return resolved or "conversationId-index"
        except Exception as exc:  # noqa: BLE001
            logger.warning("could not describe table %s: %s", table.table_name, exc)
            self._gsi_cache[name] = None
            return "conversationId-index"

    # -- player -----------------------------------------------------------

    def load_player(self, conversation_id: str) -> Optional[dict]:
        resp = self.client.query(
            TableName=self.character_table.name,
            IndexName=self._conversation_index(self.character_table),
            KeyConditionExpression="conversationId = :c",
            ExpressionAttributeValues={":c": {"S": conversation_id}},
            Limit=1,
        )
        items = resp.get("Items", [])
        if not items:
            return None
        return self._player_from_item(items[0])

    def _player_from_item(self, item: dict) -> dict:
        stats = {f: int(self._num(item.get(f), 10)) for f in STAT_FIELDS}
        inventory = self._s(item.get("inventory"))
        inventory = inventory if isinstance(inventory, list) else []
        player = {
            "id": self._s(item.get("id")),
            "name": self._s(item.get("name"), "Adventurer"),
            "race": self._s(item.get("race"), "Human"),
            "class": self._s(item.get("characterClass"), "Wanderer"),
            "level": int(self._num(item.get("level"), 1)),
            "xp": int(self._num(item.get("experience"), 0)),
            "max_hp": int(self._num(item.get("maxHP"), 12)),
            "current_hp": int(self._num(item.get("currentHP"), 12)),
            "ac": int(self._num(item.get("armorClass"), 10)),
            "stats": stats,
            "inventory": self._clean_inventory(inventory),
            "gold": 0,
        }
        gold = self._extract_gold(player["inventory"])
        if gold is not None:
            player["gold"] = gold
            player["inventory"] = [x for x in player["inventory"] if x.get("id") != "gold"]
        return player

    @staticmethod
    def _clean_inventory(inventory: list) -> list:
        cleaned = []
        for entry in inventory:
            if not isinstance(entry, dict):
                continue
            cleaned.append({
                "id": entry.get("id", entry.get("name", "item")),
                "name": entry.get("name", entry.get("id", "Item")),
                "type": entry.get("type", "misc"),
                "quantity": int(entry.get("quantity", entry.get("qty", 1))),
            })
        return cleaned

    @staticmethod
    def _extract_gold(inventory: list) -> Optional[int]:
        for entry in inventory:
            if entry.get("id") in ("gold", "coin") or str(entry.get("name", "")).lower() in ("gold", "coin"):
                return int(entry.get("quantity", 0))
        return None

    def save_player(self, conversation_id: str, player: dict) -> None:
        inventory = [dict(x) for x in player.get("inventory", [])]
        if int(player.get("gold", 0) or 0) > 0:
            inventory.append({"id": "gold", "name": "Gold", "type": "currency", "quantity": int(player["gold"])})
        self.character_table.update_item(
            Key={"id": player.get("id") or conversation_id},
            UpdateExpression=(
                "SET characterClass=:cls, level=:lvl, experience=:xp, "
                "maxHP=:mhp, currentHP=:chp, armorClass=:ac, inventory=:inv, "
                "strength=:st, dexterity=:dx, constitution=:cn, "
                "intelligence=:it, wisdom=:wd, charisma=:ch"
            ),
            ExpressionAttributeValues={
                ":cls": player.get("class", "Wanderer"),
                ":lvl": int(player.get("level", 1)),
                ":xp": int(player.get("xp", 0)),
                ":mhp": int(player.get("max_hp", 12)),
                ":chp": int(player.get("current_hp", 12)),
                ":ac": int(player.get("ac", 10)),
                ":inv": inventory,
                ":st": int(player.get("stats", {}).get("strength", 10)),
                ":dx": int(player.get("stats", {}).get("dexterity", 10)),
                ":cn": int(player.get("stats", {}).get("constitution", 10)),
                ":it": int(player.get("stats", {}).get("intelligence", 10)),
                ":wd": int(player.get("stats", {}).get("wisdom", 10)),
                ":ch": int(player.get("stats", {}).get("charisma", 10)),
            },
        )

    # -- campaign ---------------------------------------------------------

    def load_campaign(self, conversation_id: str) -> dict:
        resp = self.client.query(
            TableName=self.adventure_table.name,
            IndexName=self._conversation_index(self.adventure_table),
            KeyConditionExpression="conversationId = :c",
            ExpressionAttributeValues={":c": {"S": conversation_id}},
        )
        items = resp.get("Items", []) or []
        # The GameMasterAdventure table is shared with a legacy adventure engine
        # that writes free-text rows (a new row per turn). Prefer rows whose
        # location is a known content key; if none exist, start fresh rather than
        # inherit an unresolvable free-text location that would crash gameplay.
        known = [
            it for it in items
            if content.get_location(self._s(it.get("currentLocation"))) is not None
        ]
        pool = sorted(known, key=lambda it: self._s(it.get("updatedAt")), reverse=True)
        if not pool:
            return self._fresh_campaign(conversation_id)
        item = pool[0]
        return {
            "id": self._s(item.get("id")),
            "conversation_id": conversation_id,
            "started": bool(item.get("started", {}).get("BOOL", False)),
            "currentLocation": self._s(item.get("currentLocation"), content.STARTING_LOCATION),
            "currentScene": self._s(item.get("currentScene"), ""),
            "activeObjectives": self._json(item.get("activeObjectives")),
            "visitedLocations": self._list(item.get("visitedLocations")) or [content.STARTING_LOCATION],
            "criticalChoices": self._list(item.get("criticalChoices")) or [],
        }

    @staticmethod
    def _fresh_campaign(conversation_id: str) -> dict:
        return {
            "id": None,
            "conversation_id": conversation_id,
            "started": False,
            "currentLocation": content.STARTING_LOCATION,
            "currentScene": "",
            "activeObjectives": None,
            "visitedLocations": [content.STARTING_LOCATION],
            "criticalChoices": [],
        }

    def ensure_campaign(self, conversation_id: str, campaign: dict) -> dict:
        """Create the GameMasterAdventure row on first run and return its id."""
        if campaign.get("id"):
            return campaign
        import uuid

        adventure_id = str(uuid.uuid4())
        self.adventure_table.put_item(
            Item={
                "id": {"S": adventure_id},
                "conversationId": {"S": conversation_id},
                "started": {"BOOL": False},
                "currentLocation": {"S": campaign.get("currentLocation", content.STARTING_LOCATION)},
                "visitedLocations": {"L": [{"S": loc} for loc in (campaign.get("visitedLocations") or [])]},
                "createdAt": {"S": self._now()},
                "updatedAt": {"S": self._now()},
            },
        )
        campaign["id"] = adventure_id
        return campaign

    def save_campaign(self, campaign: dict) -> None:
        if not campaign.get("id"):
            raise ValueError("Cannot persist an uncreated campaign row")
        self.adventure_table.update_item(
            Key={"id": campaign.get("id")},
            UpdateExpression=(
                "SET started=:st, currentLocation=:loc, currentScene=:scene, "
                "activeObjectives=:obj, visitedLocations=:visited, "
                "criticalChoices=:choices"
            ),
            ExpressionAttributeValues={
                ":st": bool(campaign.get("started", False)),
                ":loc": campaign.get("currentLocation", content.STARTING_LOCATION),
                ":scene": campaign.get("currentScene", ""),
                ":obj": campaign.get("activeObjectives"),
                ":visited": campaign.get("visitedLocations", []),
                ":choices": campaign.get("criticalChoices", []),
            },
        )

    def ensure_quest_row(self, conversation_id: str, character_id: str,
                        quest: dict) -> str:
        """Create (or return) an ActiveQuest row. Uses a stable id per quest."""
        quest_id = f"{conversation_id}:{quest['id']}"
        self.active_quest_table.put_item(
            Item={
                "id": {"S": quest_id},
                "playerStateId": {"S": character_id},
                "questDefinitionId": {"S": quest["id"]},
                "campaignId": {"S": content.GREENFIELD_CAMPAIGN_ID},
                "status": {"S": "ACTIVE"},
                "currentStepIndex": {"N": "0"},
                "totalSteps": {"N": str(len(quest.get("steps", [])))},
                "startedAt": {"S": self._now()},
                "owner": {"S": character_id},
            },
        )
        return quest_id

    def record_quest_complete(self, character_id: str, quest: dict) -> None:
        self.active_quest_table.update_item(
            Key={"id": f"{character_id}:{quest['id']}"},
            UpdateExpression="SET #status=:s, completedAt=:t",
            ExpressionAttributeNames={"#status": "status"},
            ExpressionAttributeValues={":s": "COMPLETED", ":t": self._now()},
        )

    @staticmethod
    def _now() -> str:
        from datetime import datetime, timezone
        return datetime.now(timezone.utc).isoformat()

    # -- type helpers -----------------------------------------------------

    @staticmethod
    def _s(value: Any, default: Any = "") -> Any:
        if value is None:
            return default
        if isinstance(value, dict) and "S" in value:
            return value["S"]
        if isinstance(value, dict) and "N" in value:
            return value["N"]
        return value

    @staticmethod
    def _num(value: Any, default: Any) -> Any:
        v = OrchestrationStore._s(value)
        try:
            return int(v)
        except (TypeError, ValueError):
            return default

    @staticmethod
    def _json(value: Any, default: Any = None) -> Any:
        if value is None:
            return default
        if isinstance(value, dict):
            if "S" in value:
                try:
                    return json.loads(value["S"])
                except (TypeError, ValueError):
                    return value["S"]
            return value
        try:
            return json.loads(value)
        except (TypeError, ValueError):
            return value

    @staticmethod
    def _list(value: Any, default: list | None = None) -> list | None:
        if value is None:
            return default
        if isinstance(value, dict) and "L" in value:
            return value["L"]
        return value