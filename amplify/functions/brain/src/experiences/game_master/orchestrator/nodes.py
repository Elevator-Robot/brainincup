"""Graph nodes for the Game Master orchestrator.

Nodes are thin: they (1) run a deterministic system where rules apply, (2) hand
the resolved facts to the LLM solely for narration via `llm.generate_narration`,
and (3) return the partial OrchestratorState update. Persistence is done only
where a rule actually changed persisted state (combat, quest, inventory, travel).
"""

from __future__ import annotations

import logging
from typing import Any

from experiences.agui import custom_event, state_snapshot

from experiences.game_master.orchestrator import content, systems
from experiences.game_master.orchestrator.intent import describe_mode
from experiences.game_master.orchestrator.llm import generate_narration
from experiences.game_master.orchestrator.state import OrchestratorState

logger = logging.getLogger(__name__)

ORCHESTRATOR_SYSTEM_PROMPT = """\
You are the Game Master for "Alderheart: The Missing Lantern", an immersive \
text-based fantasy RPG. You narrate the world, control NPCs, and create drama.

You must NEVER adjudicate rules, roll dice, change stats, award XP, or modify \
gold/items/quests. Give "locked facts" (already established by the game engine) \
are given in [GAME_FACTS] — narrate them vividly but never override them. Only \
describe events the engine has already decided; when an outcome is in [GAME_FACTS], \
present it as fact.

Write in the present tense, second person ("you"), painting sights, sounds, smells, \
and mood. Keep the player oriented. End with a natural hook or a single clear question. \
Stay grounded in the current scene, location, and NPCS. Do not add items, gold, XP, \
or quests that [GAME_FACTS] did not grant.
"""

def _snapshot(state: OrchestratorState) -> dict:
    player = state.get("player", {}) or {}
    campaign = state.get("campaign", {}) or {}
    return {
        "character": {
            "name": player.get("name", "Adventurer"),
            "level": player.get("level", 1),
            "class": player.get("class", "Wanderer"),
            "currentHP": player.get("current_hp", 0),
            "maxHP": player.get("max_hp", 0),
            "xp": player.get("xp", 0),
            "gold": player.get("gold", 0),
        },
        "location": {
            "name": campaign.get("currentLocation"),
            "currentObjectives": campaign.get("activeObjectives"),
        },
    }


def bootstrap_node(state: OrchestratorState) -> dict:
    store = state.get("store")
    player = None
    if store is not None:
        player = store.load_player(state["conversation_id"])
    if not player:
        player = _fallback_player()
    campaign = store.load_campaign(state["conversation_id"]) if store is not None else _fallback_campaign()
    if store is not None and campaign.get("id") is None:
        campaign = store.ensure_campaign(state["conversation_id"], campaign)

    snapshot = _minimal_snapshot(player, campaign)
    try:
        from langgraph.config import get_stream_writer
        get_stream_writer()(state_snapshot(snapshot))
    except Exception:
        pass

    return {
        "player": player,
        "campaign": campaign,
        "player_id": player.get("id", ""),
        "target_npc_id": state.get("target_npc_id"),
    }


def _fallback_player() -> dict:
    return {
        "id": "",
        "name": "Adventurer",
        "race": "Human",
        "class": "Wanderer",
        "level": 1,
        "xp": 0,
        "current_hp": 12,
        "max_hp": 12,
        "ac": 10,
        "stats": {"strength": 10, "dexterity": 12, "constitution": 14,
                  "intelligence": 16, "wisdom": 13, "charisma": 11},
        "inventory": [],
        "gold": 10,
    }


def _fallback_campaign() -> dict:
    return {
        "id": None,
        "started": False,
        "currentLocation": content.STARTING_LOCATION,
        "currentScene": "",
        "activeObjectives": None,
        "visitedLocations": [content.STARTING_LOCATION],
        "cleared": False,
        "lantern_found": False,
    }


def _loc_name(campaign: dict) -> str:
    loc = content.get_location(campaign.get("currentLocation"))
    return (loc or {}).get("name", campaign.get("currentLocation"))


