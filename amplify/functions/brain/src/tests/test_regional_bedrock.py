"""Transport contract tests using fake credentials and mocked HTTP only."""

import json
import unittest
from unittest.mock import MagicMock, patch

import requests
from botocore.credentials import Credentials

from core.regional_bedrock import DEFAULT_MODEL_ID, ENDPOINT, RegionalBedrockClient


class RegionalBedrockTest(unittest.TestCase):
    def setUp(self):
        session_patch = patch("core.regional_bedrock.boto3.Session")
        session = session_patch.start()
        self.addCleanup(session_patch.stop)
        session.return_value.get_credentials.return_value = Credentials("test-key", "test-secret", "test-token")
        self.client = RegionalBedrockClient()
        post_patch = patch("core.regional_bedrock.requests.post")
        self.post = post_patch.start()
        self.addCleanup(post_patch.stop)
        self.response = MagicMock()
        self.response.status_code = 200
        self.response.headers = {}
        self.response.json.return_value = {}
        self.response.__enter__.return_value = self.response
        self.post.return_value = self.response
        self.body = json.dumps({
            "anthropic_version": "bedrock-2023-05-31", "max_tokens": 50,
            "temperature": 0.9, "top_p": 1.0,
            "system": "You are the Game Master.",
            "messages": [{"role": "user", "content": "hello"}],
        })

    def stream(self, events, trailing_separator=True):
        lines = []
        for event in events:
            lines.extend(["data: " + (event if isinstance(event, str) else json.dumps(event)), ""])
        if not trailing_separator:
            lines = lines[:-1]
        self.response.iter_lines.return_value = lines
        return self.client.invoke_model_with_response_stream(modelId=DEFAULT_MODEL_ID, body=self.body)["body"]

    def test_regional_signed_request_and_legacy_model_migration(self):
        self.response.json.return_value = {"choices": [{
            "message": {"content": "hello", "reasoning": "private reasoning"}, "finish_reason": "stop",
        }]}
        result = self.client.invoke_model(
            modelId="us.anthropic.claude-haiku-4-5-20251001-v1:0", body=self.body,
        )
        self.assertEqual(json.loads(result["body"].read())["content"][0]["text"], "hello")
        args, kwargs = self.post.call_args
        self.assertEqual(args, (ENDPOINT,))
        self.assertFalse(kwargs["allow_redirects"])
        self.assertIn("/us-east-1/bedrock-mantle/aws4_request", kwargs["headers"]["Authorization"])
        self.assertEqual(kwargs["headers"]["X-Amz-Security-Token"], "test-token")
        payload = json.loads(kwargs["data"])
        self.assertEqual(payload["model"], DEFAULT_MODEL_ID)
        self.assertFalse(payload["stream"])
        self.assertNotIn("anthropic_version", payload)
        self.assertNotIn("top_p", payload)
        self.assertNotIn("system", payload)
        self.assertNotIn("anthropic-version", kwargs["headers"])
        self.assertEqual(payload["messages"][0], {"role": "system", "content": "You are the Game Master."})
        self.assertEqual(payload["messages"][1], {"role": "user", "content": "hello"})
        self.assertEqual(payload["max_completion_tokens"], 2098)
        self.assertEqual(payload["reasoning_effort"], "low")
        self.assertEqual(kwargs["headers"]["OpenAI-Project"], "default")

    def test_stream_preserves_unicode_text_and_completion(self):
        events = [
            {"choices": [{"delta": {"role": "assistant"}, "finish_reason": None}]},
            {"choices": [{"delta": {"reasoning": "private reasoning", "reasoning_content": "also private"}}]},
            {"choices": [{"delta": {"content": "A dragon’s lair"}, "finish_reason": None}]},
            {"choices": [{"delta": {}, "finish_reason": "stop"}]},
            {"choices": [], "usage": {"completion_tokens": 42}},
            "[DONE]",
        ]
        chunks = list(self.stream(events))
        self.assertEqual([json.loads(chunk["chunk"]["bytes"]) for chunk in chunks], [
            {"type": "content_block_delta", "delta": {"type": "text_delta", "text": "A dragon’s lair"}},
            {"type": "message_stop"},
        ])
        self.assertTrue(json.loads(self.post.call_args.kwargs["data"])["stream"])
        self.response.__exit__.assert_called_once()

    def test_stream_error_is_not_a_successful_empty_reply(self):
        with self.assertRaisesRegex(RuntimeError, "overloaded_error"):
            list(self.stream([{"type": "error", "error": {"type": "overloaded_error"}}]))
        self.response.__exit__.assert_called_once()

    def test_truncated_stream_is_rejected(self):
        with self.assertLogs("core.regional_bedrock", level="ERROR"), self.assertRaisesRegex(RuntimeError, "no complete visible text"):
            list(self.stream([{"choices": [{"delta": {"content": "partial"}}]}]))

    def test_completion_without_done_marker_is_successful(self):
        chunks = list(self.stream([
            {"choices": [{"delta": {"content": "A complete answer."}, "finish_reason": None}]},
            {"choices": [{"delta": {}, "finish_reason": "stop"}]},
        ]))
        self.assertEqual(json.loads(chunks[-1]["chunk"]["bytes"]), {"type": "message_stop"})

    def test_final_completion_frame_at_eof_is_processed(self):
        chunks = list(self.stream([
            {"choices": [{"delta": {"content": "A complete answer."}, "finish_reason": "stop"}]},
        ], trailing_separator=False))
        self.assertEqual(len(chunks), 2)
        self.assertEqual(json.loads(chunks[0]["chunk"]["bytes"])["delta"]["text"], "A complete answer.")
        self.assertEqual(json.loads(chunks[-1]["chunk"]["bytes"]), {"type": "message_stop"})

    def test_done_at_eof_without_blank_separator_is_processed(self):
        chunks = list(self.stream([
            {"choices": [{"delta": {"content": "Done."}, "finish_reason": "stop"}]},
            "[DONE]",
        ], trailing_separator=False))
        self.assertEqual(json.loads(chunks[-1]["chunk"]["bytes"]), {"type": "message_stop"})

    def test_done_without_model_completion_is_rejected_with_metadata_only(self):
        self.response.headers = {"content-type": "text/event-stream", "request-id": "stream-123"}
        with self.assertLogs("core.regional_bedrock", level="ERROR") as logs, self.assertRaises(RuntimeError):
            list(self.stream([
                {"choices": [{"delta": {"content": "private partial output"}, "finish_reason": None}]},
                "[DONE]",
            ], trailing_separator=False))
        output = "\n".join(logs.output)
        self.assertIn("request_id=stream-123", output)
        self.assertIn("eof_frame=True finished=False has_text=True done=True", output)
        self.assertNotIn("private partial output", output)

    def test_complete_json_response_to_stream_request_is_usable(self):
        self.response.headers = {"content-type": "application/json; charset=utf-8"}
        self.response.json.return_value = {"choices": [{
            "message": {"content": "The gate opens.", "reasoning": "private"}, "finish_reason": "stop",
        }]}
        chunks = list(self.stream([]))
        self.assertEqual(json.loads(chunks[0]["chunk"]["bytes"])["delta"]["text"], "The gate opens.")
        self.assertEqual(json.loads(chunks[-1]["chunk"]["bytes"]), {"type": "message_stop"})
        self.response.iter_lines.assert_not_called()

    def test_incomplete_json_response_to_stream_request_is_rejected(self):
        self.response.headers = {"content-type": "application/json"}
        self.response.json.return_value = {"choices": [{
            "message": {"content": "Partial"}, "finish_reason": "length",
        }]}
        with self.assertRaises(RuntimeError):
            list(self.stream([]))

    def test_token_limit_is_not_successful_completion(self):
        with self.assertRaisesRegex(RuntimeError, "without a complete text response"):
            list(self.stream([{"choices": [{"delta": {}, "finish_reason": "length"}]}, "[DONE]"]))

    def test_reasoning_only_stream_is_rejected(self):
        with self.assertLogs("core.regional_bedrock", level="ERROR"), self.assertRaisesRegex(RuntimeError, "no complete visible text"):
            list(self.stream([
                {"choices": [{"delta": {"reasoning": "private reasoning"}, "finish_reason": "stop"}]},
                "[DONE]",
            ]))

    def test_nonstream_empty_or_truncated_results_are_rejected(self):
        for message, reason in [({"content": None, "reasoning": "private"}, "stop"), ({"content": "partial"}, "length")]:
            with self.subTest(reason=reason):
                self.response.json.return_value = {"choices": [{"message": message, "finish_reason": reason}]}
                with self.assertRaises(RuntimeError):
                    self.client.invoke_model(modelId=DEFAULT_MODEL_ID, body=self.body)

    def test_http_denial_propagates_and_closes_response(self):
        self.response.status_code = 403
        self.response.raise_for_status.side_effect = requests.HTTPError("403 Forbidden")
        with self.assertLogs("core.regional_bedrock", level="ERROR"), self.assertRaises(requests.HTTPError):
            self.client.invoke_model(modelId=DEFAULT_MODEL_ID, body=self.body)
        self.response.__exit__.assert_called_once()

    def test_denial_logs_service_reason_and_request_id_without_payload_or_credentials(self):
        self.response.status_code = 403
        self.response.headers = {"x-amzn-requestid": "service-request-123", "Authorization": "secret-header"}
        self.response.json.return_value = {
            "error": {"type": "permission_error", "message": "Access denied for ASIA1234567890123456"},
            "input": {"content": "private player chat"},
        }
        self.response.raise_for_status.side_effect = requests.HTTPError("403 Forbidden")
        with self.assertLogs("core.regional_bedrock", level="ERROR") as logs, self.assertRaises(requests.HTTPError):
            self.client.invoke_model(modelId=DEFAULT_MODEL_ID, body=self.body)
        output = "\n".join(logs.output)
        self.assertIn("status=403 code=permission_error request_id=service-request-123", output)
        self.assertIn("Access denied for [redacted-key]", output)
        self.assertNotIn("ASIA1234567890123456", output)
        self.assertNotIn("private player chat", output)
        self.assertNotIn("secret-header", output)

    def test_non_json_error_retains_http_failure_without_logging_body(self):
        self.response.status_code = 502
        self.response.json.side_effect = ValueError("not JSON")
        self.response.headers = {"x-amzn-errortype": "BadGatewayException"}
        self.response.content = b"private proxy diagnostic body"
        self.response.raise_for_status.side_effect = requests.HTTPError("502 Bad Gateway")
        with self.assertLogs("core.regional_bedrock", level="ERROR") as logs, self.assertRaises(requests.HTTPError):
            self.client.invoke_model(modelId=DEFAULT_MODEL_ID, body=self.body)
        self.assertIn("code=BadGatewayException", "\n".join(logs.output))
        self.assertNotIn("private proxy", "\n".join(logs.output))

    def test_other_regions_and_cross_region_profiles_are_rejected(self):
        with self.assertRaisesRegex(ValueError, "us-east-1"):
            RegionalBedrockClient("us-west-2")
        for model_id in ["global.anthropic.claude-haiku-4-5-20251001-v1:0", "us.anthropic.other-model", "arn:aws:bedrock:us-east-2:123:inference-profile/test"]:
            with self.subTest(model_id=model_id), self.assertRaises(ValueError):
                self.client.invoke_model(modelId=model_id, body=self.body)
        self.post.assert_not_called()


if __name__ == "__main__":
    unittest.main()
