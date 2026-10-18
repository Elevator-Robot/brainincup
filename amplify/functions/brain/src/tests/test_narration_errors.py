"""Offline checks for consistent streamed and persisted chat failures."""

import importlib.util
import json
from pathlib import Path
import unittest
from unittest.mock import MagicMock

from core.errors import TECHNICAL_DIFFICULTIES_MESSAGE


class NarrationFailureTest(unittest.TestCase):
    def setUp(self):
        self.client = MagicMock()
        path = Path(__file__).parents[1] / "experiences/game_master/orchestrator/llm.py"
        spec = importlib.util.spec_from_file_location("narration_under_test", path)
        self.narration = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.narration)
        self.narration.RegionalBedrockClient = MagicMock(return_value=self.client)
        agent_path = Path(__file__).parents[1] / "agents/language_agent.py"
        agent_spec = importlib.util.spec_from_file_location("language_under_test", agent_path)
        agent_module = importlib.util.module_from_spec(agent_spec)
        agent_spec.loader.exec_module(agent_module)
        self.language_agent = agent_module.LanguageAgent
        self.events = []
        self.narration._emit = self.events.append

    def test_failed_model_call_matches_brain_error_and_stream(self):
        self.client.invoke_model_with_response_stream.side_effect = RuntimeError("model unavailable")
        with self.assertLogs(self.narration.logger, level="ERROR"):
            text = self.narration.generate_narration("system", "input")
        self.assertEqual(text, self.language_agent._fallback_response()["response"])
        self.assertEqual(text, TECHNICAL_DIFFICULTIES_MESSAGE)
        self.assertEqual(self.events[1]["delta"], text)
        self.assertEqual(self.events[-1]["type"], "TEXT_MESSAGE_END")

    def test_midstream_failure_preserves_partial_text_consistently(self):
        def broken_stream():
            yield {"chunk": {"bytes": json.dumps({
                "type": "content_block_delta", "delta": {"type": "text_delta", "text": "The door opens."},
            }).encode()}}
            raise RuntimeError("connection lost")

        self.client.invoke_model_with_response_stream.return_value = {"body": broken_stream()}
        with self.assertLogs(self.narration.logger, level="ERROR"):
            text = self.narration.generate_narration("system", "input")
        streamed = "".join(event.get("delta", "") for event in self.events)
        self.assertEqual(text, streamed)
        self.assertEqual(text, "The door opens.\n" + TECHNICAL_DIFFICULTIES_MESSAGE)


if __name__ == "__main__":
    unittest.main()
