"""Governing story flow, with an introduction subflow.

Stages name goals and deterministic exit predicates. Pacing describes a turn's
tone; it cannot complete a stage. Append stages/branches here rather than adding
mode checks to chat or asking the narrator to mutate game state.
"""

from __future__ import annotations

from copy import deepcopy
from dataclasses import dataclass
from datetime import datetime, timezone
import json
import hashlib
from pathlib import Path
from typing import Callable

from . import content
from .events import event

QUESTIONS = json.loads(Path(__file__).with_name("introduction.json").read_text())
MAX_ANSWER_LENGTH = 1200


@dataclass(frozen=True)
class Transition:
    target: str
    when: Callable[[dict], bool]
    # Authored consequences are applied once on this transition.
    consequences: tuple[tuple[str, str], ...] = ()


@dataclass(frozen=True)
class Stage:
    id: str
    title: str
    objective: str
    transitions: tuple[Transition, ...] = ()


def _quest(campaign: dict) -> dict:
    return campaign.get("activeObjectives") or {}


def _at_least(campaign: dict, step: str) -> bool:
    quest = _quest(campaign)
    order = [s["id"] for s in content.QUESTS[content.QUEST_ID]["steps"]]
    return quest.get("status") == "COMPLETED" or (
        quest.get("status") == "IN_PROGRESS" and quest.get("step") in order
        and order.index(quest["step"]) >= order.index(step)
    )


STAGES = {
    stage.id: stage for stage in (
        Stage("introduction", "A stranger in Alderheart", "Define the person arriving in town.",
              (Transition("lantern_lead", lambda c: c["story"]["intro"]["complete"]),)),
        Stage("lantern_lead", "The missing light", "Meet Bram at the Whispering Tankard and accept his task.",
              (Transition("cellar", lambda c: _at_least(c, "meet_bram")),)),
        Stage("cellar", "Beneath the Tankard", "Explore the cellar and clear the rats.",
              (Transition("recovery", lambda c: _at_least(c, "clear_cellar"),
                          (("cellar_safe", "The cellar is clear; the lantern can now be recovered."),)),)),
        Stage("recovery", "A light in the straw", "Search the cleared cellar for the Glassbird Lantern.",
              (Transition("return", lambda c: _at_least(c, "recover_lantern")),)),
        Stage("return", "Bring the light home", "Return to Bram in the tavern with the lantern.",
              (Transition("aftermath", lambda c: _quest(c).get("status") == "COMPLETED",
                          (("alderheart_lit", "Alderheart's light is restored."),)),)),
        Stage("aftermath", "Light over Alderheart", "The lantern story is complete. Explore the town at your own pace."),
    )
}


def ensure_story(campaign: dict) -> dict:
    """Preserve older adventures: never insert an interview into active play."""
    campaign = deepcopy(campaign)
    if isinstance(campaign.get("story"), dict):
        if campaign["story"].get("version") != 1 or campaign["story"].get("stageId") not in STAGES:
            raise ValueError("This adventure uses an unsupported story definition.")
        return campaign
    legacy = bool(campaign.get("started"))
    campaign["story"] = {
        "version": 1, "stageId": "lantern_lead" if legacy else "introduction",
        "completed": ["introduction"] if legacy else [],
        "intro": {"index": 0, "answers": {}, "skipped": [], "complete": legacy},
        "flags": {}, "encounters": {}, "recentTurns": [], "memorySynced": [],
    }
    if legacy:
        campaign, _ = advance(campaign)
    return campaign


def advance(campaign: dict) -> tuple[dict, list[dict]]:
    campaign = deepcopy(campaign)
    story = campaign["story"]
    emitted = []
    # Bounded traversal also catches an accidentally authored cycle.
    for _ in range(len(STAGES)):
        stage = STAGES[story["stageId"]]
        transition = next((edge for edge in stage.transitions if edge.when(campaign)), None)
        if transition is None:
            return campaign, emitted
        if transition.target not in STAGES or transition.target in story["completed"]:
            raise ValueError("Invalid or cyclic story transition")
        story["completed"].append(stage.id)
        story["stageId"] = transition.target
        for key, description in transition.consequences:
            if not story["flags"].get(key):
                story["flags"][key] = True
                emitted.append(event("consequence", "The world changes", description, flag=key, causedBy=stage.id))
        new_stage = STAGES[transition.target]
        emitted.append(event("stage", new_stage.title, new_stage.objective,
                             stageId=new_stage.id, fromStageId=stage.id))
    raise ValueError("Story transition limit exceeded")


