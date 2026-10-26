"""Offline checks for authored, player-facing GM annotations and streaming."""
import json
import unittest
from unittest.mock import MagicMock, patch

from experiences.game_master.orchestrator.narrator_notes import CLOSE, OPEN, NarratorStream
from experiences.game_master.orchestrator import llm
from experiences.game_master.orchestrator.nodes import finalize_node
from experiences.game_master.experience import GameMasterExperience
from experiences.base import ExperienceContext


NOTES = {"sensations": ["Cold stone beneath your hands."], "thoughts": ["The silence might be deliberate."], "memories": "Mira mentioned this gate.", "self_reflection": "Not every invitation announces itself."}


class NarratorStreamTest(unittest.TestCase):
    def test_marker_can_split_at_every_character_without_leaking_annotations(self):
        for split in range(len(OPEN) + 1):
            with self.subTest(split=split):
                stream = NarratorStream()
                public = stream.feed("The gate opens." + OPEN[:split])
                public += stream.feed(OPEN[split:] + json.dumps(NOTES) + CLOSE)
                public += stream.finish_public()
                self.assertEqual(public, "The gate opens.")
                self.assertEqual(stream.notes(), NOTES)

    def test_one_character_tokens_and_unicode_preserve_visible_prose(self):
        stream = NarratorStream()
        source = "“Wait,” she says. 🕯" + OPEN + json.dumps(NOTES) + CLOSE
        text = "".join(stream.feed(char) for char in source) + stream.finish_public()
        self.assertEqual(text, "“Wait,” she says. 🕯")
        self.assertEqual(stream.notes(), NOTES)

    def test_plain_narration_without_notes_is_backward_compatible(self):
        stream = NarratorStream()
        self.assertEqual(stream.feed("The gate opens.") + stream.finish_public(), "The gate opens.")
        self.assertEqual(stream.notes(), {})

    def test_truncated_malformed_and_oversized_notes_stay_out_of_speech(self):
        for trailer in ['{"thoughts":', "bad json" + CLOSE, json.dumps({"thoughts": ["x" * 9000]}) + CLOSE]:
            with self.subTest(size=len(trailer)):
                stream = NarratorStream()
                public = stream.feed("The gate opens." + OPEN + trailer) + stream.finish_public()
                self.assertEqual(public, "The gate opens.")
                self.assertEqual(stream.notes(), {})

    def test_annotation_keys_are_whitelisted_and_bounded(self):
        stream = NarratorStream()
        stream.feed(OPEN + json.dumps({"thoughts": ["x" * 400, 123, "third"], "sensations": [], "memories": "m" * 800, "self_reflection": "", "private_plan": "must not survive"}) + CLOSE)
        notes = stream.notes()
        self.assertEqual(len(notes["thoughts"]), 1)
        self.assertEqual(len(notes["thoughts"][0]), 280)
        self.assertEqual(len(notes["memories"]), 600)
        self.assertNotIn("private_plan", notes)

    def test_dangling_marker_is_not_public_text(self):
        stream = NarratorStream()
        self.assertEqual(stream.feed("The gate opens.<NARRATOR_") + stream.finish_public(), "The gate opens.")


class NarratorPipelineTest(unittest.TestCase):
    def test_one_model_call_streams_only_prose_and_returns_annotations_for_finalize(self):
        client = MagicMock()
        source = "The gate opens." + OPEN + json.dumps(NOTES) + CLOSE
        client.invoke_model_with_response_stream.return_value = {"body": [
            {"chunk": {"bytes": json.dumps({"type": "content_block_delta", "delta": {"type": "text_delta", "text": source[i:i + 5]}}).encode()}}
            for i in range(0, len(source), 5)
        ]}
        events = []
        with patch.object(llm, "RegionalBedrockClient", return_value=client), patch.object(llm, "_emit", side_effect=events.append):
            result = llm.generate_narration("Never change locked facts.", "The player opens the known gate.")
        client.invoke_model_with_response_stream.assert_called_once()
        self.assertEqual(result.text, "The gate opens.")
        self.assertEqual("".join(event.get("delta", "") for event in events), result.text)
        self.assertEqual(result.notes, NOTES)
        self.assertNotIn(OPEN, json.dumps(events))
        self.assertNotIn("Cold stone", json.dumps(events))
        state = {"campaign": {}, "player": {"current_hp": 10}, **llm.narration_update(result)}
        finalized = finalize_node(state)
        self.assertEqual(finalized["response_metadata"]["thoughts"], NOTES["thoughts"])
        self.assertEqual(state["player"], {"current_hp": 10})

    def test_nonstreaming_experience_retains_the_same_annotation_contract(self):
        experience = GameMasterExperience()
        with patch.object(experience, "_run_turn", return_value={"final_message": "The gate opens.", "response_metadata": NOTES}):
            result = experience.process_message(ExperienceContext("conversation", "Open the gate."))
        self.assertEqual(result.metadata, NOTES)


if __name__ == "__main__":
    unittest.main()
