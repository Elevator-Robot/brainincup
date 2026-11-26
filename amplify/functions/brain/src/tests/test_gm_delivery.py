"""Delivery/deletion contracts with cloud clients replaced at import time."""
import unittest
from unittest.mock import MagicMock, patch

with patch("boto3.resource"), patch("boto3.client"):
    from experiences import handler


class GameMasterDeliveryTest(unittest.TestCase):
    def test_internal_receipt_update_is_not_a_second_turn(self):
        with patch.object(handler.ExperienceRegistry, "create_instance") as create:
            handler.process_stream_records({"Records": [{
                "eventName": "MODIFY", "dynamodb": {
                    "OldImage": {}, "NewImage": {"gmProcessed": {"BOOL": True}},
                },
            }]})
        create.assert_not_called()

    def test_fallback_can_republish_a_previously_committed_turn(self):
        image = {
            "id": {"S": "message"}, "conversationId": {"S": "adventure"},
            "owner": {"S": "owner"}, "content": {"S": "A fisher"},
            "gmProcessed": {"BOOL": True}, "streaming": {"BOOL": False},
        }
        experience = MagicMock()
        from experiences.base import ExperienceResponse
        experience.process_message.return_value = ExperienceResponse(response="Original answer.", metadata={"story": {"version": 1}})
        with patch.object(handler, "_get_experience_for_conversation", return_value="game_master"), \
             patch.object(handler.ExperienceRegistry, "create_instance", return_value=experience), \
             patch.object(handler, "_save_brain_response") as save:
            handler.process_stream_records({"Records": [{
                "eventName": "MODIFY", "dynamodb": {"OldImage": {**image, "streaming": {"BOOL": True}}, "NewImage": image},
            }]})
        experience.process_message.assert_called_once()
        self.assertEqual(save.call_args.kwargs["response_text"], "Original answer.")

    def test_conversation_removal_purges_memory_and_story_copies_and_propagates_failure(self):
        removal = {"Records": [{"eventName": "REMOVE", "dynamodb": {"OldImage": {
            "id": {"S": "adventure"}, "personalityMode": {"S": "rpg_dm"}, "experience": {"S": "brain"},
        }}}]}
        with patch("experiences.game_master.orchestrator.memory.MemoryService.from_env") as memory, \
             patch("experiences.game_master.orchestrator.persistence.OrchestrationStore") as store:
            handler.process_stream_records(removal)
            memory.return_value.delete_character.assert_called_once_with("adventure")
            store.return_value.delete_adventure.assert_called_once_with("adventure")
            memory.return_value.delete_character.side_effect = RuntimeError("retry deletion")
            with self.assertRaises(RuntimeError):
                handler.process_stream_records(removal)

    def test_message_deletion_never_purges_another_adventure(self):
        with patch("experiences.game_master.orchestrator.memory.MemoryService.from_env") as memory:
            handler.process_stream_records({"Records": [{"eventName": "REMOVE", "dynamodb": {"OldImage": {
                "id": {"S": "message"}, "conversationId": {"S": "adventure"},
            }}}]})
        memory.assert_not_called()