def snapshot(campaign: dict, memory_enabled: bool = False) -> dict:
    story = campaign.get("story") or {}
    stage = STAGES.get(story.get("stageId"))
    if not stage:
        return {}
    intro = story["intro"]
    answers = intro["answers"]
    synced = story.get("memorySynced", [])
    return {
        "version": 1, "stageId": stage.id, "title": stage.title, "objective": stage.objective,
        "introComplete": intro["complete"], "answered": len(answers),
        "questionIndex": intro["index"], "questionCount": len(QUESTIONS),
        "details": [{"id": q["id"], "title": q["title"], "answer": answers[q["id"]]["answer"]}
                    for q in QUESTIONS if q["id"] in answers],
        "memoryStatus": "synced" if memory_enabled and answers and all(key in synced for key in answers)
                        else "pending" if answers and memory_enabled else "local",
        "quest": {
            "id": content.QUEST_ID, "title": content.QUESTS[content.QUEST_ID]["name"],
            "status": _quest(campaign).get("status", "OFFERED"), "objective": stage.objective,
        },
    }


def intro_turn(campaign: dict, player: dict, user_input: str, message_id: str) -> tuple[dict, str, list[dict]]:
    """One answer per turn, recorded verbatim; hypothetical choices grant no stats."""
    campaign = deepcopy(campaign)
    intro = campaign["story"]["intro"]
    emitted = []
    first = not campaign.get("started")
    if first:
        location = content.resolve_location(campaign.get("currentLocation"))
        campaign["started"] = True
        campaign["currentScene"] = location["description"]
        campaign["activeObjectives"] = {"quest_id": content.QUEST_ID, "status": "OFFERED"}
        text = (
            f"## {location['name']}\n\n"
            f"You are **{player.get('name', 'Adventurer')}**, a level "
            f"{player.get('level', 1)} {player.get('race', 'Human')} {player.get('class', 'Wanderer')}.\n\n"
            f"{location['description']}\n\n"
            "Before you take your first step into this story, give this traveller a past. "
            "These questions describe your fictional character, one answer at a time.\n\n"
        )
        emitted.append(event("stage", STAGES["introduction"].title, STAGES["introduction"].objective,
                             stageId="introduction"))
    else:
        value = user_input.strip()
        if not value or len(value) > MAX_ANSWER_LENGTH:
            return campaign, f"Keep this answer between 1 and {MAX_ANSWER_LENGTH} characters, or type **skip**.\n\n" + question_text(intro), []
        if value.lower() in {"help", "?"}:
            return campaign, "Answer as your fictional character. **skip** leaves this detail unknown; **skip intro** starts the adventure.\n\n" + question_text(intro), []
        if value.lower() == "skip intro":
            intro["skipped"].extend(q["id"] for q in QUESTIONS[intro["index"]:])
            intro["index"] = len(QUESTIONS)
            text = "The untold parts of your past can remain a mystery.\n\n"
        else:
            question = QUESTIONS[intro["index"]]
            if value.lower() == "skip":
                intro["skipped"].append(question["id"])
                text = "That part of your past remains yours to keep.\n\n"
            else:
                intro["answers"][question["id"]] = {
                    "answer": value, "messageId": message_id,
                    "recordedAt": datetime.now(timezone.utc).isoformat(),
                    "source": "player_authored_fiction",
                }
                emitted.append(event("character", question["title"], value, field=question["id"]))
                text = "That detail is now part of your character's story.\n\n"
            intro["index"] += 1
    if intro["index"] >= len(QUESTIONS):
        intro["complete"] = True
        text += (
            "The market bell falls quiet. Warm light spills from the **Whispering Tankard**; "
            "inside, watch-captain **Bram Hightower** is looking for help with a missing lantern.\n\n"
            "You can head to the tavern, explore the square, or choose your own next move. **What do you do?**"
        )
    else:
        text += question_text(intro)
    return campaign, text, emitted


def question_text(intro: dict) -> str:
    question = QUESTIONS[intro["index"]]
    return (
        f"**{question['prompt']}**\n\n{question['hint']}\n\n"
        f"*Question {intro['index'] + 1} of {len(QUESTIONS)} · Reply in your own words, "
        "or type **skip** / **skip intro**.*"
    )


def input_hash(text: str) -> str:
    return hashlib.sha256(text.encode()).hexdigest()


def replay(campaign: dict, message_id: str, user_input: str) -> dict | None:
    previous = next((turn for turn in campaign["story"].get("recentTurns", [])
                     if message_id and turn["messageId"] == message_id), None)
    if previous and previous["inputHash"] != input_hash(user_input):
        raise ValueError("Message identifier was reused with different input")
    return previous
