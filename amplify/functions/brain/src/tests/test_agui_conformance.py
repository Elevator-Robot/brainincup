"""AG-UI protocol conformance tests.

These assert the emitted events match the wire format documented at
https://docs.ag-ui.com (event builders + request mapping). Run from the lambda
src root:
    cd amplify/functions/brain/src && python3 -m unittest tests.test_agui_conformance -v
"""

from __future__ import annotations

import json
import unittest

from experiences.agui import (
    reasoning_message_start,
    run_error,
    run_finished,
    run_started,
    sse_event,
    text_message_content,
    text_message_start,
    tool_call_result,
)
from experiences.base import normalize_request


class LifecycleEventTest(unittest.TestCase):
    def test_run_started_carries_thread_and_run_ids(self):
        event = run_started("convo-1", run_id="run-1", input_data={"messageId": "msg-1"})
        self.assertEqual(event["type"], "RUN_STARTED")
        self.assertEqual(event["threadId"], "convo-1")
        self.assertEqual(event["runId"], "run-1")
        self.assertEqual(event["input"], {"messageId": "msg-1"})

    def test_run_finished_success_outcome(self):
        event = run_finished("convo-1", "run-1", result={"response": "hi"})
        self.assertEqual(event["type"], "RUN_FINISHED")
        self.assertEqual(event["threadId"], "convo-1")
        self.assertEqual(event["runId"], "run-1")
        self.assertEqual(event["outcome"], {"type": "success"})
        self.assertEqual(event["result"], {"response": "hi"})

    def test_run_finished_omits_result_when_none(self):
        event = run_finished("convo-1", "run-1")
        self.assertNotIn("result", event)
        self.assertEqual(event["outcome"], {"type": "success"})

    def test_run_error_shape(self):
        event = run_error("boom", code="BRAIN_STREAM_ERROR")
        self.assertEqual(event["type"], "RUN_ERROR")
        self.assertEqual(event["message"], "boom")
        self.assertEqual(event["code"], "BRAIN_STREAM_ERROR")


class TextMessageEventTest(unittest.TestCase):
    def test_text_message_start_role_is_assistant(self):
        event = text_message_start("msg-1")
        self.assertEqual(event["type"], "TEXT_MESSAGE_START")
        self.assertEqual(event["messageId"], "msg-1")
        self.assertEqual(event["role"], "assistant")

    def test_text_message_content_delta(self):
        event = text_message_content("msg-1", "Hello")
        self.assertEqual(event["type"], "TEXT_MESSAGE_CONTENT")
        self.assertEqual(event["messageId"], "msg-1")
        self.assertEqual(event["delta"], "Hello")


class ReasoningEventTest(unittest.TestCase):
    def test_reasoning_message_start_role_is_reasoning(self):
        event = reasoning_message_start("think-1")
        self.assertEqual(event["type"], "REASONING_MESSAGE_START")
        self.assertEqual(event["role"], "reasoning")


class ToolCallEventTest(unittest.TestCase):
    def test_tool_call_result_requires_message_id(self):
        event = tool_call_result("tc-1", content="ok", message_id="msg-1")
        self.assertEqual(event["type"], "TOOL_CALL_RESULT")
        self.assertEqual(event["toolCallId"], "tc-1")
        self.assertEqual(event["messageId"], "msg-1")
        self.assertEqual(event["content"], "ok")
        self.assertEqual(event["role"], "tool")


class SseEncodingTest(unittest.TestCase):
    def test_sse_event_is_data_line_json(self):
        event = text_message_content("msg-1", "Hi")
        frame = sse_event(event)
        self.assertTrue(frame.startswith("data: "))
        self.assertTrue(frame.endswith("\n\n"))
        payload = json.loads(frame.split("data: ", 1)[1].strip())
        self.assertEqual(payload, event)


class RequestMappingTest(unittest.TestCase):
    def test_maps_run_agent_input(self):
        req = normalize_request(
            {
                "threadId": "thread-1",
                "runId": "run-9",
                "messages": [
                    {"id": "m1", "role": "user", "content": [{"type": "text", "text": "Hi "}]},
                    {"id": "m2", "role": "assistant", "content": "yo"},
                ],
                "tools": [],
                "context": [],
                "forwardedProps": {},
            }
        )
        self.assertEqual(req["conversation_id"], "thread-1")
        self.assertEqual(req["run_id"], "run-9")
        self.assertEqual(req["user_input"], "Hi ")

    def test_maps_legacy_shape(self):
        req = normalize_request(
            {"conversationId": "c-1", "messageId": "msg-1", "owner": "u-1", "content": "hi"}
        )
        self.assertEqual(req["conversation_id"], "c-1")
        self.assertEqual(req["message_id"], "msg-1")
        self.assertEqual(req["owner"], "u-1")
        self.assertEqual(req["user_input"], "hi")
        self.assertIsNone(req["run_id"])

    def test_run_agent_input_without_user_message(self):
        req = normalize_request({"threadId": "t-1", "messages": [{"id": "m1", "role": "assistant", "content": "yo"}]})
        self.assertEqual(req["user_input"], "")


if __name__ == "__main__":
    unittest.main()