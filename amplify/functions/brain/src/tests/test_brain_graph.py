"""Cloud-free tests of Brain's real compiled graph and both execution paths."""
from __future__ import annotations

import copy
import json
import unittest

from core.errors import TECHNICAL_DIFFICULTIES_MESSAGE
from experiences.base import ExperienceContext
from experiences.brain.experience import BrainExperience
from experiences.brain.cognition.persistence import Snapshot, BrainStateConflict, input_hash
from experiences.brain.cognition.state import initial_persona, integrate, appraise, normalize_persona


class History:
    def __init__(self, turns=None):
        self.turns = turns or []

    def load_conversation_history(self):
        return self.turns

    def retrieve_context(self, history, **kwargs):
        self.selected = history
        return json.dumps(history)[-kwargs["max_chars"]:]


class Store:
    def __init__(self):
        self.snapshot = Snapshot(initial_persona(), [], owner="alice", revision=None)
        self.commits = 0

    def load(self, ctx):
        return copy.deepcopy(self.snapshot)

    def commit(self, ctx, previous, persona, result):
        if previous.revision != self.snapshot.revision:
            raise BrainStateConflict("newer turn won")
        self.commits += 1
        receipts = self.snapshot.receipts + [{"message_id": ctx.message_id, "input_hash": input_hash(ctx.user_input), "result": result}]
        self.snapshot = Snapshot(copy.deepcopy(persona), copy.deepcopy(receipts[-4:]), str(self.commits), "alice")


class Language:
    def __init__(self, answer=None):
        self.answer = answer or {
            "response": "Hello, Alice. What is on your mind?", "thoughts": ["A familiar voice."],
            "state_update": {"mood": "settled", "arousal": .3, "remember_quotes": ["My name is Alice"]},
        }
        self.calls = 0
        self.prompts = []

    def generate_response(self, prompt, **kwargs):
        self.calls += 1
        self.prompts.append(prompt)
        return copy.deepcopy(self.answer)

    def generate_response_stream(self, prompt, **kwargs):
        self.calls += 1
        self.prompts.append(prompt)
        yield {"type": "delta", "text": '{"private_model_metadata":"not public speech"}'}
        yield {"type": "complete", "response": copy.deepcopy(self.answer)}


def ctx(message="m1", user_input="My name is Alice"):
    return ExperienceContext("conv1", user_input, message_id=message, owner="alice")


def experience(store=None, language=None, history=None):
    return BrainExperience(state_store=store or Store(), language_agent=language or Language(), history_service=history or History())


