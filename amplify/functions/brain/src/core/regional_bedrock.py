"""Regional GPT OSS Chat Completions, adapted to existing text response shapes."""

import io
import json
import logging
import re

import boto3
import requests
from botocore.auth import SigV4Auth
from botocore.awsrequest import AWSRequest

REGION = "us-east-1"
DEFAULT_MODEL_ID = "openai.gpt-oss-120b"
ENDPOINT = "https://bedrock-mantle.us-east-1.api.aws/v1/chat/completions"
logger = logging.getLogger(__name__)


def _safe_error_text(value, limit=1000):
    """Keep service diagnostics bounded and strip credential-shaped values."""
    if not isinstance(value, str):
        return ""
    value = re.sub(r"(?:AKIA|ASIA)[A-Z0-9]{16}", "[redacted-key]", value)
    value = re.sub(r"(?i)(?:bearer|AWS4-HMAC-SHA256)\s+[^\r\n]+", "[redacted-auth]", value)
    value = re.sub(r"eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+", "[redacted-token]", value)
    return " ".join(value.split())[:limit]


def regional_model_id(model_id: str) -> str:
    # The user selected GPT OSS after regional Claude access was denied.
    # Migrate stale deployment settings along with the transport change.
    if model_id in {
        "us.anthropic.claude-haiku-4-5-20251001-v1:0",
        "anthropic.claude-haiku-4-5-20251001-v1:0",
        "anthropic.claude-haiku-4-5",
        "openai.gpt-oss-120b-1:0",
    }:
        return DEFAULT_MODEL_ID
    if model_id != DEFAULT_MODEL_ID:
        raise ValueError("Use the approved regional Mantle model openai.gpt-oss-120b")
    return model_id


