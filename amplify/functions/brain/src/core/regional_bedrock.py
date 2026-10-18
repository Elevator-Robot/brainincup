"""Regional Claude Messages transport with the existing Bedrock response shapes.

Haiku 4.5 on bedrock-runtime requires cross-region profiles. Mantle supports
the same model in-region; all requests here are pinned to us-east-1.
"""

import io
import json
import logging
import re

import boto3
import requests
from botocore.auth import SigV4Auth
from botocore.awsrequest import AWSRequest

REGION = "us-east-1"
DEFAULT_MODEL_ID = "anthropic.claude-haiku-4-5"
ENDPOINT = "https://bedrock-mantle.us-east-1.api.aws/anthropic/v1/messages"
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
    # Migrate the previous deployment setting without retaining its routing.
    if model_id in {
        "us.anthropic.claude-haiku-4-5-20251001-v1:0",
        "anthropic.claude-haiku-4-5-20251001-v1:0",
    }:
        return DEFAULT_MODEL_ID
    if not re.fullmatch(r"anthropic\.[a-z0-9-]+", model_id):
        raise ValueError("Use a regional Mantle Anthropic model ID, not an inference profile or ARN")
    return model_id


class RegionalBedrockClient:
    def __init__(self, region_name: str = REGION):
        if region_name != REGION:
            raise ValueError("Brain in Cup inference must run in us-east-1")
        self.session = boto3.Session(region_name=REGION)

    def _request(self, model_id: str, body: str, stream: bool):
        payload = json.loads(body)
        payload.pop("anthropic_version", None)
        # Claude 4.5 accepts temperature OR top_p, not both.
        if "temperature" in payload:
            payload.pop("top_p", None)
        payload.update(model=regional_model_id(model_id), stream=stream)
        data = json.dumps(payload).encode("utf-8")
        credentials = self.session.get_credentials()
        if credentials is None:
            raise RuntimeError("AWS credentials are unavailable for regional inference")
        request = AWSRequest(method="POST", url=ENDPOINT, data=data, headers={
            "Content-Type": "application/json",
            "anthropic-version": "2023-06-01",
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

    def invoke_model(self, *, modelId: str, body: str):
        with self._request(modelId, body, False) as response:
            self._check_response(response)
            return {"body": io.BytesIO(response.content)}

    def invoke_model_with_response_stream(self, *, modelId: str, body: str):
        return {"body": self._stream(modelId, body)}

    def _stream(self, model_id: str, body: str):
        with self._request(model_id, body, True) as response:
            self._check_response(response)
            response.encoding = "utf-8"
            frame = []
            stopped = False
            for line in response.iter_lines(chunk_size=1, decode_unicode=True):
                if line.startswith("data:"):
                    frame.append(line[5:].lstrip())
                elif not line and frame:
                    event = json.loads("\n".join(frame))
                    frame.clear()
                    if event.get("type") == "error":
                        error_type = (event.get("error") or {}).get("type", "unknown_error")
                        raise RuntimeError(f"Regional inference stream failed: {error_type}")
                    if event.get("type") == "message_stop":
                        stopped = True
                    yield {"chunk": {"bytes": json.dumps(event).encode("utf-8")}}
            if not stopped:
                raise RuntimeError("Regional inference stream ended before message_stop")
