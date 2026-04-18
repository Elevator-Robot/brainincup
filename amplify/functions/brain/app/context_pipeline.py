"""
ContextEnrichmentPipeline — assembles the full EnrichedPromptContext dict
before every AgentCore invocation.

Loads PlayerState and WorldState from DynamoDB, evaluates the PacingEngine,
resolves the active scenario and eligible surprise events from the Content
Registry, and assembles the structured [GAME_CONTEXT] block.
"""

from __future__ import annotations

import json
import logging
import os
from typing import Optional

from pacing_engine import PacingMetrics, PacingSignal, evaluate_pacing
from content_registry_cache import get_cached_registry, load_campaign_registry

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Signal → human-readable instruction mapping
# ---------------------------------------------------------------------------

_SIGNAL_INSTRUCTIONS: dict[str, str] = {
    PacingSignal.REWARD_NUDGE.value: (
        "Within the next 2 turns, introduce a minor reward opportunity such as "
        "a discovery, NPC gift, or environmental find."
    ),
    PacingSignal.QUEST_NUDGE.value: (
        "Provide a narrative nudge that steers the player toward their current "
        "quest objective."
    ),
    PacingSignal.SURPRISE_EVENT_INJECT.value: (
        "Inject a surprise event from the eligible surprises list."
    ),
    PacingSignal.RESOLUTION_BEAT.value: (
        "Introduce a resolution beat (victory, escape, or revelation) to prevent "
        "tension fatigue."
    ),
    PacingSignal.COMPLICATION_INJECT.value: (
        "Introduce a complication or discovery to re-engage the player."
    ),
    PacingSignal.DIFFICULTY_INCREASE.value: (
        "Increase encounter difficulty for the next 5 scenarios."
    ),
    PacingSignal.DIFFICULTY_DECREASE.value: (
        "Decrease encounter difficulty for the next 5 scenarios."
    ),
    PacingSignal.CHAPTER_ADVANCE.value: (
        "Advance to the next chapter."
    ),
}


# ---------------------------------------------------------------------------
# Internal DynamoDB helpers
# ---------------------------------------------------------------------------

def _get_dynamodb_client(dynamodb_client=None):
    if dynamodb_client is not None:
        return dynamodb_client
    import boto3
    return boto3.client("dynamodb")


def _unmarshal(item: dict) -> dict:
    try:
        from boto3.dynamodb.types import TypeDeserializer
        d = TypeDeserializer()
        return {k: d.deserialize(v) for k, v in item.items()}
    except ImportError:
        return item


def _query_gsi(
    dynamodb_client,
    table_name: str,
    index_name: str,
    key_name: str,
    key_value: str,
) -> list[dict]:
    """Query a GSI and return all unmarshalled items."""
    items: list[dict] = []
    kwargs: dict = {
        "TableName": table_name,
        "IndexName": index_name,
        "KeyConditionExpression": f"{key_name} = :val",
        "ExpressionAttributeValues": {":val": {"S": key_value}},
    }
    while True:
        response = dynamodb_client.query(**kwargs)
        for raw in response.get("Items", []):
            items.append(_unmarshal(raw))
        last = response.get("LastEvaluatedKey")
        if not last:
            break
        kwargs["ExclusiveStartKey"] = last
    return items


# ---------------------------------------------------------------------------
# ContextEnrichmentPipeline
# ---------------------------------------------------------------------------

