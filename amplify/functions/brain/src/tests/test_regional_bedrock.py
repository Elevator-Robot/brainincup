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
        self.response.__enter__.return_value = self.response
        self.post.return_value = self.response
        self.body = json.dumps({
            "anthropic_version": "bedrock-2023-05-31", "max_tokens": 50,
            "temperature": 0.9, "top_p": 1.0,
            "messages": [{"role": "user", "content": "hello"}],
        })

    def stream(self, events):
        lines = []
        for event in events:
            lines.extend(["event: " + event["type"], "data: " + json.dumps(event), ""])
        self.response.iter_lines.return_value = lines
        return self.client.invoke_model_with_response_stream(modelId=DEFAULT_MODEL_ID, body=self.body)["body"]

    def test_regional_signed_request_and_legacy_model_migration(self):
        self.response.content = b'{"content":[{"type":"text","text":"hello"}]}'
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

    def test_stream_preserves_unicode_text_and_completion(self):
        events = [
            {"type": "message_start"},
            {"type": "content_block_delta", "delta": {"type": "text_delta", "text": "A dragon’s lair"}},
            {"type": "message_stop"},
        ]
        chunks = list(self.stream(events))
        self.assertEqual([json.loads(chunk["chunk"]["bytes"]) for chunk in chunks], events)
        self.assertTrue(json.loads(self.post.call_args.kwargs["data"])["stream"])
        self.response.__exit__.assert_called_once()

    def test_stream_error_is_not_a_successful_empty_reply(self):
        with self.assertRaisesRegex(RuntimeError, "overloaded_error"):
            list(self.stream([{"type": "error", "error": {"type": "overloaded_error"}}]))
        self.response.__exit__.assert_called_once()

    def test_truncated_stream_is_rejected(self):
        with self.assertRaisesRegex(RuntimeError, "before message_stop"):
            list(self.stream([{"type": "message_start"}]))

    def test_http_denial_propagates_and_closes_response(self):
        self.response.raise_for_status.side_effect = requests.HTTPError("403 Forbidden")
        with self.assertRaises(requests.HTTPError):
            self.client.invoke_model(modelId=DEFAULT_MODEL_ID, body=self.body)
        self.response.__exit__.assert_called_once()

    def test_other_regions_and_cross_region_profiles_are_rejected(self):
        with self.assertRaisesRegex(ValueError, "us-east-1"):
            RegionalBedrockClient("us-west-2")
        for model_id in ["global.anthropic.claude-haiku-4-5-20251001-v1:0", "us.anthropic.other-model", "arn:aws:bedrock:us-east-2:123:inference-profile/test"]:
            with self.subTest(model_id=model_id), self.assertRaises(ValueError):
                self.client.invoke_model(modelId=model_id, body=self.body)
        self.post.assert_not_called()


if __name__ == "__main__":
    unittest.main()
