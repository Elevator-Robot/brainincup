"""
Brain Lambda — DynamoDB stream handler for the brain function.

Handles Message table stream events, runs the ContextEnrichmentPipeline,
invokes AgentCore, and writes the BrainResponse back via AppSync.
"""

from __future__ import annotations

import json
import logging
import os
import time
from typing import Any



import boto3

from context_pipeline import ContextEnrichmentPipeline
from content_registry_cache import get_cached_registry, load_campaign_registry

logger = logging.getLogger(__name__)
logger.setLevel(os.environ.get("LOG_LEVEL", "INFO"))

# ---------------------------------------------------------------------------
# Game_Master system prompt
# ---------------------------------------------------------------------------

GAME_MASTER_SYSTEM_PROMPT = """You are the Game Master for Brain in Cup, an immersive text-based RPG. \
Your role is to narrate the world, control NPCs, adjudicate rules, and guide the player through \
a rich, reactive story. Always respond in valid JSON with the following fields: \
sensations, thoughts, memories, self_reflection, response, xp_award, hp_change, \
quest_step_advance, quest_complete, quest_fail, world_flags_set, dice_roll_request, \
tension_level, area_transition, current_location, item_grant.

The "current_location" field MUST always be set to the name of the location where the scene \
is currently taking place (e.g. "The Shrouded Vale", "The Darkwood", "The Ruined Keep"). \
Never leave it null or empty. If the player has not moved, repeat the current location.

When a [GAME_CONTEXT] block is present in the user message, treat it as authoritative game state. \
Honor all [PACING_DIRECTIVES] while maintaining narrative coherence. Always include structured \
game event fields in your JSON response: xp_award, hp_change, quest_step_advance, quest_complete, \
quest_fail, world_flags_set, dice_roll_request, tension_level, area_transition, current_location, item_grant."""

# ---------------------------------------------------------------------------
# AgentCore invocation
# ---------------------------------------------------------------------------

def _get_agentcore_endpoint() -> str:
    return os.environ.get("AGENTCORE_ENDPOINT", "http://localhost:8080")


