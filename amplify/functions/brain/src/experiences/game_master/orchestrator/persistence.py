"""Persistence adapter between the orchestrator and the existing DynamoDB tables.

Authoritative player stats / inventory / HP live on the GameMasterCharacter
row; quest, character details and story stages live on GameMasterAdventure.
The orchestrator reads these once per turn, runs deterministic systems, then
commits changes atomically. ActiveQuest is a legacy projection.
"""

from __future__ import annotations

import json
import logging
import os
from typing import Any, Optional

import boto3
from boto3.dynamodb.types import TypeDeserializer, TypeSerializer
from botocore.exceptions import ClientError

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
        self.player_state_table = self.resource.Table(_env(PLAYER_STATE_TABLE_KEY) or "")
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

    def _campaign_index(self, table: Any) -> str:
        """Resolve the PlayerState GSI keyed on `campaignId` (Amplify index name)."""
        name = table.table_name or ""
        cached = self._gsi_cache.get(f"{name}:campaign")
        if cached:
            return cached
        try:
            info = self.client.describe_table(TableName=table.name).get("Table", {})
            resolved = None
            for gsi in info.get("GlobalSecondaryIndexes", []):
                keys = [k["AttributeName"] for k in gsi.get("KeySchema", [])]
                if "campaignId" in keys:
                    resolved = gsi["IndexName"]
                    break
            self._gsi_cache[f"{name}:campaign"] = resolved
            return resolved or "campaignId-index"
        except Exception as exc:  # noqa: BLE001
            logger.warning("could not describe table %s: %s", table.table_name, exc)
            self._gsi_cache[f"{name}:campaign"] = None
            return "campaignId-index"

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
        # A GSI locates the row but may lag behind a committed reward/HP change.
        item = self.client.get_item(
            TableName=self.character_table.name, Key={"id": items[0]["id"]}, ConsistentRead=True,
        ).get("Item")
        return self._player_from_item(item) if item else None

    def _player_from_item(self, item: dict) -> dict:
        stats = {f: int(self._num(item.get(f), 10)) for f in STAT_FIELDS}
        inventory = self._json(item.get("inventory"))
        inventory = inventory if isinstance(inventory, list) else []
        player = {
            "id": self._s(item.get("id")),
            "owner": self._s(item.get("owner")),
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
        # New campaigns have a stable key, avoiding GSI lag on the next answer.
        stable = self.client.get_item(
            TableName=self.adventure_table.name,
            Key={"id": {"S": f"gm:{conversation_id}"}}, ConsistentRead=True,
        ).get("Item")
        if stable:
            return self._campaign_from_item(stable, conversation_id)
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
        # The index locates legacy rows; read their current version consistently.
        item = self.client.get_item(
            TableName=self.adventure_table.name, Key={"id": pool[0]["id"]}, ConsistentRead=True,
        ).get("Item")
        if not item:
            raise RuntimeError("Adventure was removed while loading")
        return self._campaign_from_item(item, conversation_id)

    def _campaign_from_item(self, item: dict, conversation_id: str) -> dict:
        campaign = {
            "id": self._s(item.get("id")),
            "owner": self._s(item.get("owner")),
            "conversation_id": conversation_id,
            "started": bool(item.get("started", {}).get("BOOL", False)),
            "currentLocation": self._s(item.get("currentLocation"), content.STARTING_LOCATION),
            "currentScene": self._s(item.get("currentScene"), ""),
            "activeObjectives": self._json(item.get("activeObjectives")),
            "visitedLocations": self._list(item.get("visitedLocations")) or [content.STARTING_LOCATION],
            "criticalChoices": self._list(item.get("criticalChoices")) or [],
            "currentAct": self._s(item.get("currentAct"), "EXPOSITION"),
            "currentChapter": self._num(item.get("currentChapter"), 1),
            "tensionLevel": self._num(item.get("tensionLevel"), 3),
            "timeline": self._list(item.get("timeline")) or [],
            "story": self._json(item.get("storyState")),
            "storyVersion": self._num(item.get("storyVersion"), 0),
        }
        # Nested pacing view (single source for the pacing engine).
        pacing = dict(campaign.get("pacing") or {})
        for key in ("currentAct", "currentChapter", "tensionLevel", "timeline"):
            if key not in pacing:
                pacing[key] = campaign[key]
        pacing.setdefault("turnsInChapter", 0)
        pacing.setdefault("turnsSinceBeat", 0)
        campaign["pacing"] = pacing
        return campaign

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
            "currentAct": "EXPOSITION",
            "currentChapter": 1,
            "tensionLevel": 3,
            "timeline": [],
        }

    def ensure_campaign(self, conversation_id: str, campaign: dict) -> dict:
        """Create the GameMasterAdventure row on first run and return its id."""
        if campaign.get("id"):
            return campaign
        adventure_id = f"gm:{conversation_id}"
        try:
            item = {
                "id": adventure_id,
                "conversationId": conversation_id,
                "owner": campaign.get("owner"),
                "started": False,
                "currentLocation": campaign.get("currentLocation", content.STARTING_LOCATION),
                "visitedLocations": campaign.get("visitedLocations") or [],
                "currentAct": campaign.get("currentAct") or "EXPOSITION",
                "currentChapter": int(campaign.get("currentChapter") or 1),
                "tensionLevel": int(campaign.get("tensionLevel") or 3),
                "timeline": campaign.get("timeline") or [],
                "createdAt": self._now(),
                "updatedAt": self._now(),
            }
            serializer = TypeSerializer()
            self.client.transact_write_items(TransactItems=[{"Put": {
                "TableName": self.adventure_table.name,
                "Item": {key: serializer.serialize(value) for key, value in item.items()},
                "ConditionExpression": "attribute_not_exists(id)",
            }}, {"ConditionCheck": {
                "TableName": _env("CONVERSATION_TABLE_NAME"),
                "Key": {"id": {"S": conversation_id}},
                "ConditionExpression": "attribute_exists(id)",
            }}])
        except ClientError as error:
            reasons = error.response.get("CancellationReasons", [])
            if (error.response["Error"]["Code"] != "TransactionCanceledException"
                    or not reasons or reasons[0].get("Code") != "ConditionalCheckFailed"
                    or not self.conversation_exists(conversation_id)):
                raise
            return self.load_campaign(conversation_id)
        campaign["id"] = adventure_id
        return campaign

    def commit_turn(self, state: dict, campaign: dict, player: dict) -> None:
        """Atomically commit stage, rules, dice and replay receipt.

        Version conflicts fail the turn. The Conversation existence check fences
        deletion, including an in-flight final answer.
        """
        previous_version = int(state["before_campaign"].get("storyVersion", 0))
        campaign["storyVersion"] = previous_version + 1
        pacing = campaign.get("pacing") or {}
        fields = {
            "started": bool(campaign.get("started")), "currentLocation": campaign["currentLocation"],
            "currentScene": campaign.get("currentScene", ""),
            "activeObjectives": json.dumps(campaign.get("activeObjectives")),
            "visitedLocations": json.dumps(campaign.get("visitedLocations", [])),
            "criticalChoices": json.dumps(campaign.get("criticalChoices", [])),
            "currentAct": pacing.get("currentAct", "EXPOSITION"),
            "currentChapter": int(pacing.get("currentChapter", 1)),
            "tensionLevel": int(pacing.get("tensionLevel", 3)),
            "timeline": json.dumps(pacing.get("timeline", [])),
            "storyState": json.dumps(campaign["story"]),
            "storyVersion": campaign["storyVersion"], "updatedAt": self._now(),
        }
        update = self._transaction_update(self.adventure_table.name, campaign["id"], fields)
        update["ConditionExpression"] = "attribute_exists(id) AND (attribute_not_exists(storyVersion) OR storyVersion = :expected)"
        update["ExpressionAttributeValues"][":expected"] = {"N": str(previous_version)}
        writes = [{"Update": update}, {"ConditionCheck": {
            "TableName": _env("CONVERSATION_TABLE_NAME"),
            "Key": {"id": {"S": state["conversation_id"]}},
            "ConditionExpression": "attribute_exists(id)",
        }}]
        if state.get("message_id"):
            # The bounded replay cache can expire; this durable internal marker
            # still prevents an old transport retry from applying rules twice.
            writes.append({"Update": {
                "TableName": _env("MESSAGE_TABLE_NAME"),
                "Key": {"id": {"S": state["message_id"]}},
                "UpdateExpression": "SET gmProcessed = :yes",
                "ConditionExpression": "attribute_exists(id) AND conversationId = :cid AND attribute_not_exists(gmProcessed)",
                "ExpressionAttributeValues": {":yes": {"BOOL": True}, ":cid": {"S": state["conversation_id"]}},
            }})
        if player.get("id") and player != state["before_player"]:
            inventory = [dict(item) for item in player.get("inventory", [])]
            if player.get("gold", 0):
                inventory.append({"id": "gold", "name": "Gold", "type": "currency", "quantity": player["gold"]})
            player_fields = {
                "level": player["level"], "experience": player["xp"],
                "currentHP": player["current_hp"], "maxHP": player["max_hp"],
                "armorClass": player["ac"], "inventory": json.dumps(inventory),
            }
            player_update = self._transaction_update(self.character_table.name, player["id"], player_fields)
            player_update["ConditionExpression"] = "attribute_exists(id)"
            writes.append({"Update": player_update})
        pending, result = state.get("dice_pending"), state.get("dice_result")
        if pending or result:
            row = self.load_player_state(state["conversation_id"])
            fields = {"campaignId": state["conversation_id"], "characterId": player.get("id", ""),
                      "owner": player.get("owner") or state.get("owner", ""),
                      "version": int((row or {}).get("version", 0)) + 1,
                      "updatedAt": self._now()}
            if not row:
                fields["createdAt"] = self._now()
            if pending:
                fields["pendingDiceRoll"] = json.dumps(pending)
            else:
                fields["pendingDiceRoll"] = None
                fields["diceRollLog"] = json.dumps((list((row or {}).get("diceRollLog") or []) + [result])[-20:])
            update = self._transaction_update(self.player_state_table.name, (row or {}).get("id") or state["conversation_id"], fields)
            writes.append({"Update": update})
        self.client.transact_write_items(TransactItems=writes)

    def save_memory_status(self, campaign: dict) -> None:
        # A concurrent next turn can retry the same idempotent memory write.
        try:
            self.adventure_table.update_item(
                Key={"id": campaign["id"]},
                UpdateExpression="SET storyState = :story",
                ConditionExpression="attribute_exists(id) AND storyVersion = :version",
                ExpressionAttributeValues={":story": json.dumps(campaign["story"]),
                                           ":version": campaign["storyVersion"]},
            )
        except ClientError as error:
            if error.response["Error"]["Code"] != "ConditionalCheckFailedException":
                logger.warning("Could not checkpoint character memory sync", exc_info=True)

    def conversation_exists(self, conversation_id: str) -> bool:
        return bool(self.client.get_item(
            TableName=_env("CONVERSATION_TABLE_NAME"),
            Key={"id": {"S": conversation_id}}, ConsistentRead=True,
        ).get("Item"))

    def delete_adventure(self, conversation_id: str) -> None:
        """Delete adventure-owned story/profile copies after Conversation removal.

        Errors propagate so the stream retries. Stable keys cover new rows even
        before their indexes become visible; indexed legacy/history cleanup is
        paginated and never scans another adventure.
        """
        for table, key in ((self.adventure_table, f"gm:{conversation_id}"),
                           (self.player_state_table, conversation_id)):
            table.delete_item(Key={"id": key})
        related = [
            (self.adventure_table, "conversationId"),
            (self.character_table, "conversationId"),
            (self.player_state_table, "campaignId"),
            (self.resource.Table(_env("MESSAGE_TABLE_NAME")), "conversationId"),
            (self.resource.Table(_env("RESPONSE_TABLE_NAME")), "conversationId"),
        ]
        for table, field in related:
            index = self._campaign_index(table) if field == "campaignId" else self._conversation_index(table)
            cursor = None
            while True:
                response = self.client.query(
                    TableName=table.name, IndexName=index,
                    KeyConditionExpression=f"{field} = :c",
                    ExpressionAttributeValues={":c": {"S": conversation_id}},
                    ProjectionExpression="id",
                    **({"ExclusiveStartKey": cursor} if cursor else {}),
                )
                for item in response.get("Items", []):
                    self.client.delete_item(TableName=table.name, Key={"id": item["id"]})
                cursor = response.get("LastEvaluatedKey")
                if not cursor:
                    break

    @staticmethod
    def _transaction_update(table: str, key: str, fields: dict) -> dict:
        serializer = TypeSerializer()
        return {
            "TableName": table, "Key": {"id": {"S": key}},
            "UpdateExpression": "SET " + ", ".join(f"#f{i} = :v{i}" for i in range(len(fields))),
            "ExpressionAttributeNames": {f"#f{i}": key for i, key in enumerate(fields)},
            "ExpressionAttributeValues": {f":v{i}": serializer.serialize(value) for i, value in enumerate(fields.values())},
        }

    def save_campaign(self, campaign: dict) -> None:
        if not campaign.get("id"):
            raise ValueError("Cannot persist an uncreated campaign row")
        pacing = dict(campaign.get("pacing") or {})
        self.adventure_table.update_item(
            Key={"id": campaign.get("id")},
            UpdateExpression=(
                "SET started=:st, currentLocation=:loc, currentScene=:scene, "
                "activeObjectives=:obj, visitedLocations=:visited, "
                "criticalChoices=:choices, currentAct=:act, currentChapter=:ch, "
                "tensionLevel=:tension, timeline=:timeline, updatedAt=:updated"
            ),
            ExpressionAttributeValues={
                ":st": bool(campaign.get("started", False)),
                ":loc": campaign.get("currentLocation", content.STARTING_LOCATION),
                ":scene": campaign.get("currentScene", ""),
                ":obj": campaign.get("activeObjectives"),
                ":visited": campaign.get("visitedLocations", []),
                ":choices": campaign.get("criticalChoices", []),
                ":act": pacing.get("currentAct") or campaign.get("currentAct") or "EXPOSITION",
                ":ch": int(pacing.get("currentChapter") or campaign.get("currentChapter") or 1),
                ":tension": int(pacing.get("tensionLevel") or campaign.get("tensionLevel") or 3),
                ":timeline": pacing.get("timeline") or campaign.get("timeline") or [],
                ":updated": self._now(),
            },
        )

    def ensure_quest_row(self, conversation_id: str, character_id: str,
                        quest: dict) -> str:
        """Create (or return) an ActiveQuest row. Uses a stable id per quest."""
        quest_id = f"{conversation_id}:{quest['id']}"
        self.active_quest_table.put_item(
            Item={
                "id": quest_id,
                "playerStateId": character_id,
                "questDefinitionId": quest["id"],
                "campaignId": content.GREENFIELD_CAMPAIGN_ID,
                "status": "ACTIVE",
                "currentStepIndex": 0,
                "totalSteps": len(quest.get("steps", [])),
                "startedAt": self._now(),
                "owner": character_id,
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

    # -- player state (dice) ----------------------------------------------

    def load_player_state(self, conversation_id: str) -> Optional[dict]:
        """Load the PlayerState row for a conversation via the campaignId GSI.

        The frontend writes PlayerState with `campaignId == conversationId`,
        so the GSI lookup mirrors exactly what the AppSync subscription filters.
        """
        if not self.player_state_table.name:
            return None
        # Read the new stable key first; legacy rows are located through the GSI.
        item = self.client.get_item(
            TableName=self.player_state_table.name,
            Key={"id": {"S": conversation_id}}, ConsistentRead=True,
        ).get("Item")
        if not item:
            index = self._campaign_index(self.player_state_table)
            resp = self.client.query(
                TableName=self.player_state_table.name,
                IndexName=index,
                KeyConditionExpression="campaignId = :c",
                ExpressionAttributeValues={":c": {"S": conversation_id}},
                Limit=1,
            )
            items = resp.get("Items", [])
            if not items:
                return None
            item = self.client.get_item(
                TableName=self.player_state_table.name, Key={"id": items[0]["id"]}, ConsistentRead=True,
            ).get("Item")
        if not item:
            return None
        return {
            "id": self._s(item.get("id")),
            "campaignId": self._s(item.get("campaignId")),
            "version": self._num(item.get("version"), 1),
            "pendingDiceRoll": self._json(item.get("pendingDiceRoll")),
            "diceRollLog": self._list(item.get("diceRollLog")) or [],
        }

    def write_pending_dice_roll(self, conversation_id: str, request: dict,
                                character_id: str = "") -> None:
        """Upsert a pending dice roll onto the PlayerState row.

        Idempotent: the same requestId can be written repeatedly without
        creating a second row (keyed on the resolved row's id, else campaignId).
        """
        if not self.player_state_table.name or not request:
            return
        existing = self.load_player_state(conversation_id)
        key = {"id": existing["id"]} if existing and existing.get("id") else {
            "id": conversation_id
        }
        self.player_state_table.update_item(
            Key=key,
            UpdateExpression=(
                "SET pendingDiceRoll=:roll, campaignId=:cid, "
                "characterId=:char, #v=:ver"
            ),
            ExpressionAttributeNames={"#v": "version"},
            ExpressionAttributeValues={
                ":roll": request,
                ":cid": conversation_id,
                ":char": character_id or "",
                ":ver": int(existing["version"] + 1) if existing else 1,
            },
        )

    def append_dice_roll_log(self, conversation_id: str, entry: dict,
                             clear_pending: bool = True) -> None:
        """Append a dice-roll log entry to PlayerState (keep last 20).

        With `clear_pending=True` (default) the pending dice roll is cleared,
        which is what the frontend echoes back to stop the dice animation.
        """
        if not self.player_state_table.name or not entry:
            return
        existing = self.load_player_state(conversation_id)
        if not existing or not existing.get("id"):
            return
        log = list(existing.get("diceRollLog") or [])
        log.append(entry)
        if len(log) > 20:
            log = log[-20:]
        update_expr = "SET diceRollLog=:log, #v=:ver"
        attr_names = {"#v": "version"}
        attr_values = {":log": log, ":ver": int(existing["version"] + 1)}
        if clear_pending:
            update_expr += ", pendingDiceRoll=:none"
            attr_values[":none"] = None
        self.player_state_table.update_item(
            Key={"id": existing["id"]},
            UpdateExpression=update_expr,
            ExpressionAttributeNames=attr_names,
            ExpressionAttributeValues=attr_values,
        )

    @staticmethod
    def _now() -> str:
        from datetime import datetime, timezone
        # AppSync stores updatedAt as "YYYY-MM-DDTHH:MM:SS.fffZ". Match that
        # format (Z suffix) so lexicographic sort against AppSync rows works.
        return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%fZ")

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
            if any(key in value for key in ("M", "L", "NULL", "BOOL", "N")):
                return TypeDeserializer().deserialize(value)
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
        return OrchestrationStore._json(value, default)