class ContextEnrichmentPipeline:
    """
    Assembles the full EnrichedPromptContext dict before every AgentCore
    invocation. DynamoDB and AppSync clients are injectable for testing.
    """

    def __init__(self, dynamodb_client=None, appsync_client=None):
        self._dynamodb = dynamodb_client
        self._appsync = appsync_client

    # ------------------------------------------------------------------
    # load_player_state
    # ------------------------------------------------------------------

    def load_player_state(self, conversation_id: str) -> dict:
        """
        Load PlayerState from DynamoDB by conversationId GSI.
        Returns the first matching item as a plain dict, or safe defaults.
        """
        client = _get_dynamodb_client(self._dynamodb)
        table = os.environ.get("PLAYER_STATE_TABLE", "PlayerState")
        try:
            items = _query_gsi(
                client, table, "conversationId-index",
                "conversationId", conversation_id,
            )
            if items:
                item = items[0]
                # Deserialise JSON fields stored as strings
                for field in ("activeQuestIds", "completedQuestIds", "failedQuestIds",
                              "diceRollLog", "pacingMetrics", "uiHints", "pendingDiceRoll"):
                    if field in item and isinstance(item[field], str):
                        try:
                            item[field] = json.loads(item[field])
                        except (json.JSONDecodeError, TypeError):
                            pass
                return item
        except Exception as exc:
            logger.warning("load_player_state failed for %s: %s", conversation_id, exc)

        # Safe defaults
        return {
            "currentLevel": 1,
            "currentXP": 0,
            "xpToNextLevel": 100,
            "currentAreaId": "starting_area",
            "lastKnownLocation": "The Shrouded Vale",
            "currentActId": "",
            "currentChapterId": "",
            "currentSceneId": "",
            "currentHP": 20,
            "maxHP": 20,
            "activeQuestIds": [],
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

    # ------------------------------------------------------------------
    # load_world_state
    # ------------------------------------------------------------------

    def load_world_state(self, campaign_id: str, owner: str) -> dict:
        """
        Load WorldState from DynamoDB by campaignId GSI.
        Returns the first matching item (filtered by owner), or defaults.
        """
        client = _get_dynamodb_client(self._dynamodb)
        table = os.environ.get("WORLD_STATE_TABLE", "WorldState")
        try:
            items = _query_gsi(
                client, table, "campaignId-index",
                "campaignId", campaign_id,
            )
            # Filter to the requesting owner when multiple records exist
            for item in items:
                if not owner or item.get("owner") == owner:
                    if "flags" in item and isinstance(item["flags"], str):
                        try:
                            item["flags"] = json.loads(item["flags"])
                        except (json.JSONDecodeError, TypeError):
                            item["flags"] = {}
                    return item
            if items:
                item = items[0]
                if "flags" in item and isinstance(item["flags"], str):
                    try:
                        item["flags"] = json.loads(item["flags"])
                    except (json.JSONDecodeError, TypeError):
                        item["flags"] = {}
                return item
        except Exception as exc:
            logger.warning(
                "load_world_state failed for campaign=%s owner=%s: %s",
                campaign_id, owner, exc,
            )

        return {"campaignId": campaign_id, "flags": {}, "version": 1}

    # ------------------------------------------------------------------
    # evaluate_pacing_engine
    # ------------------------------------------------------------------

    def evaluate_pacing_engine(self, pacing_metrics: dict) -> list:
        """
        Convert a pacing_metrics dict to a PacingMetrics dataclass and call
        evaluate_pacing. Returns a list of PacingSignal values.
        """
        metrics = PacingMetrics(
            turns_since_last_xp_award=pacing_metrics.get("turnsSinceLastXPAward", 0),
            turns_since_last_level_up=pacing_metrics.get("turnsSinceLastLevelUp", 0),
            turns_since_last_quest_step=pacing_metrics.get("turnsSinceLastQuestStepCompletion", 0),
            turns_since_last_surprise_event=pacing_metrics.get("turnsSinceLastSurpriseEvent", 0),
            current_tension_level=pacing_metrics.get("currentTensionLevel", 5),
            consecutive_turns_at_high_tension=pacing_metrics.get("consecutiveTurnsAtHighTension", 0),
            consecutive_turns_at_low_tension=pacing_metrics.get("consecutiveTurnsAtLowTension", 0),
            current_act=pacing_metrics.get("currentAct", ""),
            stat_check_history=pacing_metrics.get("statCheckHistory", []),
            difficulty_modifier=pacing_metrics.get("difficultyModifier", 0.0),
            difficulty_modifier_turns_remaining=pacing_metrics.get(
                "difficultyModifierTurnsRemaining", 0
            ),
            last_surprise_event_ids=pacing_metrics.get("lastSurpriseEventIds", {}),
            total_turns=pacing_metrics.get("totalTurns", 0),
            all_chapter_scenarios_over_leveled=pacing_metrics.get(
                "allChapterScenariosOverLeveled", False
            ),
        )
        return evaluate_pacing(metrics)

    # ------------------------------------------------------------------
    # resolve_active_scenario
    # ------------------------------------------------------------------

    def resolve_active_scenario(
        self,
        player_state: dict,
        world_state: dict,
        registry: dict,
    ) -> Optional[dict]:
        """
        Select the best matching scenario from registry["SCENARIO"] based on
        player level and world flags. Returns the scenario body dict or None.
        """
        scenarios = registry.get("SCENARIO", [])
        if not scenarios:
            return None

        player_level = player_state.get("currentLevel", 1)
        world_flags = world_state.get("flags", {})

        eligible = []
        for doc in scenarios:
            body = doc.get("body") or doc
            required_flags = body.get("requiredWorldFlags", [])
            # All required flags must be truthy in world_state
            if not all(world_flags.get(f) for f in required_flags):
                continue
            rec_min = body.get("recommendedLevelMin", 1)
            rec_max = body.get("recommendedLevelMax", 99)
            if rec_min <= player_level <= rec_max:
                eligible.append(body)

        if not eligible:
            # Fall back to any scenario whose max level >= player level
            for doc in scenarios:
                body = doc.get("body") or doc
                if body.get("recommendedLevelMax", 99) >= player_level:
                    eligible.append(body)

        if not eligible:
            return None

        # Prefer scenarios closest to the player's level
        eligible.sort(
            key=lambda s: abs(
                player_level - (s.get("recommendedLevelMin", 1) + s.get("recommendedLevelMax", 1)) / 2
            )
        )
        return eligible[0]

    # ------------------------------------------------------------------
    # resolve_eligible_surprises
    # ------------------------------------------------------------------

    def resolve_eligible_surprises(
        self,
        player_state: dict,
        world_state: dict,
        registry: dict,
        signals: list,
    ) -> list:
        """
        Return surprise events from registry["SURPRISE_EVENT"] whose trigger
        conditions match the current state.
        """
        surprise_docs = registry.get("SURPRISE_EVENT", [])
        if not surprise_docs:
            return []

        world_flags = world_state.get("flags", {})
        pacing_metrics = player_state.get("pacingMetrics") or {}
        current_act = pacing_metrics.get("currentAct", "")
        tension = pacing_metrics.get("currentTensionLevel", 5)
        total_turns = pacing_metrics.get("totalTurns", 0)
        last_event_ids: dict = pacing_metrics.get("lastSurpriseEventIds", {})

        eligible = []
        for doc in surprise_docs:
            body = doc.get("body") or doc
            conditions = body.get("triggerConditions", {})

            # Act filter
            allowed_acts = conditions.get("acts", [])
            if allowed_acts and current_act and current_act not in allowed_acts:
                continue

            # Tension range filter
            tension_range = conditions.get("tensionRange", [1, 10])
            if len(tension_range) == 2:
                if not (tension_range[0] <= tension <= tension_range[1]):
                    continue

            # Required world flags
            required_flags = conditions.get("requiredWorldFlags", [])
            if not all(world_flags.get(f) for f in required_flags):
                continue

            # Forbidden world flags
            forbidden_flags = conditions.get("forbiddenWorldFlags", [])
            if any(world_flags.get(f) for f in forbidden_flags):
                continue

            # Cooldown check
            event_id = body.get("id", "")
            cooldown = body.get("cooldownTurns", 0)
            last_turn = last_event_ids.get(event_id, -9999)
            if total_turns - last_turn < cooldown:
                continue

            eligible.append(body)

        # Sort by priority descending
        eligible.sort(key=lambda e: e.get("priority", 0), reverse=True)
        return eligible

    # ------------------------------------------------------------------
    # assemble_game_context
    # ------------------------------------------------------------------

    def assemble_game_context(
        self,
        player_state: dict,
        world_state: dict,
        pacing_signals: list,
        active_scenario: Optional[dict],
        eligible_surprises: list,
        registry: dict,
        character: Optional[dict] = None,
    ) -> dict:
        """
        Assemble the full EnrichedPromptContext dict matching the design JSON
        structure. Returns a dict with all required top-level keys.
        """
        # --- character ---
        char_data: dict = {}
        if character:
            char_data = {
                "name": character.get("name", ""),
                "level": character.get("level", player_state.get("currentLevel", 1)),
                "currentHP": character.get("currentHP", player_state.get("currentHP", 20)),
                "maxHP": character.get("maxHP", player_state.get("maxHP", 20)),
                "xp": character.get("xp", player_state.get("currentXP", 0)),
                "xpToNextLevel": character.get(
                    "xpToNextLevel", player_state.get("xpToNextLevel", 100)
                ),
                "stats": character.get("stats", {}),
            }
        else:
            char_data = {
                "name": player_state.get("characterName", ""),
                "level": player_state.get("currentLevel", 1),
                "currentHP": player_state.get("currentHP", 20),
                "maxHP": player_state.get("maxHP", 20),
                "xp": player_state.get("currentXP", 0),
                "xpToNextLevel": player_state.get("xpToNextLevel", 100),
                "stats": player_state.get("stats", {}),
            }

        # --- location ---
        current_area_id = player_state.get("currentAreaId", "starting_area")
        area_docs = registry.get("AREA", [])
        current_area_doc = next(
            (
                (doc.get("body") or doc)
                for doc in area_docs
                if (doc.get("body") or doc).get("id") == current_area_id
            ),
            None,
        )
        display_name = (
            current_area_doc.get("displayName", current_area_id)
            if current_area_doc
            else player_state.get("lastKnownLocation", current_area_id)
        )
        connected_area_ids = (
            current_area_doc.get("connectedAreaIds", []) if current_area_doc else []
        )
        connected_areas = []
        for cid in connected_area_ids:
            connected_doc = next(
                (
                    (doc.get("body") or doc)
                    for doc in area_docs
                    if (doc.get("body") or doc).get("id") == cid
                ),
                None,
            )
            if connected_doc:
                min_level = connected_doc.get("minCharacterLevel", 1)
                player_level = player_state.get("currentLevel", 1)
                connected_areas.append({
                    "id": cid,
                    "displayName": connected_doc.get("displayName", cid),
                    "locked": player_level < min_level,
                    "requiredLevel": min_level,
                })
            else:
                connected_areas.append({"id": cid, "displayName": cid, "locked": False})

        location = {
            "currentAreaId": current_area_id,
            "displayName": display_name,
            "connectedAreas": connected_areas,
        }

        # --- campaign ---
        campaign = {
            "currentAct": player_state.get("currentActId", ""),
            "currentChapter": player_state.get("currentChapterId", ""),
            "currentScene": player_state.get("currentSceneId", ""),
        }

        # --- activeQuests ---
        active_quest_ids: list = player_state.get("activeQuestIds") or []
        quest_docs = registry.get("QUEST", [])
        active_quests = []
        for qid in active_quest_ids:
            quest_doc = next(
                (
                    (doc.get("body") or doc)
                    for doc in quest_docs
                    if (doc.get("body") or doc).get("id") == qid
                ),
                None,
            )
            if quest_doc:
                steps = quest_doc.get("steps", [])
                # currentStepIndex comes from ActiveQuest record; default to 0
                step_index = 0
                current_step_desc = (
                    steps[step_index].get("description", "") if steps else ""
                )
                active_quests.append({
                    "id": qid,
                    "title": quest_doc.get("title", qid),
                    "currentStep": current_step_desc,
                    "stepProgress": f"{step_index + 1} of {len(steps)}" if steps else "0 of 0",
                })
            else:
                active_quests.append({"id": qid, "title": qid, "currentStep": "", "stepProgress": ""})

        # --- worldStateFlags ---
        world_flags = world_state.get("flags", {})

        # --- pacingDirectives ---
        pacing_directives = []
        for signal in pacing_signals:
            signal_value = signal.value if hasattr(signal, "value") else str(signal)
            instruction = _SIGNAL_INSTRUCTIONS.get(signal_value, signal_value)
            pacing_directives.append({"signal": signal_value.upper(), "instruction": instruction})

        return {
            "character": char_data,
            "location": location,
            "campaign": campaign,
            "activeQuests": active_quests,
            "worldStateFlags": world_flags,
            "activeScenario": active_scenario,
            "pacingDirectives": pacing_directives,
            "pendingDiceRoll": player_state.get("pendingDiceRoll"),
            "levelGateBlocked": None,
        }