# Quest progress is persisted in the Adventure `activeObjectives` JSON:
# {"quest_id", "status": "OFFERED"|"IN_PROGRESS"|"COMPLETED", "step": "<step_id>"}
QUEST_STEP_ORDER = [s["id"] for s in content.QUESTS[content.QUEST_ID]["steps"]]


def _quest_state(campaign: dict) -> dict:
    obj = campaign.get("activeObjectives") or {}
    return {
        "quest_id": obj.get("quest_id", content.QUEST_ID),
        "status": obj.get("status") or "OFFERED",
        "step": obj.get("step") or "",
    }


def _quest_step_index(campaign: dict) -> int:
    step = _quest_state(campaign).get("step", "")
    return QUEST_STEP_ORDER.index(step) if step in QUEST_STEP_ORDER else -1


def _rats_cleared(campaign: dict) -> bool:
    """Rats are gone once the quest has reached/passed the clear step."""
    st = _quest_state(campaign)
    if st["status"] != "IN_PROGRESS":
        return False
    return _quest_step_index(campaign) >= _quest_step_index({"activeObjectives": {"step": "clear_cellar", "status": "IN_PROGRESS"}})


def _enemy_present(campaign: dict) -> bool:
    loc = content.get_location(campaign.get("currentLocation"))
    if not loc or not loc.get("enemies"):
        return False
    if _rats_cleared(campaign):
        return False
    return True


# ---------------------------------------------------------------------------
# Opening
# ---------------------------------------------------------------------------

def opening_narrative_node(state: OrchestratorState) -> dict:
    campaign = dict(state.get("campaign", {}) or {})
    player = state.get("player", {}) or {}
    location = content.get_location(campaign.get("currentLocation", content.STARTING_LOCATION))
    featured = content.get_npc(campaign.get("featured_npc", location and location.get("featured")))

    campaign["started"] = True
    campaign["currentScene"] = (location or {}).get("description", "")

    facts = [
        f"Scene: {location}",
        f"Player: {player.get('name','Adventurer')} ({player.get('class')}, level {player.get('level')}).",
        f"IntroNPc present: {featured}.",
        f"Quest lead available here.",
    ]
    if campaign.get("activeObjectives") is None:
        campaign["activeObjectives"] = {"quest_id": content.QUEST_ID, "status": "OFFERED"}

    prompt = _facts_prompt(state, facts)
    text = generate_narration(state.get("system_prompt", ORCHESTRATOR_SYSTEM_PROMPT), prompt,
                              model_id=state.get("model_id"), region=state.get("region"))

    store = state.get("store")
    if store is not None:
        _persist_campaign(store, campaign, player)

    return {"campaign": campaign, "final_message": text, "opened": True}


# ---------------------------------------------------------------------------
# Intent
# ---------------------------------------------------------------------------

def intent_node(state: OrchestratorState) -> dict:
    intent = state.get("intent", "narration")
    facts = [f"Player intent detected: {describe_mode(intent)}."]
    return {"facts": facts, "game_mode": intent}


# ---------------------------------------------------------------------------
# Game-modes (each: one call to the contest, one narrative)
# ---------------------------------------------------------------------------

def dialogue_node(state: OrchestratorState) -> dict:
    campaign = state.get("campaign", {})
    player = state.get("player", {})
    npc = _resolve_npc(state, campaign)
    facts = [f"You are speaking with {npc['name']} ({npc['role']}) at {_loc_name(campaign)}."]
    prompt = _facts_prompt(state, facts) + f"\nThe NPC responds: {npc.get('greeting', '')}"
    text = generate_narration(state.get("system_prompt", ORCHESTRATOR_SYSTEM_PROMPT), prompt,
                              model_id=state.get("model_id"), region=state.get("region"))
    return {"final_message": text}


