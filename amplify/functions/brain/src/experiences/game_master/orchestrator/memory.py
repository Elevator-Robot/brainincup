"""AgentCore-backed memory for the Game Master orchestrator.

The orchestrator delegates memory to Amazon Bedrock AgentCore rather than
simplifying itself. It uses the **episodic** memory strategy: meaningful slices
of the conversation are captured, summarised into episode records, and reflected
on by AgentCore. The service here only:

  * decides the AgentCore namespace for a conversation/actor,
  * feeds each turn to AgentCore as short-term events (`CreateEvent`, from
    which the episodic strategy extracts and consolidates episodes), and
  * retrieves the most relevant episodes + reflections for the LLM prompt.

The service is a safe no-op whenever AgentCore is not configured (no memory
id / no episodic strategy id / a failure) so the game never breaks on memory.
"""

from __future__ import annotations

import logging
import re
from typing import Any, Optional

logger = logging.getLogger(__name__)


def sanitize_namespace(value: str) -> str:
    """Mirror of AgentCoreClient.sanitize_namespace for namespace building."""
    cleaned = re.sub(r"[^a-zA-Z0-9_-]", "-", value or "").strip("-")
    if not cleaned:
        return "default"
    return cleaned[:128]


class MemoryService:
    """Thin, duck-typed adapter over the AgentCore memory APIs.

    Accepts an injected`client` implementing the same surface as the
    `bedrock-agentcore` boto3 client: `create_event`, `retrieve_memory_records`,
    and `batch_create_memory_records`. Constructed fresh per turn with cached
    services so repeated turns share one boto3 client.
    """

    def __init__(
        self,
        *,
        memory_id: Optional[str],
        episodic_strategy_id: Optional[str],
        region_name: str = "us-east-1",
        client: Any = None,
    ) -> None:
        self.memory_id = (memory_id or "").strip()
        self.episodic_strategy_id = (episodic_strategy_id or "").strip()
        self.region_name = region_name or "us-east-1"
        self._client = client
        self.enabled = bool(self.memory_id and self.episodic_strategy_id)

    # -- construction ------------------------------------------------------

    @classmethod
    def from_env(cls, region_name: str = "us-east-1") -> "MemoryService":
        import os

        return cls(
            memory_id=os.getenv("AGENTCORE_MEMORY_ID", "").strip(),
            episodic_strategy_id=os.getenv(
                "AGENTCORE_MEMORY_EPISODIC_STRATEGY_ID", ""
            ).strip(),
            region_name=region_name,
        )

    def client(self) -> Any:
        if self._client is None:
            import boto3

            self._client = boto3.client("bedrock-agentcore", region_name=self.region_name)
        return self._client

    # -- namespaces ---------------------------------------------------------
    # Episodes are stored at the actor level; reflections at the strategy level
    # (see AgentCore episodic-memory-strategy docs).

    def episodic_actor(self, owner: Optional[str], conversation_id: str) -> str:
        actor = sanitize_namespace(owner or conversation_id)
        return actor

    def episodes_namespace(self, actor: str) -> str:
        strategy = sanitize_namespace(self.episodic_strategy_id or "episodic-default")
        return f"/strategy/{strategy}/actor/{actor}/"

    def reflections_namespace(self, actor: str) -> str:
        strategy = sanitize_namespace(self.episodic_strategy_id or "episodic-default")
        return f"/strategy/{strategy}/actor/{actor}/"

    # -- retrieval ----------------------------------------------------------

    def retrieve_episodic_context(
        self,
        *,
        actor: str,
        session_id: str,
        search_query: str,
        top_k: int = 5,
    ) -> str:
        """Retrieve relevant episodes + reflections and format for the prompt.

        Returns an empty string when AgentCore is unavailable so callers can
        inject memory context only when there is something to inject.
        """
        if not self.enabled or not search_query:
            return ""
        episodes: list[str] = []
        try:
            episodes.extend(
                self.client().retrieve_memory_records(
                    memoryId=self.memory_id,
                    namespace=self.episodes_namespace(actor),
                    searchCriteria={
                        "searchQuery": search_query,
                        "topK": max(1, min(top_k, 25)),
                        "memoryStrategyId": self.episodic_strategy_id,
                    },
                    maxResults=max(1, min(top_k, 25)),
                ).get("memoryRecordSummaries", [])
            )
        except Exception as exc:  # noqa: BLE001 - memory must never break the game
            logger.warning("AgentCore episodic retrieval failed: %s", exc)

        records = [
            s.get("content", {}).get("text", "")
            for s in episodes
            if isinstance(s, dict) and s.get("content", {}).get("text")
        ]
        seen: set[str] = set()
        unique: list[str] = []
        for record in records:
            normalized = record.strip()
            if normalized and normalized not in seen:
                seen.add(normalized)
                unique.append(normalized)

        if not unique:
            return ""
        lines = ["=== EPISODIC MEMORY ==="]
        lines.extend(f"- {record}" for record in unique)
        lines.append("========================")
        return "\n".join(lines)

    # -- recording ----------------------------------------------------------

    def record_turn(
        self,
        *,
        actor: str,
        session_id: str,
        user_input: str,
        assistant_text: str,
        metadata: Optional[dict[str, str]] = None,
    ) -> None:
        """Feed a turn to AgentCore so the episodic strategy can extract it.

        Creates USER and ASSISTANT short-term events (per session). Event roles
        must be one of ASSISTANT, USER, TOOL, OTHER. Failures are logged and
        swallowed.
        """
        if not self.enabled:
            return
        client = self.client()
        base = {
            "memoryId": self.memory_id,
            "actorId": actor,
            "sessionId": session_id,
            "eventTimestamp": _utcnow(),
        }
        if metadata:
            base["metadata"] = {
                key: {"stringValue": value}
                for key, value in metadata.items()
                if value is not None
            }
        try:
            user_payload = dict(base)
            user_payload["payload"] = [
                {
                    "conversational": {
                        "role": "USER",
                        "content": {"text": user_input or ""},
                    }
                }
            ]
            client.create_event(**user_payload)

            assistant_payload = dict(base)
            assistant_payload["payload"] = [
                {
                    "conversational": {
                        "role": "ASSISTANT",
                        "content": {"text": assistant_text or ""},
                    }
                }
            ]
            client.create_event(**assistant_payload)
        except Exception as exc:  # noqa: BLE001
            logger.warning("AgentCore episodic event creation failed: %s", exc)

    def save_long_term_record(
        self,
        *,
        request_identifier: str,
        namespaces: list[str],
        content_text: str,
    ) -> None:
        """Persist a structured record (e.g. character/world snapshot) as a
        long-term AgentCore memory record."""
        if not self.enabled or not request_identifier or not content_text or not namespaces:
            return
        try:
            self.client().batch_create_memory_records(
                memoryId=self.memory_id,
                records=[
                    {
                        "requestIdentifier": request_identifier,
                        "namespaces": namespaces,
                        "content": {"text": content_text},
                        "timestamp": _utcnow(),
                        "memoryStrategyId": self.episodic_strategy_id,
                    }
                ],
            )
        except Exception as exc:  # noqa: BLE001
            logger.warning("AgentCore long-term record save failed: %s", exc)


def _utcnow():
    from datetime import datetime, timezone

    return datetime.now(timezone.utc)