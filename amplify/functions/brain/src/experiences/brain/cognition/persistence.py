"""Owner-fenced, optimistic persistence on the existing Conversation record.

No new table or expanded IAM permission is required. Caller authentication stays
the responsibility of the transport; an owner string alone is not authentication.
"""
from __future__ import annotations

import copy
import hashlib
import json
import os
import uuid
from dataclasses import dataclass

from .state import normalize_persona, MAX_RECEIPTS


class BrainStateConflict(RuntimeError):
    pass


class BrainStateAccessError(RuntimeError):
    pass


def input_hash(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def owner_matches(stored: str, supplied: str) -> bool:
    return bool(isinstance(stored, str) and isinstance(supplied, str) and stored.split("::", 1)[0]
                and stored.split("::", 1)[0] == supplied.split("::", 1)[0])


@dataclass
class Snapshot:
    persona: dict
    receipts: list
    revision: str | None = None
    owner: str = ""
    mode: str = "brain"


def cached_reply(snapshot: Snapshot, message_id: str | None, user_input: str) -> dict | None:
    if not message_id:
        return None
    for receipt in snapshot.receipts:
        if receipt.get("message_id") == message_id:
            if receipt.get("input_hash") != input_hash(user_input):
                raise BrainStateConflict("Message identifier was reused with different input")
            result = receipt.get("result")
            if isinstance(result, dict) and isinstance(result.get("reply"), dict):
                return copy.deepcopy(result)
    return None


class BrainStateStore:
    def __init__(self, resource=None, *, conversation_table: str | None = None, message_table: str | None = None):
        self.resource = resource
        self.conversation_table = conversation_table if conversation_table is not None else os.getenv("CONVERSATION_TABLE_NAME", "")
        self.message_table = message_table if message_table is not None else os.getenv("MESSAGE_TABLE_NAME", "")

    def _conversation(self):
        if not self.resource or not self.conversation_table or not self.message_table:
            raise RuntimeError("Brain state persistence is not configured")
        return self.resource.Table(self.conversation_table)

    def load(self, ctx) -> Snapshot:
        table = self._conversation()
        if not isinstance(ctx.owner, str) or not ctx.owner or not isinstance(ctx.message_id, str) or not ctx.message_id:
            raise BrainStateAccessError("An owned, persisted message is required")
        row = table.get_item(Key={"id": ctx.conversation_id}, ConsistentRead=True).get("Item", {})
        owner = row.get("owner", "")
        if not isinstance(owner, str) or not owner_matches(owner, ctx.owner):
            raise BrainStateAccessError("Conversation ownership does not match")
        mode = row.get("experience") or row.get("personalityMode") or "brain"
        if row.get("experience", "brain") not in (None, "brain", "default") or row.get("personalityMode", "brain") not in (None, "brain", "default"):
            raise BrainStateAccessError("Brain state cannot be used by another experience")
        message = self.resource.Table(self.message_table).get_item(Key={"id": ctx.message_id}, ConsistentRead=True).get("Item", {})
        if message.get("conversationId") != ctx.conversation_id or not owner_matches(str(message.get("owner", "")), ctx.owner) or message.get("content") != ctx.user_input:
            raise BrainStateAccessError("Message ownership, conversation or content does not match")
        raw = row.get("brainState")
        if isinstance(raw, str):
            raw = json.loads(raw)
        if raw is not None and not isinstance(raw, dict):
            raise BrainStateConflict("Invalid saved Brain state")
        raw = raw if isinstance(raw, dict) else {}
        if raw.get("schema_version", 1) != 1 or (isinstance(raw.get("persona"), dict) and raw["persona"].get("schema_version", 1) != 1):
            raise BrainStateConflict("Unsupported Brain state schema")
        receipts = raw.get("receipts", [])
        receipts = [r for r in receipts[-MAX_RECEIPTS:] if isinstance(r, dict)] if isinstance(receipts, list) else []
        revision = row.get("brainStateVersion")
        if revision is not None and not isinstance(revision, str):
            raise BrainStateConflict("Invalid saved Brain revision")
        return Snapshot(normalize_persona(raw.get("persona")), receipts, revision, owner, mode)

    def commit(self, ctx, previous: Snapshot, persona: dict, result: dict) -> None:
        receipts = previous.receipts + [{"message_id": ctx.message_id, "input_hash": input_hash(ctx.user_input), "result": result}]
        payload = {"schema_version": 1, "persona": persona, "receipts": receipts[-MAX_RECEIPTS:]}
        encoded = json.dumps(payload, ensure_ascii=False)
        while len(encoded.encode("utf-8")) > 250_000 and len(payload["receipts"]) > 1:
            payload["receipts"].pop(0)
            encoded = json.dumps(payload, ensure_ascii=False)
        if len(encoded.encode("utf-8")) > 250_000:
            raise ValueError("Brain state exceeded its storage budget")
        values = {":state": encoded, ":next": str(uuid.uuid4()), ":owner": previous.owner, ":brain": "brain", ":default": "default", ":null": "NULL"}
        condition = ("attribute_exists(#id) AND #owner = :owner "
                     "AND (attribute_not_exists(#experience) OR attribute_type(#experience, :null) OR #experience IN (:brain, :default)) "
                     "AND (attribute_not_exists(#mode) OR attribute_type(#mode, :null) OR #mode IN (:brain, :default)) AND ")
        if previous.revision is None:
            condition += "attribute_not_exists(#revision)"
        else:
            condition += "#revision = :expected"
            values[":expected"] = previous.revision
        try:
            self._conversation().update_item(
                Key={"id": ctx.conversation_id},
                UpdateExpression="SET #state = :state, #revision = :next",
                ConditionExpression=condition,
                ExpressionAttributeNames={"#id": "id", "#owner": "owner", "#experience": "experience", "#mode": "personalityMode", "#state": "brainState", "#revision": "brainStateVersion"},
                ExpressionAttributeValues=values,
            )
        except Exception as error:
            if getattr(error, "response", {}).get("Error", {}).get("Code") == "ConditionalCheckFailedException":
                raise BrainStateConflict("Conversation advanced or was cleared during this turn") from error
            raise