class RegionalBedrockClient:
    def __init__(self, region_name: str = REGION):
        if region_name != REGION:
            raise ValueError("Brain in Cup inference must run in us-east-1")
        self.session = boto3.Session(region_name=REGION)

    def _request(self, model_id: str, body: str, stream: bool):
        payload = json.loads(body)
        payload.pop("anthropic_version", None)
        system = payload.pop("system", None)
        if system:
            payload["messages"] = [{"role": "system", "content": system}, *payload["messages"]]
        # GPT OSS's completion budget includes reasoning as well as visible text.
        # Keep enough headroom for short title requests without exposing reasoning.
        output_tokens = int(payload.pop("max_tokens", 2048))
        payload["max_completion_tokens"] = min(16384, output_tokens + 2048)
        payload["reasoning_effort"] = "low"
        if "temperature" in payload:
            payload.pop("top_p", None)
        payload.update(model=regional_model_id(model_id), stream=stream)
        data = json.dumps(payload).encode("utf-8")
        credentials = self.session.get_credentials()
        if credentials is None:
            raise RuntimeError("AWS credentials are unavailable for regional inference")
        request = AWSRequest(method="POST", url=ENDPOINT, data=data, headers={
            "Content-Type": "application/json",
            "OpenAI-Project": "default",
            "Accept": "text/event-stream" if stream else "application/json",
        })
        SigV4Auth(credentials.get_frozen_credentials(), "bedrock-mantle", REGION).add_auth(request)
        return requests.post(
            ENDPOINT, data=data, headers=dict(request.headers), stream=stream,
            timeout=(5, 90), allow_redirects=False,
        )

    @staticmethod
    def _check_response(response):
        if response.status_code != 200:
            try:
                payload = response.json()
            except (ValueError, requests.RequestException):
                payload = {}
            if not isinstance(payload, dict):
                payload = {}
            error = payload.get("error")
            if not isinstance(error, dict):
                error = payload
            error_type = error.get("type") or error.get("code") or payload.get("__type")
            error_type = error_type or response.headers.get("x-amzn-errortype", "unknown")
            request_id = (
                response.headers.get("x-amzn-requestid")
                or response.headers.get("x-amz-request-id")
                or response.headers.get("request-id")
                or response.headers.get("x-request-id")
                or payload.get("request_id")
            )
            # Log only service error fields; never dump response bodies, request
            # payloads, or headers (which can contain signed credentials).
            logger.error(
                "Regional inference rejected: status=%s code=%s request_id=%s message=%s",
                response.status_code,
                _safe_error_text(error_type, 120),
                _safe_error_text(request_id, 200),
                _safe_error_text(error.get("message") or payload.get("message")),
            )
        response.raise_for_status()
        if response.status_code != 200:
            raise RuntimeError(f"Unexpected regional inference status: {response.status_code}")

    @staticmethod
    def _completed_text(payload):
        choices = payload.get("choices") or []
        if not choices or choices[0].get("finish_reason") != "stop":
            raise RuntimeError("Regional inference did not return a complete text response")
        text = (choices[0].get("message") or {}).get("content")
        if not isinstance(text, str) or not text.strip():
            raise RuntimeError("Regional inference returned no visible text")
        return text

    @staticmethod
    def _text_chunk(text):
        event = {"type": "content_block_delta", "delta": {"type": "text_delta", "text": text}}
        return {"chunk": {"bytes": json.dumps(event).encode("utf-8")}}

    def invoke_model(self, *, modelId: str, body: str):
        with self._request(modelId, body, False) as response:
            self._check_response(response)
            text = self._completed_text(response.json())
            result = {"content": [{"type": "text", "text": text}]}
            return {"body": io.BytesIO(json.dumps(result).encode("utf-8"))}

    def invoke_model_with_response_stream(self, *, modelId: str, body: str):
        return {"body": self._stream(modelId, body)}

    @staticmethod
    def _sse_frames(response):
        frame = []
        for line in response.iter_lines(chunk_size=1, decode_unicode=True):
            if line.startswith("data:"):
                frame.append(line[5:].lstrip())
            elif not line and frame:
                yield "\n".join(frame), False
                frame.clear()
        # Some gateways close after the last data line without a blank separator.
        if frame:
            yield "\n".join(frame), True

    def _stream(self, model_id: str, body: str):
        with self._request(model_id, body, True) as response:
            self._check_response(response)
            response.encoding = "utf-8"
            content_type = response.headers.get("content-type", "").split(";", 1)[0].lower()
            if content_type == "application/json":
                # A complete non-streamed result is still usable. Validate it
                # with exactly the same completion checks as invoke_model.
                yield self._text_chunk(self._completed_text(response.json()))
                yield {"chunk": {"bytes": b'{"type":"message_stop"}'}}
                return
            finished = False
            has_text = False
            saw_done = False
            eof_frame = False
            event_count = 0
            for data, eof_frame in self._sse_frames(response):
                event_count += 1
                if data == "[DONE]":
                    saw_done = True
                    break
                event = json.loads(data)
                if "error" in event:
                    error_type = (event.get("error") or {}).get("type", "unknown_error")
                    raise RuntimeError(f"Regional inference stream failed: {error_type}")
                for choice in event.get("choices", []):
                    if choice.get("index", 0) != 0:
                        continue
                    # Only final-answer content is player-facing, never the
                    # separate reasoning/reasoning_content or tool deltas.
                    text = (choice.get("delta") or {}).get("content")
                    if isinstance(text, str) and text:
                        has_text = has_text or bool(text.strip())
                        yield self._text_chunk(text)
                    reason = choice.get("finish_reason")
                    if reason is not None:
                        if reason != "stop":
                            raise RuntimeError("Regional inference stopped without a complete text response")
                        finished = True
            # finish_reason=stop is the model's authoritative completion signal.
            # [DONE] is an optional transport terminator, not proof of success.
            if not finished or not has_text:
                logger.error(
                    "Regional inference incomplete stream: content_type=%s request_id=%s events=%s eof_frame=%s finished=%s has_text=%s done=%s",
                    _safe_error_text(content_type, 120),
                    _safe_error_text(response.headers.get("x-amzn-requestid") or response.headers.get("request-id") or response.headers.get("x-request-id"), 200),
                    event_count, eof_frame, finished, has_text, saw_done,
                )
                raise RuntimeError("Regional inference returned no complete visible text")
            yield {"chunk": {"bytes": b'{"type":"message_stop"}'}}