def exploration_node(state: OrchestratorState) -> dict:
    campaign = dict(state.get("campaign", {}) or {})
    player = state.get("player", {})
    store = state.get("store")

    moved = content.resolve_location_transition(campaign.get("currentLocation", content.STARTING_LOCATION),
                                                state.get("user_input", ""))
    facts = []
    if moved:
        new_id = moved["id"]
        visited = campaign.get("visitedLocations") or []
        if new_id not in visited:
            visited = visited + [new_id]
        campaign["currentLocation"] = new_id
        campaign["currentScene"] = moved.get("description", "")
        campaign["visitedLocations"] = visited
        facts = [
            f"You have entered: {moved['name']} ({moved['description']}).",
            f"Connections: {', '.join(moved.get('connections', []))}",
        ]
    else:
        loc = content.get_location(campaign.get("currentLocation", content.STARTING_LOCATION))
        facts = [
            f"You remain in: {loc['name']}.",
            f"{loc['description']}",
            f"Present NPCS: {', '.join(n['name'] for n in _npcs_at(loc))}",
        ]

    # Recover the lantern once the cellar rats are gone.
    if (campaign.get("currentLocation") == "market_tavern_cellar"
            and _rats_cleared(campaign)
            and _quest_step_index(campaign) < _quest_step_index({"activeObjectives": {"step": "recover_lantern"}})):
        campaign["activeObjectives"] = {"quest_id": content.QUEST_ID, "status": "IN_PROGRESS", "step": "recover_lantern"}
        facts.append("Among the wrecked barrels you lift the Glasshand Lantern — cold but undamaged.")

    if store is not None:
        try:
            _persist_campaign(store, campaign, player)
        except Exception:  # noqa: BLE001 - non-fatal persistence
            logger.warning("exploration persist failed", exc_info=True)

    text = generate_narration(state.get("system_prompt", ORCHESTRATOR_SYSTEM_PROMPT), _facts_prompt(state, facts),
                              model_id=state.get("model_id"), region=state.get("region"))
    return {"campaign": campaign, "final_message": text}


def combat_node(state: OrchestratorState) -> dict:
    campaign = dict(state.get("campaign", {}) or {})
    player = state.get("player", {})
    store = state.get("store")
    enemy_id = content.get_location(campaign.get("currentLocation"))
    enemy_ids = (enemy_id or {}).get("enemies") or []
    enemy = content.get_enemy(enemy_ids[0] if enemy_ids else None)

    if enemy is None or not _enemy_present(campaign):
        loc = content.get_location(campaign.get("currentLocation"))
        text = generate_narration(state.get("system_prompt", ORCHESTRATOR_SYSTEM_PROMPT),
                                  _facts_prompt(state, [f"No enemy here ({loc['name']})."]),
                                  model_id=state.get("model_id"), region=state.get("region"))
        return {"final_message": text}

    result = systems.player_attack(player, enemy)
    facts = [
        f"attack roll={result['roll']} vs AC {enemy['armor_class']}: "
        f"{'HIT' if result['hit'] else 'MISS'}"
        + (f" for {result['damage']} damage." if result['hit'] else "."),
        f"enemy remaining HP={result['enemy_hp']}.",
    ]

    if result["enemy_defeated"]:
        campaign["activeObjectives"] = {"quest_id": content.QUEST_ID, "status": "IN_PROGRESS", "step": "clear_cellar"}
        xp = content.ENEMIES[enemy["id"]]["xp_value"]
        player = dict(player)
        facts.append(f"The cellar rat is defeated. You gain {xp} XP.")
        if player:
            player = systems.apply_xp(player, xp)
        if store is not None:
            store.save_player(state["conversation_id"], player)
            _persist_campaign(store, campaign, player)

    text = generate_narration(state.get("system_prompt", ORCHESTRATOR_SYSTEM_PROMPT), _facts_prompt(state, facts),
                              model_id=state.get("model_id"), region=state.get("region"))
    return {"campaign": campaign, "player": player, "final_message": text}


def inventory_node(state: OrchestratorState) -> dict:
    campaign = state.get("campaign", {})
    player = state.get("player", {})
    store = state.get("store")
    npc = _merchant_at(campaign)

    facts = _describe_inventory(player, npc)
    if npc and _wants_buy(state.get("user_input", "")):
        item, err = _try_purchase(player, npc)
        if err:
            facts.append(f"Purchase failed: {err}.")
        else:
            facts.append(f"You bought {item['name']}. Gold now {player['gold']}.")
            if store is not None:
                store.save_player(state["conversation_id"], player)

    text = generate_narration(state.get("system_prompt", ORCHESTRATOR_SYSTEM_PROMPT), _facts_prompt(state, facts),
                              model_id=state.get("model_id"), region=state.get("region"))
    return {"player": player, "final_message": text}


