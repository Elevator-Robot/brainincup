"""Unit tests for the AgentCore-backed episodic memory service.

Run from the lambda src root:
    cd amplify/functions/brain/src && python3 -m unittest tests.test_memory -v
"""

from __future__ import annotations

import unittest

from experiences.game_master.orchestrator import MemoryService


class FakeAgentCoreClient:
    """In-memory stand-in for the `bedrock-agentcore` boto3 client."""

    def __init__(self):
        self.events: list[dict] = []
        self.records: list[dict] = []
        self.last_search_criteria: dict | None = None

    def create_event(self, **kwargs):
        self.events.append(kwargs)
        return {}

    def retrieve_memory_records(self, **kwargs):
        self.last_search_criteria = kwargs.get("searchCriteria")
        return {
            "memoryRecordSummaries": [
                {"content": {"text": "The player found the Glasshand Lantern in the cellar."}},
                {"content": {"text": "Bram Harlowow asked the player to investigate missing lanterns."}},
            ]
        }

    def batch_create_memory_records(self, **kwargs):
        self.records.extend(kwargs.get("records", []))
        return {}


def _service(client=None) -> MemoryService:
    return MemoryService(
        memory_id="mem-123",
        episodic_strategy_id="strat-episodic",
        region_name="us-east-1",
        client=client or FakeAgentCoreClient(),
    )


class NamespaceTest(unittest.TestCase):
    def test_episodes_namespace_uses_strategy_and_actor(self):
        svc = _service()
        self.assertEqual(
            svc.episodes_namespace("alice"),
            "/strategy/strat-episodic/actor/alice/",
        )

    def test_actor_falls_back_to_conversation_id(self):
        svc = _service()
        self.assertEqual(svc.episodic_actor(None, "conv-1"), "conv-1")
        self.assertEqual(svc.episodic_actor("owner-1", "conv-1"), "owner-1")

    def test_actor_is_sanitized(self):
        svc = _service()
        self.assertEqual(svc.episodic_actor("owner / with: weird*chars", "conv"), "owner---with--weird-chars")


class DisabledServiceTest(unittest.TestCase):
    def test_noop_without_config(self):
        svc = MemoryService(memory_id="", episodic_strategy_id="", client=FakeAgentCoreClient())
        self.assertFalse(svc.enabled)
        self.assertEqual(
            svc.retrieve_episodic_context(actor="a", session_id="s", search_query="q"),
            "",
        )
        svc.record_turn(actor="a", session_id="s", user_input="hi", assistant_text="yo")
        self.assertEqual(svc.client().events, [])

    def test_noop_missing_memory_id(self):
        svc = MemoryService(memory_id="", episodic_strategy_id="strat", client=FakeAgentCoreClient())
        self.assertFalse(svc.enabled)


class RetrievalTest(unittest.TestCase):
    def test_formats_episodes_for_prompt(self):
        client = FakeAgentCoreClient()
        svc = _service(client)
        text = svc.retrieve_episodic_context(
            actor="alice",
            session_id="conv-1",
            search_query="lantern cellar",
            top_k=4,
        )
        self.assertIn("=== EPISODIC MEMORY ===", text)
        self.assertIn("Glasshand Lantern", text)
        self.assertIn("Bram Harlowow", text)

    def test_sets_search_criteria(self):
        client = FakeAgentCoreClient()
        svc = _service(client)
        svc.retrieve_episodic_context(actor="a", session_id="s", search_query="lantern", top_k=4)
        self.assertEqual(client.last_search_criteria["searchQuery"], "lantern")
        self.assertEqual(client.last_search_criteria["memoryStrategyId"], "strat-episodic")

    def test_empty_when_no_records(self):
        client = FakeAgentCoreClient()
        client.retrieve_memory_records = lambda **kwargs: {"memoryRecordSummaries": []}
        svc = _service(client)
        self.assertEqual(
            svc.retrieve_episodic_context(actor="a", session_id="s", search_query="q"),
            "",
        )

    def test_swallows_client_errors(self):
        client = FakeAgentCoreClient()
        client.retrieve_memory_records = lambda **kwargs: (_ for _ in ()).throw(RuntimeError("boom"))
        svc = _service(client)
        self.assertEqual(
            svc.retrieve_episodic_context(actor="a", session_id="s", search_query="q"),
            "",
        )

    def test_deduplicates_records(self):
        client = FakeAgentCoreClient()
        client.retrieve_memory_records = lambda **kwargs: {
            "memoryRecordSummaries": [
                {"content": {"text": "same"}},
                {"content": {"text": "same"}},
                {"content": {"text": "different"}},
            ]
        }
        svc = _service(client)
        text = svc.retrieve_episodic_context(actor="a", session_id="s", search_query="q")
        self.assertEqual(text.count("- same"), 1)


class RecordingTest(unittest.TestCase):
    def test_creates_user_and_assistant_events(self):
        client = FakeAgentCoreClient()
        svc = _service(client)
        svc.record_turn(
            actor="alice",
            session_id="conv-1",
            user_input="I search the cellar",
            assistant_text="You find the lantern.",
            metadata={"intent": "exploration"},
        )
        self.assertEqual(len(client.events), 2)
        roles = [e["payload"][0]["conversational"]["role"] for e in client.events]
        self.assertEqual(roles, ["USER", "ASSISTANT"])
        for event in client.events:
            self.assertEqual(event["actorId"], "alice")
            self.assertEqual(event["sessionId"], "conv-1")
            self.assertEqual(event["metadata"]["intent"], {"stringValue": "exploration"})

    def test_swallows_client_errors(self):
        client = FakeAgentCoreClient()
        client.create_event = lambda **kwargs: (_ for _ in ()).throw(RuntimeError("boom"))
        svc = _service(client)
        svc.record_turn(actor="a", session_id="s", user_input="hi", assistant_text="yo")

    def test_does_nothing_when_disabled(self):
        svc = MemoryService(memory_id="", episodic_strategy_id="", client=FakeAgentCoreClient())
        svc.record_turn(actor="a", session_id="s", user_input="hi", assistant_text="yo")
        self.assertEqual(svc.client().events, [])


class LongTermRecordTest(unittest.TestCase):
    def test_saves_record_with_metadata(self):
        client = FakeAgentCoreClient()
        svc = _service(client)
        svc.save_long_term_record(
            request_identifier="character-1",
            namespaces=["/strategy/strat-episodic/actor/alice/"],
            content_text="Player is a level 2 Wanderer.",
        )
        self.assertEqual(len(client.records), 1)
        self.assertEqual(client.records[0]["requestIdentifier"], "character-1")
        self.assertEqual(client.records[0]["memoryStrategyId"], "strat-episodic")


if __name__ == "__main__":
    unittest.main()
