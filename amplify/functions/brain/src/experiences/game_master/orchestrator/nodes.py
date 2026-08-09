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
from experiences.game_master.orchestrator.intent import describe_mode, parse_dice_result
from experiences.game_master.orchestrator.llm import generate_narration
from experiences.game_master.orchestrator.pacing import apply_pacing, pacing_snapshot
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

def _snapshot(player: dict, campaign: dict, pacing: dict | None = None) -> dict:
    player = player or {}
    campaign = campaign or {}
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
            "name": _loc_name(campaign),
            "id": campaign.get("currentLocation"),
            "currentObjectives": campaign.get("activeObjectives"),
        },
        "pacing": pacing_snapshot(pacing or campaign.get("pacing") or {}),
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

    memory_context = _retrieve_memory_context(state, player)

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
        "memory_context": memory_context,
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
        "currentAct": "EXPOSITION",
        "currentChapter": 1,
        "tensionLevel": 3,
        "timeline": [],
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


def _wants_brawl(user_input: str) -> bool:
    """True when the player aggresses unarmed detail or picks a fight unprompted."""
    text = " " + (user_input or "").lower()
    attacks = ("fight", "fighting", "attack", "hit the", "punch", "kick", "shove",
               "slug", "smack", "assault", "brawl", "grab", "start a", "throw a")
    return any(t in text for t in attacks)


def _story_landmark(campaign: dict, state: OrchestratorState) -> str | None:
    """Return a story landmark (milestone) the engine observed this turn.

    Deterministic milestones come from the quest state machine and combat
    resolution — never from LLM prose. A landmark acts as a pacing beat.
    """
    quest = campaign.get("activeObjectives") or {}
    status = quest.get("status")
    step = quest.get("step") or ""

    if status == "COMPLETED":
        return "quest-completed"
    if status == "IN_PROGRESS" and step in ("clear_cellar", "recover_lantern", "return_lantern"):
        return f"quest-progress-{step}"
    if state.get("game_mode") == "dice":
        return "dice-resolved"

    loc = content.get_location(campaign.get("currentLocation"))
    enemies = (loc or {}).get("enemies") or []
    if enemies:
        return f"hazard-{campaign.get('currentLocation')}"
    return None


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


# ---------------------------------------------------------------------------
# Stat checks & dice
# ---------------------------------------------------------------------------

# Map a player phrase to the stat a stat-check should test.
CHECK_STAT_KEYWORDS: dict[tuple[str, ...], str] = {
    ("sneak", "creep", "stealth", "hide", "disguise"): "dexterity",
    ("climb", "balance", "jump", "leap", "swim", "acrobatic"): "dexterity",
    ("pick the lock", "picklock", "jimmy", "delicate", "slight of hand", "sleight"): "dexterity",
    ("bluff", "seduce", "convince", "fast talk", "bargain", "haggle", "lie to",
     "persuade", "intimidate"): "charisma",
    ("force the door", "shoulder the door", "break", "smash the door", "lift",
     "push the", "pull the", "bend the bars"): "strength",
    ("track", "survival", "spot", "listen", "investigate", "search for",
     "notice", "perceive"): "wisdom",
    ("remember", "recall", "deduce", "intellect"): "intelligence",
}


def _stat_for_input(user_input: str) -> str:
    text = " " + (user_input or "").lower()
    for terms, stat in CHECK_STAT_KEYWORDS.items():
        for term in terms:
            if term in text:
                return stat
    return "dexterity"


def _check_difficulty(location: dict | None) -> int:
    danger = (location or {}).get("danger_level", 0)
    if danger >= 6:
        return 18
    if danger >= 4:
        return 15
    return 12


def _emit_custom(name: str, value: Any) -> None:
    try:
        from langgraph.config import get_stream_writer
        get_stream_writer()(custom_event(name, value))
    except Exception:
        pass


def check_node(state: OrchestratorState) -> dict:
    """Request a stat check when the player attempts a risky action.

    Emits a `dice_roll_requested` custom event inline AND writes the pending
    roll onto PlayerState so the frontend's pendingDiceRoll subscription also
    triggers the TroubleDice animation. The player's roll then returns as a
    DICE_RESULT message routed to `dice_node`.
    """
    campaign = dict(state.get("campaign", {}) or {})
    player = state.get("player", {}) or {}
    store = state.get("store")

    stat = _stat_for_input(state.get("user_input", ""))
    dc = _check_difficulty(content.get_location(campaign.get("currentLocation")))
    stat_value = int(player.get("stats", {}).get(stat, 10))
    pending = systems.request_stat_check(
        stat_name=stat,
        stat_value=stat_value,
        difficulty_class=dc,
        description=state.get("user_input", ""),
        base_xp=10,
    )

    _emit_custom("dice_roll_requested", pending)
    if store is not None:
        try:
            store.write_pending_dice_roll(state["conversation_id"], pending,
                                          character_id=(player or {}).get("id", ""))
        except Exception:  # noqa: BLE001 - dice prompt is best-effort prompt
            logger.warning("pending dice roll write failed", exc_info=True)

    facts = [
        f"The GM needs a {systems.stat_modifier(stat_value)}-modifier {stat.capitalize()} check.",
        f"Difficulty: {dc}. The player must roll the die to resolve this.",
    ]
    text = generate_narration(state.get("system_prompt", ORCHESTRATOR_SYSTEM_PROMPT), _facts_prompt(state, facts),
                              model_id=state.get("model_id"), region=state.get("region"))
    return {"final_message": text}