def quest_node(state: OrchestratorState) -> dict:
    campaign = dict(state.get("campaign", {}) or {})
    player = state.get("player", {})
    store = state.get("store")
    st = _quest_state(campaign)
    quest = content.QUESTS[content.QUEST_ID]

    if st["status"] == "IN_PROGRESS" and _rats_cleared(campaign):
        # Report completion: assuming Bram in the tavern (featured NPC).
        player = systems.apply_xp(player, quest["reward"]["xp"])
        player = systems.grant_gold(player, quest["reward"]["gold"])
        campaign["activeObjectives"] = {"quest_id": content.QUEST_ID, "status": "COMPLETED", "step": "return_lantern"}
        facts = [
            f"Quest complete: {quest['name']}.",
            f"Reward: {quest['reward']['gold']} gold and {quest['reward']['xp']} XP.",
            "The town will stay lit tonight.",
        ]
        if store is not None:
            store.save_player(state["conversation_id"], player)
            try:
                store.record_quest_complete(state["conversation_id"], quest)
            except Exception:  # noqa: BLE001
                logger.warning("could not record quest complete", exc_info=True)
    else:
        if st["status"] in ("OFFERED", "", None):
            campaign["activeObjectives"] = {"quest_id": content.QUEST_ID, "status": "IN_PROGRESS", "step": "meet_bram"}
            st = _quest_state(campaign)
        step = content.QUESTS[content.QUEST_ID]["steps"][max(0, _quest_step_index(campaign))]
        facts = [
            f"You are on the task: {quest['name']}.",
            f"Objective: {step['objective']}",
        ]
        if _enemy_present(campaign):
            facts.append("Something shifts in the dark — the cellar is not empty.")

    text = generate_narration(state.get("system_prompt", ORCHESTRATOR_SYSTEM_PROMPT), _facts_prompt(state, facts),
                              model_id=state.get("model_id"), region=state.get("region"))
    return {"campaign": campaign, "player": player, "final_message": text}


def character_node(state: OrchestratorState) -> dict:
    player = state.get("player", {})
    facts = [_format_sheet(player)]
    text = generate_narration(state.get("system_prompt", ORCHESTRATOR_SYSTEM_PROMPT), _facts_prompt(state, facts),
                              model_id=state.get("model_id"), region=state.get("region"))
    return {"final_message": text}


def narration_node(state: OrchestratorState) -> dict:
    facts = [x for x in state.get("facts", []) if x]
    loc = content.get_location(state.get("campaign", {}).get("currentLocation"))
    npcs = ", ".join(n["name"] for n in _content_npcs(loc))
    prompt = _facts_prompt(state, facts + (
        [f"Scene: {loc['name']}. Present: {npcs}."] if loc else []
    ))
    text = generate_narration(state.get("system_prompt", ORCHESTRATOR_SYSTEM_PROMPT), prompt,
                              model_id=state.get("model_id"), region=state.get("region"))
    return {"final_message": text}


def finalize_node(state: OrchestratorState) -> dict:
    text = state.get("final_message", "") or state.get("final_response", "")
    if not text:
        text = "The world holds its breath, waiting for you to decide what happens next."
    response_metadata = {
        "intent": state.get("intent", "narration"),
        "target": state.get("target_npc_id"),
        "opened": state.get("opened", False),
    }
    try:
        from langgraph.config import get_stream_writer
        get_stream_writer()(custom_event("response_complete", {"response": text, "metadata": response_metadata}))
    except Exception:
        pass
    return {"final_response": text, "response_metadata": response_metadata, "final_message": text}


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------

def _facts_prompt(state: OrchestratorState, facts: list[str]) -> str:
    header = "[GAME_FACTS]\n" + "\n".join(f"- {f}" for f in facts) + "\n[/GAME_FACTS]"
    chat = f"Player said: \"{state.get('user_input', '')}\"\n\nNarrate the next beat."
    return header + "\n\n" + chat