def invoke_agentcore(prompt: str, conversation_id: str) -> dict:
    """
    Invoke the AgentCore runtime with the enriched prompt.
    Returns the parsed JSON response dict.
    """
    import urllib.request

    endpoint = _get_agentcore_endpoint()
    payload = json.dumps({
        "prompt": prompt,
        "persona": {
            "name": "The Game Master",
            "mode": "game_master",
            "temperature": 1.0,
            "top_p": 1.0,
        },
        "context": conversation_id,
        "message": {"id": conversation_id, "owner": ""},
    }).encode("utf-8")

    req = urllib.request.Request(
        f"{endpoint}/invocations",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except Exception as exc:
        logger.error("AgentCore invocation failed: %s", exc)
        return {
            "response": "The Game Master is momentarily unavailable.",
            "sensations": [],
            "thoughts": [],
            "memories": "",
            "self_reflection": "",
        }


# ---------------------------------------------------------------------------
# AppSync write helpers
# ---------------------------------------------------------------------------

def _get_appsync_client():
    return boto3.client("appsync", region_name=os.environ.get("AWS_REGION", "us-east-1"))


def write_with_retry(write_fn, *args, max_retries=3, **kwargs):
    """Call write_fn with exponential backoff retry (1s, 2s, 4s)."""
    last_exc = None
    for attempt in range(max_retries):
        try:
            return write_fn(*args, **kwargs)
        except Exception as exc:
            last_exc = exc
            wait = 2 ** attempt  # 1, 2, 4
            logger.warning("Write attempt %d failed: %s. Retrying in %ds...", attempt + 1, exc, wait)
            time.sleep(wait)
    logger.error("Write failed after %d attempts: %s", max_retries, last_exc)
    return {"error": str(last_exc)}


def write_brain_response(
    conversation_id: str,
    message_id: str,
    agent_response: dict,
) -> None:
    """Write the BrainResponse record via AppSync GraphQL mutation."""
    appsync_url = os.environ.get("APPSYNC_ENDPOINT", "")
    if not appsync_url:
        logger.warning("APPSYNC_ENDPOINT not set — skipping BrainResponse write")
        return

    mutation = """
    mutation CreateBrainResponse($input: CreateBrainResponseInput!) {
      createBrainResponse(input: $input) { id conversationId }
    }
    """
    variables = {
        "input": {
            "conversationId": conversation_id,
            "messageId": message_id,
            "response": agent_response.get("response", ""),
            "sensations": json.dumps(agent_response.get("sensations", [])),
            "thoughts": json.dumps(agent_response.get("thoughts", [])),
            "memories": agent_response.get("memories", ""),
            "selfReflection": agent_response.get("self_reflection", ""),
        }
    }

    try:
        import urllib.request
        payload = json.dumps({"query": mutation, "variables": variables}).encode("utf-8")
        req = urllib.request.Request(
            appsync_url,
            data=payload,
            headers={"Content-Type": "application/json", "x-api-key": os.environ.get("APPSYNC_API_KEY", "")},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            result = json.loads(resp.read().decode("utf-8"))
            if "errors" in result:
                logger.error("AppSync mutation errors: %s", result["errors"])
    except Exception as exc:
        logger.error("write_brain_response failed: %s", exc)


def update_adventure_location(
    conversation_id: str,
    new_location: str,
) -> None:
    """
    Update GameMasterAdventure.currentLocation and lastLocation via AppSync.
    Called after each GM response when a location is present in the response.
    """
    appsync_url = os.environ.get("APPSYNC_ENDPOINT", "")
    if not appsync_url or not new_location:
        return

    # First fetch the adventure id for this conversation
    query = """
    query GetAdventureByConversation($conversationId: ID!) {
      listGameMasterAdventures(filter: { conversationId: { eq: $conversationId } }, limit: 1) {
        items { id }
      }
    }
    """
    mutation = """
    mutation UpdateAdventureLocation($input: UpdateGameMasterAdventureInput!) {
      updateGameMasterAdventure(input: $input) { id currentLocation lastLocation }
    }
    """

    try:
        import urllib.request
        headers = {
            "Content-Type": "application/json",
            "x-api-key": os.environ.get("APPSYNC_API_KEY", ""),
        }

        # Fetch adventure id
        payload = json.dumps({"query": query, "variables": {"conversationId": conversation_id}}).encode("utf-8")
        req = urllib.request.Request(appsync_url, data=payload, headers=headers, method="POST")
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        items = (data.get("data") or {}).get("listGameMasterAdventures", {}).get("items", [])
        if not items:
            logger.warning("update_adventure_location: no adventure found for conversation=%s", conversation_id)
            return
        adventure_id = items[0]["id"]

        # Update location
        payload = json.dumps({
            "query": mutation,
            "variables": {"input": {"id": adventure_id, "currentLocation": new_location, "lastLocation": new_location}},
        }).encode("utf-8")
        req = urllib.request.Request(appsync_url, data=payload, headers=headers, method="POST")
        with urllib.request.urlopen(req, timeout=10) as resp:
            result = json.loads(resp.read().decode("utf-8"))
            if "errors" in result:
                logger.error("update_adventure_location mutation errors: %s", result["errors"])
            else:
                logger.info("Updated adventure location to '%s' for conversation=%s", new_location, conversation_id)
    except Exception as exc:
        logger.error("update_adventure_location failed: %s", exc)


# ---------------------------------------------------------------------------
# DynamoDB stream handler
# ---------------------------------------------------------------------------

def handle_message_stream_event(record: dict) -> None:
    """
    Process a single DynamoDB stream record from the Message table.

    Flow:
      1. Extract conversation_id and message_id from the new image
      2. Instantiate ContextEnrichmentPipeline
      3. Load PlayerState and WorldState
      4. Load / refresh ContentRegistry cache
      5. Evaluate PacingEngine
      6. Resolve active scenario and eligible surprises
      7. Assemble enriched game context
      8. Append [GAME_CONTEXT] block to the prompt
      9. Invoke AgentCore
      10. Write BrainResponse
    """
    new_image = record.get("dynamodb", {}).get("NewImage", {})
    if not new_image:
        logger.warning("Stream record has no NewImage — skipping")
        return

    conversation_id = new_image.get("conversationId", {}).get("S", "")
    message_id = new_image.get("id", {}).get("S", "")
    message_content = new_image.get("content", {}).get("S", "")

    if not conversation_id:
        logger.warning("No conversationId in stream record — skipping")
        return

    logger.info("Handling message stream event: conversation=%s message=%s", conversation_id, message_id)

    pipeline = ContextEnrichmentPipeline()

    # 1. Load state
    player_state = pipeline.load_player_state(conversation_id)

    # Check for expired dice roll and clear it before processing
    from state_sync import PlayerState as PS, check_expired_dice_roll, sync_location_from_quest
    _ps_obj = PS(
        current_level=player_state.get("currentLevel", 1),
        current_xp=player_state.get("currentXP", 0),
        xp_to_next_level=player_state.get("xpToNextLevel", 100),
        current_area_id=player_state.get("currentAreaId", "area_shrouded_vale"),
        last_known_location=player_state.get("lastKnownLocation", ""),
        current_act_id=player_state.get("currentActId", ""),
        current_chapter_id=player_state.get("currentChapterId", ""),
        current_scene_id=player_state.get("currentSceneId", ""),
        current_hp=player_state.get("currentHP", 20),
        max_hp=player_state.get("maxHP", 20),
        version=player_state.get("version", 1),
        pending_dice_roll=player_state.get("pendingDiceRoll"),
        active_quest_ids=player_state.get("activeQuestIds", []),
    )
    if check_expired_dice_roll(_ps_obj):
        player_state["pendingDiceRoll"] = None
        logger.info("Cleared expired dice roll for conversation=%s", conversation_id)
    campaign_id = player_state.get("campaignId", "")
    owner = player_state.get("owner", "")
    world_state = pipeline.load_world_state(campaign_id, owner)

    # 2. Load content registry (warm cache or cold fetch)
    registry = get_cached_registry(campaign_id)
    if not registry and campaign_id:
        try:
            registry = load_campaign_registry(campaign_id)
        except Exception as exc:
            logger.warning("ContentRegistry load failed for %s: %s", campaign_id, exc)
            registry = {}
    
    # 2b. Sync location from active quest (single source of truth)
    quest_registry = registry.get("QUEST", [])
    area_registry = registry.get("AREA", [])
    sync_location_from_quest(_ps_obj, quest_registry, area_registry)
    # Write back synced location to player_state dict
    player_state["currentAreaId"] = _ps_obj.current_area_id
    player_state["lastKnownLocation"] = _ps_obj.last_known_location

    # 3. Evaluate pacing engine
    pacing_metrics = player_state.get("pacingMetrics") or {}
    pacing_signals = pipeline.evaluate_pacing_engine(pacing_metrics)

    # 4. Resolve active content
    active_scenario = pipeline.resolve_active_scenario(player_state, world_state, registry)
    eligible_surprises = pipeline.resolve_eligible_surprises(
        player_state, world_state, registry, pacing_signals
    )

    # 5. Assemble enriched game context
    game_context = pipeline.assemble_game_context(
        player_state=player_state,
        world_state=world_state,
        pacing_signals=pacing_signals,
        active_scenario=active_scenario,
        eligible_surprises=eligible_surprises,
        registry=registry,
    )

    # 6. Build full prompt with [GAME_CONTEXT] block appended
    game_context_block = (
        "\n\n[GAME_CONTEXT]\n"
        + json.dumps({"gameContext": game_context}, indent=2)
        + "\n[/GAME_CONTEXT]"
    )
    prompt = (message_content or "") + game_context_block

    # 7. Invoke AgentCore
    agent_response = invoke_agentcore(prompt, conversation_id)

    # 8. Write BrainResponse
    write_brain_response(conversation_id, message_id, agent_response)

    # 9. Update adventure location if the GM set one
    location = (
        agent_response.get("area_transition")
        or agent_response.get("current_location")
        or agent_response.get("location")
    )
    if location and isinstance(location, str):
        write_with_retry(update_adventure_location, conversation_id, location)


# ---------------------------------------------------------------------------
# Dice result submission handler
# ---------------------------------------------------------------------------

def submit_dice_result(
    conversation_id: str,
    dice_value: int,
    request_id: str,
) -> dict:
    """
    Handle a dice result submitted by the frontend.

    1. Load PlayerState and verify the pendingDiceRoll matches request_id
    2. Call resolve_stat_check with the dice value
    3. Apply XP award and HP change from the result
    4. Append to diceRollLog and clear pendingDiceRoll
    5. Trigger the next Game_Master context enrichment with the stat check result
    Returns the StatCheckResult as a dict.
    """
    from stat_check import StatCheckRequest, resolve_stat_check
    from state_sync import check_expired_dice_roll
    from game_event_parser import GameEvents

    pipeline = ContextEnrichmentPipeline()
    player_state_dict = pipeline.load_player_state(conversation_id)

    pending = player_state_dict.get("pendingDiceRoll")
    if not pending:
        logger.warning("submit_dice_result: no pending dice roll for %s", conversation_id)
        return {"error": "no_pending_roll"}

    if pending.get("requestId") != request_id:
        logger.warning(
            "submit_dice_result: requestId mismatch for %s (expected %s, got %s)",
            conversation_id, pending.get("requestId"), request_id,
        )
        return {"error": "request_id_mismatch"}

    # Resolve the stat check
    req = StatCheckRequest(
        stat_name=pending.get("statName", "strength"),
        stat_value=int(pending.get("statValue", 10)),
        difficulty_class=int(pending.get("difficultyClass", 10)),
        dice_value=dice_value,
        base_xp=int(pending.get("baseXPReward", 10)),
    )
    result = resolve_stat_check(req)

    # Build a dice roll log entry
    log_entry = {
        "requestId": request_id,
        "statName": req.stat_name,
        "statValue": req.stat_value,
        "statModifier": result.stat_modifier,
        "diceValue": dice_value,
        "rollResult": result.roll_result,
        "difficultyClass": req.difficulty_class,
        "outcome": result.outcome,
        "xpAwarded": result.xp_awarded,
        "narrativeHint": result.narrative_hint,
    }

    # Append to diceRollLog (keep last 20)
    dice_roll_log = player_state_dict.get("diceRollLog") or []
    dice_roll_log.append(log_entry)
    if len(dice_roll_log) > 20:
        dice_roll_log = dice_roll_log[-20:]

    # Clear pendingDiceRoll
    player_state_dict["pendingDiceRoll"] = None
    player_state_dict["diceRollLog"] = dice_roll_log

    logger.info(
        "Dice result resolved: conversation=%s outcome=%s xp=%d",
        conversation_id, result.outcome, result.xp_awarded,
    )

    # Trigger next Game_Master turn with stat check result injected into context
    stat_check_context = json.dumps({
        "statCheckResult": {
            "outcome": result.outcome,
            "rollResult": result.roll_result,
            "statModifier": result.stat_modifier,
            "xpAwarded": result.xp_awarded,
            "narrativeHint": result.narrative_hint,
        }
    })
    handle_message_stream_event({
        "dynamodb": {
            "NewImage": {
                "conversationId": {"S": conversation_id},
                "id": {"S": f"dice_result_{request_id}"},
                "content": {"S": f"[DICE_RESULT]{stat_check_context}[/DICE_RESULT]"},
            }
        },
        "eventName": "INSERT",
    })

    return {"outcome": result.outcome, "xpAwarded": result.xp_awarded, "logEntry": log_entry}


# ---------------------------------------------------------------------------
# Lambda handler entrypoint
# ---------------------------------------------------------------------------

def handler(event: dict, context: Any) -> dict:
    """
    AWS Lambda handler. Processes DynamoDB stream events from the Message table.
    """
    records = event.get("Records", [])
    logger.info("Received %d stream record(s)", len(records))

    for record in records:
        event_name = record.get("eventName", "")
        if event_name != "INSERT":
            logger.debug("Skipping non-INSERT event: %s", event_name)
            continue
        try:
            handle_message_stream_event(record)
        except Exception as exc:
            logger.error("Error handling stream record: %s", exc, exc_info=True)

    return {"statusCode": 200}