def dice_node(state: OrchestratorState) -> dict:
    """Resolve a DICE_RESULT message posted by the frontend dice UI.

    Verifies the requestId against the pending roll on PlayerState, resolves
    the stat check deterministically, awards XP on success, records the roll
    in the diceRollLog, clears the pending request, and narrates the outcome.
    """
    payload = parse_dice_result(state.get("user_input", ""))
    if not payload:
        return {"final_message": "The dice clatter unheard."}
    request_id = payload.get("requestId")
    dice_value = payload.get("diceValue")
    player = dict(state.get("player", {}) or {})
    store = state.get("store")
    campaign = state.get("campaign", {}) or {}

    pending = None
    if store is not None:
        state_row = store.load_player_state(state["conversation_id"])
        pending = (state_row or {}).get("pendingDiceRoll")
    if not pending or pending.get("requestId") != request_id:
        facts = [
            "The dice were rolled but no pending check matched.",
            "The GM accepts the roll without consequence.",
        ]
        text = generate_narration(state.get("system_prompt", ORCHESTRATOR_SYSTEM_PROMPT), _facts_prompt(state, facts),
                                  model_id=state.get("model_id"), region=state.get("region"))
        return {"final_message": text}

    try:
        result = systems.resolve_stat_check(pending, dice_value)
    except Exception as exc:  # noqa: BLE001
        logger.warning("stat check resolution failed: %s", exc)
        result = systems.resolve_stat_check(pending, dice_value if dice_value else 1)

    if result.get("xpAwarded"):
        player = systems.apply_xp(player, result["xpAwarded"])
        if store is not None:
            try:
                store.save_player(state["conversation_id"], player)
            except Exception:  # noqa: BLE001 - XP award is a nice-to-have
                logger.warning("player save after dice roll failed", exc_info=True)

    if store is not None:
        try:
            store.append_dice_roll_log(state["conversation_id"], result)
        except Exception:  # noqa: BLE001
            logger.warning("dice roll log append failed", exc_info=True)

    _emit_custom("dice_resolved", result)

    facts = [
        f"Roll: {dice_value} + {result['statModifier']} ({result['statName']}) = {result['rollResult']} "
        f"vs DC {result['difficultyClass']}.",
        f"Outcome: {result['outcome'].replace('_', ' ').title()}.",
    ]
    if result.get("xpAwarded"):
        facts.append(f"The player gains {result['xpAwarded']} XP.")
    text = generate_narration(state.get("system_prompt", ORCHESTRATOR_SYSTEM_PROMPT), _facts_prompt(state, facts),
                              model_id=state.get("model_id"), region=state.get("region"))
    return {"player": player, "final_message": text}


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
        loc = content.resolve_location(campaign.get("currentLocation", content.STARTING_LOCATION))
        facts = [
            f"You remain in: {loc['name']}.",
            f"{loc['description']}",
            f"Present NPCS: {', '.join(n['name'] for n in _content_npcs(loc))}",
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
    loc = content.resolve_location(campaign.get("currentLocation", content.STARTING_LOCATION))
    enemy_ids = (loc or {}).get("enemies") or []
    enemy = content.get_enemy(enemy_ids[0] if enemy_ids else None)

    if enemy is None or not _enemy_present(campaign):
        # No scripted foe here, but an aggressive/combat command can start a brawl
        # against whoever is present so the player is never soft-locked out of fights.
        if _wants_brawl(state.get("user_input", "")):
            enemy = content.get_enemy("bar_brawler")
            facts = ["You throw yourself into the fight against a brawling patron."]
        else:
            facts = [f"No enemy here ({loc['name']})."]
            text = generate_narration(state.get("system_prompt", ORCHESTRATOR_SYSTEM_PROMPT),
                                      _facts_prompt(state, facts),
                                      model_id=state.get("model_id"), region=state.get("region"))
            return {"final_message": text}
    else:
        facts = []

    result = systems.player_attack(player, enemy)
    facts += [
        f"attack roll={result['roll']} vs AC {enemy['armor_class']}: "
        f"{'HIT' if result['hit'] else 'MISS'}"
        + (f" for {result['damage']} damage." if result['hit'] else "."),
        f"enemy remaining HP={result['enemy_hp']}.",
    ]

    if result["enemy_defeated"]:
        is_cellar_rat = enemy["id"] == "cellar_rat"
        if is_cellar_rat:
            campaign["activeObjectives"] = {"quest_id": content.QUEST_ID, "status": "IN_PROGRESS", "step": "clear_cellar"}
        xp = content.ENEMIES[enemy["id"]]["xp_value"]
        player = dict(player)
        facts.append(f"{enemy['name']} is defeated. You gain {xp} XP.")
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
    campaign = dict(state.get("campaign", {}) or {})
    game_mode = state.get("game_mode") or state.get("intent", "narration")
    landmark = _story_landmark(campaign, state)

    pacing = apply_pacing(campaign, game_mode, landmark=landmark)
    if campaign.get("id"):
        campaign["pacing"] = pacing
    # Persist pacing changes (act/chapter/tension) onto the adventure row.
    if state.get("store") is not None and campaign.get("id"):
        try:
            _persist_campaign(state["store"], campaign, state.get("player", {}))
        except Exception:  # noqa: BLE001 - pacing persistence is best-effort
            logger.warning("pacing persist failed", exc_info=True)

    snapshot = _snapshot(state.get("player", {}), campaign, pacing)
    try:
        from langgraph.config import get_stream_writer
        get_stream_writer()(state_snapshot(snapshot))
    except Exception:
        pass

    text = state.get("final_message", "") or state.get("final_response", "")
    if not text:
        text = "The world holds its breath, waiting for you to decide what happens next."

    _record_memory_turn(state, text)

    response_metadata = {
        "intent": state.get("intent", "narration"),
        "target": state.get("target_npc_id"),
        "opened": state.get("opened", False),
    }
    if pacing:
        response_metadata["pacing"] = pacing_snapshot(pacing)
    try:
        from langgraph.config import get_stream_writer
        get_stream_writer()(custom_event("response_complete", {"response": text, "metadata": response_metadata}))
    except Exception:
        pass
    return {"final_response": text, "response_metadata": response_metadata, "final_message": text,
            "campaign": campaign}


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------

def _facts_prompt(state: OrchestratorState, facts: list[str]) -> str:
    header = "[GAME_FACTS]\n" + "\n".join(f"- {f}" for f in facts) + "\n[/GAME_FACTS]"
    chat = f"Player said: \"{state.get('user_input', '')}\"\n\nNarrate the next beat."
    prompt = header + "\n\n" + chat
    memory_context = state.get("memory_context", "") or ""
    if memory_context:
        prompt = f"{memory_context}\n\n{prompt}"
    return prompt


def _minimal_snapshot(player: dict, campaign: dict) -> dict:
    return {
        "character": {
            "name": player.get("name"), "level": player.get("level", 1),
            "currentHP": player.get("current_hp", 0), "maxHP": player.get("max_hp", 0),
            "xp": player.get("xp", 0), "gold": player.get("gold", 0),
        },
        "location": {"name": _loc_name(campaign), "id": campaign.get("currentLocation")},
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


def _retrieve_memory_context(state: OrchestratorState, player: dict) -> str:
    """Pull relevant AgentCore episodic episodes + reflections for this turn."""
    memory = state.get("memory")
    if not memory or not getattr(memory, "enabled", False):
        return ""
    actor = memory.episodic_actor(state.get("owner"), state["conversation_id"])
    player_name = (player or {}).get("name", "Adventurer")
    search_query = (
        f"{state.get('user_input', '')} {state.get('intent', '')} "
        f"player {player_name}"
    ).strip()
    try:
        return memory.retrieve_episodic_context(
            actor=actor,
            session_id=state["conversation_id"],
            search_query=search_query,
            top_k=4,
        ) or ""
    except Exception:  # noqa: BLE001 - memory must never break the game
        logger.warning("memory context retrieval failed", exc_info=True)
        return ""


def _record_memory_turn(state: OrchestratorState, text: str) -> None:
    """Record the finished turn with AgentCore so episodic extraction runs."""
    memory = state.get("memory")
    if not memory or not getattr(memory, "enabled", False):
        return
    actor = memory.episodic_actor(state.get("owner"), state["conversation_id"])
    if not text or not state.get("user_input"):
        return
    try:
        memory.record_turn(
            actor=actor,
            session_id=state["conversation_id"],
            user_input=state.get("user_input", ""),
            assistant_text=text,
            metadata={
                "conversationId": state["conversation_id"],
                "intent": state.get("intent", "narration"),
                "personalityMode": "game_master",
            },
        )
    except Exception:  # noqa: BLE001 - memory must never break the game
        logger.warning("memory turn recording failed", exc_info=True)