def _minimal_snapshot(player: dict, campaign: dict) -> dict:
    return {
        "character": {
            "name": player.get("name"), "level": player.get("level", 1),
            "currentHP": player.get("current_hp", 0), "maxHP": player.get("max_hp", 0),
            "xp": player.get("xp", 0), "gold": player.get("gold", 0),
        },
        "location": {"name": campaign.get("currentLocation")},
    }


def _content_npcs(loc: dict | None) -> list[dict]:
    if not loc:
        return []
    return [content.get_npc(nid) for nid in loc.get("npcs", []) if content.get_npc(nid)]


def _resolve_npc(state: OrchestratorState, campaign: dict) -> dict:
    chosen = content.get_npc_by_name_fragment(state.get("user_input", ""))
    if chosen:
        return chosen
    featured = campaign.get("featured_npc")
    npc = content.get_npc(featured) if featured else None
    if npc:
        return npc
    loc = content.get_location(campaign.get("currentLocation"))
    npcs = _content_npcs(loc)
    return npcs[0] if npcs else {"id": "bram", "name": "Bram Harlowow", "role": "watch-captain",
                                  "greeting": "Tell me what you see.", "at": campaign.get("currentLocation")}


def _context_enemy(campaign: dict, state: OrchestratorState) -> dict | None:
    loc = content.get_location(campaign.get("currentLocation"))
    if not loc or not loc.get("enemies"):
        return None
    return content.get_enemy(loc["enemies"][0])


def _merchant_at(campaign: dict) -> dict | None:
    loc = content.get_location(campaign.get("currentLocation"))
    if not loc:
        return None
    for npc in _content_npcs(loc):
        if npc.get("merchant"):
            return npc
    return None


def _wants_buy(text: str) -> bool:
    lowered = (text or "").lower()
    return any(t in lowered for t in ("buy", "purchase", "sell", "shop", "merchant"))


def _try_purchase(player: dict, npc: dict) -> tuple[dict | None, str | None]:
    from experiences.game_master.orchestrator import content as c
    item_id = npc.get("stock")[0] if npc.get("stock") else None
    item = c.ITEMS.get(item_id)
    if not item:
        return None, "the merchant has nothing to sell you"
    if int(player.get("gold", 0)) < int(item.get("value", 0)):
        return None, f"you need {item['value']} gold for a {item['name']}"
    player["gold"] = int(player.get("gold", 0)) - int(item.get("value", 0))
    systems.add_item(player, item["id"], 1)
    return item, None


def _describe_inventory(player: dict, npc: dict | None) -> list[str]:
    lines = []
    if npc:
        stock = ", ".join(i["id"] for i in npc.get("stock", []))
        lines.append(f"Nearby, {npc['name']} offers: {stock}.")
    inv = player.get("inventory", [])
    lines.append("Your inventory: " + (", ".join(f"{i['name']} x{i['quantity']}" for i in inv) if inv else "empty"))
    lines.append(f"Gold: {player.get('gold', 0)}")
    lines.append(f"HP: {player.get('current_hp', 0)}/{player.get('max_hp', 0)}")
    return lines


def _format_sheet(player: dict) -> list[str]:
    lines = [
        f"Name: {player.get('name')} — {player.get('race')} {player.get('class')} (level {player.get('level')})",
        f"HP: {player.get('current_hp')}/{player.get('max_hp')} · AC {player.get('ac')}",
        f"XP: {player.get('xp')} · Gold: {player.get('gold')}",
    ]
    stats = player.get("stats", {})
    lines.append("Stats: " + ", ".join(f"{k}={v}" for k, v in stats.items()))
    inv = player.get("inventory", [])
    lines.append("Inventory: " + (", ".join(f"{i['name']} x{i['quantity']}" for i in inv) if inv else "empty"))
    return lines


def _persist_campaign(store: Any, campaign: dict, player: dict) -> None:
    try:
        store.save_campaign(campaign)
    except Exception:
        logger.warning("campaign persist skipped (no row yet)", exc_info=True)