class BrainGraphTest(unittest.TestCase):
    def test_one_call_and_evidence_backed_memory(self):
        store, language = Store(), Language()
        result = experience(store, language).process_message(ctx())
        self.assertEqual(result.response, language.answer["response"])
        self.assertEqual(language.calls, 1)
        self.assertEqual(store.commits, 1)
        self.assertEqual(store.snapshot.persona["user_memories"][0]["quote"], "My name is Alice")
        self.assertEqual(store.snapshot.persona["turn_count"], 1)
        self.assertTrue(result.metadata["brain_state_persisted"])
        self.assertNotIn("state_update", result.raw)

    def test_next_experience_instance_recalls_personal_memory(self):
        store = Store()
        experience(store).process_message(ctx())
        language = Language({"response": "You told me your name is Alice."})
        result = experience(store, language).process_message(ctx("m2", "Do you remember my name?"))
        self.assertIn("My name is Alice", language.prompts[0])
        self.assertEqual(result.metadata["brain_state"]["intention"], "recollect")
        self.assertEqual(store.snapshot.persona["turn_count"], 2)

    def test_stream_and_invoke_share_response_state_and_one_call(self):
        first, second = Store(), Store()
        normal_language, streaming_language = Language(), Language()
        normal = experience(first, normal_language).process_message(ctx())
        events = list(experience(second, streaming_language).stream_message(ctx()))
        spoken = "".join(e["delta"] for e in events if e["type"] == "TEXT_MESSAGE_CONTENT")
        self.assertEqual(spoken, normal.response)
        self.assertEqual(first.snapshot.persona, second.snapshot.persona)
        self.assertEqual(normal_language.calls, 1)
        self.assertEqual(streaming_language.calls, 1)
        self.assertFalse(any(e["type"].startswith("REASONING_MESSAGE") for e in events))
        self.assertNotIn("private_model_metadata", json.dumps(events))
        self.assertEqual(events[0]["type"], "RUN_STARTED")
        self.assertEqual(events[-1]["type"], "RUN_FINISHED")
        self.assertEqual(sum(e.get("name") == "response_complete" for e in events), 1)

    def test_each_intention_is_bounded_and_uses_one_model_call(self):
        for user_input, expected in [("hello", "respond"), ("Do you remember?", "recollect"), ("Are you conscious?", "reflect"), ("?", "clarify")]:
            with self.subTest(expected=expected):
                language = Language({"response": "A considered reply."})
                result = experience(language=language).process_message(ctx(user_input=user_input))
                self.assertEqual(result.metadata["brain_state"]["intention"], expected)
                self.assertEqual(language.calls, 1)

    def test_replayed_message_does_not_infer_or_consolidate_twice(self):
        store, language = Store(), Language()
        first = experience(store, language).process_message(ctx())
        replay = experience(store, language).process_message(ctx())
        self.assertEqual(first.response, replay.response)
        self.assertEqual(language.calls, 1)
        self.assertEqual(store.commits, 1)

    def test_different_content_cannot_reuse_a_message_receipt(self):
        store, language = Store(), Language()
        experience(store, language).process_message(ctx())
        result = experience(store, language).process_message(ctx(user_input="different text"))
        self.assertEqual(result.response, TECHNICAL_DIFFICULTIES_MESSAGE)
        self.assertEqual(language.calls, 1)
        self.assertEqual(store.commits, 1)

    def test_current_unanswered_message_is_not_added_to_history_context(self):
        history = History([{"id": "m1", "user_input": "My name is Alice", "response": ""}])
        experience(history=history).process_message(ctx())
        self.assertEqual(history.selected, [])

    def test_old_canonical_response_prevents_inference_after_receipt_eviction(self):
        language = Language()
        history = History([{"id": "m1", "user_input": "My name is Alice", "response": {"response": "An earlier reply."}}])
        result = experience(language=language, history=history).process_message(ctx())
        self.assertEqual(result.response, "An earlier reply.")
        self.assertEqual(language.calls, 0)

    def test_failed_model_does_not_become_personal_memory(self):
        store = Store()
        language = Language({"response": TECHNICAL_DIFFICULTIES_MESSAGE, "sensations": ["Error processing input"]})
        result = experience(store, language).process_message(ctx())
        self.assertTrue(result.metadata["error"])
        self.assertEqual(store.commits, 0)
        events = list(experience(store, language).stream_message(ctx()))
        self.assertEqual(events[-1]["type"], "RUN_ERROR")
        complete = next(e for e in events if e.get("name") == "response_complete")
        self.assertTrue(complete["value"]["metadata"]["error"])
        self.assertFalse(complete["value"]["metadata"]["brain_state_persisted"])
        self.assertEqual(complete["value"]["response"], TECHNICAL_DIFFICULTIES_MESSAGE)
        self.assertEqual(store.commits, 0)

    def test_conflict_does_not_silently_overwrite_or_call_the_model_again(self):
        store, language = Store(), Language()
        def conflict(*args):
            raise BrainStateConflict("cleared while generating")
        store.commit = conflict
        result = experience(store, language).process_message(ctx())
        self.assertTrue(result.metadata["error"])
        self.assertEqual(language.calls, 1)
        self.assertEqual(store.snapshot.persona["turn_count"], 0)
        events = list(experience(store, language).stream_message(ctx()))
        self.assertFalse(any(e.get("name") == "response_complete" for e in events))


class CharacterStateTest(unittest.TestCase):
    def test_mood_values_are_bounded_and_change_gradually(self):
        prior = initial_persona()
        result = integrate(prior, {"arousal": 999, "curiosity": -99, "mood": "invented"}, appraise(prior, "hello", "respond"),
                           user_input="hello", response="hi", message_id="m", intention="respond")
        self.assertLessEqual(abs(result["arousal"] - prior["arousal"]), .080001)
        self.assertLessEqual(abs(result["curiosity"] - prior["curiosity"]), .080001)
        self.assertEqual(result["mood"], prior["mood"])

    def test_fabricated_memories_and_tiny_evidence_are_not_stored(self):
        prior = initial_persona()
        result = integrate(prior, {"remember_quotes": ["Alice was my surgeon", "I", "I like green tea"]}, appraise(prior, "I like green tea", "respond"),
                           user_input="I like green tea", response="Noted.", message_id="m", intention="respond")
        self.assertEqual([m["quote"] for m in result["user_memories"]], ["I like green tea"])
        self.assertEqual(result["user_memories"][0]["source"], "user_reported")

    def test_open_questions_must_come_from_the_user(self):
        prior = initial_persona()
        result = integrate(prior, {"unresolved_questions": ["Why am I here?", "Was Alice my surgeon?"]}, appraise(prior, "Why am I here?", "reflect"),
                           user_input="Why am I here?", response="I do not know yet.", message_id="m", intention="reflect")
        self.assertEqual(result["unresolved_questions"], ["Why am I here?"])

    def test_state_growth_is_bounded(self):
        persona = initial_persona()
        for index in range(40):
            quote = f"I prefer tea number {index}"
            persona = integrate(persona, {"remember_quotes": [quote]}, appraise(persona, quote, "respond"), user_input=quote,
                                response="A reply.", message_id=str(index), intention="respond")
        self.assertEqual(len(persona["user_memories"]), 16)
        self.assertEqual(len(persona["episodes"]), 8)

    def test_invalid_saved_values_do_not_poison_character_state(self):
        result = normalize_persona({"schema_version": 1, "mood": [], "arousal": float("nan"), "curiosity": True, "episodes": "bad"})
        self.assertEqual(result["mood"], "curious")
        self.assertEqual(result["arousal"], .25)
        self.assertEqual(result["curiosity"], .65)


if __name__ == "__main__":
    unittest.main()
